/*
 * Dados do painel. Toda rota aqui exige sessão e declara a permissão que
 * pede (RN-13).
 *
 *   GET /api/admin/resumo -> resumo da tela inicial (pedidos, hoje, aguardando cliente)
 *
 * As outras abas têm arquivos próprios em src/rotas/: pedidos e agenda
 * (RF-16 a RF-19) em agenda.js, serviços e portfólio (RF-20, RF-21) em
 * catalogo.js, relatório (RF-24) em relatorio.js, configurações (RF-22,
 * RF-23) em configuracoes.js e usuários (RF-15) em usuarios.js.
 */
'use strict';

const express = require('express');
const agendamentos = require('../repositorios/agendamentos');
const { exigirSessao, exigirPermissao } = require('../middlewares/autenticacao');
const { ACOES } = require('../auth/permissoes');

const rotas = express.Router();

// Proteção por rota (e não rotas.use) porque este router fica montado em
// /api/admin: um rotas.use consultaria a sessão para qualquer endereço ali.
rotas.get('/resumo', exigirSessao, exigirPermissao(ACOES.AGENDA), async (req, res) => {
  res.json(await agendamentos.resumoDoDia());
});

module.exports = rotas;
