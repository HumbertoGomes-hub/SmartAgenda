/*
 * Leitura dos dados de serviços (RF-20) e do portfólio (RF-21) que chegam do
 * painel. Cada função devolve só os campos enviados (para editar), já
 * convertidos para as colunas do banco, ou lança ErroHttp 400.
 */
'use strict';

const { lerTexto, lerData } = require('./agenda');
const { ErroHttp } = require('../util/erros');

const TIPOS_DE_FOTO = Object.freeze(['ANTES', 'DEPOIS', 'GERAL']);
const MAXIMO_DESTAQUES = 4; // "Trabalhos recentes" do início
const MAXIMO_FOTOS_GERAIS = 12;

function invalido(mensagem) {
  return new ErroHttp(400, 'DADOS_INVALIDOS', mensagem);
}

function texto(corpo, campo, { rotulo, minimo = 0, maximo }) {
  const valor = lerTexto(corpo[campo], { minimo, maximo });
  if (valor === null) {
    throw invalido(
      minimo > 0 ? `${rotulo} precisa ter de ${minimo} a ${maximo} caracteres.` : `${rotulo} pode ter até ${maximo} caracteres.`,
    );
  }
  return valor;
}

function booleano(corpo, campo, rotulo) {
  if (typeof corpo[campo] !== 'boolean') {
    throw invalido(`${rotulo} deve ser verdadeiro ou falso.`);
  }
  return corpo[campo];
}

function presente(corpo, campo, completo) {
  return completo || corpo[campo] !== undefined;
}

/* Serviço ---------------------------------------------------------------- */

// completo = true na criação (nome, categoria, preço e duração obrigatórios).
function lerServico(corpo, { completo }) {
  corpo = corpo || {};
  const dados = {};

  if (presente(corpo, 'nome', completo)) {
    dados.nome = texto(corpo, 'nome', { rotulo: 'O nome', minimo: 2, maximo: 80 });
  }
  if (presente(corpo, 'categoria', completo)) {
    dados.categoria = texto(corpo, 'categoria', { rotulo: 'A categoria', minimo: 2, maximo: 40 });
  }
  if (presente(corpo, 'descricao', false)) {
    dados.descricao = texto(corpo, 'descricao', { rotulo: 'A descrição', maximo: 300 }) || null;
  }
  if (presente(corpo, 'precoBase', completo)) {
    const preco = Number(corpo.precoBase);
    if (typeof corpo.precoBase !== 'number' || !Number.isFinite(preco) || preco < 0 || preco > 100000) {
      throw invalido('Informe o preço inicial em reais, de 0 a 100.000.');
    }
    dados.preco_base = Math.round(preco * 100) / 100;
  }
  if (presente(corpo, 'duracaoMinutos', completo)) {
    const minutos = corpo.duracaoMinutos;
    if (!Number.isInteger(minutos) || minutos < 5 || minutos > 24 * 60 || minutos % 5 !== 0) {
      throw invalido('Informe a duração em minutos, de 5 em 5, até 24 horas.');
    }
    dados.duracao_minutos = minutos;
  }
  if (presente(corpo, 'ativo', false)) {
    dados.ativo = booleano(corpo, 'ativo', 'Ativo');
  }

  if (!completo && Object.keys(dados).length === 0) {
    throw invalido('Nada para alterar.');
  }
  return dados;
}

/* Trabalho do portfólio ------------------------------------------------- */

function lerTrabalho(corpo, { completo }) {
  corpo = corpo || {};
  const dados = {};

  if (presente(corpo, 'titulo', completo)) {
    dados.titulo = texto(corpo, 'titulo', { rotulo: 'O título', minimo: 3, maximo: 100 });
  }
  if (presente(corpo, 'descricao', false)) {
    dados.descricao = texto(corpo, 'descricao', { rotulo: 'A descrição', maximo: 1000 }) || null;
  }
  if (presente(corpo, 'servicoId', false)) {
    const id = corpo.servicoId;
    if (id !== null && !(Number.isInteger(id) && id > 0)) {
      throw invalido('Serviço inválido.');
    }
    dados.servico_id = id;
  }
  if (presente(corpo, 'dataRealizacao', false)) {
    if (corpo.dataRealizacao !== null && !lerData(corpo.dataRealizacao)) {
      throw invalido('Informe a data no formato AAAA-MM-DD.');
    }
    dados.data_realizacao = corpo.dataRealizacao;
  }
  if (presente(corpo, 'publicado', false)) {
    dados.publicado = booleano(corpo, 'publicado', 'Publicado');
  }
  if (presente(corpo, 'emDestaque', false)) {
    dados.em_destaque = booleano(corpo, 'emDestaque', 'Em destaque');
  }
  // A capa tem função própria no banco (definir_capa); vem separada.
  let naCapa;
  if (presente(corpo, 'naCapa', false)) {
    naCapa = booleano(corpo, 'naCapa', 'Na capa');
  }

  if (!completo && Object.keys(dados).length === 0 && naCapa === undefined) {
    throw invalido('Nada para alterar.');
  }
  return { dados, naCapa };
}

function lerTipoDeFoto(tipo) {
  const valor = String(tipo || 'GERAL').toUpperCase();
  if (!TIPOS_DE_FOTO.includes(valor)) {
    throw invalido('O tipo da foto deve ser ANTES, DEPOIS ou GERAL.');
  }
  return valor;
}

function lerLegenda(corpo) {
  return texto(corpo || {}, 'legenda', { rotulo: 'A legenda', maximo: 140 }) || null;
}

function lerId(valor) {
  const id = Number(valor);
  return Number.isInteger(id) && id > 0 ? id : null;
}

module.exports = {
  TIPOS_DE_FOTO,
  MAXIMO_DESTAQUES,
  MAXIMO_FOTOS_GERAIS,
  lerServico,
  lerTrabalho,
  lerTipoDeFoto,
  lerLegenda,
  lerId,
};
