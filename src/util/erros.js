'use strict';

/*
 * Erro com status HTTP e código estável, que o front-end usa para decidir
 * o que mostrar. As rotas lançam ErroHttp e o tratador central em
 * middlewares/erros.js monta a resposta:
 *   { "erro": { "codigo": "CREDENCIAIS_INVALIDAS", "mensagem": "..." } }
 */
class ErroHttp extends Error {
  constructor(status, codigo, mensagem) {
    super(mensagem);
    this.name = 'ErroHttp';
    this.status = status;
    this.codigo = codigo;
  }
}

module.exports = { ErroHttp };
