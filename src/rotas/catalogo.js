/*
 * Serviços (RF-20) e portfólio (RF-21) no painel. Toda rota exige sessão e
 * declara a permissão que pede (RN-13): serviços para dono e sócio,
 * portfólio para os três perfis.
 *
 * Serviços
 *   GET    /api/admin/servicos                    -> { servicos } (ativos e desativados)
 *   POST   /api/admin/servicos                    -> 201 serviço
 *   PATCH  /api/admin/servicos/:id                -> serviço (inclui ativar e desativar)
 *   PUT    /api/admin/servicos/:id/foto           (corpo: a foto) -> serviço
 *   DELETE /api/admin/servicos/:id/foto           -> serviço sem foto
 *
 * Portfólio
 *   GET    /api/admin/portfolio                   -> { trabalhos, servicos }
 *   POST   /api/admin/portfolio                   -> 201 trabalho
 *   PATCH  /api/admin/portfolio/:id               -> trabalho (publicar, capa, destaque...)
 *   DELETE /api/admin/portfolio/:id               -> 204
 *   POST   /api/admin/portfolio/:id/fotos?tipo=ANTES|DEPOIS|GERAL (corpo: a foto) -> trabalho
 *   PATCH  /api/admin/portfolio/:id/fotos/:fotoId { legenda } -> trabalho
 *   DELETE /api/admin/portfolio/:id/fotos/:fotoId -> trabalho
 *   PUT    /api/admin/portfolio/:id/fotos/ordem   { ids } -> trabalho
 *
 * Fotos vão como o corpo da requisição (Content-Type: image/webp, image/jpeg
 * ou image/png), até 5 MB. O painel já envia em WebP com até 1600 px.
 */
'use strict';

const express = require('express');
const servicos = require('../repositorios/servicos');
const portfolio = require('../repositorios/portfolio');
const { exigirSessao, exigirPermissao } = require('../middlewares/autenticacao');
const { receberFoto } = require('../middlewares/receberFoto');
const { ACOES } = require('../auth/permissoes');
const catalogo = require('../dominio/catalogo');
const { ErroHttp } = require('../util/erros');

const rotas = express.Router();

const gerirServicos = [exigirSessao, exigirPermissao(ACOES.SERVICOS)];
const gerirPortfolio = [exigirSessao, exigirPermissao(ACOES.PORTFOLIO)];

function lerId(req, parametro = 'id') {
  const id = catalogo.lerId(req.params[parametro]);
  if (!id) {
    throw new ErroHttp(404, 'NAO_ENCONTRADO', 'Não encontrado.');
  }
  return id;
}

/* Serviços -------------------------------------------------------------- */

rotas.get('/servicos', ...gerirServicos, async (req, res) => {
  res.json({ servicos: await servicos.listar() });
});

rotas.post('/servicos', ...gerirServicos, async (req, res) => {
  res.status(201).json(await servicos.criar(catalogo.lerServico(req.body, { completo: true })));
});

rotas.patch('/servicos/:id', ...gerirServicos, async (req, res) => {
  res.json(await servicos.editar(lerId(req), catalogo.lerServico(req.body, { completo: false })));
});

rotas.put('/servicos/:id/foto', ...gerirServicos, receberFoto, async (req, res) => {
  res.json(await servicos.trocarFoto(lerId(req), req.foto));
});

rotas.delete('/servicos/:id/foto', ...gerirServicos, async (req, res) => {
  res.json(await servicos.removerFoto(lerId(req)));
});

/* Portfólio ------------------------------------------------------------- */

rotas.get('/portfolio', ...gerirPortfolio, async (req, res) => {
  // A lista de serviços vai junto para o campo "serviço relacionado": quem
  // cuida do portfólio nem sempre tem acesso à tela de Serviços.
  const [trabalhos, todos] = await Promise.all([portfolio.listar(), servicos.listar()]);
  res.json({ trabalhos, servicos: todos.map((s) => ({ id: s.id, nome: s.nome, ativo: s.ativo })) });
});

rotas.post('/portfolio', ...gerirPortfolio, async (req, res) => {
  const { dados } = catalogo.lerTrabalho(req.body, { completo: true });
  res.status(201).json(await portfolio.criar(dados));
});

rotas.patch('/portfolio/:id', ...gerirPortfolio, async (req, res) => {
  const { dados, naCapa } = catalogo.lerTrabalho(req.body, { completo: false });
  res.json(await portfolio.editar(lerId(req), dados, naCapa));
});

rotas.delete('/portfolio/:id', ...gerirPortfolio, async (req, res) => {
  await portfolio.excluir(lerId(req));
  res.status(204).end();
});

rotas.post('/portfolio/:id/fotos', ...gerirPortfolio, receberFoto, async (req, res) => {
  const tipo = catalogo.lerTipoDeFoto(req.query.tipo);
  res.json(await portfolio.adicionarFoto(lerId(req), req.foto, { tipo, legenda: null }));
});

// Antes de "/fotos/:fotoId", para "ordem" não ser lido como id de foto.
rotas.put('/portfolio/:id/fotos/ordem', ...gerirPortfolio, async (req, res) => {
  const ids = (req.body || {}).ids;
  if (!Array.isArray(ids) || !ids.every((id) => Number.isInteger(id) && id > 0)) {
    throw new ErroHttp(400, 'DADOS_INVALIDOS', 'Envie a lista de fotos na nova ordem.');
  }
  res.json(await portfolio.ordenarFotos(lerId(req), ids));
});

rotas.patch('/portfolio/:id/fotos/:fotoId', ...gerirPortfolio, async (req, res) => {
  res.json(await portfolio.editarFoto(lerId(req), lerId(req, 'fotoId'), { legenda: catalogo.lerLegenda(req.body) }));
});

rotas.delete('/portfolio/:id/fotos/:fotoId', ...gerirPortfolio, async (req, res) => {
  res.json(await portfolio.removerFoto(lerId(req), lerId(req, 'fotoId')));
});

module.exports = rotas;
