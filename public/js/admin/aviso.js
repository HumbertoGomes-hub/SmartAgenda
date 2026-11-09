/*
 * Aviso que aparece no canto da tela depois de uma ação do painel
 * ("Serviço salvo", "Pedido aceito"...), com um botão opcional junto
 * (avisar no WhatsApp, desfazer). A página precisa ter
 * <div id="aviso-acao" class="aviso-acao" role="status" hidden></div>.
 */
(function () {
  'use strict';

  var aviso = document.getElementById('aviso-acao');

  function mostrar(texto, extra) {
    if (!aviso) {
      return;
    }
    var mensagem = document.createElement('p');
    mensagem.className = 'aviso-acao__texto';
    mensagem.textContent = texto;

    var fechar = document.createElement('button');
    fechar.type = 'button';
    fechar.className = 'aviso-acao__fechar';
    fechar.textContent = 'Fechar';
    fechar.addEventListener('click', function () {
      aviso.hidden = true;
    });

    aviso.replaceChildren(mensagem);
    if (extra) {
      aviso.append(extra);
    }
    aviso.append(fechar);
    aviso.hidden = false;
  }

  function esconder() {
    if (aviso) {
      aviso.hidden = true;
    }
  }

  window.SmartAgendaAviso = { mostrar: mostrar, esconder: esconder };
})();
