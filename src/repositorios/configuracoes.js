/*
 * Configurações da estética: agenda (configuracao_agenda), vitrine (empresa)
 * e datas bloqueadas (bloqueio_agenda). Cada instalação tem uma empresa só
 * (RNF-12), então cada tabela tem uma linha (ou uma lista, nos bloqueios).
 */
'use strict';

const { supabase, exigirSucesso } = require('../banco/supabase');
const armazenamento = require('../banco/armazenamento');
const empresa = require('./empresa');
const { agendaParaResposta, vitrineParaResposta, dataISO } = require('../dominio/configuracoes');
const { ErroHttp } = require('../util/erros');

const COLUNAS_AGENDA =
  'dias_funcionamento, hora_abertura, hora_fechamento, intervalo_minutos, capacidade_simultanea, ' +
  'antecedencia_minima_horas, limite_dias_futuros, prazo_resposta_horas, prazo_cancelamento_horas';
const COLUNAS_VITRINE =
  'nome, descricao, endereco, telefone_contato, instagram, telefone_whatsapp, cor_primaria, logotipo_url, logotipo_caminho';

async function lerAgenda(empresaId) {
  const resposta = await supabase
    .from('configuracao_agenda')
    .select(COLUNAS_AGENDA)
    .eq('empresa_id', empresaId)
    .maybeSingle();
  return agendaParaResposta(exigirSucesso(resposta, 'configuracoes.lerAgenda'));
}

async function lerVitrineLinha(empresaId) {
  const resposta = await supabase.from('empresa').select(COLUNAS_VITRINE).eq('id', empresaId).single();
  return exigirSucesso(resposta, 'configuracoes.lerVitrine');
}

// Datas bloqueadas de hoje em diante (as passadas não interessam mais).
async function listarBloqueios(empresaId, hoje = new Date()) {
  const resposta = await supabase
    .from('bloqueio_agenda')
    .select('data, motivo')
    .eq('empresa_id', empresaId)
    .gte('data', dataISO(hoje))
    .order('data');
  return exigirSucesso(resposta, 'configuracoes.listarBloqueios').map((b) => ({ data: b.data, motivo: b.motivo || '' }));
}

async function ler() {
  const empresaId = await empresa.buscarId();
  const [agenda, vitrine, bloqueios] = await Promise.all([
    lerAgenda(empresaId),
    lerVitrineLinha(empresaId),
    listarBloqueios(empresaId),
  ]);
  return { agenda, vitrine: vitrineParaResposta(vitrine), bloqueios };
}

// Grava a agenda inteira. Se a linha ainda não existir, ela é criada.
async function salvarAgenda(dados) {
  const empresaId = await empresa.buscarId();
  const resposta = await supabase
    .from('configuracao_agenda')
    .upsert({ empresa_id: empresaId, ...dados })
    .select(COLUNAS_AGENDA)
    .single();
  return agendaParaResposta(exigirSucesso(resposta, 'configuracoes.salvarAgenda'));
}

async function salvarVitrine(dados) {
  const empresaId = await empresa.buscarId();
  const resposta = await supabase.from('empresa').update(dados).eq('id', empresaId).select(COLUNAS_VITRINE).single();
  return vitrineParaResposta(exigirSucesso(resposta, 'configuracoes.salvarVitrine'));
}

// Envia o logotipo novo, grava na empresa e só então apaga o antigo.
async function trocarLogotipo(foto) {
  const empresaId = await empresa.buscarId();
  const atual = await lerVitrineLinha(empresaId);
  const novo = await armazenamento.enviar('empresa', foto);
  const resposta = await supabase
    .from('empresa')
    .update({ logotipo_url: novo.url, logotipo_caminho: novo.caminho })
    .eq('id', empresaId)
    .select(COLUNAS_VITRINE)
    .single();
  const linha = exigirSucesso(resposta, 'configuracoes.trocarLogotipo');
  await armazenamento.remover([atual.logotipo_caminho]);
  return vitrineParaResposta(linha);
}

async function removerLogotipo() {
  const empresaId = await empresa.buscarId();
  const atual = await lerVitrineLinha(empresaId);
  const resposta = await supabase
    .from('empresa')
    .update({ logotipo_url: null, logotipo_caminho: null })
    .eq('id', empresaId)
    .select(COLUNAS_VITRINE)
    .single();
  const linha = exigirSucesso(resposta, 'configuracoes.removerLogotipo');
  await armazenamento.remover([atual.logotipo_caminho]);
  return vitrineParaResposta(linha);
}

async function criarBloqueio({ data, motivo }) {
  const empresaId = await empresa.buscarId();
  const resposta = await supabase.from('bloqueio_agenda').insert({ empresa_id: empresaId, data, motivo });
  if (resposta.error && resposta.error.code === '23505') {
    throw new ErroHttp(409, 'DATA_JA_BLOQUEADA', 'Essa data já está bloqueada.');
  }
  exigirSucesso(resposta, 'configuracoes.criarBloqueio');
  return listarBloqueios(empresaId);
}

async function removerBloqueio(data) {
  const empresaId = await empresa.buscarId();
  exigirSucesso(
    await supabase.from('bloqueio_agenda').delete().eq('empresa_id', empresaId).eq('data', data),
    'configuracoes.removerBloqueio',
  );
  return listarBloqueios(empresaId);
}

module.exports = {
  ler,
  salvarAgenda,
  salvarVitrine,
  trocarLogotipo,
  removerLogotipo,
  criarBloqueio,
  removerBloqueio,
};
