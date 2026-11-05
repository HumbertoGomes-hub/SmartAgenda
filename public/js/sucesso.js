/* Tela de confirmação do pedido. */
(function () {
  'use strict';

  var pedido = window.SmartAgendaAPI.ultimoPedido();
  var codigoURL = new URLSearchParams(window.location.search).get('codigo');
  var codigo = codigoURL || (pedido && pedido.codigo);
  var campoCodigo = document.getElementById('codigo');

  if (codigo) {
    campoCodigo.textContent = codigo;
  }

  if (pedido && pedido.codigo === codigo) {
    document.getElementById('ficha-quando').textContent = pedido.dataHoraTexto;
    document.getElementById('ficha-servicos').textContent = pedido.servicosTexto;
    document.getElementById('ficha-duracao').textContent = pedido.duracaoTexto;
    document.getElementById('ficha-valor').textContent = pedido.precoTexto;
  }

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
