/*
 * Fotos enviadas pelo painel (RNF-09): JPG, PNG ou WebP de até 5 MB.
 *
 * O navegador já reduz a foto para no máximo 1600 px e converte para WebP
 * antes de enviar (public/js/admin/imagem.js). Aqui o servidor não confia no
 * que foi declarado: confere o formato pelos primeiros bytes do arquivo.
 */
'use strict';

const LIMITE_BYTES = 5 * 1024 * 1024;

const TIPOS = Object.freeze({
  'image/webp': 'webp',
  'image/jpeg': 'jpg',
  'image/png': 'png',
});

// Formato real pela assinatura do arquivo, ou null se não for imagem aceita.
function tipoReal(buffer) {
  if (!Buffer.isBuffer(buffer) || buffer.length < 12) {
    return null;
  }
  if (buffer.toString('ascii', 0, 4) === 'RIFF' && buffer.toString('ascii', 8, 12) === 'WEBP') {
    return 'image/webp';
  }
  if (buffer[0] === 0xff && buffer[1] === 0xd8 && buffer[2] === 0xff) {
    return 'image/jpeg';
  }
  if (buffer.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))) {
    return 'image/png';
  }
  return null;
}

/*
 * Confere a foto recebida. Devolve { buffer, tipo, extensao } ou o código
 * do problema: SEM_FOTO, FORMATO_INVALIDO ou FOTO_GRANDE.
 */
function lerFoto(buffer) {
  if (!Buffer.isBuffer(buffer) || buffer.length === 0) {
    return { erro: 'SEM_FOTO' };
  }
  if (buffer.length > LIMITE_BYTES) {
    return { erro: 'FOTO_GRANDE' };
  }
  const tipo = tipoReal(buffer);
  if (!tipo) {
    return { erro: 'FORMATO_INVALIDO' };
  }
  return { buffer, tipo, extensao: TIPOS[tipo] };
}

module.exports = { LIMITE_BYTES, TIPOS, tipoReal, lerFoto };
