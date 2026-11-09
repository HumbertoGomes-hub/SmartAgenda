/*
 * Relatório mensal do painel (RF-24). Só dono e sócio (permissão
 * "relatorio", RN-13).
 *
 *   GET /api/admin/relatorio?mes=AAAA-MM  -> relatório do mês (sem mes: o mês atual)
 *
 * Os agendamentos entram pelo mês do horário marcado, em todos os status.
 */
'use strict';

const express = require('express');
const agenda = require('../repositorios/agenda');
const { exigirSessao, exigirPermissao } = require('../middlewares/autenticacao');
const { ACOES } = require('../auth/permissoes');
const dominio = require('../dominio/relatorio');
const { ErroHttp } = require('../util/erros');

const rotas = express.Router();

rotas.get('/relatorio', exigirSessao, exigirPermissao(ACOES.RELATORIO), async (req, res) => {
  const agora = new Date();
  const mes = dominio.lerMes(req.query.mes === undefined ? dominio.mesDe(agora) : req.query.mes);
  if (!mes) {
    throw new ErroHttp(400, 'DADOS_INVALIDOS', 'Informe o mês no formato AAAA-MM.');
  }
  const agendamentos = await agenda.listarPeriodo(mes.inicio, mes.fim, { incluirLiberados: true });
  res.json(dominio.montarRelatorio(agendamentos, mes, agora));
});

module.exports = rotas;
