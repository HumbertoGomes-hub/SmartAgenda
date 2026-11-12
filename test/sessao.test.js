'use strict';

/*
 * Sessão do painel em cookie assinado (middlewares/sessao.js): o que entra,
 * o que é recusado e o que sai no logout. Usa o app de verdade numa porta
 * local, com o usuário de teste de test/apoio/app.js.
 */
const test = require('node:test');
const assert = require('node:assert/strict');
const app = require('./apoio/app');
const sessao = require('../src/middlewares/sessao');
const agenda = app.substituir(require('../src/repositorios/agenda'));

test.before(app.iniciar);
test.after(app.parar);

function cookiesDe(resposta) {
  const lista = {};
  for (const linha of resposta.cabecalhos.getSetCookie()) {
    const [par, ...atributos] = linha.split(';').map((p) => p.trim());
    const igual = par.indexOf('=');
    lista[par.slice(0, igual)] = { valor: par.slice(igual + 1), atributos };
  }
  return lista;
}

test('login cria a sessão httpOnly e o cookie do painel, sem dado sensível', async () => {
  app.sair();
  const r = await app.pedir('POST', '/api/admin/entrar', { email: 'lucas@teste.test', senha: 'senha-de-teste' });
  assert.equal(r.status, 200);
  const cookies = cookiesDe(r);

  const sid = cookies[sessao.COOKIE_SESSAO];
  assert.ok(sid.atributos.includes('HttpOnly'));
  assert.ok(sid.atributos.includes('SameSite=Lax'));
  assert.ok(sid.atributos.includes('Max-Age=1800')); // 30 minutos (RNF-07)

  const painel = cookies[sessao.COOKIE_PAINEL];
  assert.ok(!painel.atributos.includes('HttpOnly'), 'o painel precisa ler este cookie');
  const publico = JSON.parse(Buffer.from(decodeURIComponent(painel.valor), 'base64url').toString());
  assert.equal(publico.usuario.nome, 'Lucas');
  assert.ok(Array.isArray(publico.usuario.permissoes));
  assert.equal(JSON.stringify(publico).includes('senha'), false);
});

test('cada requisição com sessão renova o prazo (expiração deslizante)', async () => {
  await app.entrar('FUNCIONARIO');
  agenda.resposta = { prazoRespostaHoras: 12, pendentes: [], aguardandoCliente: [] };
  const r = await app.pedir('GET', '/api/admin/pedidos');
  assert.equal(r.status, 200);
  const cookies = cookiesDe(r);
  assert.ok(cookies[sessao.COOKIE_SESSAO].valor, 'a sessão foi reenviada com prazo novo');
  assert.ok(cookies[sessao.COOKIE_PAINEL].valor);
});

test('cookie adulterado ou vencido não abre o painel', async () => {
  const valido = sessao.codificar({ usuarioId: 7, expira: Date.now() + 60000 });
  const [corpo] = valido.split('.');
  const outroUsuario = Buffer.from(JSON.stringify({ usuarioId: 1, expira: Date.now() + 60000 })).toString('base64url');
  const vencido = sessao.codificar({ usuarioId: 7, expira: Date.now() - 1000 });

  assert.equal(sessao.decodificar(valido).usuarioId, 7);
  assert.equal(sessao.decodificar(outroUsuario + '.' + valido.split('.')[1]), null, 'troca do conteúdo');
  assert.equal(sessao.decodificar(corpo + '.assinatura-falsa'), null, 'assinatura falsa');
  assert.equal(sessao.decodificar(vencido), null, 'prazo vencido');
  assert.equal(sessao.decodificar('lixo'), null);

  const resposta = await fetch(`http://127.0.0.1:${app.porta()}/api/admin/sessao`, {
    headers: { cookie: `${sessao.COOKIE_SESSAO}=${encodeURIComponent(outroUsuario + '.' + valido.split('.')[1])}` },
  });
  assert.equal(resposta.status, 401);
});

test('sair apaga os dois cookies e a sessão deixa de valer', async () => {
  await app.entrar('FUNCIONARIO');
  const r = await app.pedir('POST', '/api/admin/sair');
  assert.equal(r.status, 204);
  const cookies = cookiesDe(r);
  assert.ok(cookies[sessao.COOKIE_SESSAO].atributos.includes('Max-Age=0'));
  assert.ok(cookies[sessao.COOKIE_PAINEL].atributos.includes('Max-Age=0'));
  assert.equal((await app.pedir('GET', '/api/admin/sessao')).status, 401);
});
