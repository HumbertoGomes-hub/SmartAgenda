'use strict';

/*
 * Rotas de pedidos e agenda com o app de verdade, numa porta local.
 * O banco é trocado por respostas falsas: aqui se testa sessão, permissão,
 * validação dos dados e a tradução dos erros. O SQL tem os próprios testes
 * (agenda-sql.test.js).
 */
const test = require('node:test');
const assert = require('node:assert/strict');
const app = require('./apoio/app');
const agenda = require('../src/repositorios/agenda');
const { ErroHttp } = require('../src/util/erros');

const falso = app.substituir(agenda);
const { pedir, entrar } = app;
const ultima = falso.ultima;

test.before(app.iniciar);
test.after(app.parar);
test.beforeEach(() => {
  falso.resposta = null;
});

test('sem sessão, pedidos e agenda respondem 401', async () => {
  app.sair();
  assert.equal((await pedir('GET', '/api/admin/pedidos')).status, 401);
  assert.equal((await pedir('GET', '/api/admin/agenda?de=2026-11-01&ate=2026-11-30')).status, 401);
  assert.equal((await pedir('POST', '/api/admin/agendamentos/K7M2QX/aceitar')).status, 401);
});

test('perfil sem a permissão de agenda recebe 403 (RN-13)', async () => {
  await entrar('PERFIL_DESCONHECIDO');
  const r = await pedir('GET', '/api/admin/pedidos');
  assert.equal(r.status, 403);
  assert.equal(r.corpo.erro.codigo, 'SEM_PERMISSAO');
});

test('funcionário vê os pedidos', async () => {
  await entrar('FUNCIONARIO');
  falso.resposta = { prazoRespostaHoras: 12, pendentes: [], aguardandoCliente: [] };
  const r = await pedir('GET', '/api/admin/pedidos');
  assert.equal(r.status, 200);
  assert.deepEqual(r.corpo, falso.resposta);
});

test('agenda exige um período válido de até 62 dias', async () => {
  await entrar('FUNCIONARIO');
  assert.equal((await pedir('GET', '/api/admin/agenda')).status, 400);
  assert.equal((await pedir('GET', '/api/admin/agenda?de=2026-11-01&ate=2027-01-15')).status, 400);

  const r = await pedir('GET', '/api/admin/agenda?de=2026-11-01&ate=2026-11-30&liberados=1');
  assert.equal(r.status, 200);
  const [inicio, fim, opcoes] = ultima('listarPeriodo').argumentos;
  assert.equal(inicio.toISOString(), '2026-11-01T03:00:00.000Z');
  assert.equal(fim.toISOString(), '2026-12-01T03:00:00.000Z');
  assert.deepEqual(opcoes, { incluirLiberados: true });
});

test('aceitar registra quem respondeu', async () => {
  await entrar('FUNCIONARIO');
  const r = await pedir('POST', '/api/admin/agendamentos/k7m2qx/aceitar');
  assert.equal(r.status, 200);
  assert.deepEqual(ultima('aceitar').argumentos, ['K7M2QX', 7]);
});

test('código inválido responde 404 sem consultar o banco', async () => {
  await entrar('FUNCIONARIO');
  const antes = falso.chamadas.length;
  assert.equal((await pedir('POST', '/api/admin/agendamentos/K7M0QX/cancelar')).status, 404);
  assert.equal(falso.chamadas.length, antes);
});

test('agendamento manual valida os dados e grava no fuso da estética (RF-18)', async () => {
  await entrar('FUNCIONARIO');
  const valido = { nome: 'Carlos Andrade', telefone: '(11) 98765-4321', servicos: [1, 3], data: '2026-11-10', hora: '14:30', modeloVeiculo: 'Onix' };

  assert.equal((await pedir('POST', '/api/admin/agendamentos', { ...valido, nome: 'Al' })).status, 400);
  assert.equal((await pedir('POST', '/api/admin/agendamentos', { ...valido, telefone: '9876' })).status, 400);
  assert.equal((await pedir('POST', '/api/admin/agendamentos', { ...valido, servicos: [] })).status, 400);
  assert.equal((await pedir('POST', '/api/admin/agendamentos', { ...valido, hora: '14:32' })).status, 400);

  const r = await pedir('POST', '/api/admin/agendamentos', valido);
  assert.equal(r.status, 201);
  const [dados] = ultima('criarManual').argumentos;
  assert.equal(dados.telefone, '+5511987654321');
  assert.equal(dados.inicio.toISOString(), '2026-11-10T17:30:00.000Z');
  assert.deepEqual(dados.servicos, [1, 3]);
  assert.equal(dados.observacoes, '');
  assert.equal(dados.responsavelId, 7);
});

test('horário ocupado chega ao painel como 409 com o código do erro', async () => {
  await entrar('FUNCIONARIO');
  falso.resposta = new ErroHttp(409, 'HORARIO_OCUPADO', 'Esse horário já está ocupado.');
  const r = await pedir('PATCH', '/api/admin/agendamentos/K7M2QX', { data: '2026-11-10', hora: '09:00' });
  assert.equal(r.status, 409);
  assert.equal(r.corpo.erro.codigo, 'HORARIO_OCUPADO');
});

test('editar exige alguma mudança e data junto com hora', async () => {
  await entrar('FUNCIONARIO');
  assert.equal((await pedir('PATCH', '/api/admin/agendamentos/K7M2QX', {})).status, 400);
  assert.equal((await pedir('PATCH', '/api/admin/agendamentos/K7M2QX', { data: '2026-11-10' })).status, 400);

  const r = await pedir('PATCH', '/api/admin/agendamentos/K7M2QX', { observacoes: 'Trocar o horário a pedido do cliente' });
  assert.equal(r.status, 200);
  assert.deepEqual(ultima('editar').argumentos, [
    'K7M2QX',
    { inicio: undefined, servicos: undefined, modeloVeiculo: undefined, observacoes: 'Trocar o horário a pedido do cliente' },
  ]);
});

test('atendimento aceita só concluído ou não compareceu (RF-19)', async () => {
  await entrar('FUNCIONARIO');
  assert.equal((await pedir('POST', '/api/admin/agendamentos/K7M2QX/atendimento', { resultado: 'CANCELADO' })).status, 400);
  const r = await pedir('POST', '/api/admin/agendamentos/K7M2QX/atendimento', { resultado: 'NAO_COMPARECEU' });
  assert.equal(r.status, 200);
  assert.deepEqual(ultima('registrarAtendimento').argumentos, ['K7M2QX', 'NAO_COMPARECEU']);
});
