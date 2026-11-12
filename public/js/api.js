/*
 * Comunicação do site com o servidor (rotas em src/rotas/vitrine.js).
 *
 * As telas usam este objeto e não sabem de fetch nem de endereços. Toda
 * função devolve uma Promise; em caso de erro, a Promise falha com um Error
 * que traz a mensagem para o cliente e o código do servidor (erro.codigo).
 */
(function () {
  'use strict';

  var CHAVE_PEDIDO = 'smartagenda:ultimo-pedido';
  var empresaEmAndamento = null;

  function pedir(metodo, caminho, corpo) {
    var opcoes = { method: metodo, headers: { Accept: 'application/json' }, credentials: 'same-origin' };
    if (corpo !== undefined) {
      opcoes.headers['Content-Type'] = 'application/json';
      opcoes.body = JSON.stringify(corpo);
    }
    return fetch(caminho, opcoes)
      .catch(function () {
        var semRede = new Error('Sem conexão com o servidor. Confira a internet e tente de novo.');
        semRede.codigo = 'SEM_CONEXAO';
        throw semRede;
      })
      .then(function (resposta) {
        return resposta.text().then(function (texto) {
          var dados = null;
          try {
            dados = texto ? JSON.parse(texto) : null;
          } catch (erro) {
            dados = null;
          }
          if (!resposta.ok) {
            var falha = (dados && dados.erro) || {};
            var erro = new Error(falha.mensagem || 'Algo deu errado. Tente de novo em instantes.');
            erro.codigo = falha.codigo || 'ERRO_' + resposta.status;
            erro.status = resposta.status;
            throw erro;
          }
          return dados;
        });
      });
  }

  window.SmartAgendaAPI = {
    // Nome, descrição, contatos, cor, logotipo e horário. Todas as páginas usam;
    // a mesma Promise serve para todas as chamadas da página.
    empresa: function () {
      if (!empresaEmAndamento) {
        empresaEmAndamento = pedir('GET', '/api/vitrine/empresa');
      }
      return empresaEmAndamento;
    },
    agenda: function () {
      return pedir('GET', '/api/vitrine/agenda');
    },
    servicos: function () {
      return pedir('GET', '/api/vitrine/servicos');
    },
    portfolio: function () {
      return pedir('GET', '/api/vitrine/portfolio');
    },
    trabalho: function (id) {
      return pedir('GET', '/api/vitrine/portfolio/' + encodeURIComponent(id));
    },
    buscarHorarios: function (data, servicoIds) {
      return pedir(
        'GET',
        '/api/vitrine/horarios?data=' + encodeURIComponent(data) + '&servicos=' + encodeURIComponent(servicoIds.join(',')),
      );
    },
    criarAgendamento: function (pedido) {
      return pedir('POST', '/api/vitrine/agendamentos', pedido);
    },

    // O último pedido fica só nesta aba, para a tela de "pedido enviado".
    ultimoPedido: function () {
      try {
        return JSON.parse(sessionStorage.getItem(CHAVE_PEDIDO));
      } catch (erro) {
        return null;
      }
    },
    guardarPedido: function (pedido) {
      try {
        sessionStorage.setItem(CHAVE_PEDIDO, JSON.stringify(pedido));
      } catch (erro) {
        // Sem armazenamento, a tela de sucesso mostra só o código.
      }
    },
  };
})();
