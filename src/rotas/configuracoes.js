/*
 * Configurações da agenda (RF-22) e da vitrine (RF-23). Só o dono
 * (permissão "configuracao", RN-13).
 *
 *   GET    /api/admin/configuracoes                  -> { agenda, vitrine, bloqueios }
 *   PUT    /api/admin/configuracoes/agenda           -> agenda (todos os campos)
 *   PUT    /api/admin/configuracoes/vitrine          -> vitrine (todos os campos)
 *   PUT    /api/admin/configuracoes/logotipo         (corpo: a imagem) -> vitrine
 *   DELETE /api/admin/configuracoes/logotipo         -> vitrine sem logotipo
 *   POST   /api/admin/configuracoes/bloqueios        { data, motivo } -> 201 { bloqueios }
 *   DELETE /api/admin/configuracoes/bloqueios/:data  -> { bloqueios }
 *
 * O logotipo vai como o corpo da requisição (image/webp, image/jpeg ou
 * image/png), até 5 MB, como as fotos de serviços e do portfólio.
 */
'use strict';

const express = require('express');
const configuracoes = require('../repositorios/configuracoes');
const { exigirSessao, exigirPermissao } = require('../middlewares/autenticacao');
const { receberFoto } = require('../middlewares/receberFoto');
const { ACOES } = require('../auth/permissoes');
const dominio = require('../dominio/configuracoes');
const { lerData } = require('../dominio/agenda');
const { ErroHttp } = require('../util/erros');

const rotas = express.Router();

const configurar = [exigirSessao, exigirPermissao(ACOES.CONFIGURACAO)];

rotas.get('/configuracoes', ...configurar, async (req, res) => {
  res.json(await configuracoes.ler());
});

rotas.put('/configuracoes/agenda', ...configurar, async (req, res) => {
  res.json(await configuracoes.salvarAgenda(dominio.lerAgenda(req.body)));
});

rotas.put('/configuracoes/vitrine', ...configurar, async (req, res) => {
  res.json(await configuracoes.salvarVitrine(dominio.lerVitrine(req.body)));
});

rotas.put('/configuracoes/logotipo', ...configurar, receberFoto, async (req, res) => {
  res.json(await configuracoes.trocarLogotipo(req.foto));
});

rotas.delete('/configuracoes/logotipo', ...configurar, async (req, res) => {
  res.json(await configuracoes.removerLogotipo());
});

rotas.post('/configuracoes/bloqueios', ...configurar, async (req, res) => {
  res.status(201).json({ bloqueios: await configuracoes.criarBloqueio(dominio.lerBloqueio(req.body)) });
});

rotas.delete('/configuracoes/bloqueios/:data', ...configurar, async (req, res) => {
  if (!lerData(req.params.data)) {
    throw new ErroHttp(404, 'NAO_ENCONTRADO', 'Data bloqueada não encontrada.');
  }
  res.json({ bloqueios: await configuracoes.removerBloqueio(req.params.data) });
});

module.exports = rotas;
