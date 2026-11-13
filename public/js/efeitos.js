/*
 * Cartões de trabalho que inclinam em 3D e refletem a luz onde o mouse está
 * (estilos em tema.css). Só com mouse de verdade e sem pedido de menos
 * movimento; no toque, o cartão fica parado.
 *
 * Os cartões são montados depois (vitrine.js), então o evento é escutado no
 * documento e o cartão é achado pelo alvo.
 */
(function () {
  'use strict';

  var comMouse = window.matchMedia('(hover: hover) and (pointer: fine)').matches;
  var movimentoReduzido = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  if (!comMouse || movimentoReduzido) {
    return;
  }

  var INCLINACAO = 7; // graus no canto do cartão
  var atual = null;
  var pedido = null;
  var ultimo = null;

  function soltar(cartao) {
    var foto = cartao.querySelector('.trabalho__foto');
    cartao.removeAttribute('data-inclinado');
    if (foto) {
      foto.style.setProperty('--rx', '0deg');
      foto.style.setProperty('--ry', '0deg');
    }
  }

  function aplicar() {
    pedido = null;
    if (!atual || !ultimo) {
      return;
    }
    var foto = atual.querySelector('.trabalho__foto');
    if (!foto) {
      return;
    }
    var caixa = foto.getBoundingClientRect();
    var x = Math.min(Math.max((ultimo.clientX - caixa.left) / caixa.width, 0), 1);
    var y = Math.min(Math.max((ultimo.clientY - caixa.top) / caixa.height, 0), 1);
    foto.style.setProperty('--ry', ((x - 0.5) * 2 * INCLINACAO).toFixed(2) + 'deg');
    foto.style.setProperty('--rx', ((0.5 - y) * 2 * INCLINACAO).toFixed(2) + 'deg');
    foto.style.setProperty('--brilho-x', (x * 100).toFixed(1) + '%');
    foto.style.setProperty('--brilho-y', (y * 100).toFixed(1) + '%');
    atual.setAttribute('data-inclinado', 'true');
  }

  document.addEventListener(
    'pointermove',
    function (evento) {
      var cartao = evento.target.closest ? evento.target.closest('.trabalho') : null;
      if (cartao && !cartao.querySelector('.trabalho__foto')) {
        cartao = null;
      }
      if (atual && atual !== cartao) {
        soltar(atual);
      }
      atual = cartao;
      ultimo = evento;
      if (atual && !pedido) {
        pedido = requestAnimationFrame(aplicar);
      }
    },
    { passive: true },
  );

  document.addEventListener('pointerleave', function () {
    if (atual) {
      soltar(atual);
      atual = null;
    }
  });
})();
