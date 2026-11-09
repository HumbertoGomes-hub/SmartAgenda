/* Comportamentos comuns a todas as páginas públicas. */
(function () {
  'use strict';

  var movimentoReduzido = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  /* Menu no celular */
  var cabecalho = document.querySelector('.cabecalho');
  var botaoMenu = document.querySelector('.alternar-menu');
  var navegacao = document.getElementById('navegacao');

  function menuAberto() {
    return navegacao.dataset.aberta === 'true';
  }

  function abrirMenu(aberto) {
    botaoMenu.setAttribute('aria-expanded', String(aberto));
    botaoMenu.setAttribute('aria-label', aberto ? 'Fechar menu' : 'Abrir menu');
    navegacao.dataset.aberta = String(aberto);
  }

  if (botaoMenu && navegacao) {
    botaoMenu.addEventListener('click', function () {
      abrirMenu(!menuAberto());
    });

    document.addEventListener('keydown', function (evento) {
      if (evento.key === 'Escape' && menuAberto()) {
        abrirMenu(false);
        botaoMenu.focus();
      }
    });

    // Toque fora do cabeçalho fecha o menu.
    document.addEventListener('pointerdown', function (evento) {
      if (menuAberto() && !cabecalho.contains(evento.target)) {
        abrirMenu(false);
      }
    });
  }

  /*
   * Cabeçalho fixo: ganha fundo de vidro ao sair do topo e se esconde enquanto
   * a pessoa rola para baixo, voltando assim que ela rola para cima.
   */
  if (cabecalho) {
    var ultimoY = window.scrollY;
    var quadroPedido = false;
    var LIMIAR = 6;

    // Só o foco de teclado segura o cabeçalho; o de um clique não.
    var focoDeTecladoNoCabecalho = function () {
      try {
        return Boolean(cabecalho.querySelector(':focus-visible'));
      } catch (erro) {
        return cabecalho.contains(document.activeElement);
      }
    };

    var atualizarCabecalho = function () {
      quadroPedido = false;
      var y = Math.max(window.scrollY, 0);
      var altura = cabecalho.offsetHeight;
      cabecalho.dataset.rolado = String(y > 4);

      var podeEsconder =
        !movimentoReduzido &&
        !(navegacao && menuAberto()) &&
        !focoDeTecladoNoCabecalho();

      if (y <= altura) {
        cabecalho.dataset.oculto = 'false';
      } else if (podeEsconder && y > ultimoY + LIMIAR) {
        cabecalho.dataset.oculto = 'true';
      } else if (y < ultimoY - LIMIAR) {
        cabecalho.dataset.oculto = 'false';
      }

      if (Math.abs(y - ultimoY) > LIMIAR) {
        ultimoY = y;
      }
    };

    window.addEventListener(
      'scroll',
      function () {
        if (!quadroPedido) {
          quadroPedido = true;
          requestAnimationFrame(atualizarCabecalho);
        }
      },
      { passive: true },
    );

    // Quem navega pelo teclado e volta ao cabeçalho sempre o encontra visível.
    cabecalho.addEventListener('focusin', function () {
      cabecalho.dataset.oculto = 'false';
    });

    atualizarCabecalho();
  }

  /*
   * Paralaxe: a camada marcada com data-paralaxe se desloca mais devagar que a
   * página e gira com a rolagem. Só calcula enquanto a seção está na tela.
   */
  if (!movimentoReduzido && 'IntersectionObserver' in window) {
    document.querySelectorAll('[data-paralaxe]').forEach(function (camada) {
      var secao = camada.parentElement;
      var visivel = false;
      var pedido = false;

      function atualizar() {
        pedido = false;
        var caixa = secao.getBoundingClientRect();
        var progresso = (window.innerHeight - caixa.top) / (window.innerHeight + caixa.height);
        progresso = Math.min(Math.max(progresso, 0), 1);
        camada.style.setProperty('--desloc', ((progresso - 0.5) * 220).toFixed(1) + 'px');
        camada.style.setProperty('--giro', (progresso * 200).toFixed(1) + 'deg');
      }

      function pedirQuadro() {
        if (visivel && !pedido) {
          pedido = true;
          requestAnimationFrame(atualizar);
        }
      }

      new IntersectionObserver(function (entradas) {
        visivel = entradas[0].isIntersecting;
        pedirQuadro();
      }).observe(secao);

      window.addEventListener('scroll', pedirQuadro, { passive: true });
      window.addEventListener('resize', pedirQuadro);
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
