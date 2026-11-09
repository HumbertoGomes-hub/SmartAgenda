'use strict';

// O mês é lido no fuso da estética, como no servidor (config.js).
process.env.TZ = 'America/Sao_Paulo';

const test = require('node:test');
const assert = require('node:assert/strict');
const { STATUS, lerMes, mesDe, montarRelatorio } = require('../src/dominio/relatorio');

const NOVEMBRO = lerMes('2026-11');

function agendamento(status, itens, origem = 'site') {
  return {
    status,
    origem,
    itens: itens.map(([servicoId, nome, precoPraticado]) => ({ servicoId, nome, precoPraticado, duracaoMinutos: 60 })),
  };
}

const LAVAGEM = [1, 'Lavagem', 80];
const POLIMENTO = [2, 'Polimento', 450];
const VIDROS = [3, 'Vidros', 120];

const DO_MES = [
  agendamento('CONCLUIDO', [LAVAGEM, VIDROS]),
  agendamento('CONCLUIDO', [LAVAGEM], 'painel'),
  agendamento('NAO_COMPARECEU', [POLIMENTO]),
  agendamento('CANCELADO', [LAVAGEM]),
  agendamento('PENDENTE', [POLIMENTO]),
];

test('lê o mês no fuso da estética', () => {
  const mes = lerMes('2026-11');
  assert.equal(mes.texto, '2026-11');
  assert.equal(mes.inicio.toISOString(), '2026-11-01T03:00:00.000Z');
  assert.equal(mes.fim.toISOString(), '2026-12-01T03:00:00.000Z');
  assert.equal(lerMes('2026-12').fim.toISOString(), '2027-01-01T03:00:00.000Z');
  assert.equal(mesDe(new Date(2026, 10, 30, 23, 59)), '2026-11');
});

test('recusa mês em formato errado', () => {
  for (const texto of ['2026-13', '2026-00', '2026-1', '11-2026', '1999-05', '', undefined, 202611]) {
    assert.equal(lerMes(texto), null, String(texto));
  }
});

test('totais do mês e valor estimado só dos concluídos (RF-24)', () => {
  const { totais } = montarRelatorio(DO_MES, NOVEMBRO);
  assert.deepEqual(totais, {
    agendamentos: 5,
    naAgenda: 1,
    concluidos: 2,
    naoCompareceu: 1,
    comparecimento: 0.6667,
    valorConcluidos: 280,
    ticketMedio: 140,
  });
});

test('por status: do maior para o menor, empates na ordem do ciclo de vida', () => {
  const { porStatus } = montarRelatorio(DO_MES, NOVEMBRO);
  assert.deepEqual(
    porStatus.map((linha) => `${linha.status}:${linha.quantidade}`),
    [
      'CONCLUIDO:2',
      'PENDENTE:1',
      'NAO_COMPARECEU:1',
      'CANCELADO:1',
      'AGUARDANDO_CLIENTE:0',
      'CONFIRMADO:0',
      'RECUSADO:0',
      'EXPIRADO:0',
    ],
  );
});

test('por serviço: um agendamento com dois serviços conta nos dois', () => {
  const { porServico } = montarRelatorio(DO_MES, NOVEMBRO);
  assert.deepEqual(porServico, [
    { servicoId: 1, nome: 'Lavagem', agendamentos: 3, concluidos: 2, valorConcluidos: 160 },
    { servicoId: 3, nome: 'Vidros', agendamentos: 1, concluidos: 1, valorConcluidos: 120 },
    { servicoId: 2, nome: 'Polimento', agendamentos: 2, concluidos: 0, valorConcluidos: 0 },
  ]);
});

test('por origem: site ou painel', () => {
  assert.deepEqual(montarRelatorio(DO_MES, NOVEMBRO).porOrigem, { site: 4, painel: 1 });
});

test('mês sem agendamentos não divide por zero', () => {
  const relatorio = montarRelatorio([], NOVEMBRO);
  assert.equal(relatorio.totais.agendamentos, 0);
  assert.equal(relatorio.totais.comparecimento, null);
  assert.equal(relatorio.totais.ticketMedio, null);
  assert.equal(relatorio.totais.valorConcluidos, 0);
  assert.deepEqual(relatorio.porServico, []);
  assert.deepEqual(relatorio.porStatus.map((linha) => linha.status), [...STATUS]);
});

test('valores em centavos sem erro de arredondamento', () => {
  const { totais } = montarRelatorio(
    [agendamento('CONCLUIDO', [[1, 'Lavagem', 95.5], [3, 'Vidros', 0.1]]), agendamento('CONCLUIDO', [[3, 'Vidros', 0.2]])],
    NOVEMBRO,
  );
  assert.equal(totais.valorConcluidos, 95.8);
  assert.equal(totais.ticketMedio, 47.9);
});
