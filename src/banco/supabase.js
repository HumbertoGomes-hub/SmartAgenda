/*
 * Cliente do Supabase usado pelo servidor.
 *
 * Usa a chave de serviço, que ignora o RLS: nunca envie esta chave ao
 * navegador. Todas as regras de acesso ficam nas rotas do Express.
 */
'use strict';

const { createClient } = require('@supabase/supabase-js');
const config = require('../config');
const { ErroHttp } = require('../util/erros');

const supabase = createClient(config.supabase.url, config.supabase.chaveServico, {
  auth: { persistSession: false, autoRefreshToken: false },
});

/*
 * O supabase-js devolve { data, error } em vez de lançar exceção.
 * Este ajudante transforma o erro em exceção, para o tratador central
 * responder 500 e registrar o detalhe no log.
 */
function exigirSucesso({ data, error }, contexto) {
  if (error) {
    const falha = new ErroHttp(500, 'ERRO_BANCO', 'Não foi possível acessar o banco de dados.');
    falha.cause = error;
    falha.contexto = contexto;
    throw falha;
  }
  return data;
}

module.exports = { supabase, exigirSucesso };
