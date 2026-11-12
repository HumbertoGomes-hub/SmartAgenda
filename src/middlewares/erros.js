/*
 * Respostas de erro.
 * Rotas /api/* respondem JSON no formato { erro: { codigo, mensagem } };
 * as demais respondem texto simples.
 */
'use strict';

const path = require('node:path');
const { ErroHttp } = require('../util/erros');

function naoEncontrado(req, res, next) {
  next(new ErroHttp(404, 'NAO_ENCONTRADO', 'Endereço não encontrado.'));
}

// Express reconhece o tratador de erros pelos 4 parâmetros: não remova `next`.
// eslint-disable-next-line no-unused-vars
function tratarErros(erro, req, res, next) {
  let status = 500;
  let codigo = 'ERRO_INTERNO';
  let mensagem = 'Algo deu errado no servidor. Tente de novo em instantes.';

  if (erro instanceof ErroHttp && erro.status < 500) {
    status = erro.status;
    codigo = erro.codigo;
    mensagem = erro.message;
  } else if (erro.type === 'entity.parse.failed') {
    // JSON malformado no corpo da requisição (express.json)
    status = 400;
    codigo = 'JSON_INVALIDO';
    mensagem = 'O corpo da requisição não é um JSON válido.';
  } else if (erro.type === 'entity.too.large') {
    status = 413;
    codigo = 'CORPO_GRANDE_DEMAIS';
    mensagem = 'A requisição é grande demais.';
  } else if (erro.expose && erro.status >= 400 && erro.status < 500) {
    // Outros erros 4xx de bibliotecas (http-errors), com mensagem em inglês.
    status = erro.status;
    codigo = 'REQUISICAO_INVALIDA';
    mensagem = 'A requisição não pôde ser atendida.';
  } else {
    console.error('[erro]', req.method, req.originalUrl, erro.contexto || '', erro.cause || erro);
  }

  if (res.headersSent) {
    return;
  }

  if (req.path.startsWith('/api/')) {
    res.status(status).json({ erro: { codigo, mensagem } });
  } else if (status === 404 && req.method === 'GET') {
    res.status(404).sendFile(path.join(__dirname, '..', '..', 'public', '404.html'));
  } else {
    res.status(status).type('text/plain').send(mensagem);
  }
}

module.exports = { naoEncontrado, tratarErros };
