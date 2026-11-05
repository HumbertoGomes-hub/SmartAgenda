/* Acesso à tabela empresa (uma linha por instalação, RNF-12). */
'use strict';

const { supabase, exigirSucesso } = require('../banco/supabase');
const { ErroHttp } = require('../util/erros');

// Só o que as páginas precisam para mostrar a identidade da estética (RF-23).
// O telefone das notificações não sai do servidor.
function identidadeParaResposta(linha) {
  return {
    nome: linha.nome,
    logotipoUrl: linha.logotipo_url || '',
    corPrimaria: linha.cor_primaria || '',
  };
}

async function buscarIdentidade() {
  const resposta = await supabase
    .from('empresa')
    .select('nome, logotipo_url, cor_primaria')
    .order('id')
    .limit(1)
    .maybeSingle();
  const empresa = exigirSucesso(resposta, 'empresa.buscarIdentidade');
  if (!empresa) {
    throw new ErroHttp(404, 'EMPRESA_NAO_CONFIGURADA', 'A estética ainda não foi configurada.');
  }
  return identidadeParaResposta(empresa);
}

module.exports = { buscarIdentidade, identidadeParaResposta };
