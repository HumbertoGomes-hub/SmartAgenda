'use strict';

/*
 * Anonimização de clientes (RNF-13) num PostgreSQL em memória.
 * Precisa do PGlite (ver test/apoio/banco.js). Sem ele, os testes são pulados.
 */
const test = require('node:test');
const assert = require('node:assert/strict');
const { bancoNovo, pular } = require('./apoio/banco');

// Cliente com um agendamento marcado para `quando` (intervalo SQL relativo a agora).
async function clienteCom(db, { telefone, quando }) {
  const c = await db.query(
    "insert into cliente (nome, telefone, consentimento_lgpd, data_consentimento) values ('Ana Souza', $1, true, now()) returning id",
    [telefone],
  );
  const id = c.rows[0].id;
  await db.query(
    `insert into agendamento (codigo, cliente_id, data_hora_inicio, data_hora_fim, modelo_veiculo, observacoes, status, criado_em)
     values (gerar_codigo_agendamento(), $1, now() + $2::interval, now() + $2::interval + interval '1 hour',
             'Onix', 'Mancha no banco', 'CONCLUIDO', now() + $2::interval - interval '1 day')`,
    [id, quando],
  );
  return id;
}

async function cliente(db, id) {
  return (await db.query('select nome, telefone, consentimento_lgpd, data_consentimento, anonimizado from cliente where id = $1', [id])).rows[0];
}

test('cliente sem agendamento há 12 meses perde os dados pessoais (RNF-13)', { skip: pular }, async () => {
  const db = await bancoNovo();
  const antigo = await clienteCom(db, { telefone: '+5511987654321', quando: '-13 months' });

  assert.equal((await db.query('select anonimizar_clientes() as n')).rows[0].n, 1);
  const c = await cliente(db, antigo);
  assert.equal(c.nome, 'Cliente removido');
  assert.equal(c.anonimizado, true);
  assert.equal(c.consentimento_lgpd, false);
  assert.equal(c.data_consentimento, null);
  assert.match(c.telefone, /^\+9\d{14}$/);
  assert.ok(!c.telefone.includes('987654321'), 'o número novo não carrega o telefone original');

  const ag = (await db.query('select modelo_veiculo, observacoes from agendamento where cliente_id = $1', [antigo])).rows[0];
  assert.deepEqual(ag, { modelo_veiculo: null, observacoes: null });
});

test('cliente com agendamento recente ou futuro fica como está', { skip: pular }, async () => {
  const db = await bancoNovo();
  const recente = await clienteCom(db, { telefone: '+5511900000001', quando: '-2 months' });
  const futuro = await clienteCom(db, { telefone: '+5511900000002', quando: '10 days' });
  // Cliente antigo que voltou: um agendamento velho e um novo.
  const voltou = await clienteCom(db, { telefone: '+5511900000003', quando: '-20 months' });
  await db.query(
    `insert into agendamento (codigo, cliente_id, data_hora_inicio, data_hora_fim, status)
     values (gerar_codigo_agendamento(), $1, now() + interval '3 days', now() + interval '3 days 1 hour', 'PENDENTE')`,
    [voltou],
  );

  assert.equal((await db.query('select anonimizar_clientes() as n')).rows[0].n, 0);
  for (const id of [recente, futuro, voltou]) {
    assert.equal((await cliente(db, id)).nome, 'Ana Souza');
  }
});

test('anonimizar de novo não muda nada; o telefone verdadeiro fica livre', { skip: pular }, async () => {
  const db = await bancoNovo();
  await clienteCom(db, { telefone: '+5511987654321', quando: '-13 months' });
  assert.equal((await db.query('select anonimizar_clientes() as n')).rows[0].n, 1);
  assert.equal((await db.query('select anonimizar_clientes() as n')).rows[0].n, 0);

  // A mesma pessoa volta e pede de novo: vira um cliente novo, sem conflito.
  await db.query("insert into cliente (nome, telefone) values ('Ana Souza', '+5511987654321')");
  assert.equal((await db.query("select count(*)::int as n from cliente where telefone = '+5511987654321'")).rows[0].n, 1);
});
