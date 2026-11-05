/*
 * Sessão do painel (RNF-07): cookie httpOnly que expira após 30 minutos
 * sem requisições. Com `rolling`, cada requisição renova o prazo.
 *
 * A sessão guarda só o id do usuário. Perfil e situação (ativo) são lidos
 * do banco a cada requisição em middlewares/autenticacao.js, para que uma
 * desativação ou mudança de perfil valha na hora.
 *
 * O memorystore mantém as sessões na memória e apaga as vencidas. Serve para
 * uma instância só; se o sistema rodar em mais de uma, troque por um store
 * no PostgreSQL (ex.: connect-pg-simple).
 */
'use strict';

const session = require('express-session');
const MemoryStore = require('memorystore')(session);
const config = require('../config');

const duracaoMs = config.sessao.minutos * 60 * 1000;

module.exports = session({
  name: 'smartagenda.sid',
  secret: config.sessao.segredo,
  store: new MemoryStore({ checkPeriod: 15 * 60 * 1000 }),
  resave: false,
  saveUninitialized: false,
  rolling: true,
  cookie: {
    httpOnly: true,
    sameSite: 'lax', // bloqueia POST de outros sites com o cookie (CSRF)
    secure: config.producao, // só HTTPS em produção (RNF-08)
    maxAge: duracaoMs,
  },
});
