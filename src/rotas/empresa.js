/*
 * Identidade da estética, configurada no painel (RF-23) em vez de escrita
 * no HTML (RNF-12). Não exige sessão: a tela de login também usa.
 *
 *   GET /api/empresa -> 200 { nome, logotipoUrl, corPrimaria }
 */
'use strict';

const express = require('express');
const empresa = require('../repositorios/empresa');

const rotas = express.Router();

rotas.get('/', async (req, res) => {
  res.json(await empresa.buscarIdentidade());
});

module.exports = rotas;
