/*
 * Simulação do servidor, usada só enquanto o back-end não existe.
 *
 * Todas as telas falam com o servidor por este objeto. Na etapa do back-end,
 * troque cada função pela chamada real e mantenha o formato de retorno:
 *   buscarHorarios   -> GET  /api/horarios?data=AAAA-MM-DD&servicos=id1,id2
 *   criarAgendamento -> POST /agendar
 *
 * Situações de erro para testar a interface:
 *   Telefone terminado em 0000    -> número sem WhatsApp (RN-02)
 *   Telefone terminado em 1111    -> limite de 2 agendamentos ativos (RN-09)
 */
(function () {
  'use strict';

  var CHAVE_PEDIDO = 'smartagenda:ultimo-pedido';
  var ALFABETO_CODIGO = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  var ATRASO_MS = 350;

  var DURACOES = {
    'lavagem-detalhada': 60,
    'higienizacao-interna': 150,
    'polimento-comercial': 180,
    'polimento-tecnico': 300,
    'vitrificacao-pintura': 480,
    'cristalizacao-vidros': 60,
  };

  var AGENDA = {
    abertura: 8 * 60,
    fechamento: 18 * 60,
    intervalo: 30,
    antecedenciaHoras: 2,
  };

  function aguardar(valor) {
    return new Promise(function (resolver) {
      setTimeout(function () {
        resolver(valor);
      }, ATRASO_MS);
    });
  }

  function falhar(codigo, mensagem) {
    return new Promise(function (_, rejeitar) {
      setTimeout(function () {
        var erro = new Error(mensagem);
        erro.codigo = codigo;
        rejeitar(erro);
      }, ATRASO_MS);
    });
  }

  // Sempre devolve o mesmo resultado para a mesma data, como faria o banco.
  function sorteio(texto) {
    var h = 0;
    for (var i = 0; i < texto.length; i += 1) {
      h = (h * 31 + texto.charCodeAt(i)) >>> 0;
    }
    return function (limite) {
      h = (h * 1664525 + 1013904223) >>> 0;
      return (h >>> 8) % limite;
    };
  }

  function paraTexto(minutos) {
    var h = String(Math.floor(minutos / 60)).padStart(2, '0');
    var m = String(minutos % 60).padStart(2, '0');
    return h + ':' + m;
  }

  function reservasDoDia(data) {
    var sortear = sorteio(data);
    var quantidade = 1 + sortear(3);
    var reservas = [];
    for (var i = 0; i < quantidade; i += 1) {
      var inicio = AGENDA.abertura + sortear(18) * AGENDA.intervalo;
      reservas.push({ inicio: inicio, fim: inicio + 60 + sortear(4) * 30 });
    }
    return reservas;
  }

  function gerarCodigo() {
    var codigo = '';
    for (var i = 0; i < 6; i += 1) {
      codigo += ALFABETO_CODIGO[Math.floor(Math.random() * ALFABETO_CODIGO.length)];
    }
    return codigo;
  }

  function buscarHorarios(data, servicoIds) {
    var duracao = servicoIds.reduce(function (total, id) {
      return total + (DURACOES[id] || 0);
    }, 0);
    var reservas = reservasDoDia(data);
    var agora = new Date();
    var livres = [];

    for (
      var inicio = AGENDA.abertura;
      inicio + duracao <= AGENDA.fechamento;
      inicio += AGENDA.intervalo
    ) {
      var horario = paraTexto(inicio);
      var momento = new Date(data + 'T' + horario + ':00');
      var antecedencia = (momento - agora) / 36e5;
      var fim = inicio + duracao;
      var ocupado = reservas.some(function (r) {
        return inicio < r.fim && fim > r.inicio;
      });
      if (!ocupado && antecedencia >= AGENDA.antecedenciaHoras) {
        livres.push(horario);
      }
    }

    return aguardar({ data: data, horarios: livres });
  }

  function criarAgendamento(pedido) {
    var telefone = pedido.telefone;
    if (telefone.slice(-4) === '0000') {
      return falhar(
        'TELEFONE_SEM_WHATSAPP',
        'Este número não tem WhatsApp ativo. Informe outro celular para receber a confirmação.',
      );
    }
    if (telefone.slice(-4) === '1111') {
      return falhar(
        'LIMITE_ATIVOS',
        'Este telefone já tem 2 agendamentos em aberto. Desmarque um deles ou aguarde o atendimento para pedir outro.',
      );
    }
    return aguardar({ codigo: gerarCodigo() });
  }

  function ultimoPedido() {
    try {
      return JSON.parse(sessionStorage.getItem(CHAVE_PEDIDO));
    } catch (erro) {
      return null;
    }
  }


  window.SmartAgendaAPI = {
    buscarHorarios: buscarHorarios,
    criarAgendamento: criarAgendamento,
    ultimoPedido: ultimoPedido,
    guardarPedido: function (pedido) {
      try {
        sessionStorage.setItem(CHAVE_PEDIDO, JSON.stringify(pedido));
      } catch (erro) {
        // Sem armazenamento, a tela de sucesso mostra só o código.
      }
    },
  };
})();
