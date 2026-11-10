'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { lerUsuario, lerSenha, conferirProprioAcesso } = require('../src/dominio/usuarios');

function recusa(fn, trecho) {
  assert.throws(fn, (erro) => erro.status === 400 && erro.message.includes(trecho));
}

const NOVO = { nome: ' Ana  Ribeiro ', email: ' Ana@Exemplo.COM ', perfil: 'SOCIO', senha: 'senha-segura' };

test('cadastro: nome limpo, e-mail em minúsculas e senha obrigatória (RF-15)', () => {
  assert.deepEqual(lerUsuario(NOVO, { completo: true }), {
    nome: 'Ana Ribeiro',
    email: 'ana@exemplo.com',
    perfil: 'SOCIO',
    senha: 'senha-segura',
  });
  recusa(() => lerUsuario({ ...NOVO, senha: 'curta' }, { completo: true }), 'senha');
  recusa(() => lerUsuario({ ...NOVO, senha: undefined }, { completo: true }), 'senha');
  recusa(() => lerUsuario({ ...NOVO, email: 'ana@' }, { completo: true }), 'e-mail');
  recusa(() => lerUsuario({ ...NOVO, perfil: 'CLIENTE' }, { completo: true }), 'perfil');
  recusa(() => lerUsuario({ ...NOVO, nome: 'A' }, { completo: true }), 'nome');
});

test('cadastro: telefone, cargo e avisos são opcionais', () => {
  const dados = lerUsuario(
    { ...NOVO, perfil: 'FUNCIONARIO', telefone: '(11) 98765-4321', cargo: ' Polidor ', recebeNotificacoes: false },
    { completo: true },
  );
  assert.equal(dados.telefone, '+5511987654321');
  assert.equal(dados.cargo, 'Polidor');
  assert.equal(dados.recebeNotificacoes, false);
  assert.equal(lerUsuario({ ...NOVO, telefone: '' }, { completo: true }).telefone, null);
  recusa(() => lerUsuario({ ...NOVO, telefone: '9876' }, { completo: true }), 'telefone');
});

test('edição: só os campos enviados; ativo só existe na edição', () => {
  assert.deepEqual(lerUsuario({ ativo: false }, { completo: false }), { ativo: false });
  assert.deepEqual(lerUsuario({ nome: 'Ana R.' }, { completo: false }), { nome: 'Ana R.' });
  assert.equal('ativo' in lerUsuario({ ...NOVO, ativo: false }, { completo: true }), false);
  assert.equal('senha' in lerUsuario({ senha: 'qualquer-coisa' }, { completo: false }), false);
  recusa(() => lerUsuario({ ativo: 'não' }, { completo: false }), 'Ativo');
});

test('senha: de 8 a 72 caracteres (limite do bcrypt)', () => {
  assert.equal(lerSenha('12345678'), '12345678');
  recusa(() => lerSenha('1234567'), 'senha');
  recusa(() => lerSenha('x'.repeat(73)), 'senha');
  recusa(() => lerSenha(12345678), 'senha');
});

test('o dono não desativa nem muda o perfil do próprio acesso', () => {
  const proprio = (dados) => () => conferirProprioAcesso(1, 1, dados);
  for (const dados of [{ ativo: false }, { perfil: 'SOCIO' }]) {
    assert.throws(proprio(dados), (erro) => erro.status === 409 && erro.codigo === 'PROPRIO_ACESSO');
  }
  // Mudar o próprio nome ou manter o perfil de dono pode.
  assert.doesNotThrow(proprio({ nome: 'Marcos', perfil: 'DONO', ativo: true }));
  // Com outra pessoa, a regra do último dono fica com o banco.
  assert.doesNotThrow(() => conferirProprioAcesso(2, 1, { ativo: false, perfil: 'FUNCIONARIO' }));
});
