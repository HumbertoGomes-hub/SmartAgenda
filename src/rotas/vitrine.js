/*
 * Dados públicos do site (RF-01 a RF-03). Não exigem sessão e só trazem o
 * que pode aparecer: serviços ativos e trabalhos publicados.
 *
 *   GET /api/vitrine/servicos          -> { servicos }
 *   GET /api/vitrine/portfolio         -> { trabalhos } (com naCapa e emDestaque para o início)
 *   GET /api/vitrine/portfolio/:id     -> trabalho publicado, ou 404
 */
'use strict';

const express = require('express');
const servicos = require('../repositorios/servicos');
const portfolio = require('../repositorios/portfolio');
const { lerId } = require('../dominio/catalogo');
const { ErroHttp } = require('../util/erros');

const rotas = express.Router();

// O site pode guardar por um minuto: mudanças do painel aparecem logo.
function emCache(res) {
  res.set('Cache-Control', 'public, max-age=60');
}

rotas.get('/servicos', async (req, res) => {
  emCache(res);
  res.json({ servicos: await servicos.listar({ apenasAtivos: true }) });
});

rotas.get('/portfolio', async (req, res) => {
  emCache(res);
  res.json({ trabalhos: await portfolio.listar({ apenasPublicados: true }) });
});

rotas.get('/portfolio/:id', async (req, res) => {
  const id = lerId(req.params.id);
  if (!id) {
    throw new ErroHttp(404, 'NAO_ENCONTRADO', 'Trabalho não encontrado.');
  }
  emCache(res);
  res.json(await portfolio.buscar(id, { apenasPublicado: true }));
});

module.exports = rotas;
