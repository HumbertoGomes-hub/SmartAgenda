'use strict';

/*
 * Rotas de serviços, portfólio e vitrine com o app de verdade numa porta
 * local; o banco é trocado por respostas falsas (ver test/apoio/app.js).
 */
const test = require('node:test');
const assert = require('node:assert/strict');
const app = require('./apoio/app');
const servicos = app.substituir(require('../src/repositorios/servicos'));
const portfolio = app.substituir(require('../src/repositorios/portfolio'));
const { ErroHttp } = require('../src/util/erros');

const { pedir, entrar } = app;
const WEBP = Buffer.concat([Buffer.from('RIFF'), Buffer.alloc(4), Buffer.from('WEBPVP8 '), Buffer.alloc(32)]);

test.before(app.iniciar);
test.after(app.parar);
test.beforeEach(() => {
  servicos.resposta = null;
  portfolio.resposta = null;
});

test('funcionário não gerencia serviços, mas gerencia o portfólio (RN-13)', async () => {
  await entrar('FUNCIONARIO');
  assert.equal((await pedir('GET', '/api/admin/servicos')).status, 403);
  assert.equal((await pedir('PATCH', '/api/admin/servicos/1', { precoBase: 1 })).status, 403);
  assert.equal((await pedir('PUT', '/api/admin/servicos/1/foto', { bytes: WEBP, tipo: 'image/webp' })).status, 403);

  servicos.resposta = [];
  portfolio.resposta = [];
  assert.equal((await pedir('GET', '/api/admin/portfolio')).status, 200);
});

test('sócio cria serviço com os campos validados', async () => {
  await entrar('SOCIO');
  assert.equal((await pedir('POST', '/api/admin/servicos', { nome: 'Lavagem' })).status, 400);

  const r = await pedir('POST', '/api/admin/servicos', {
    nome: 'Lavagem de motor',
    categoria: 'Lavagem',
    precoBase: 120,
    duracaoMinutos: 90,
  });
  assert.equal(r.status, 201);
  assert.deepEqual(servicos.ultima('criar').argumentos[0], {
    nome: 'Lavagem de motor',
    categoria: 'Lavagem',
    preco_base: 120,
    duracao_minutos: 90,
  });
});

test('desativar serviço é uma edição; não existe exclusão (RF-20)', async () => {
  await entrar('DONO');
  assert.equal((await pedir('PATCH', '/api/admin/servicos/3', { ativo: false })).status, 200);
  assert.deepEqual(servicos.ultima('editar').argumentos, [3, { ativo: false }]);
  assert.equal((await pedir('DELETE', '/api/admin/servicos/3')).status, 404);
});

test('foto do serviço: confere o formato real e o tamanho (RNF-09)', async () => {
  await entrar('DONO');
  const semFoto = await pedir('PUT', '/api/admin/servicos/1/foto', { nome: 'x' });
  assert.equal(semFoto.status, 415);

  const disfarcada = await pedir('PUT', '/api/admin/servicos/1/foto', { bytes: Buffer.from('<script>alert(1)</script>'), tipo: 'image/png' });
  assert.equal(disfarcada.status, 415);
  assert.equal(disfarcada.corpo.erro.codigo, 'FORMATO_INVALIDO');

  const grande = await pedir('PUT', '/api/admin/servicos/1/foto', { bytes: Buffer.concat([WEBP, Buffer.alloc(5 * 1024 * 1024)]), tipo: 'image/webp' });
  assert.equal(grande.status, 413);
  assert.equal(grande.corpo.erro.codigo, 'FOTO_GRANDE');

  const ok = await pedir('PUT', '/api/admin/servicos/1/foto', { bytes: WEBP, tipo: 'image/webp' });
  assert.equal(ok.status, 200);
  const [id, foto] = servicos.ultima('trocarFoto').argumentos;
  assert.equal(id, 1);
  assert.equal(foto.tipo, 'image/webp');
  assert.equal(foto.extensao, 'webp');
});

test('portfólio: foto vai com o tipo; capa vem separada dos outros campos', async () => {
  await entrar('FUNCIONARIO');
  assert.equal((await pedir('POST', '/api/admin/portfolio/5/fotos?tipo=CAPA', { bytes: WEBP, tipo: 'image/webp' })).status, 400);

  assert.equal((await pedir('POST', '/api/admin/portfolio/5/fotos?tipo=antes', { bytes: WEBP, tipo: 'image/webp' })).status, 200);
  const [id, , opcoes] = portfolio.ultima('adicionarFoto').argumentos;
  assert.equal(id, 5);
  assert.deepEqual(opcoes, { tipo: 'ANTES', legenda: null });

  assert.equal((await pedir('PATCH', '/api/admin/portfolio/5', { publicado: true, naCapa: true })).status, 200);
  assert.deepEqual(portfolio.ultima('editar').argumentos, [5, { publicado: true }, true]);
});

test('portfólio: regra do banco chega ao painel como 409', async () => {
  await entrar('FUNCIONARIO');
  portfolio.resposta = new ErroHttp(409, 'CAPA_SEM_FOTOS', 'Precisa da foto de antes e da de depois.');
  const r = await pedir('PATCH', '/api/admin/portfolio/5', { naCapa: true });
  assert.equal(r.status, 409);
  assert.equal(r.corpo.erro.codigo, 'CAPA_SEM_FOTOS');
});

test('portfólio: ordenar fotos exige a lista de ids', async () => {
  await entrar('FUNCIONARIO');
  assert.equal((await pedir('PUT', '/api/admin/portfolio/5/fotos/ordem', { ids: ['a'] })).status, 400);
  assert.equal((await pedir('PUT', '/api/admin/portfolio/5/fotos/ordem', { ids: [9, 8] })).status, 200);
  assert.deepEqual(portfolio.ultima('ordenarFotos').argumentos, [5, [9, 8]]);
});

test('vitrine é pública e só pede o que pode aparecer no site', async () => {
  app.sair();
  servicos.resposta = [];
  portfolio.resposta = [];
  const r = await pedir('GET', '/api/vitrine/servicos');
  assert.equal(r.status, 200);
  assert.deepEqual(servicos.ultima('listar').argumentos, [{ apenasAtivos: true }]);
  assert.match(r.cabecalhos.get('cache-control'), /max-age=60/);

  assert.equal((await pedir('GET', '/api/vitrine/portfolio')).status, 200);
  assert.deepEqual(portfolio.ultima('listar').argumentos, [{ apenasPublicados: true }]);

  portfolio.resposta = { id: 2 };
  assert.equal((await pedir('GET', '/api/vitrine/portfolio/2')).status, 200);
  assert.deepEqual(portfolio.ultima('buscar').argumentos, [2, { apenasPublicado: true }]);
  assert.equal((await pedir('GET', '/api/vitrine/portfolio/abc')).status, 404);
});

test('sem sessão, o painel de serviços e portfólio responde 401', async () => {
  app.sair();
  assert.equal((await pedir('GET', '/api/admin/servicos')).status, 401);
  assert.equal((await pedir('POST', '/api/admin/portfolio/5/fotos', { bytes: WEBP, tipo: 'image/webp' })).status, 401);
});
