/* Acesso à tabela usuario_admin. */
'use strict';

const { supabase, exigirSucesso } = require('../banco/supabase');

const COLUNAS = 'id, nome, email, perfil, ativo';

function normalizarEmail(email) {
  return String(email || '').trim().toLowerCase();
}

async function buscarPorId(id) {
  const resposta = await supabase.from('usuario_admin').select(COLUNAS).eq('id', id).maybeSingle();
  return exigirSucesso(resposta, 'usuarios.buscarPorId');
}

// Inclui o hash da senha: use só no login, nunca devolva ao navegador.
async function buscarParaLogin(email) {
  const resposta = await supabase
    .from('usuario_admin')
    .select(COLUNAS + ', senha_hash')
    .eq('email', normalizarEmail(email))
    .maybeSingle();
  return exigirSucesso(resposta, 'usuarios.buscarParaLogin');
}

module.exports = { normalizarEmail, buscarPorId, buscarParaLogin };
