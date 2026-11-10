/*
 * Usuários do painel (RF-15). Só o dono (permissão "usuarios", RN-13).
 *
 *   GET   /api/admin/usuarios            -> { usuarios }
 *   POST  /api/admin/usuarios            { nome, email, telefone, perfil, senha, cargo, recebeNotificacoes } -> 201 usuário
 *   PATCH /api/admin/usuarios/:id        -> usuário (inclui ativar e desativar; não existe excluir)
 *   PUT   /api/admin/usuarios/:id/senha  { senha } -> 204 (o dono define uma senha nova)
 *
 * A senha só é guardada com bcrypt (RNF-07). Um usuário desativado perde o
 * painel na próxima requisição: middlewares/autenticacao.js relê o usuário.
 */
'use strict';

const express = require('express');
const bcrypt = require('bcrypt');
const equipe = require('../repositorios/equipe');
const { exigirSessao, exigirPermissao } = require('../middlewares/autenticacao');
const { ACOES } = require('../auth/permissoes');
const dominio = require('../dominio/usuarios');
const { lerId } = require('../dominio/catalogo');
const { ErroHttp } = require('../util/erros');

const rotas = express.Router();

const gerirUsuarios = [exigirSessao, exigirPermissao(ACOES.USUARIOS)];

function lerIdDoUsuario(req) {
  const id = lerId(req.params.id);
  if (!id) {
    throw new ErroHttp(404, 'NAO_ENCONTRADO', 'Usuário não encontrado.');
  }
  return id;
}

rotas.get('/usuarios', ...gerirUsuarios, async (req, res) => {
  res.json({ usuarios: await equipe.listar() });
});

rotas.post('/usuarios', ...gerirUsuarios, async (req, res) => {
  const { senha, ...dados } = dominio.lerUsuario(req.body, { completo: true });
  const senhaHash = await bcrypt.hash(senha, dominio.CUSTO_BCRYPT);
  res.status(201).json(await equipe.criar({ ...dados, senhaHash }));
});

rotas.patch('/usuarios/:id', ...gerirUsuarios, async (req, res) => {
  const id = lerIdDoUsuario(req);
  const dados = dominio.lerUsuario(req.body, { completo: false });
  if (Object.keys(dados).length === 0) {
    throw new ErroHttp(400, 'DADOS_INVALIDOS', 'Nada para alterar.');
  }
  dominio.conferirProprioAcesso(id, req.usuario.id, dados);
  res.json(await equipe.editar(id, dados));
});

rotas.put('/usuarios/:id/senha', ...gerirUsuarios, async (req, res) => {
  const id = lerIdDoUsuario(req);
  const senha = dominio.lerSenha((req.body || {}).senha);
  await equipe.definirSenha(id, await bcrypt.hash(senha, dominio.CUSTO_BCRYPT));
  res.status(204).end();
});

module.exports = rotas;
