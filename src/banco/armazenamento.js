/*
 * Fotos no Supabase Storage (RNF-11), no bucket público de leitura
 * SUPABASE_BUCKET. Só o servidor grava, com a chave de serviço.
 *
 * Caminhos: servicos/<id>/<uuid>.webp e portfolio/<id>/<uuid>.webp
 */
'use strict';

const { randomUUID } = require('node:crypto');
const config = require('../config');
const { supabase } = require('./supabase');
const { ErroHttp } = require('../util/erros');

function bucket() {
  return supabase.storage.from(config.supabase.bucket);
}

// foto: { buffer, tipo, extensao } (ver dominio/imagens.js)
async function enviar(pasta, foto) {
  const caminho = `${pasta}/${randomUUID()}.${foto.extensao}`;
  const { error } = await bucket().upload(caminho, foto.buffer, {
    contentType: foto.tipo,
    cacheControl: '31536000', // o nome é único: a foto pode ficar em cache
    upsert: false,
  });
  if (error) {
    const falha = new ErroHttp(500, 'ERRO_ARMAZENAMENTO', 'Não foi possível guardar a foto.');
    falha.cause = error;
    falha.contexto = 'armazenamento.enviar';
    throw falha;
  }
  return { caminho, url: bucket().getPublicUrl(caminho).data.publicUrl };
}

/*
 * Apaga fotos que deixaram de ser usadas. Falhar aqui não desfaz a operação
 * do painel (a foto já saiu do banco); só fica registrado no log.
 */
async function remover(caminhos) {
  const lista = (caminhos || []).filter(Boolean);
  if (lista.length === 0) {
    return;
  }
  const { error } = await bucket().remove(lista);
  if (error) {
    console.error('[armazenamento] não apagou', lista, error);
  }
}

module.exports = { enviar, remover };
