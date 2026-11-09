'use strict';

/*
 * Testa as funções SQL da agenda (supabase/migrations) num PostgreSQL de
 * verdade rodando em memória, sem precisar do Supabase.
 *
 * Precisa do PGlite (ver test/apoio/banco.js). Sem ele, os testes são pulados.
 */
const test = require('node:test');
const assert = require('node:assert/strict');
const { bancoNovo, falhaCom: falhaComBase, pular } = require('./apoio/banco');

// Horários no fuso da estética, como o servidor envia.
const em = (dataHora) => `${dataHora}:00-03:00`;

async function criar(db, { nome = 'Carlos Andrade', telefone = '+5511987654321', servicos = [1], inicio }) {
  const r = await db.query(
    'select criar_agendamento_painel($1, $2, $3, $4, $5, $6, $7) as codigo',
    [nome, telefone, servicos, em(inicio), 'Onix', '', 1],
  );
  return r.rows[0].codigo;
}

async function buscar(db, codigo) {
  const r = await db.query(
    `select a.*, c.nome as cliente_nome,
            (select json_agg(json_build_object('servico', i.servico_id, 'preco', i.preco_praticado::float, 'duracao', i.duracao_minutos)
                     order by i.servico_id)
               from item_agendamento i where i.agendamento_id = a.id) as itens
       from agendamento a join cliente c on c.id = a.cliente_id
      where a.codigo = $1`,
    [codigo],
  );
  return r.rows[0];
}

const falhaCom = (promessa, codigo) => falhaComBase(assert, promessa, codigo);

test('agendamento manual nasce confirmado, com origem painel e preços copiados (RF-18)', { skip: pular }, async () => {
  const db = await bancoNovo();
  const codigo = await criar(db, { servicos: [1, 3], inicio: '2026-11-10T08:00' });

  assert.match(codigo, /^[A-HJ-NP-Z2-9]{6}$/);
  const ag = await buscar(db, codigo);
  assert.equal(ag.status, 'CONFIRMADO');
  assert.equal(ag.origem, 'painel');
  assert.equal(ag.responsavel_id, 1);
  assert.ok(ag.respondido_em);
  assert.equal(new Date(ag.data_hora_fim).toISOString(), '2026-11-10T12:30:00.000Z'); // 08:00 + 90 min em -03:00
  assert.deepEqual(ag.itens, [
    { servico: 1, preco: 80, duracao: 60 },
    { servico: 3, preco: 120, duracao: 30 },
  ]);
});

test('mesmo telefone reaproveita o cliente e atualiza o nome (RN-03)', { skip: pular }, async () => {
  const db = await bancoNovo();
  await criar(db, { nome: 'Carlos', inicio: '2026-11-10T08:00' });
  const codigo = await criar(db, { nome: 'Carlos Andrade', inicio: '2026-11-11T08:00' });

  const clientes = await db.query('select nome from cliente');
  assert.deepEqual(clientes.rows, [{ nome: 'Carlos Andrade' }]);
  assert.equal((await buscar(db, codigo)).cliente_nome, 'Carlos Andrade');
});

test('não grava horário que excede a capacidade (RN-06)', { skip: pular }, async () => {
  const db = await bancoNovo({ capacidade: 1 });
  await criar(db, { servicos: [2], inicio: '2026-11-10T09:00' }); // 09:00 às 11:00

  await falhaCom(criar(db, { telefone: '+5511900000001', inicio: '2026-11-10T10:30' }), 'HORARIO_OCUPADO');
  await falhaCom(criar(db, { telefone: '+5511900000001', inicio: '2026-11-10T08:30' }), 'HORARIO_OCUPADO');
  // Encostado, sem sobrepor: pode.
  await criar(db, { telefone: '+5511900000001', inicio: '2026-11-10T08:00' }); // 08:00 às 09:00
  await criar(db, { telefone: '+5511900000002', inicio: '2026-11-10T11:00' });
});

test('capacidade 2 olha a ocupação em cada instante, não o total do período', { skip: pular }, async () => {
  const db = await bancoNovo({ capacidade: 2 });
  await criar(db, { telefone: '+5511900000001', inicio: '2026-11-10T08:00' }); // 08 às 09
  await criar(db, { telefone: '+5511900000002', inicio: '2026-11-10T09:00' }); // 09 às 10

  // 08 às 10 cruza os dois, mas nunca há mais de 1 ao mesmo tempo: cabe.
  await criar(db, { telefone: '+5511900000003', servicos: [2], inicio: '2026-11-10T08:00' });
  // Agora 08:30 tem 2 ocupando: o terceiro não entra.
  await falhaCom(criar(db, { telefone: '+5511900000004', inicio: '2026-11-10T08:30' }), 'HORARIO_OCUPADO');
});

