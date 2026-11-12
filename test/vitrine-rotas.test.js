'use strict';

/*
 * Rotas públicas do site com o app de verdade numa porta local; o banco é
 * trocado por respostas falsas (ver test/apoio/app.js).
 */
const test = require('node:test');
const assert = require('node:assert/strict');
const app = require('./apoio/app');
const vitrine = app.substituir(require('../src/repositorios/vitrine'));
const { ErroHttp } = require('../src/util/erros');

const { pedir } = app;

test.before(app.iniciar);
test.after(app.parar);
test.beforeEach(() => {
  app.sair();
  vitrine.resposta = null;
});

const PEDIDO = {
  servicos: ['1', '6'],
  data: '2026-11-16',
  horario: '10:00',
  nome: 'Ana Souza',
  telefone: '+5511987654321',
  modeloVeiculo: 'Onix',
  observacoes: '',
  consentimentoLgpd: true,
};

test('/health responde sem sessão (RNF-03)', async () => {
  const r = await pedir('GET', '/health');
  assert.equal(r.status, 200);
  assert.deepEqual(r.corpo, { ok: true });
});

test('empresa e agenda são públicas', async () => {
  vitrine.resposta = { nome: 'GHdetail' };
  assert.equal((await pedir('GET', '/api/vitrine/empresa')).status, 200);
  assert.equal((await pedir('GET', '/api/vitrine/agenda')).status, 200);
});

test('horários exigem data e serviços válidos', async () => {
  assert.equal((await pedir('GET', '/api/vitrine/horarios?servicos=1')).status, 400);
  assert.equal((await pedir('GET', '/api/vitrine/horarios?data=2026-11-16')).status, 400);
  vitrine.resposta = ['08:00', '08:30'];
  const r = await pedir('GET', '/api/vitrine/horarios?data=2026-11-16&servicos=1,6');
  assert.equal(r.status, 200);
  assert.deepEqual(r.corpo, { data: '2026-11-16', horarios: ['08:00', '08:30'] });
  assert.deepEqual(vitrine.ultima('horarios').argumentos, [{ ano: 2026, mes: 11, dia: 16 }, [1, 6]]);
  assert.equal(r.cabecalhos.get('cache-control'), 'no-store');
});

test('pedido exige consentimento LGPD, nome e celular com DDD (RN-01, RNF-13)', async () => {
  assert.equal((await pedir('POST', '/api/vitrine/agendamentos', { ...PEDIDO, consentimentoLgpd: false })).status, 400);
  assert.equal((await pedir('POST', '/api/vitrine/agendamentos', { ...PEDIDO, nome: 'Al' })).status, 400);
  assert.equal((await pedir('POST', '/api/vitrine/agendamentos', { ...PEDIDO, telefone: '+551130000000' })).status, 400); // fixo
  assert.equal((await pedir('POST', '/api/vitrine/agendamentos', { ...PEDIDO, servicos: [] })).status, 400);
  assert.equal((await pedir('POST', '/api/vitrine/agendamentos', { ...PEDIDO, horario: '10:07' })).status, 400);
});

test('pedido válido vai ao banco no fuso da estética e devolve o código', async () => {
  vitrine.resposta = 'K7M2QX';
  const r = await pedir('POST', '/api/vitrine/agendamentos', PEDIDO);
  assert.equal(r.status, 201);
  assert.deepEqual(r.corpo, { codigo: 'K7M2QX' });
  const [dados] = vitrine.ultima('criarPedido').argumentos;
  assert.equal(dados.telefone, '+5511987654321');
  assert.deepEqual(dados.servicos, [1, 6]);
  assert.equal(dados.inicio.toISOString(), '2026-11-16T13:00:00.000Z');
});

test('regra do banco chega ao site como 409 com o código', async () => {
  vitrine.resposta = new ErroHttp(409, 'HORARIO_OCUPADO', 'Esse horário acabou de ser ocupado.');
  const r = await pedir('POST', '/api/vitrine/agendamentos', PEDIDO);
  assert.equal(r.status, 409);
  assert.equal(r.corpo.erro.codigo, 'HORARIO_OCUPADO');
});
