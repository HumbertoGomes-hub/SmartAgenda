'use strict';

/*
 * Rota do relatório com o app de verdade, numa porta local. O banco é trocado
 * por respostas falsas: aqui se testa sessão, permissão (só dono e sócio),
 * a leitura do mês e o período pedido à agenda.
 */
const test = require('node:test');
const assert = require('node:assert/strict');
const app = require('./apoio/app');
const agenda = require('../src/repositorios/agenda');

const falso = app.substituir(agenda);
const { pedir, entrar } = app;

test.before(app.iniciar);
test.after(app.parar);
test.beforeEach(() => {
  falso.resposta = [];
});

test('sem sessão, o relatório responde 401', async () => {
  app.sair();
  assert.equal((await pedir('GET', '/api/admin/relatorio?mes=2026-11')).status, 401);
});

test('funcionário não vê o relatório (RN-13)', async () => {
  await entrar('FUNCIONARIO');
  const r = await pedir('GET', '/api/admin/relatorio?mes=2026-11');
  assert.equal(r.status, 403);
  assert.equal(r.corpo.erro.codigo, 'SEM_PERMISSAO');
});

test('mês em formato errado responde 400', async () => {
  await entrar('SOCIO');
  const r = await pedir('GET', '/api/admin/relatorio?mes=2026-13');
  assert.equal(r.status, 400);
  assert.equal(r.corpo.erro.codigo, 'DADOS_INVALIDOS');
});

test('sócio vê o relatório do mês, com todos os status do período', async () => {
  await entrar('SOCIO');
  falso.resposta = [
    { status: 'CONCLUIDO', origem: 'site', itens: [{ servicoId: 1, nome: 'Lavagem', precoPraticado: 80, duracaoMinutos: 60 }] },
    { status: 'CANCELADO', origem: 'painel', itens: [{ servicoId: 1, nome: 'Lavagem', precoPraticado: 80, duracaoMinutos: 60 }] },
  ];

  const r = await pedir('GET', '/api/admin/relatorio?mes=2026-11');
  assert.equal(r.status, 200);
  assert.equal(r.corpo.mes, '2026-11');
  assert.equal(r.corpo.totais.agendamentos, 2);
  assert.equal(r.corpo.totais.valorConcluidos, 80);
  assert.deepEqual(r.corpo.porOrigem, { site: 1, painel: 1 });

  const [inicio, fim, opcoes] = falso.ultima('listarPeriodo').argumentos;
  assert.equal(inicio.toISOString(), '2026-11-01T03:00:00.000Z');
  assert.equal(fim.toISOString(), '2026-12-01T03:00:00.000Z');
  assert.deepEqual(opcoes, { incluirLiberados: true });
});

test('sem mês, o dono vê o mês atual', async () => {
  await entrar('DONO');
  const r = await pedir('GET', '/api/admin/relatorio');
  assert.equal(r.status, 200);
  const agora = new Date();
  const esperado = `${agora.getFullYear()}-${String(agora.getMonth() + 1).padStart(2, '0')}`;
  assert.equal(r.corpo.mes, esperado);
});