test('agendamento cancelado libera o horário (RF-08)', { skip: pular }, async () => {
  const db = await bancoNovo();
  const codigo = await criar(db, { inicio: '2026-11-10T08:00' });
  await db.query("update agendamento set status = 'CANCELADO' where codigo = $1", [codigo]);
  await criar(db, { telefone: '+5511900000001', inicio: '2026-11-10T08:00' });
});

test('serviços: ao menos um, sem repetir e só ativos (RN-04)', { skip: pular }, async () => {
  const db = await bancoNovo();
  await falhaCom(criar(db, { servicos: [], inicio: '2026-11-10T08:00' }), 'SEM_SERVICO');
  await falhaCom(criar(db, { servicos: [1, 1], inicio: '2026-11-10T08:00' }), 'SERVICO_REPETIDO');
  await falhaCom(criar(db, { servicos: [4], inicio: '2026-11-10T08:00' }), 'SERVICO_INVALIDO');
  await falhaCom(criar(db, { servicos: [99], inicio: '2026-11-10T08:00' }), 'SERVICO_INVALIDO');
});

test('remarcar move o horário e ignora o próprio agendamento na conferência', { skip: pular }, async () => {
  const db = await bancoNovo();
  const codigo = await criar(db, { servicos: [2], inicio: '2026-11-10T09:00' }); // 09 às 11

  // 30 minutos depois: sobrepõe o horário antigo dele mesmo, mas pode.
  await db.query('select remarcar_agendamento($1, $2)', [codigo, em('2026-11-10T09:30')]);
  const ag = await buscar(db, codigo);
  assert.equal(new Date(ag.data_hora_inicio).toISOString(), '2026-11-10T12:30:00.000Z');
  assert.equal(new Date(ag.data_hora_fim).toISOString(), '2026-11-10T14:30:00.000Z');
});

test('remarcar recusa horário ocupado por outro', { skip: pular }, async () => {
  const db = await bancoNovo();
  await criar(db, { inicio: '2026-11-10T08:00' });
  const outro = await criar(db, { telefone: '+5511900000001', inicio: '2026-11-10T14:00' });
  await falhaCom(db.query('select remarcar_agendamento($1, $2)', [outro, em('2026-11-10T08:30')]), 'HORARIO_OCUPADO');
  // Nada mudou.
  assert.equal(new Date((await buscar(db, outro)).data_hora_inicio).toISOString(), '2026-11-10T17:00:00.000Z');
});

test('remarcar trocando serviços recalcula o fim e mantém o preço dos que ficaram', { skip: pular }, async () => {
  const db = await bancoNovo();
  const codigo = await criar(db, { servicos: [1], inicio: '2026-11-10T08:00' });
  await db.query('update servico set preco_base = 95 where id = 1'); // reajuste depois do pedido

  await db.query('select remarcar_agendamento($1, $2, $3)', [codigo, em('2026-11-10T08:00'), [1, 3]]);
  const ag = await buscar(db, codigo);
  assert.deepEqual(ag.itens, [
    { servico: 1, preco: 80, duracao: 60 }, // preço praticado continua o do pedido
    { servico: 3, preco: 120, duracao: 30 },
  ]);
  assert.equal(new Date(ag.data_hora_fim).toISOString(), '2026-11-10T12:30:00.000Z');
});

test('remarcar só vale para agendamento que ocupa a agenda', { skip: pular }, async () => {
  const db = await bancoNovo();
  const codigo = await criar(db, { inicio: '2026-11-10T08:00' });
  await db.query("update agendamento set status = 'CONCLUIDO' where codigo = $1", [codigo]);
  await falhaCom(db.query('select remarcar_agendamento($1, $2)', [codigo, em('2026-11-11T08:00')]), 'STATUS_NAO_PERMITE');
  await falhaCom(db.query('select remarcar_agendamento($1, $2)', ['ZZZZZZ', em('2026-11-11T08:00')]), 'NAO_ENCONTRADO');
});

test('falha no meio da remarcação não deixa nada pela metade', { skip: pular }, async () => {
  const db = await bancoNovo();
  await criar(db, { inicio: '2026-11-10T10:00' });
  const codigo = await criar(db, { telefone: '+5511900000001', servicos: [1], inicio: '2026-11-10T08:00' });

  // Trocar para Polimento (2h) a partir das 08:00 bate no das 10:00: recusa,
  // e os serviços antigos continuam lá.
  await falhaCom(db.query('select remarcar_agendamento($1, $2, $3)', [codigo, em('2026-11-10T08:30'), [2]]), 'HORARIO_OCUPADO');
  assert.deepEqual((await buscar(db, codigo)).itens, [{ servico: 1, preco: 80, duracao: 60 }]);
});
