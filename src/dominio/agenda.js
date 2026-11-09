/*
 * Regras da agenda que não dependem do banco: transições de status (RN-16)
 * e leitura dos dados que chegam do painel. As regras de capacidade (RN-06)
 * ficam nas funções SQL de supabase/migrations, que travam a agenda do dia.
 */
'use strict';

// Status que ocupam a agenda. Os demais liberam o horário (RF-08).
const STATUS_QUE_OCUPAM = Object.freeze(['PENDENTE', 'AGUARDANDO_CLIENTE', 'CONFIRMADO']);

// RN-16: qualquer transição fora desta tabela é recusada.
const TRANSICOES = Object.freeze({
  PENDENTE: ['CONFIRMADO', 'RECUSADO', 'AGUARDANDO_CLIENTE', 'EXPIRADO', 'CANCELADO'],
  AGUARDANDO_CLIENTE: ['CONFIRMADO', 'CANCELADO'],
  CONFIRMADO: ['CANCELADO', 'CONCLUIDO', 'NAO_COMPARECEU'],
});

const RESULTADOS_ATENDIMENTO = Object.freeze(['CONCLUIDO', 'NAO_COMPARECEU']);

// Maior período que a agenda carrega de uma vez (uma visão mensal com folga).
const MAXIMO_DIAS_PERIODO = 62;

function podeMudar(de, para) {
  return (TRANSICOES[de] || []).includes(para);
}

// "2026-11-10" -> { ano, mes, dia }, só se a data existir de verdade.
function lerData(texto) {
  const partes = /^(\d{4})-(\d{2})-(\d{2})$/.exec(typeof texto === 'string' ? texto : '');
  if (!partes) {
    return null;
  }
  const [ano, mes, dia] = partes.slice(1).map(Number);
  const data = new Date(ano, mes - 1, dia);
  if (data.getFullYear() !== ano || data.getMonth() !== mes - 1 || data.getDate() !== dia) {
    return null;
  }
  return { ano, mes, dia };
}

// "14:30" -> minutos desde a meia-noite. Aceita múltiplos de 5 minutos.
function lerHora(texto) {
  const partes = /^([01]\d|2[0-3]):([0-5]\d)$/.exec(typeof texto === 'string' ? texto : '');
  if (!partes) {
    return null;
  }
  const minutos = Number(partes[1]) * 60 + Number(partes[2]);
  return minutos % 5 === 0 ? minutos : null;
}

/*
 * Data e hora do painel para um instante. O Node roda no fuso da estética
 * (TZ, ver config.js), então o horário local é o horário da estética.
 */
function instanteLocal(data, minutos) {
  return new Date(data.ano, data.mes - 1, data.dia, Math.floor(minutos / 60), minutos % 60);
}

// Período da agenda: do início do dia `de` ao fim do dia `ate`.
function lerPeriodo(de, ate) {
  const inicio = lerData(de);
  const fim = lerData(ate);
  if (!inicio || !fim) {
    return null;
  }
  const primeiro = new Date(inicio.ano, inicio.mes - 1, inicio.dia);
  const depoisDoUltimo = new Date(fim.ano, fim.mes - 1, fim.dia + 1);
  const dias = Math.round((depoisDoUltimo - primeiro) / 864e5);
  if (dias < 1 || dias > MAXIMO_DIAS_PERIODO) {
    return null;
  }
  return { inicio: primeiro, fim: depoisDoUltimo };
}

/*
 * Telefone brasileiro com DDD -> +55DDDNUMERO. No balcão também vale fixo
 * (10 dígitos); o site exige celular (RN-01).
 */
function lerTelefone(texto) {
  let digitos = String(texto || '').replace(/\D/g, '');
  if (digitos.length >= 12 && digitos.startsWith('55')) {
    digitos = digitos.slice(2);
  }
  if (!/^[1-9]{2}\d{8,9}$/.test(digitos)) {
    return null;
  }
  return '+55' + digitos;
}

// Texto opcional (vazio vira '') ou obrigatório com tamanho mínimo.
function lerTexto(valor, { maximo, minimo = 0 }) {
  if (valor === undefined || valor === null) {
    return minimo > 0 ? null : '';
  }
  if (typeof valor !== 'string') {
    return null;
  }
  const texto = valor.trim().replace(/\s+/g, ' ');
  if (texto.length < minimo || texto.length > maximo) {
    return null;
  }
  return texto;
}

// Lista de ids de serviço: ao menos um, inteiros positivos e sem repetir (RN-04).
function lerServicos(lista) {
  if (!Array.isArray(lista) || lista.length === 0 || lista.length > 20) {
    return null;
  }
  const ids = lista.map(Number);
  if (!ids.every((id) => Number.isInteger(id) && id > 0) || new Set(ids).size !== ids.length) {
    return null;
  }
  return ids;
}

function codigoValido(codigo) {
  return typeof codigo === 'string' && /^[A-HJ-NP-Z2-9]{6}$/.test(codigo);
}

module.exports = {
  STATUS_QUE_OCUPAM,
  TRANSICOES,
  RESULTADOS_ATENDIMENTO,
  MAXIMO_DIAS_PERIODO,
  podeMudar,
  lerData,
  lerHora,
  instanteLocal,
  lerPeriodo,
  lerTelefone,
  lerTexto,
  lerServicos,
  codigoValido,
};
