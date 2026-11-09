/*
 * Recebe uma foto enviada como o próprio corpo da requisição
 * (Content-Type: image/webp, image/jpeg ou image/png), sem formulário
 * multipart. Confere tamanho e formato real (dominio/imagens.js) e deixa
 * o resultado em req.foto.
 */
'use strict';

const express = require('express');
const { LIMITE_BYTES, TIPOS, lerFoto } = require('../dominio/imagens');
const { ErroHttp } = require('../util/erros');

const MENSAGENS = {
  SEM_FOTO: [415, 'Envie a foto em JPG, PNG ou WebP.'],
  FORMATO_INVALIDO: [415, 'O arquivo não é uma foto JPG, PNG ou WebP.'],
  FOTO_GRANDE: [413, 'A foto pode ter até 5 MB.'],
};

const lerCorpo = express.raw({ type: Object.keys(TIPOS), limit: LIMITE_BYTES });

function receberFoto(req, res, next) {
  lerCorpo(req, res, (erro) => {
    if (erro && erro.type === 'entity.too.large') {
      return next(new ErroHttp(413, 'FOTO_GRANDE', MENSAGENS.FOTO_GRANDE[1]));
    }
    if (erro) {
      return next(erro);
    }
    const foto = lerFoto(req.body);
    if (foto.erro) {
      const [status, mensagem] = MENSAGENS[foto.erro];
      return next(new ErroHttp(status, foto.erro, mensagem));
    }
    req.foto = foto;
    next();
  });
}

module.exports = { receberFoto };
