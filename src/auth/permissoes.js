/*
 * Matriz de permissões (RN-13), equivalente a UsuarioAdmin.podeExecutar().
 *
 * É a única fonte da matriz: o front-end recebe a lista pronta em
 * usuario.permissoes e só esconde o que o perfil não pode usar.
 */
'use strict';

const ACOES = Object.freeze({
  AGENDA: 'agenda', // ver agenda, responder pedidos, registrar atendimento
  AGENDAMENTO_MANUAL: 'agendamento-manual',
  PORTFOLIO: 'portfolio',
  SERVICOS: 'servicos',
  RELATORIO: 'relatorio',
  CONFIGURACAO: 'configuracao', // configurar agenda e vitrine
  USUARIOS: 'usuarios',
});

const MATRIZ = Object.freeze({
  DONO: [
    ACOES.AGENDA,
    ACOES.AGENDAMENTO_MANUAL,
    ACOES.PORTFOLIO,
    ACOES.SERVICOS,
    ACOES.RELATORIO,
    ACOES.CONFIGURACAO,
    ACOES.USUARIOS,
  ],
  SOCIO: [ACOES.AGENDA, ACOES.AGENDAMENTO_MANUAL, ACOES.PORTFOLIO, ACOES.SERVICOS, ACOES.RELATORIO],
  FUNCIONARIO: [ACOES.AGENDA, ACOES.AGENDAMENTO_MANUAL, ACOES.PORTFOLIO],
});

function permissoesDo(perfil) {
  return [...(MATRIZ[perfil] || [])];
}

function podeExecutar(perfil, acao) {
  return (MATRIZ[perfil] || []).includes(acao);
}

module.exports = { ACOES, permissoesDo, podeExecutar };
