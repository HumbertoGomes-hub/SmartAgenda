/*
 * Login e sessão do painel (RF-14, RNF-07).
 *
 *   POST /api/admin/entrar  { email, senha } -> 200 { usuario }
 *   POST /api/admin/sair                     -> 204
 *   GET  /api/admin/sessao                   -> 200 { usuario, sessaoMinutos } ou 401
 */
'use strict';

const express = require('express');
const bcrypt = require('bcrypt');
const { rateLimit } = require('express-rate-limit');
const config = require('../config');
const usuarios = require('../repositorios/usuarios');
const { exigirSessao, usuarioPublico } = require('../middlewares/autenticacao');
const { ErroHttp } = require('../util/erros');

const rotas = express.Router();

// Comparado quando o e-mail não existe, para a resposta levar o mesmo tempo
// e não revelar quais e-mails têm conta.
const HASH_FICTICIO = bcrypt.hashSync('senha-que-nao-existe', 10);

// Tentativas erradas por IP: 10 a cada 15 minutos. Logins certos não contam.
const limitarTentativas = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 10,
  skipSuccessfulRequests: true,
  standardHeaders: 'draft-7',
  legacyHeaders: false,
  message: {
    erro: {
      codigo: 'MUITAS_TENTATIVAS',
      mensagem: 'Muitas tentativas de entrar. Espere 15 minutos e tente de novo.',
    },
  },
});

function texto(valor, maximo) {
  return typeof valor === 'string' && valor.length > 0 && valor.length <= maximo ? valor : null;
}

function regenerar(req) {
  return new Promise((resolver, rejeitar) => {
    req.session.regenerate((erro) => (erro ? rejeitar(erro) : resolver()));
  });
}

function salvar(req) {
  return new Promise((resolver, rejeitar) => {
    req.session.save((erro) => (erro ? rejeitar(erro) : resolver()));
  });
}

rotas.post('/entrar', limitarTentativas, async (req, res) => {
  const corpo = req.body || {};
  const email = texto(corpo.email, 254);
  const senha = texto(corpo.senha, 200);
  if (!email || !senha) {
    throw new ErroHttp(400, 'DADOS_INVALIDOS', 'Informe o e-mail e a senha.');
  }

  const usuario = await usuarios.buscarParaLogin(email);
  const senhaConfere = await bcrypt.compare(senha, usuario ? usuario.senha_hash : HASH_FICTICIO);

  // Mesma mensagem para e-mail e senha errados.
  if (!usuario || !senhaConfere) {
    throw new ErroHttp(401, 'CREDENCIAIS_INVALIDAS', 'E-mail ou senha incorretos. Confira os dados e tente de novo.');
  }
  if (!usuario.ativo) {
    throw new ErroHttp(403, 'USUARIO_INATIVO', 'Este acesso foi desativado. Peça ao dono da estética para reativá-lo.');
  }

  // Nova sessão a cada login: evita reaproveitar um id de sessão antigo.
  await regenerar(req);
  req.session.usuarioId = usuario.id;
  await salvar(req);

  res.json({ usuario: usuarioPublico(usuario) });
});

rotas.post('/sair', (req, res, next) => {
  req.session.destroy((erro) => {
    if (erro) {
      return next(erro);
    }
    res.clearCookie('smartagenda.sid');
    res.status(204).end();
  });
});

rotas.get('/sessao', exigirSessao, (req, res) => {
  res.json({ usuario: req.usuario, sessaoMinutos: config.sessao.minutos });
});

module.exports = rotas;
