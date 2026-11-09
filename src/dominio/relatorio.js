/*
 * Relatório mensal (RF-24): quantos agendamentos o mês teve por status e por
 * serviço, e o valor estimado dos atendimentos concluídos.
 *
 * Só regras, sem banco: recebe os agendamentos do mês no formato que o painel
 * já usa (repositorios/agendamentos.js -> paraResposta). O mês de um
 * agendamento é o do horário marcado, não o do pedido.
 */
'use strict';

// Ordem do ciclo de vida (RN-16); desempata quando duas contagens são iguais.
const STATUS = Object.freeze([
  'PENDENTE',
  'AGUARDANDO_CLIENTE',
  'CONFIRMADO',
  'CONCLUIDO',
  'NAO_COMPARECEU',
  'CANCELADO',
  'RECUSADO',
  'EXPIRADO',
]);

// Ainda vão acontecer (ou esperam resposta): ocupam a agenda.
const STATUS_NA_AGENDA = Object.freeze(['PENDENTE', 'AGUARDANDO_CLIENTE', 'CONFIRMADO']);

// "2026-11" -> o mês, com início e fim no fuso da estética (TZ, ver config.js).
function lerMes(texto) {
  const partes = /^(\d{4})-(0[1-9]|1[0-2])$/.exec(typeof texto === 'string' ? texto : '');
  if (!partes) {
    return null;
  }
  const ano = Number(partes[1]);
  const mes = Number(partes[2]);
  if (ano < 2000 || ano > 2100) {
    return null;
  }
  return {
    texto: partes[0],
    ano,
    mes,
    inicio: new Date(ano, mes - 1, 1),
    fim: new Date(ano, mes, 1),
  };
}

// O mês de uma data, no formato de lerMes.
function mesDe(data) {
  return `${data.getFullYear()}-${String(data.getMonth() + 1).padStart(2, '0')}`;
}

function centavos(valor) {
  return Math.round(valor * 100) / 100;
}

function montarRelatorio(agendamentos, mes, agora = new Date()) {
  const porStatus = Object.fromEntries(STATUS.map((status) => [status, 0]));
  const porServico = new Map();
  const porOrigem = { site: 0, painel: 0 };
  let valorConcluidos = 0;

  for (const agendamento of agendamentos) {
    if (porStatus[agendamento.status] !== undefined) {
      porStatus[agendamento.status] += 1;
    }
    porOrigem[agendamento.origem === 'painel' ? 'painel' : 'site'] += 1;

    const concluido = agendamento.status === 'CONCLUIDO';
    for (const item of agendamento.itens || []) {
      if (!porServico.has(item.servicoId)) {
        porServico.set(item.servicoId, {
          servicoId: item.servicoId,
          nome: item.nome,
          agendamentos: 0,
          concluidos: 0,
          valorConcluidos: 0,
        });
      }
      const linha = porServico.get(item.servicoId);
      linha.agendamentos += 1;
      if (concluido) {
        linha.concluidos += 1;
        linha.valorConcluidos += item.precoPraticado;
        valorConcluidos += item.precoPraticado;
      }
    }
  }

  const concluidos = porStatus.CONCLUIDO;
  const atendimentosRegistrados = concluidos + porStatus.NAO_COMPARECEU;

  return {
    mes: mes.texto,
    geradoEm: agora.toISOString(),
    totais: {
      agendamentos: agendamentos.length,
      naAgenda: STATUS_NA_AGENDA.reduce((total, status) => total + porStatus[status], 0),
      concluidos,
      naoCompareceu: porStatus.NAO_COMPARECEU,
      // Parte dos atendimentos registrados em que o cliente veio (0 a 1).
      comparecimento: atendimentosRegistrados
        ? Math.round((concluidos / atendimentosRegistrados) * 10000) / 10000
        : null,
      // Soma dos preços "a partir de" praticados (RN-15): é uma estimativa.
      valorConcluidos: centavos(valorConcluidos),
      ticketMedio: concluidos ? centavos(valorConcluidos / concluidos) : null,
    },
    // Do maior para o menor; status sem nenhum agendamento ficam no fim.
    porStatus: STATUS.map((status) => ({ status, quantidade: porStatus[status] })).sort(
      (a, b) => b.quantidade - a.quantidade || STATUS.indexOf(a.status) - STATUS.indexOf(b.status),
    ),
    // Um agendamento com dois serviços conta nos dois.
    porServico: [...porServico.values()]
      .map((linha) => ({ ...linha, valorConcluidos: centavos(linha.valorConcluidos) }))
      .sort(
        (a, b) =>
          b.valorConcluidos - a.valorConcluidos ||
          b.agendamentos - a.agendamentos ||
          a.nome.localeCompare(b.nome, 'pt-BR'),
      ),
    porOrigem,
  };
}

module.exports = { STATUS, STATUS_NA_AGENDA, lerMes, mesDe, montarRelatorio };
