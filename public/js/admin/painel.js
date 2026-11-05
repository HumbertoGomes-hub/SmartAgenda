/*
 * Comportamentos comuns às páginas do painel: confere a sessão, monta o menu
 * conforme o perfil, controla o tempo sem uso e oferece formatações.
 *
 * O menu e as permissões aqui só organizam a tela. Quem bloqueia de verdade é
 * o servidor, que confere a permissão em cada rota (RN-13).
 */
(function () {
  'use strict';

  var API = window.SmartAgendaPainelAPI;
  var raiz = document.documentElement;

  var CONFERIR_MS = 30 * 1000;
  var RENOVAR_MS = 60 * 1000;

  var ROTULOS_PERFIL = { DONO: 'Dono', SOCIO: 'Sócio', FUNCIONARIO: 'Funcionário' };
  var ROTULOS_STATUS = {
    PENDENTE: 'Pendente',
    AGUARDANDO_CLIENTE: 'Aguardando cliente',
    CONFIRMADO: 'Confirmado',
    RECUSADO: 'Recusado',
    EXPIRADO: 'Expirado',
    CANCELADO: 'Cancelado',
    CONCLUIDO: 'Concluído',
    NAO_COMPARECEU: 'Não compareceu',
  };
  var AVISOS = {
    'sem-permissao': 'Seu perfil não tem acesso a essa área do painel.',
  };

  var DIAS = ['Domingo', 'Segunda', 'Terça', 'Quarta', 'Quinta', 'Sexta', 'Sábado'];
  var MESES = ['janeiro', 'fevereiro', 'março', 'abril', 'maio', 'junho', 'julho', 'agosto', 'setembro', 'outubro', 'novembro', 'dezembro'];

  /* Sessão ---------------------------------------------------------------- */

  function irParaEntrar(motivo, voltarAqui) {
    var parametros = new URLSearchParams();
    var pagina = location.pathname.split('/').pop();
    if (motivo) {
      parametros.set('motivo', motivo);
    }
    if (voltarAqui && pagina && pagina !== 'index.html') {
      parametros.set('voltar', pagina);
    }
    var busca = parametros.toString();
    location.replace('entrar.html' + (busca ? '?' + busca : ''));
  }

  var estado = API.sessao();
  if (!estado.usuario) {
    irParaEntrar(estado.expirada ? 'expirou' : '', true);
    return;
  }

  var usuario = estado.usuario;

  function pode(acao) {
    return usuario.permissoes.indexOf(acao) !== -1;
  }

  // Página inteira restrita: <body data-permissao="...">
  var exigida = document.body.dataset.permissao;
  if (exigida && !pode(exigida)) {
    location.replace('index.html?aviso=sem-permissao');
    return;
  }

  /* Menu por perfil (RN-13) ----------------------------------------------- */

  document.querySelectorAll('.menu-painel [data-permissao]').forEach(function (item) {
    if (!pode(item.dataset.permissao)) {
      item.remove();
    }
  });

  document.querySelectorAll('[data-usuario-nome]').forEach(function (no) {
    no.textContent = usuario.nome;
  });
  document.querySelectorAll('[data-usuario-perfil]').forEach(function (no) {
    no.textContent = ROTULOS_PERFIL[usuario.perfil] || usuario.perfil;
  });

  /* Menu no celular ------------------------------------------------------- */

  var botaoMenu = document.querySelector('.lateral__alternar');
  var gaveta = document.getElementById('gaveta');

  function abrirMenu(aberto) {
    botaoMenu.setAttribute('aria-expanded', String(aberto));
    botaoMenu.setAttribute('aria-label', aberto ? 'Fechar menu' : 'Abrir menu');
    gaveta.dataset.aberta = String(aberto);
  }

  if (botaoMenu && gaveta) {
    botaoMenu.addEventListener('click', function () {
      abrirMenu(botaoMenu.getAttribute('aria-expanded') !== 'true');
    });

    document.addEventListener('keydown', function (evento) {
      if (evento.key === 'Escape' && gaveta.dataset.aberta === 'true') {
        abrirMenu(false);
        botaoMenu.focus();
      }
    });
  }

  /* Sair ------------------------------------------------------------------ */

  document.querySelectorAll('[data-sair]').forEach(function (botao) {
    botao.addEventListener('click', function () {
      botao.setAttribute('aria-busy', 'true');
      botao.textContent = 'Saindo…';
      API.sair().then(function () {
        irParaEntrar('saiu', false);
      });
    });
  });

  /* Tempo sem uso (RNF-07: 30 minutos) ------------------------------------ */

  var ultimaRenovacao = Date.now();

  function registrarUso() {
    if (Date.now() - ultimaRenovacao < RENOVAR_MS) {
      return;
    }
    ultimaRenovacao = Date.now();
    if (!API.renovarSessao()) {
      irParaEntrar('expirou', true);
    }
  }

  function conferirSessao() {
    if (!API.sessao().usuario) {
      irParaEntrar('expirou', true);
    }
  }

  document.addEventListener('pointerdown', registrarUso, { passive: true });
  document.addEventListener('keydown', registrarUso);
  document.addEventListener('visibilitychange', function () {
    if (!document.hidden) {
      conferirSessao();
    }
  });
  setInterval(conferirSessao, CONFERIR_MS);

  /* Aviso vindo de outra página (ex.: ?aviso=sem-permissao) ---------------- */

  var codigoAviso = new URLSearchParams(location.search).get('aviso');
  var areaAviso = document.querySelector('[data-aviso-painel]');
  if (codigoAviso && AVISOS[codigoAviso] && areaAviso) {
    areaAviso.textContent = AVISOS[codigoAviso];
    // Tira o parâmetro da barra de endereço para o aviso não voltar ao recarregar.
    history.replaceState(null, '', location.pathname);
  }

  /* Formatação ------------------------------------------------------------ */

  function doisDigitos(numero) {
    return String(numero).padStart(2, '0');
  }

  function inicioDoDia(data) {
    return new Date(data.getFullYear(), data.getMonth(), data.getDate());
  }

  function hora(valor) {
    var data = new Date(valor);
    return doisDigitos(data.getHours()) + ':' + doisDigitos(data.getMinutes());
  }

  // "Hoje", "Amanhã" ou "Sexta, 6 nov"
  function dia(valor) {
    var data = new Date(valor);
    var diferenca = Math.round((inicioDoDia(data) - inicioDoDia(new Date())) / 864e5);
    if (diferenca === 0) {
      return 'Hoje';
    }
    if (diferenca === 1) {
      return 'Amanhã';
    }
    return DIAS[data.getDay()] + ', ' + data.getDate() + ' ' + MESES[data.getMonth()].slice(0, 3);
  }

  // "Quarta, 4 de novembro"
  function dataLonga(valor) {
    var data = new Date(valor);
    return DIAS[data.getDay()] + ', ' + data.getDate() + ' de ' + MESES[data.getMonth()];
  }

  function duracao(minutos) {
    var h = Math.floor(minutos / 60);
    var m = minutos % 60;
    if (!h) {
      return m + ' min';
    }
    return m ? h + 'h' + doisDigitos(m) : h + 'h';
  }

  function tempoRestante(milissegundos) {
    if (milissegundos <= 0) {
      return 'agora';
    }
    return duracao(Math.ceil(milissegundos / 60000));
  }

  // +5511987654321 -> (11) 98765-4321
  function telefone(valor) {
    var digitos = String(valor).replace(/\D/g, '');
    if (digitos.length === 13 && digitos.indexOf('55') === 0) {
      digitos = digitos.slice(2);
    }
    if (digitos.length !== 11) {
      return valor;
    }
    return '(' + digitos.slice(0, 2) + ') ' + digitos.slice(2, 7) + '-' + digitos.slice(7);
  }

  function preco(valor) {
    return valor.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL', maximumFractionDigits: 0 });
  }

  /* Montagem de elementos ------------------------------------------------- */

  // Sempre por textContent: nome e observações vêm do cliente, nunca viram HTML.
  function el(tag, opcoes, filhos) {
    var no = document.createElement(tag);
    opcoes = opcoes || {};
    if (opcoes.classe) {
      no.className = opcoes.classe;
    }
    if (opcoes.texto !== undefined && opcoes.texto !== null) {
      no.textContent = opcoes.texto;
    }
    Object.keys(opcoes.atributos || {}).forEach(function (nome) {
      no.setAttribute(nome, opcoes.atributos[nome]);
    });
    (filhos || []).forEach(function (filho) {
      if (filho) {
        no.append(filho);
      }
    });
    return no;
  }

  function status(codigo) {
    return el('span', {
      classe: 'status',
      texto: ROTULOS_STATUS[codigo] || codigo,
      atributos: { 'data-status': codigo },
    });
  }

  raiz.dataset.sessao = 'ok';

  window.SmartAgendaPainel = {
    usuario: usuario,
    pode: pode,
    el: el,
    status: status,
    formatar: {
      hora: hora,
      dia: dia,
      dataLonga: dataLonga,
      duracao: duracao,
      tempoRestante: tempoRestante,
      telefone: telefone,
      preco: preco,
    },
  };
})();
