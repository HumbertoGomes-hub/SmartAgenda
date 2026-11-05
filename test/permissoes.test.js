'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { ACOES, permissoesDo, podeExecutar } = require('../src/auth/permissoes');

// Matriz de permissões da especificação (RN-13).
test('dono pode tudo', () => {
  for (const acao of Object.values(ACOES)) {
    assert.equal(podeExecutar('DONO', acao), true, acao);
  }
});

test('sócio não configura agenda e vitrine nem gerencia usuários', () => {
  assert.equal(podeExecutar('SOCIO', ACOES.SERVICOS), true);
  assert.equal(podeExecutar('SOCIO', ACOES.RELATORIO), true);
  assert.equal(podeExecutar('SOCIO', ACOES.CONFIGURACAO), false);
  assert.equal(podeExecutar('SOCIO', ACOES.USUARIOS), false);
});

test('funcionário só agenda, agendamento manual e portfólio', () => {
  assert.deepEqual(permissoesDo('FUNCIONARIO'), [ACOES.AGENDA, ACOES.AGENDAMENTO_MANUAL, ACOES.PORTFOLIO]);
});

test('perfil desconhecido não pode nada', () => {
  assert.deepEqual(permissoesDo('CLIENTE'), []);
  assert.equal(podeExecutar(undefined, ACOES.AGENDA), false);
});

test('a lista devolvida é uma cópia', () => {
  permissoesDo('DONO').push('qualquer-coisa');
  assert.equal(podeExecutar('DONO', 'qualquer-coisa'), false);
});
