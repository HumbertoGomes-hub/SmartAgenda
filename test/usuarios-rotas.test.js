'use strict';

/*
 * Rotas de usuários com o app de verdade, numa porta local. O banco é trocado
 * por respostas falsas: aqui se testa sessão, permissão (só o dono), o hash da
 * senha e a regra do próprio acesso. A regra do último dono (RN-14) é do banco
 * e tem teste próprio em usuarios-sql.test.js.
 */
const test = require('node:test');
const assert = require('node:assert/strict');
const bcrypt = require('bcrypt');
const app = require('./apoio/app');
const equipe = require('../src/repositorios/equipe');
const { ErroHttp } = require('../src/util/erros');

const falso = app.substituir(equipe);
const { pedir, entrar, USUARIO_ID } = app;

const NOVO = { nome: 'Ana Ribeiro', email: 'ana@exemplo.com', perfil: 'SOCIO', senha: 'senha-segura' };

test.before(app.iniciar);
test.after(app.parar);
test.beforeEach(() => {
  falso.resposta = null;
});

test('sem sessão, usuários respondem 401', async () => {
  app.sair();
  assert.equal((await pedir('GET', '/api/admin/usuarios')).status, 401);
  assert.equal((await pedir('POST', '/api/admin/usuarios', NOVO)).status, 401);
});

test('só o dono gerencia usuários (RN-13, RN-14)', async () => {
  for (const perfil of ['SOCIO', 'FUNCIONARIO']) {
    await entrar(perfil);
    const r = await pedir('GET', '/api/admin/usuarios');
    assert.equal(r.status, 403, perfil);
    assert.equal(r.corpo.erro.codigo, 'SEM_PERMISSAO');
  }
});

test('cadastro guarda só o hash bcrypt da senha (RNF-07)', async () => {
  await entrar('DONO');
  assert.equal((await pedir('POST', '/api/admin/usuarios', { ...NOVO, senha: 'curta' })).status, 400);

  falso.resposta = { id: 9, nome: 'Ana Ribeiro' };
  const r = await pedir('POST', '/api/admin/usuarios', NOVO);
  assert.equal(r.status, 201);
  const [dados] = falso.ultima('criar').argumentos;
  assert.equal('senha' in dados, false);
  assert.match(dados.senhaHash, /^\$2[aby]\$12\$/);
  assert.equal(await bcrypt.compare('senha-segura', dados.senhaHash), true);
});

test('e-mail repetido chega ao painel como 409', async () => {
  await entrar('DONO');
  falso.resposta = new ErroHttp(409, 'EMAIL_EM_USO', 'Já existe um usuário com esse e-mail.');
  const r = await pedir('POST', '/api/admin/usuarios', NOVO);
  assert.equal(r.status, 409);
  assert.equal(r.corpo.erro.codigo, 'EMAIL_EM_USO');
});

test('o dono não desativa nem rebaixa o próprio acesso', async () => {
  await entrar('DONO');
  const antes = falso.chamadas.length;
  const desativar = await pedir('PATCH', `/api/admin/usuarios/${USUARIO_ID}`, { ativo: false });
  assert.equal(desativar.status, 409);
  assert.equal(desativar.corpo.erro.codigo, 'PROPRIO_ACESSO');
  assert.equal((await pedir('PATCH', `/api/admin/usuarios/${USUARIO_ID}`, { perfil: 'SOCIO' })).status, 409);
  assert.equal(falso.chamadas.length, antes);

  assert.equal((await pedir('PATCH', `/api/admin/usuarios/${USUARIO_ID}`, { nome: 'Lucas Dono' })).status, 200);
});

test('desativar outra pessoa e trocar a senha dela', async () => {
  await entrar('DONO');
  assert.equal((await pedir('PATCH', '/api/admin/usuarios/3', {})).status, 400);
  assert.equal((await pedir('PATCH', '/api/admin/usuarios/abc', { ativo: false })).status, 404);

  assert.equal((await pedir('PATCH', '/api/admin/usuarios/3', { ativo: false })).status, 200);
  assert.deepEqual(falso.ultima('editar').argumentos, [3, { ativo: false }]);

  assert.equal((await pedir('PUT', '/api/admin/usuarios/3/senha', { senha: '123' })).status, 400);
  assert.equal((await pedir('PUT', '/api/admin/usuarios/3/senha', { senha: 'nova-senha-123' })).status, 204);
  const [id, hash] = falso.ultima('definirSenha').argumentos;
  assert.equal(id, 3);
  assert.equal(await bcrypt.compare('nova-senha-123', hash), true);
});

test('último dono: a regra do banco chega ao painel como 409', async () => {
  await entrar('DONO');
  falso.resposta = new ErroHttp(409, 'ULTIMO_DONO', 'Precisa existir pelo menos um dono ativo.');
  const r = await pedir('PATCH', '/api/admin/usuarios/2', { perfil: 'SOCIO' });
  assert.equal(r.status, 409);
  assert.equal(r.corpo.erro.codigo, 'ULTIMO_DONO');
});
