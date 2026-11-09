/*
 * Serviços (RF-20). Não são apagados: desativar tira o serviço do site e do
 * agendamento, mas mantém o histórico dos pedidos que já o usaram.
 * A foto é opcional; sem ela, o site não reserva espaço.
 */
'use strict';

const { supabase, exigirSucesso } = require('../banco/supabase');
const armazenamento = require('../banco/armazenamento');
const empresa = require('./empresa');
const { ErroHttp } = require('../util/erros');

const COLUNAS = 'id, nome, descricao, categoria, preco_base, duracao_minutos, ativo, foto_url, foto_caminho';

function paraResposta(linha) {
  return {
    id: linha.id,
    nome: linha.nome,
    descricao: linha.descricao || '',
    categoria: linha.categoria,
    precoBase: Number(linha.preco_base),
    duracaoMinutos: linha.duracao_minutos,
    ativo: linha.ativo,
    fotoUrl: linha.foto_url || '',
  };
}

function naoEncontrado() {
  return new ErroHttp(404, 'NAO_ENCONTRADO', 'Serviço não encontrado.');
}

async function buscarLinha(id) {
  const resposta = await supabase.from('servico').select(COLUNAS).eq('id', id).maybeSingle();
  const linha = exigirSucesso(resposta, 'servicos.buscar');
  if (!linha) {
    throw naoEncontrado();
  }
  return linha;
}

// Painel: todos. Site: só os ativos.
async function listar({ apenasAtivos = false } = {}) {
  let consulta = supabase.from('servico').select(COLUNAS).order('categoria').order('nome');
  if (apenasAtivos) {
    consulta = consulta.eq('ativo', true);
  }
  return exigirSucesso(await consulta, 'servicos.listar').map(paraResposta);
}

async function criar(dados) {
  const resposta = await supabase
    .from('servico')
    .insert({ ...dados, empresa_id: await empresa.buscarId() })
    .select(COLUNAS)
    .single();
  return paraResposta(exigirSucesso(resposta, 'servicos.criar'));
}

async function editar(id, dados) {
  await buscarLinha(id);
  const resposta = await supabase.from('servico').update(dados).eq('id', id).select(COLUNAS).single();
  return paraResposta(exigirSucesso(resposta, 'servicos.editar'));
}

// Envia a foto nova, grava no serviço e só então apaga a antiga.
async function trocarFoto(id, foto) {
  const atual = await buscarLinha(id);
  const nova = await armazenamento.enviar(`servicos/${id}`, foto);
  const resposta = await supabase
    .from('servico')
    .update({ foto_url: nova.url, foto_caminho: nova.caminho })
    .eq('id', id)
    .select(COLUNAS)
    .single();
  const linha = exigirSucesso(resposta, 'servicos.trocarFoto');
  await armazenamento.remover([atual.foto_caminho]);
  return paraResposta(linha);
}

async function removerFoto(id) {
  const atual = await buscarLinha(id);
  const resposta = await supabase
    .from('servico')
    .update({ foto_url: null, foto_caminho: null })
    .eq('id', id)
    .select(COLUNAS)
    .single();
  const linha = exigirSucesso(resposta, 'servicos.removerFoto');
  await armazenamento.remover([atual.foto_caminho]);
  return paraResposta(linha);
}

module.exports = { paraResposta, listar, criar, editar, trocarFoto, removerFoto };
