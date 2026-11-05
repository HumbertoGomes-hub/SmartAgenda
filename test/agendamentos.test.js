'use strict';

// O módulo carrega a configuração; valores fictícios bastam, nada é consultado.
process.env.SESSION_SECRET = process.env.SESSION_SECRET || 'segredo-de-teste';
process.env.SUPABASE_URL = process.env.SUPABASE_URL || 'http://localhost:54321';
process.env.SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_KEY || 'chave-de-teste';

const test = require('node:test');
const assert = require('node:assert/strict');
const { paraResposta } = require('../src/repositorios/agendamentos');

const linha = {
  codigo: 'B3XJ7P',
  data_hora_inicio: '2026-11-05T11:00:00+00:00',
  data_hora_fim: '2026-11-05T13:00:00+00:00',
  modelo_veiculo: 'Honda Civic',
  observacoes: null,
  status: 'PENDENTE',
  criado_em: '2026-11-04T10:00:00+00:00',
  cliente: { nome: 'Diego Martins', telefone: '+5511910987654' },
  itens: [
    { servico_id: 1, preco_praticado: 80, duracao_minutos: 60, servico: { nome: 'Lavagem detalhada' } },
    { servico_id: 6, preco_praticado: '120.00', duracao_minutos: 60, servico: { nome: 'Cristalização de vidros' } },
  ],
};

test('converte a linha do banco para o formato do painel', () => {
  const resposta = paraResposta(linha, 12);

  assert.equal(resposta.codigo, 'B3XJ7P');
  assert.equal(resposta.dataHoraInicio, '2026-11-05T11:00:00.000Z');
  assert.deepEqual(resposta.cliente, { nome: 'Diego Martins', telefone: '+5511910987654' });
  assert.equal(resposta.observacoes, '');
  assert.equal(resposta.duracaoMinutos, 120);
  assert.equal(resposta.valorEstimado, 200);
  assert.deepEqual(resposta.itens[1], {
    servicoId: 6,
    nome: 'Cristalização de vidros',
    precoPraticado: 120,
    duracaoMinutos: 60,
  });
});

test('pedido pendente expira no prazo de resposta (RN-08)', () => {
  assert.equal(paraResposta(linha, 12).expiraEm, '2026-11-04T22:00:00.000Z');
});

test('só pedido pendente tem prazo de expiração', () => {
  assert.equal(paraResposta({ ...linha, status: 'CONFIRMADO' }, 12).expiraEm, undefined);
});
