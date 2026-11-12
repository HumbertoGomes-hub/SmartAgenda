'use strict';

/*
 * Pedido feito pelo site (criar_agendamento_site) e expiração dos pedidos
 * (expirar_pedidos), num PostgreSQL em memória. Precisa do PGlite (ver
 * test/apoio/banco.js). Sem ele, os testes são pulados.
 *
 * A configuração padrão do banco de teste: segunda a sábado, das 8h às 18h,
 * 2 horas de antecedência, 30 dias à frente e 12 horas para responder.
 */
const test = require('node:test');
const assert = require('node:assert/strict');
const { bancoNovo, falhaCom: falhaComBase, pular } = require('./apoio/banco');

const falhaCom = (promessa, codigo) => falhaComBase(assert, promessa, codigo);

// Próximo dia útil (segunda a sábado) daqui a pelo menos `minimo` dias, no fuso da estética.
function diaUtil(minimo = 2, diaDaSemana = null) {
  const data = new Date(Date.now() + minimo * 864e5);
  while (diaDaSemana === null ? data.getUTCDay() === 0 : data.getUTCDay() !== diaDaSemana) {
    data.setUTCDate(data.getUTCDate() + 1);
  }
  return data.toISOString().slice(0, 10);
}

const em = (dia, hora) => `${dia}T${hora}:00-03:00`;

async function pedir(db, { nome = 'Ana Souza', telefone = '+5511987654321', servicos = [1], inicio }) {
  const r = await db.query(
    'select criar_agendamento_site($1, $2, $3, $4, $5, $6) as codigo',
    [nome, telefone, servicos, inicio, 'Onix', ''],
  );
  return r.rows[0].codigo;
}

test('pedido do site nasce pendente, com origem site e consentimento registrado (RF-05)', { skip: pular }, async () => {
  const db = await bancoNovo();
  const codigo = await pedir(db, { servicos: [1, 3], inicio: em(diaUtil(), '10:00') });
  assert.match(codigo, /^[A-HJ-NP-Z2-9]{6}$/);

  const r = await db.query(
    `select a.status, a.origem, a.responsavel_id, c.consentimento_lgpd, c.data_consentimento is not null as tem_data,
            (select count(*)::int from item_agendamento i where i.agendamento_id = a.id) as itens,
            (extract(epoch from a.data_hora_fim - a.data_hora_inicio) / 60)::int as minutos
       from agendamento a join cliente c on c.id = a.cliente_id where a.codigo = $1`,
    [codigo],
  );
  assert.deepEqual(r.rows[0], {
    status: 'PENDENTE',
    origem: 'site',
    responsavel_id: null,
    consentimento_lgpd: true,
    tem_data: true,
    itens: 2,
    minutos: 90,
  });
});

test('respeita antecedência mínima e limite de dias à frente (RN-07)', { skip: pular }, async () => {
  const db = await bancoNovo();
  const daquiAUmaHora = new Date(Date.now() + 36e5).toISOString();
  await falhaCom(pedir(db, { inicio: daquiAUmaHora }), 'ANTECEDENCIA_MINIMA');
  await falhaCom(pedir(db, { inicio: em(diaUtil(40), '10:00') }), 'ALEM_DO_LIMITE');
});

test('não aceita domingo nem data bloqueada', { skip: pular }, async () => {
  const db = await bancoNovo();
  const domingo = diaUtil(2, 0);
  await falhaCom(pedir(db, { inicio: em(domingo, '10:00') }), 'DIA_FECHADO');

  const dia = diaUtil();
  await db.query("insert into bloqueio_agenda (empresa_id, data, motivo) values (1, $1, 'Feriado')", [dia]);
  await falhaCom(pedir(db, { inicio: em(dia, '10:00') }), 'DIA_FECHADO');
});

test('o atendimento precisa caber no horário de funcionamento (RN-05)', { skip: pular }, async () => {
  const db = await bancoNovo();
  const dia = diaUtil();
  await falhaCom(pedir(db, { inicio: em(dia, '07:30') }), 'FORA_DO_EXPEDIENTE');
  await falhaCom(pedir(db, { servicos: [2], inicio: em(dia, '16:30') }), 'FORA_DO_EXPEDIENTE'); // 2h, passa das 18h
  await pedir(db, { servicos: [2], inicio: em(dia, '16:00') }); // termina às 18h em ponto
});

test('no máximo 2 pedidos em aberto por telefone (RN-09)', { skip: pular }, async () => {
  const db = await bancoNovo();
  const dia = diaUtil();
  await pedir(db, { inicio: em(dia, '08:00') });
  await pedir(db, { inicio: em(dia, '10:00') });
  await falhaCom(pedir(db, { inicio: em(dia, '12:00') }), 'LIMITE_ATIVOS');
  await pedir(db, { telefone: '+5511900000001', inicio: em(dia, '12:00') }); // outro telefone pode
});

test('pedido do site e agendamento do painel disputam o mesmo lugar (RN-06)', { skip: pular }, async () => {
  const db = await bancoNovo();
  const dia = diaUtil();
  await db.query('select criar_agendamento_painel($1, $2, $3, $4, $5, $6, $7)', [
    'Carlos Andrade', '+5511911112222', [2], em(dia, '09:00'), '', '', 1,
  ]);
  await falhaCom(pedir(db, { inicio: em(dia, '10:00') }), 'HORARIO_OCUPADO');
  await pedir(db, { inicio: em(dia, '11:00') });
});

test('serviço desativado não entra no pedido (RN-04)', { skip: pular }, async () => {
  const db = await bancoNovo();
  await falhaCom(pedir(db, { servicos: [4], inicio: em(diaUtil(), '10:00') }), 'SERVICO_INVALIDO');
  await falhaCom(pedir(db, { servicos: [], inicio: em(diaUtil(), '10:00') }), 'SEM_SERVICO');
});

test('pedido sem resposta no prazo expira e libera o horário (RN-08)', { skip: pular }, async () => {
  const db = await bancoNovo();
  const dia = diaUtil();
  const codigo = await pedir(db, { inicio: em(dia, '10:00') });
  await falhaCom(pedir(db, { telefone: '+5511900000001', inicio: em(dia, '10:00') }), 'HORARIO_OCUPADO');

  // 13 horas depois do pedido (prazo de 12).
  await db.query("update agendamento set criado_em = now() - interval '13 hours' where codigo = $1", [codigo]);
  assert.equal((await db.query('select expirar_pedidos() as n')).rows[0].n, 1);
  assert.equal((await db.query('select status from agendamento where codigo = $1', [codigo])).rows[0].status, 'EXPIRADO');

  await pedir(db, { telefone: '+5511900000001', inicio: em(dia, '10:00') });
});

test('expirar não mexe em pedido no prazo nem em confirmado', { skip: pular }, async () => {
  const db = await bancoNovo();
  const dia = diaUtil();
  await pedir(db, { inicio: em(dia, '10:00') });
  await db.query('select criar_agendamento_painel($1, $2, $3, $4, $5, $6, $7)', [
    'Carlos Andrade', '+5511911112222', [1], em(dia, '14:00'), '', '', 1,
  ]);
  await db.query("update agendamento set criado_em = now() - interval '2 days' where origem = 'painel'");
  assert.equal((await db.query('select expirar_pedidos() as n')).rows[0].n, 0);
});
