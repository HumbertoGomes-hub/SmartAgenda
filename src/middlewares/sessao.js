/*
 * Sessão do painel (RNF-07) em cookie assinado, sem guardar nada no servidor.
 *
 * Funciona em hospedagens sem servidor fixo (Vercel), onde cada requisição
 * pode cair numa instância diferente e a memória não é compartilhada.
 *
 *   smartagenda.sid     httpOnly. Id do usuário e validade, assinados com
 *                       HMAC-SHA256 (SESSION_SECRET). É o que autoriza.
 *   smartagenda.painel  legível pelo navegador. Só nome, perfil e permissões,
 *                       para o painel montar o menu sem esperar o servidor.
 *                       Não autoriza nada: o servidor confere o .sid sempre.
 *
 * Os dois expiram após 30 minutos sem requisições: cada resposta a um usuário
 * logado renova o prazo. Perfil e situação (ativo) continuam sendo lidos do
 * banco a cada requisição em middlewares/autenticacao.js, para que uma
 * desativação valha na hora.
 *
 * Para o resto do código, req.session tem a mesma forma de antes
 * (express-session): usuarioId, regenerate(), save() e destroy().
 */
'use strict';

const crypto = require('node:crypto');
const config = require('../config');

const COOKIE_SESSAO = 'smartagenda.sid';
const COOKIE_PAINEL = 'smartagenda.painel';
const DURACAO_MS = config.sessao.minutos * 60 * 1000;

function assinar(texto) {
  return crypto.createHmac('sha256', config.sessao.segredo).update(texto).digest('base64url');
}

function codificar(dados) {
  const corpo = Buffer.from(JSON.stringify(dados)).toString('base64url');
  return `${corpo}.${assinar(corpo)}`;
}

// Devolve os dados se a assinatura confere e o prazo não venceu; senão null.
function decodificar(valor) {
  const ponto = typeof valor === 'string' ? valor.lastIndexOf('.') : -1;
  if (ponto <= 0) {
    return null;
  }
  const corpo = valor.slice(0, ponto);
  const recebida = Buffer.from(valor.slice(ponto + 1));
  const esperada = Buffer.from(assinar(corpo));
  if (recebida.length !== esperada.length || !crypto.timingSafeEqual(recebida, esperada)) {
    return null;
  }
  try {
    const dados = JSON.parse(Buffer.from(corpo, 'base64url').toString('utf8'));
    return dados && typeof dados.expira === 'number' && dados.expira > Date.now() ? dados : null;
  } catch (erro) {
    return null;
  }
}

function lerCookies(cabecalho) {
  const cookies = {};
  for (const parte of String(cabecalho || '').split(';')) {
    const igual = parte.indexOf('=');
    if (igual > 0) {
      const nome = parte.slice(0, igual).trim();
      try {
        cookies[nome] = decodeURIComponent(parte.slice(igual + 1).trim());
      } catch (erro) {
        // Cookie malformado: ignorado.
      }
    }
  }
  return cookies;
}

function cookie(nome, valor, { httpOnly, maxAgeMs }) {
  const partes = [`${nome}=${encodeURIComponent(valor)}`, 'Path=/', 'SameSite=Lax', `Max-Age=${Math.floor(maxAgeMs / 1000)}`];
  if (httpOnly) {
    partes.push('HttpOnly');
  }
  if (config.producao) {
    partes.push('Secure'); // só HTTPS em produção (RNF-08)
  }
  return partes.join('; ');
}

// O dado público vai como base64url de JSON, para o navegador ler com atob().
function painelParaCookie(usuario, expira) {
  return Buffer.from(JSON.stringify({ usuario, expira })).toString('base64url');
}

function sessao(req, res, next) {
  const dados = decodificar(lerCookies(req.headers.cookie)[COOKIE_SESSAO]);
  let destruida = false;

  req.session = {
    usuarioId: dados ? dados.usuarioId : undefined,
    regenerate(pronto) {
      this.usuarioId = undefined;
      destruida = false;
      pronto();
    },
    save(pronto) {
      pronto();
    },
    destroy(pronto) {
      this.usuarioId = undefined;
      destruida = true;
      if (pronto) {
        pronto();
      }
    },
  };

  // Os cookies são escritos no último instante antes de enviar os cabeçalhos,
  // quando a rota já decidiu (login, logout, 401...).
  const escreverCabecalho = res.writeHead;
  res.writeHead = function (...argumentos) {
    const usuarioId = req.session.usuarioId;
    if (destruida || !usuarioId || res.statusCode === 401) {
      if (dados || destruida || res.statusCode === 401) {
        res.append('Set-Cookie', cookie(COOKIE_SESSAO, '', { httpOnly: true, maxAgeMs: 0 }));
        res.append('Set-Cookie', cookie(COOKIE_PAINEL, '', { httpOnly: false, maxAgeMs: 0 }));
      }
    } else {
      // Sessão válida: renova o prazo (expiração deslizante).
      const expira = Date.now() + DURACAO_MS;
      res.append('Set-Cookie', cookie(COOKIE_SESSAO, codificar({ usuarioId, expira }), { httpOnly: true, maxAgeMs: DURACAO_MS }));
      if (req.usuario) {
        res.append('Set-Cookie', cookie(COOKIE_PAINEL, painelParaCookie(req.usuario, expira), { httpOnly: false, maxAgeMs: DURACAO_MS }));
      }
    }
    return escreverCabecalho.apply(this, argumentos);
  };

  next();
}

module.exports = sessao;
module.exports.COOKIE_SESSAO = COOKIE_SESSAO;
module.exports.COOKIE_PAINEL = COOKIE_PAINEL;
module.exports.decodificar = decodificar;
module.exports.codificar = codificar;
