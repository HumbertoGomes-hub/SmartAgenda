/* Tela de confirmação do pedido. */
(function () {
  'use strict';

  var pedido = window.SmartAgendaAPI.ultimoPedido();
  var codigoURL = new URLSearchParams(window.location.search).get('codigo');
  var codigo = codigoURL || (pedido && pedido.codigo);
  var campoCodigo = document.getElementById('codigo');

  if (codigo) {
    campoCodigo.textContent = codigo;
    // site.js monta o link do WhatsApp da estética com esta mensagem.
    document.getElementById('falar-whatsapp').dataset.whatsappTexto =
      'Olá! Fiz o pedido ' + codigo + ' pelo site e quero falar sobre ele.';
  }

  if (pedido && pedido.codigo === codigo) {
    document.getElementById('ficha-quando').textContent = pedido.dataHoraTexto;
    document.getElementById('ficha-servicos').textContent = pedido.servicosTexto;
    document.getElementById('ficha-duracao').textContent = pedido.duracaoTexto;
    document.getElementById('ficha-valor').textContent = pedido.precoTexto;
  }

  window.SmartAgendaAPI.agenda()
    .then(function (agenda) {
      document.getElementById('prazo-resposta').textContent = agenda.prazoRespostaHoras + ' horas';
    })
    .catch(function () {
      // Sem a agenda, fica o prazo padrão do texto.
    });

  var botao = document.getElementById('copiar-codigo');
  var aviso = document.getElementById('copiar-aviso');

  botao.addEventListener('click', function () {
    if (!navigator.clipboard) {
      aviso.textContent = 'Anote o código acima.';
      return;
    }
    navigator.clipboard
      .writeText(campoCodigo.textContent)
      .then(function () {
        aviso.textContent = 'Código copiado.';
      })
      .catch(function () {
        aviso.textContent = 'Anote o código acima.';
      });
  });
})();
