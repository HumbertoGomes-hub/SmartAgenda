/* Início do painel: resumo do dia, pedidos esperando resposta e agenda de hoje. */
(function () {
  'use strict';

  var Painel = window.SmartAgendaPainel;
  if (!Painel) {
    return; // Sem sessão: painel.js já mandou para o login.
  }

  var API = window.SmartAgendaPainelAPI;
  var f = Painel.formatar;
  var el = Painel.el;

  // Abaixo disso o prazo de resposta aparece em destaque.
  var URGENTE_MS = 3 * 36e5;

  var areaIndicadores = document.getElementById('indicadores');
  var listaPendentes = document.getElementById('lista-pendentes');
  var listaHoje = document.getElementById('lista-hoje');
  var apoioPendentes = document.getElementById('pendentes-apoio');
  var apoioHoje = document.getElementById('hoje-apoio');

  /* Saudação -------------------------------------------------------------- */

  var agora = new Date();
  var periodo = agora.getHours() < 12 ? 'Bom dia' : agora.getHours() < 18 ? 'Boa tarde' : 'Boa noite';
  document.getElementById('saudacao').textContent = periodo + ', ' + Painel.usuario.nome.split(' ')[0];
  document.getElementById('data-hoje').textContent = f.dataLonga(agora);

  /* Peças ----------------------------------------------------------------- */

  function nomesDosServicos(agendamento) {
    return agendamento.itens
      .map(function (item) {
        return item.nome;
      })
      .join(' + ');
  }

  function detalhe(agendamento) {
    return [agendamento.modeloVeiculo, nomesDosServicos(agendamento)].filter(Boolean).join(' · ');
  }

  function indicador(rotulo, numero, apoio, destaque) {
    return el('div', { classe: 'indicador', atributos: destaque ? { 'data-destaque': 'true' } : {} }, [
      el('dt', { classe: 'indicador__rotulo', texto: rotulo }),
      el('dd', { classe: 'indicador__numero', texto: String(numero) }),
      el('dd', { classe: 'indicador__apoio', texto: apoio }),
    ]);
  }

  function quando(linha1, linha2) {
    return el('p', { classe: 'linha-agendamento__quando' }, [
      el('span', { texto: linha1 }),
      el('small', { texto: linha2 }),
    ]);
  }

  function cliente(agendamento, comTelefone) {
    var filhos = [
      el('p', { classe: 'linha-agendamento__cliente', texto: agendamento.cliente.nome }),
      el('p', { classe: 'linha-agendamento__detalhe', texto: detalhe(agendamento) }),
    ];
    if (comTelefone) {
      filhos.push(
        el('a', {
          classe: 'linha-agendamento__telefone',
          texto: f.telefone(agendamento.cliente.telefone),
          atributos: { href: 'tel:' + agendamento.cliente.telefone },
        }),
      );
    }
    if (agendamento.observacoes) {
      filhos.push(el('p', { classe: 'linha-agendamento__obs', texto: '“' + agendamento.observacoes + '”' }));
    }
    return el('div', { classe: 'linha-agendamento__principal' }, filhos);
  }

  function vazio(texto) {
    return el('li', { classe: 'vazio', texto: texto });
  }

  /* Pedidos esperando resposta (RN-08) ------------------------------------ */

  function linhaPendente(agendamento) {
    var restante = new Date(agendamento.expiraEm) - Date.now();
    var prazo = el('p', {
      classe: 'prazo',
      texto: restante > 0 ? 'Expira em ' + f.tempoRestante(restante) : 'Expirando',
      atributos: restante < URGENTE_MS ? { 'data-urgente': 'true' } : {},
    });

    return el('li', { classe: 'linha-agendamento' }, [
      quando(
        f.dia(agendamento.dataHoraInicio),
        f.hora(agendamento.dataHoraInicio) + ' – ' + f.hora(agendamento.dataHoraFim),
      ),
      cliente(agendamento, true),
      el('div', { classe: 'linha-agendamento__lado' }, [
        prazo,
        el('p', { classe: 'linha-agendamento__valor', texto: 'a partir de ' + f.preco(agendamento.valorEstimado) }),
      ]),
    ]);
  }

  /* Agenda de hoje -------------------------------------------------------- */

  function linhaHoje(agendamento, momento) {
    var emAndamento =
      agendamento.status === 'CONFIRMADO' &&
      new Date(agendamento.dataHoraInicio) <= momento &&
      momento < new Date(agendamento.dataHoraFim);

    return el('li', { classe: 'linha-agendamento', atributos: emAndamento ? { 'data-agora': 'true' } : {} }, [
      quando(f.hora(agendamento.dataHoraInicio), 'até ' + f.hora(agendamento.dataHoraFim)),
      cliente(agendamento, false),
      el('div', { classe: 'linha-agendamento__lado' }, [
        emAndamento ? el('span', { classe: 'etiqueta', texto: 'Agora' }) : null,
        Painel.status(agendamento.status),
      ]),
    ]);
  }

  /* Montagem -------------------------------------------------------------- */

  function mostrar(resumo) {
    var momento = new Date(resumo.geradoEm);
    var pendentes = resumo.pendentes;
    var hoje = resumo.hoje;
    var aguardando = resumo.aguardandoCliente;

    areaIndicadores.replaceChildren(
      indicador(
        'Pedidos esperando resposta',
        pendentes.length,
        pendentes.length
          ? 'O mais antigo expira em ' + f.tempoRestante(new Date(pendentes[0].expiraEm) - momento)
          : 'Nenhum pedido em aberto',
        pendentes.length > 0,
      ),
      indicador(
        'Atendimentos hoje',
        hoje.length,
        hoje.length
          ? 'Das ' + f.hora(hoje[0].dataHoraInicio) + ' às ' + f.hora(hoje[hoje.length - 1].dataHoraFim)
          : 'Agenda livre hoje',
      ),
      indicador(
        'Aguardando cliente',
        aguardando.length,
        aguardando.length ? 'Novo horário proposto, esperando o aceite' : 'Nenhuma proposta em aberto',
      ),
    );
    areaIndicadores.removeAttribute('aria-busy');

    apoioPendentes.textContent =
      'Sem resposta em ' + resumo.prazoRespostaHoras + ' horas, o pedido expira e o horário volta a ficar livre.';
    listaPendentes.replaceChildren.apply(
      listaPendentes,
      pendentes.length ? pendentes.map(linhaPendente) : [vazio('Nenhum pedido esperando resposta.')],
    );
    listaPendentes.removeAttribute('aria-busy');

    apoioHoje.textContent = f.dataLonga(momento);
    listaHoje.replaceChildren.apply(
      listaHoje,
      hoje.length
        ? hoje.map(function (agendamento) {
            return linhaHoje(agendamento, momento);
          })
        : [vazio('Nenhum atendimento marcado para hoje.')],
    );
    listaHoje.removeAttribute('aria-busy');
  }

  function falhou(erro) {
    document.getElementById('erro-resumo').textContent =
      erro.message || 'Não foi possível carregar o resumo. Recarregue a página para tentar de novo.';
    [areaIndicadores, listaPendentes, listaHoje].forEach(function (area) {
      area.removeAttribute('aria-busy');
    });
    listaPendentes.replaceChildren();
    listaHoje.replaceChildren();
  }

  API.resumoDoDia().then(mostrar).catch(falhou);
})();
