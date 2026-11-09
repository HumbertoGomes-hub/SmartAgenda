/*
 * Pedidos (RF-16): solicitações feitas pelo site, esperando resposta.
 *
 * Duas ações por pedido: aceitar ou chamar o cliente no WhatsApp. Não há
 * "recusar": a ideia é a equipe encaixar o cliente em outro horário (pela
 * Agenda) em vez de perder o pedido. Sem resposta no prazo, o pedido expira
 * e o horário volta a ficar livre (RN-08).
 */
(function () {
  'use strict';

  var Painel = window.SmartAgendaPainel;
  var A = window.SmartAgendaAgendamento;
  if (!Painel || !A) {
    return;
  }

  var API = window.SmartAgendaPainelAPI;
  var f = Painel.formatar;
  var el = Painel.el;

  // Abaixo disso o prazo de resposta aparece em destaque.
  var URGENTE_MS = 3 * 36e5;

  var listaPendentes = document.getElementById('lista-pendentes');
  var listaAguardando = document.getElementById('lista-aguardando');
  var blocoAguardando = document.getElementById('bloco-aguardando');
  var apoioPendentes = document.getElementById('pendentes-apoio');
  var areaErro = document.getElementById('erro-pedidos');

  function linkAgenda(agendamento) {
    var data = new Date(agendamento.dataHoraInicio);
    var iso = [data.getFullYear(), String(data.getMonth() + 1).padStart(2, '0'), String(data.getDate()).padStart(2, '0')].join('-');
    return 'agenda.html?visao=dia&data=' + iso + '&codigo=' + agendamento.codigo;
  }

  // Bloco com dia da semana, número e mês, como a folha de um calendário.
  function folhaDoDia(agendamento) {
    var data = new Date(agendamento.dataHoraInicio);
    var semana = data.toLocaleDateString('pt-BR', { weekday: 'short' }).replace('.', '');
    var mes = data.toLocaleDateString('pt-BR', { month: 'short' }).replace('.', '');
    return el('p', { classe: 'folha', atributos: { 'aria-hidden': 'true' } }, [
      el('span', { classe: 'folha__semana', texto: semana }),
      el('span', { classe: 'folha__numero', texto: String(data.getDate()) }),
      el('span', { classe: 'folha__mes', texto: mes }),
    ]);
  }

  function prazo(agendamento) {
    if (!agendamento.expiraEm) {
      return null;
    }
    var restante = new Date(agendamento.expiraEm) - Date.now();
    return el('p', {
      classe: 'prazo',
      texto: restante > 0 ? 'Expira em ' + f.tempoRestante(restante) : 'Expirando',
      atributos: restante < URGENTE_MS ? { 'data-urgente': 'true' } : {},
    });
  }

  function servicos(agendamento) {
    var itens = agendamento.itens.map(function (item) {
      return el('li', {}, [
        el('span', { texto: item.nome }),
        el('span', { classe: 'pedido__valor', texto: f.preco(item.precoPraticado) }),
      ]);
    });
    itens.push(
      el('li', { classe: 'pedido__total' }, [
        el('span', { texto: 'Total, a partir de' }),
        el('span', { classe: 'pedido__valor', texto: f.preco(agendamento.valorEstimado) }),
      ]),
    );
    return el('ul', { classe: 'pedido__servicos', atributos: { 'aria-label': 'Serviços escolhidos' } }, itens);
  }

  function cartao(agendamento, comAceitar) {
    var idTitulo = 'pedido-' + agendamento.codigo;
    var contato = [
      el('a', {
        texto: f.telefone(agendamento.cliente.telefone),
        atributos: { href: 'tel:' + agendamento.cliente.telefone },
      }),
    ];
    if (agendamento.modeloVeiculo) {
      contato.push(el('span', { texto: agendamento.modeloVeiculo }));
    }

    var acoes = el('div', { classe: 'pedido__acoes' });
    if (comAceitar) {
      var aceitar = el('button', { classe: 'botao', texto: 'Aceitar pedido', atributos: { type: 'button' } });
      aceitar.addEventListener('click', function () {
        aceitarPedido(agendamento, item, aceitar);
      });
      acoes.append(aceitar);
    }
    acoes.append(
      A.botaoWhatsApp(agendamento, 'pedido', 'Chamar no WhatsApp'),
      el('a', { classe: 'ligacao', texto: 'Ver na agenda', atributos: { href: linkAgenda(agendamento) } }),
    );

    var item = el('li', { classe: 'pedido', atributos: { 'data-codigo': agendamento.codigo } }, [
      el('article', { classe: 'pedido__cartao', atributos: { 'aria-labelledby': idTitulo } }, [
        folhaDoDia(agendamento),
        el('div', { classe: 'pedido__conteudo' }, [
          el('div', { classe: 'pedido__cabeca' }, [
            el('div', {}, [
              el('h3', { classe: 'pedido__cliente', texto: agendamento.cliente.nome, atributos: { id: idTitulo } }),
              el('p', { classe: 'pedido__contato' }, contato),
            ]),
            prazo(agendamento),
          ]),
          el('p', { classe: 'pedido__quando' }, [
            el('span', { texto: f.dataLonga(agendamento.dataHoraInicio) + ', ' + A.intervalo(agendamento) }),
            el('span', { classe: 'etiqueta', texto: f.duracao(agendamento.duracaoMinutos) }),
          ]),
          servicos(agendamento),
          agendamento.observacoes
            ? el('p', { classe: 'pedido__obs', texto: '“' + agendamento.observacoes + '”' })
            : null,
          acoes,
        ]),
      ]),
    ]);
    return item;
  }

  function vazio(texto) {
    var item = el('li', { classe: 'vazio' }, [el('span', { texto: texto + ' ' })]);
    item.append(el('a', { classe: 'ligacao', texto: 'Abrir a agenda', atributos: { href: 'agenda.html' } }));
    return item;
  }

  function aceitarPedido(agendamento, item, botao) {
    if (botao.getAttribute('aria-busy') === 'true') {
      return;
    }
    botao.setAttribute('aria-busy', 'true');
    botao.textContent = 'Aceitando…';
    areaErro.textContent = '';

    API.aceitar(agendamento.codigo)
      .then(function (confirmado) {
        // O cartão vira a confirmação, com o atalho para avisar o cliente.
        item.dataset.aceito = 'true';
        item.replaceChildren(
          el('div', { classe: 'pedido__aceito' }, [
            el('p', {
              texto: 'Pedido de ' + confirmado.cliente.nome + ' aceito para ' + A.quandoTexto(confirmado) + '.',
            }),
            el('div', { classe: 'pedido__acoes' }, [
              A.botaoWhatsApp(confirmado, 'confirmacao', 'Avisar o cliente no WhatsApp'),
              el('a', { classe: 'ligacao', texto: 'Ver na agenda', atributos: { href: linkAgenda(confirmado) } }),
            ]),
          ]),
        );
        item.querySelector('.botao-whatsapp').focus();
        atualizarContagem();
      })
      .catch(function (erro) {
        botao.removeAttribute('aria-busy');
        botao.textContent = 'Aceitar pedido';
        areaErro.textContent = erro.message || 'Não foi possível aceitar o pedido. Tente de novo.';
      });
  }

  function atualizarContagem() {
    var restantes = listaPendentes.querySelectorAll('.pedido:not([data-aceito])').length;
    document.getElementById('pendentes-titulo').textContent =
      restantes === 1 ? '1 pedido esperando resposta' : restantes + ' pedidos esperando resposta';
  }

  function mostrar(resposta) {
    apoioPendentes.textContent =
      'Sem resposta em ' + resposta.prazoRespostaHoras + ' horas, o pedido expira e o horário volta a ficar livre.';

    listaPendentes.replaceChildren.apply(
      listaPendentes,
      resposta.pendentes.length
        ? resposta.pendentes.map(function (agendamento) {
            return cartao(agendamento, true);
          })
        : [vazio('Nenhum pedido esperando resposta. Os pedidos feitos pelo site aparecem aqui.')],
    );
    listaPendentes.removeAttribute('aria-busy');
    atualizarContagem();

    blocoAguardando.hidden = resposta.aguardandoCliente.length === 0;
    listaAguardando.replaceChildren.apply(
      listaAguardando,
      resposta.aguardandoCliente.map(function (agendamento) {
        return cartao(agendamento, true);
      }),
    );
  }

  API.pedidos()
    .then(mostrar)
    .catch(function (erro) {
      areaErro.textContent = erro.message || 'Não foi possível carregar os pedidos. Recarregue a página.';
      listaPendentes.removeAttribute('aria-busy');
    });
})();
