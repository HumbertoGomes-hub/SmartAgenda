/*
 * Pedidos e agenda do painel (RF-16 a RF-19). Toda rota exige sessão e
 * declara a permissão que pede (RN-13).
 *
 *   GET   /api/admin/pedidos                          -> { prazoRespostaHoras, pendentes, aguardandoCliente }
 *   GET   /api/admin/agenda?de=AAAA-MM-DD&ate=AAAA-MM-DD[&liberados=1]
 *                                                     -> { agendamentos }
 *   GET   /api/admin/agenda/opcoes                    -> { servicos, configuracao, bloqueios }
 *   POST  /api/admin/agendamentos                     -> 201 agendamento manual, já confirmado
 *   GET   /api/admin/agendamentos/:codigo             -> agendamento
 *   PATCH /api/admin/agendamentos/:codigo             -> agendamento editado ou realocado
 *   POST  /api/admin/agendamentos/:codigo/aceitar     -> agendamento confirmado
 *   POST  /api/admin/agendamentos/:codigo/cancelar    -> agendamento desmarcado (libera o horário)
 *   POST  /api/admin/agendamentos/:codigo/atendimento { resultado: CONCLUIDO | NAO_COMPARECEU }
 *
 * Não existe "recusar" no painel: a ideia é a equipe encaixar o cliente em
 * outro horário (editar) em vez de perder o pedido.
 */
'use strict';

const express = require('express');
const agenda = require('../repositorios/agenda');
const { exigirSessao, exigirPermissao } = require('../middlewares/autenticacao');
const { ACOES } = require('../auth/permissoes');
const dominio = require('../dominio/agenda');
const { ErroHttp } = require('../util/erros');

const rotas = express.Router();

const verAgenda = [exigirSessao, exigirPermissao(ACOES.AGENDA)];

function invalido(mensagem) {
  return new ErroHttp(400, 'DADOS_INVALIDOS', mensagem);
}

function lerCodigo(req) {
  const codigo = String(req.params.codigo || '').toUpperCase();
  if (!dominio.codigoValido(codigo)) {
    throw new ErroHttp(404, 'NAO_ENCONTRADO', 'Agendamento não encontrado.');
  }
  return codigo;
}

// Data e hora juntas: as duas ou nenhuma (na edição).
function lerInicio(corpo, { obrigatorio }) {
  if (!obrigatorio && corpo.data === undefined && corpo.hora === undefined) {
    return undefined;
  }
  const data = dominio.lerData(corpo.data);
  const minutos = dominio.lerHora(corpo.hora);
  if (!data) {
    throw invalido('Informe a data no formato AAAA-MM-DD.');
  }
  if (minutos === null) {
    throw invalido('Informe a hora no formato HH:MM, em múltiplos de 5 minutos.');
  }
  return dominio.instanteLocal(data, minutos);
}

function lerDetalhe(corpo, campo, rotulo, maximo) {
  if (corpo[campo] === undefined) {
    return undefined;
  }
  const valor = dominio.lerTexto(corpo[campo], { maximo });
  if (valor === null) {
    throw invalido(`${rotulo} pode ter até ${maximo} caracteres.`);
  }
  return valor;
}

/* Pedidos --------------------------------------------------------------- */

rotas.get('/pedidos', ...verAgenda, async (req, res) => {
  res.json(await agenda.listarPedidos());
});

/* Agenda ---------------------------------------------------------------- */

rotas.get('/agenda', ...verAgenda, async (req, res) => {
  const periodo = dominio.lerPeriodo(req.query.de, req.query.ate);
  if (!periodo) {
    throw invalido(
      `Informe o período em de e ate (AAAA-MM-DD), com até ${dominio.MAXIMO_DIAS_PERIODO} dias.`,
    );
  }
  const agendamentos = await agenda.listarPeriodo(periodo.inicio, periodo.fim, {
    incluirLiberados: req.query.liberados === '1',
  });
  res.json({ agendamentos });
});

rotas.get('/agenda/opcoes', ...verAgenda, async (req, res) => {
  res.json(await agenda.opcoes());
});

/* Agendamentos ---------------------------------------------------------- */

rotas.post(
  '/agendamentos',
  exigirSessao,
  exigirPermissao(ACOES.AGENDAMENTO_MANUAL),
  async (req, res) => {
    const corpo = req.body || {};
    const nome = dominio.lerTexto(corpo.nome, { minimo: 3, maximo: 120 });
    if (!nome) {
      throw invalido('Informe o nome do cliente, com pelo menos 3 letras.');
    }
    const telefone = dominio.lerTelefone(corpo.telefone);
    if (!telefone) {
      throw invalido('Informe o telefone com DDD.');
    }
    const servicos = dominio.lerServicos(corpo.servicos);
    if (!servicos) {
      throw invalido('Escolha pelo menos um serviço.');
    }

    const agendamento = await agenda.criarManual({
      nome,
      telefone,
      servicos,
      inicio: lerInicio(corpo, { obrigatorio: true }),
      modeloVeiculo: lerDetalhe(corpo, 'modeloVeiculo', 'O modelo do veículo', 80) || '',
      observacoes: lerDetalhe(corpo, 'observacoes', 'As observações', 500) || '',
      responsavelId: req.usuario.id,
    });
    res.status(201).json(agendamento);
  },
);

rotas.get('/agendamentos/:codigo', ...verAgenda, async (req, res) => {
  const agendamento = await agenda.buscar(lerCodigo(req));
  if (!agendamento) {
    throw new ErroHttp(404, 'NAO_ENCONTRADO', 'Agendamento não encontrado.');
  }
  res.json(agendamento);
});

rotas.patch('/agendamentos/:codigo', ...verAgenda, async (req, res) => {
  const codigo = lerCodigo(req);
  const corpo = req.body || {};
  let servicos;
  if (corpo.servicos !== undefined) {
    servicos = dominio.lerServicos(corpo.servicos);
    if (!servicos) {
      throw invalido('Escolha pelo menos um serviço.');
    }
  }

  const mudancas = {
    inicio: lerInicio(corpo, { obrigatorio: false }),
    servicos,
    modeloVeiculo: lerDetalhe(corpo, 'modeloVeiculo', 'O modelo do veículo', 80),
    observacoes: lerDetalhe(corpo, 'observacoes', 'As observações', 500),
  };
  if (Object.values(mudancas).every((valor) => valor === undefined)) {
    throw invalido('Nada para alterar.');
  }

  res.json(await agenda.editar(codigo, mudancas));
});

rotas.post('/agendamentos/:codigo/aceitar', ...verAgenda, async (req, res) => {
  res.json(await agenda.aceitar(lerCodigo(req), req.usuario.id));
});

rotas.post('/agendamentos/:codigo/cancelar', ...verAgenda, async (req, res) => {
  res.json(await agenda.cancelar(lerCodigo(req)));
});

rotas.post('/agendamentos/:codigo/atendimento', ...verAgenda, async (req, res) => {
  const resultado = (req.body || {}).resultado;
  if (!dominio.RESULTADOS_ATENDIMENTO.includes(resultado)) {
    throw invalido('Informe o resultado: CONCLUIDO ou NAO_COMPARECEU.');
  }
  res.json(await agenda.registrarAtendimento(lerCodigo(req), resultado));
});

module.exports = rotas;
