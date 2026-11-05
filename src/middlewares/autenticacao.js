/*
 * Proteção das rotas do painel.
 *
 *   router.get('/rota', exigirSessao, exigirPermissao(ACOES.SERVICOS), ...)
 *
 * exigirSessao   -> 401 SEM_SESSAO quando não há sessão ou o usuário foi desativado
 * exigirPermissao -> 403 SEM_PERMISSAO quando o perfil não pode executar a ação (RN-13)
 */
'use strict';

const usuarios = require('../repositorios/usuarios');
const { podeExecutar, permissoesDo } = require('../auth/permissoes');
const { ErroHttp } = require('../util/erros');

function semSessao() {
  return new ErroHttp(401, 'SEM_SESSAO', 'Sua sessão terminou. Entre de novo para continuar.');
}

// Dados do usuário que podem ir para o navegador (nunca o hash da senha).
function usuarioPublico(usuario) {
  return {
    id: usuario.id,
    nome: usuario.nome,
    email: usuario.email,
    perfil: usuario.perfil,
    permissoes: permissoesDo(usuario.perfil),
  };
}

async function exigirSessao(req, res, next) {
  const id = req.session && req.session.usuarioId;
  if (!id) {
    throw semSessao();
  }

  const usuario = await usuarios.buscarPorId(id);
  if (!usuario || !usuario.ativo) {
    await new Promise((resolver) => req.session.destroy(resolver));
    throw semSessao();
  }

  req.usuario = usuarioPublico(usuario);
  next();
}

function exigirPermissao(acao) {
  return function (req, res, next) {
    if (!req.usuario || !podeExecutar(req.usuario.perfil, acao)) {
      throw new ErroHttp(403, 'SEM_PERMISSAO', 'Seu perfil não tem acesso a essa área do painel.');
    }
    next();
  };
}

module.exports = { exigirSessao, exigirPermissao, usuarioPublico };
