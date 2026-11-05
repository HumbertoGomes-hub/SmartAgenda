/* Comportamentos comuns a todas as páginas públicas. */
(function () {
  'use strict';

  var movimentoReduzido = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  /* Menu no celular */
  var botaoMenu = document.querySelector('.alternar-menu');
  var navegacao = document.getElementById('navegacao');

  if (botaoMenu && navegacao) {
    botaoMenu.addEventListener('click', function () {
      var aberta = botaoMenu.getAttribute('aria-expanded') === 'true';
      botaoMenu.setAttribute('aria-expanded', String(!aberta));
      navegacao.dataset.aberta = String(!aberta);
    });

    document.addEventListener('keydown', function (evento) {
      if (evento.key === 'Escape' && navegacao.dataset.aberta === 'true') {
        botaoMenu.setAttribute('aria-expanded', 'false');
        navegacao.dataset.aberta = 'false';
        botaoMenu.focus();
      }
    });
  }

  /* Comparador antes/depois */
  function aplicarPosicao(comparador, valor) {
    comparador.style.setProperty('--pos', valor + '%');
  }

  function apresentar(comparador, controle) {
    var inicio = 12;
    var fim = Number(controle.value);
    var duracao = 1400;
    var comeco = null;
    var interrompido = false;

    function interromper() {
      interrompido = true;
    }

    controle.addEventListener('pointerdown', interromper, { once: true });
    controle.addEventListener('keydown', interromper, { once: true });

    function quadro(agora) {
      if (interrompido) {
        return;
      }
      if (comeco === null) {
        comeco = agora;
      }
      var t = Math.min((agora - comeco) / duracao, 1);
      var suavizado = 1 - Math.pow(1 - t, 3);
      aplicarPosicao(comparador, inicio + (fim - inicio) * suavizado);
      if (t < 1) {
        requestAnimationFrame(quadro);
      }
    }

    aplicarPosicao(comparador, inicio);
    requestAnimationFrame(quadro);
  }

  document.querySelectorAll('.comparador').forEach(function (comparador) {
    var controle = comparador.querySelector('.comparador__controle');
    if (!controle) {
      return;
    }

    aplicarPosicao(comparador, controle.value);
    controle.addEventListener('input', function () {
      aplicarPosicao(comparador, controle.value);
    });

    if (comparador.dataset.apresentar === 'true' && !movimentoReduzido) {
      apresentar(comparador, controle);
    }
  });

  /* Máscara de telefone, compartilhada com os formulários */
  function formatarTelefone(valor) {
    var d = valor.replace(/\D/g, '').slice(0, 11);
    if (d.length <= 2) {
      return d.length ? '(' + d : '';
    }
    if (d.length <= 7) {
      return '(' + d.slice(0, 2) + ') ' + d.slice(2);
    }
    return '(' + d.slice(0, 2) + ') ' + d.slice(2, 7) + '-' + d.slice(7);
  }

  function telefoneValido(valor) {
    return /^[1-9]{2}9\d{8}$/.test(valor.replace(/\D/g, ''));
  }

  document.querySelectorAll('input[data-telefone]').forEach(function (campo) {
    campo.addEventListener('input', function () {
      campo.value = formatarTelefone(campo.value);
    });
  });

  window.SmartAgendaSite = {
    telefoneValido: telefoneValido,
    telefoneE164: function (valor) {
      return '+55' + valor.replace(/\D/g, '');
    },
  };
})();
