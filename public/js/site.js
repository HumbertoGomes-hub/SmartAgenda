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

  // Liga o controle deslizante. vitrine.js chama de novo para os comparadores que monta.
  function iniciarComparador(comparador) {
    var controle = comparador.querySelector('.comparador__controle');
    if (!controle || comparador.dataset.iniciado) {
      return;
    }
    comparador.dataset.iniciado = 'true';

    aplicarPosicao(comparador, controle.value);
    controle.addEventListener('input', function () {
      aplicarPosicao(comparador, controle.value);
    });

    if (comparador.dataset.apresentar === 'true' && !movimentoReduzido) {
      apresentar(comparador, controle);
    }
  }

  document.querySelectorAll('.comparador').forEach(iniciarComparador);

  /* Formatação compartilhada (vitrine e agendamento) */
  // Centavos só quando existem: R$ 80, R$ 95,50.
  function formatarPreco(valor) {
    var casas = valor % 1 ? 2 : 0;
    return valor.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL', minimumFractionDigits: casas, maximumFractionDigits: casas });
  }

  function formatarDuracao(minutos) {
    var h = Math.floor(minutos / 60);
    var m = minutos % 60;
    if (!h) {
      return m + ' min';
    }
    return m ? h + 'h' + String(m).padStart(2, '0') : h + 'h';
  }

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

  /*
   * Dados da estética (RF-01, RF-23): nome, descrição, endereço, horário,
   * contatos, cor e logotipo, como o dono configurou no painel.
   *   data-empresa="campo"       recebe o texto
   *   data-empresa-se="campo"    some quando o campo está vazio (sem espaço vazio)
   *   data-empresa-link="tipo"   vira link de telefone, WhatsApp ou Instagram
   *   data-whatsapp-texto="..."  mensagem pronta no link do WhatsApp
   */
  var DIAS = ['domingo', 'segunda', 'terça', 'quarta', 'quinta', 'sexta', 'sábado'];
  var tituloDaPagina = document.title;
  var nomeDaEmpresa = '';

  function maiuscula(texto) {
    return texto.charAt(0).toUpperCase() + texto.slice(1);
  }

  // "08:00" -> "8h", "08:30" -> "8h30"
  function horaCurta(hora) {
    var partes = hora.split(':');
    return Number(partes[0]) + 'h' + (partes[1] !== '00' ? partes[1] : '');
  }

  // [1,2,3,4,5,6] -> "segunda a sábado"; [1,3,5] -> "segunda, quarta e sexta"
  function diasTexto(dias) {
    var ordenados = dias.slice().sort();
    var blocos = [];
    ordenados.forEach(function (dia) {
      var ultimo = blocos[blocos.length - 1];
      if (ultimo && dia === ultimo[ultimo.length - 1] + 1) {
        ultimo.push(dia);
      } else {
        blocos.push([dia]);
      }
    });
    var partes = [];
    blocos.forEach(function (bloco) {
      if (bloco.length >= 3) {
        partes.push(DIAS[bloco[0]] + ' a ' + DIAS[bloco[bloco.length - 1]]);
      } else {
        bloco.forEach(function (dia) {
          partes.push(DIAS[dia]);
        });
      }
    });
    return partes.length > 1 ? partes.slice(0, -1).join(', ') + ' e ' + partes[partes.length - 1] : partes.join('');
  }

  function horarioTexto(horario) {
    if (!horario || !horario.diasFuncionamento || !horario.diasFuncionamento.length) {
      return '';
    }
    return (
      maiuscula(diasTexto(horario.diasFuncionamento)) +
      ', das ' +
      horaCurta(horario.horaAbertura) +
      ' às ' +
      horaCurta(horario.horaFechamento)
    );
  }

  // "+5511987654321" -> "(11) 98765-4321"; "+551130000000" -> "(11) 3000-0000"
  function telefoneTexto(telefone) {
    var d = String(telefone || '').replace(/\D/g, '');
    if (d.length > 11 && d.indexOf('55') === 0) {
      d = d.slice(2);
    }
    if (d.length === 11) {
      return '(' + d.slice(0, 2) + ') ' + d.slice(2, 7) + '-' + d.slice(7);
    }
    if (d.length === 10) {
      return '(' + d.slice(0, 2) + ') ' + d.slice(2, 6) + '-' + d.slice(6);
    }
    return telefone || '';
  }

  // Texto branco ou escuro, o que tiver mais contraste com a cor da marca (WCAG).
  function luminancia(hex) {
    var canais = [1, 3, 5].map(function (inicio) {
      var c = parseInt(hex.slice(inicio, inicio + 2), 16) / 255;
      return c <= 0.03928 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4);
    });
    return 0.2126 * canais[0] + 0.7152 * canais[1] + 0.0722 * canais[2];
  }

  function aplicarCor(cor) {
    if (!/^#[0-9a-f]{6}$/i.test(cor || '')) {
      return; // sem cor configurada: fica a do tokens.css
    }
    var l = luminancia(cor);
    // No tema escuro (tema.css), cor quase preta sumiria no fundo: fica o azul do tema.
    var temaEscuro = getComputedStyle(document.documentElement).getPropertyValue('--tema').trim() === 'escuro';
    if (temaEscuro && l < 0.05) {
      return;
    }
    document.documentElement.style.setProperty('--marca-2', cor);
    var textoBranco = 1.05 / (l + 0.05) >= (l + 0.05) / (luminancia('#1f1f1f') + 0.05);
    document.documentElement.style.setProperty('--marca', cor);
    document.documentElement.style.setProperty('--marca-texto', textoBranco ? '#ffffff' : '#1f1f1f');
  }

  // Título da aba: "Serviços | GHdetail"; no início, só o nome da estética.
  function definirTitulo(texto) {
    tituloDaPagina = texto;
    if (document.body.dataset.pagina === 'inicio') {
      document.title = nomeDaEmpresa || texto;
    } else {
      document.title = texto + (nomeDaEmpresa ? ' | ' + nomeDaEmpresa : '');
    }
  }

  function preencherEmpresa(empresa) {
    nomeDaEmpresa = empresa.nome || '';
    var telefone = empresa.telefoneContato || '';
    var digitos = telefone.replace(/\D/g, '');
    var valores = {
      nome: nomeDaEmpresa,
      descricao: empresa.descricao || 'Estética automotiva com agendamento online: escolha o serviço, veja os horários livres e marque sem criar conta.',
      endereco: empresa.endereco || '',
      horario: horarioTexto(empresa.horario),
      telefone: telefoneTexto(telefone),
      whatsapp: digitos,
      instagram: empresa.instagram || '',
    };

    document.querySelectorAll('[data-empresa]').forEach(function (elemento) {
      elemento.textContent = valores[elemento.dataset.empresa] || '';
    });
    document.querySelectorAll('[data-empresa-se]').forEach(function (elemento) {
      elemento.hidden = !valores[elemento.dataset.empresaSe];
    });
    document.querySelectorAll('[data-empresa-link]').forEach(function (link) {
      var tipo = link.dataset.empresaLink;
      if (tipo === 'telefone' && digitos) {
        link.href = 'tel:+' + (digitos.length > 11 ? digitos : '55' + digitos);
      } else if (tipo === 'whatsapp' && digitos) {
        var texto = link.dataset.whatsappTexto;
        link.href = 'https://wa.me/' + (digitos.length > 11 ? digitos : '55' + digitos) + (texto ? '?text=' + encodeURIComponent(texto) : '');
      } else if (tipo === 'instagram' && valores.instagram) {
        link.href = 'https://www.instagram.com/' + encodeURIComponent(valores.instagram.replace(/^@/, ''));
      }
    });

    // Grupo sem nenhum item visível (ex.: "Contato" sem telefone nem Instagram) some inteiro.
    document.querySelectorAll('[data-empresa-grupo]').forEach(function (grupo) {
      var visiveis = Array.prototype.filter.call(grupo.querySelectorAll('li'), function (item) {
        return !item.hidden;
      });
      grupo.hidden = visiveis.length === 0;
    });

    // Sem logotipo cadastrado no painel, a marca usa o logotipo padrão.
    document.querySelectorAll('img[data-empresa-logo]').forEach(function (img) {
      img.src = empresa.logotipoUrl || '/img/logotipo-padrao.svg';
      img.hidden = false;
    });
    if (empresa.logotipoUrl) {
      var icone = document.querySelector('link[data-empresa-icone]');
      if (icone) {
        icone.href = empresa.logotipoUrl;
        icone.removeAttribute('type');
      }
    }
    aplicarCor(empresa.corPrimaria);
    definirTitulo(tituloDaPagina);
  }

  if (window.SmartAgendaAPI && window.SmartAgendaAPI.empresa) {
    window.SmartAgendaAPI.empresa()
      .then(preencherEmpresa)
      .catch(function () {
        // Sem os dados, a página segue com o conteúdo que já tem.
      });
  }

  window.SmartAgendaSite = {
    definirTitulo: definirTitulo,
    iniciarComparador: iniciarComparador,
    formatar: { preco: formatarPreco, duracao: formatarDuracao },
    telefoneValido: telefoneValido,
    telefoneE164: function (valor) {
      return '+55' + valor.replace(/\D/g, '');
    },
  };
})();
