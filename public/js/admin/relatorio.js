/*
 * Relatório mensal (RF-24): quantos agendamentos o mês teve por status, por
 * serviço e por origem, e o valor estimado dos atendimentos concluídos.
 * Só dono e sócio veem esta página (permissão "relatorio", RN-13).
 *
 * O mês fica na barra de endereço (?mes=AAAA-MM), para recarregar ou
 * imprimir o mesmo relatório.
 */
(function () {
  'use strict';

  var Painel = window.SmartAgendaPainel;
  if (!Painel) {
    return; // Sem sessão ou sem permissão: painel.js já redirecionou.
  }

  var API = window.SmartAgendaPainelAPI;
  var f = Painel.formatar;
  var el = Painel.el;

  var titulo = document.getElementById('relatorio-titulo');
  var area = document.getElementById('relatorio');
  var areaErro = document.getElementById('erro-relatorio');
  var indicadores = document.getElementById('indicadores');
  var vazio = document.getElementById('relatorio-vazio');
  var detalhes = document.getElementById('relatorio-detalhes');
  var listaStatus = document.getElementById('lista-status');
  var apoioStatus = document.getElementById('status-apoio');
  var corpoServicos = document.getElementById('tabela-servicos');
  var totalServicos = document.getElementById('tabela-servicos-total');
  var listaOrigem = document.getElementById('lista-origem');
  var botaoAtual = document.getElementById('mes-atual');

  /* Mês ------------------------------------------------------------------- */

  function textoDoMes(data) {
    return data.getFullYear() + '-' + String(data.getMonth() + 1).padStart(2, '0');
  }

  function lerMes(texto) {
    var partes = /^(\d{4})-(0[1-9]|1[0-2])$/.exec(texto || '');
    return partes ? new Date(Number(partes[1]), Number(partes[2]) - 1, 1) : null;
  }

  // "novembro de 2026"
  function nomeDoMes(data) {
    return data.toLocaleDateString('pt-BR', { month: 'long', year: 'numeric' });
  }

  var hoje = new Date();
  var mesAtual = new Date(hoje.getFullYear(), hoje.getMonth(), 1);
  var mes = lerMes(new URLSearchParams(location.search).get('mes')) || mesAtual;
  var consulta = 0;

  /* Peças ----------------------------------------------------------------- */

  function porcentagem(parte, total) {
    return total ? Math.round((parte / total) * 100) + '%' : '0%';
  }

  function indicador(rotulo, numero, apoio, destaque) {
    return el('div', { classe: 'indicador', atributos: destaque ? { 'data-destaque': 'true' } : {} }, [
      el('dt', { classe: 'indicador__rotulo', texto: rotulo }),
      el('dd', { classe: 'indicador__numero', texto: numero }),
      el('dd', { classe: 'indicador__apoio', texto: apoio }),
    ]);
  }

  function preenchimento(valor, maximo) {
    var barra = el('span', { classe: 'barra__valor' });
    barra.style.setProperty('--tamanho', maximo ? (valor / maximo) * 100 + '%' : '0%');
    return barra;
  }

  // Uma linha do gráfico: rótulo, barra proporcional ao maior valor e o número.
  function barra(rotulo, valor, maximo, total) {
    var parte = porcentagem(valor, total);
    return el(
      'li',
      {
        classe: 'barra',
        atributos: { 'data-zero': valor === 0 ? 'true' : 'false', title: valor + ' de ' + total + ' (' + parte + ')' },
      },
      [
        el('span', { classe: 'barra__rotulo' }, [rotulo]),
        el('span', { classe: 'barra__trilho', atributos: { 'aria-hidden': 'true' } }, [preenchimento(valor, maximo)]),
        el('span', { classe: 'barra__numero' }, [
          String(valor),
          el('span', { classe: 'visualmente-oculto', texto: ', ' + parte + ' do mês' }),
        ]),
      ],
    );
  }

  function maior(lista, campo) {
    return lista.reduce(function (atual, item) {
      return Math.max(atual, item[campo]);
    }, 0);
  }

  /* Montagem -------------------------------------------------------------- */

  function mostrarIndicadores(t) {
    indicadores.replaceChildren(
      indicador(
        'Agendamentos no mês',
        String(t.agendamentos),
        t.naAgenda ? t.naAgenda + ' ainda na agenda' : 'Nenhum ainda na agenda',
      ),
      indicador(
        'Atendimentos concluídos',
        String(t.concluidos),
        t.naoCompareceu === 1
          ? '1 cliente não compareceu'
          : t.naoCompareceu
            ? t.naoCompareceu + ' clientes não compareceram'
            : 'Nenhuma falta registrada',
      ),
      indicador(
        'Comparecimento',
        t.comparecimento === null ? '–' : Math.round(t.comparecimento * 100) + '%',
        t.comparecimento === null ? 'Nenhum atendimento registrado' : 'Dos atendimentos registrados',
      ),
      indicador(
        'Valor estimado',
        f.preco(t.valorConcluidos),
        t.ticketMedio === null ? 'Nenhum atendimento concluído' : 'Média de ' + f.preco(t.ticketMedio) + ' por atendimento',
        true,
      ),
    );
  }

  function mostrarStatus(relatorio) {
    var total = relatorio.totais.agendamentos;
    var maximo = maior(relatorio.porStatus, 'quantidade');
    apoioStatus.textContent = total === 1 ? '1 agendamento no mês' : total + ' agendamentos no mês';
    listaStatus.replaceChildren.apply(
      listaStatus,
      relatorio.porStatus.map(function (linha) {
        return barra(Painel.status(linha.status), linha.quantidade, maximo, total);
      }),
    );
  }

  function mostrarServicos(relatorio) {
    var maximo = maior(relatorio.porServico, 'valorConcluidos');
    corpoServicos.replaceChildren.apply(
      corpoServicos,
      relatorio.porServico.map(function (linha) {
        return el('tr', {}, [
          el('th', { texto: linha.nome, atributos: { scope: 'row' } }),
          el('td', { classe: 'numero', texto: String(linha.agendamentos) }),
          el('td', { classe: 'numero', texto: String(linha.concluidos) }),
          el('td', { classe: 'numero' }, [
            el('span', { classe: 'valor-celula' }, [
              el('span', { classe: 'valor-celula__trilho', atributos: { 'aria-hidden': 'true' } }, [
                preenchimento(linha.valorConcluidos, maximo),
              ]),
              el('span', { texto: f.preco(linha.valorConcluidos) }),
            ]),
          ]),
        ]);
      }),
    );

    var t = relatorio.totais;
    totalServicos.replaceChildren(
      el('tr', {}, [
        el('th', { texto: 'Total do mês', atributos: { scope: 'row' } }),
        el('td', { classe: 'numero', texto: String(t.agendamentos) }),
        el('td', { classe: 'numero', texto: String(t.concluidos) }),
        el('td', { classe: 'numero', texto: f.preco(t.valorConcluidos) }),
      ]),
    );
  }

  function mostrarOrigem(relatorio) {
    var o = relatorio.porOrigem;
    var total = relatorio.totais.agendamentos;
    var maximo = Math.max(o.site, o.painel);
    listaOrigem.replaceChildren(
      barra('Pelo site', o.site, maximo, total),
      barra('Pela equipe, no painel', o.painel, maximo, total),
    );
  }

  function mostrar(relatorio) {
    var semAgendamentos = relatorio.totais.agendamentos === 0;
    mostrarIndicadores(relatorio.totais);

    vazio.hidden = !semAgendamentos;
    detalhes.hidden = semAgendamentos;
    if (semAgendamentos) {
      vazio.replaceChildren(
        el('span', { texto: 'Nenhum agendamento em ' + nomeDoMes(mes) + '. ' }),
        el('a', { classe: 'ligacao', texto: 'Abrir a agenda', atributos: { href: 'agenda.html' } }),
      );
    } else {
      mostrarStatus(relatorio);
      mostrarServicos(relatorio);
      mostrarOrigem(relatorio);
    }
    area.removeAttribute('aria-busy');
  }

  function carregar() {
    var nome = nomeDoMes(mes);
    titulo.textContent = 'Relatório de ' + nome;
    // Mantém o nome da estética que marca.js acrescenta ao título da aba.
    document.title = document.title.replace(/^[^|]*/, 'Relatório de ' + nome + ' ');
    botaoAtual.disabled = mes.getTime() === mesAtual.getTime();
    areaErro.textContent = '';
    area.setAttribute('aria-busy', 'true');

    var esta = ++consulta;
    API.relatorio(textoDoMes(mes))
      .then(function (relatorio) {
        if (esta === consulta) {
          mostrar(relatorio);
        }
      })
      .catch(function (erro) {
        if (esta === consulta) {
          areaErro.textContent = erro.message || 'Não foi possível carregar o relatório. Recarregue a página.';
          area.removeAttribute('aria-busy');
        }
      });
  }

  function irPara(novo) {
    mes = novo;
    history.replaceState(null, '', '?mes=' + textoDoMes(mes));
    carregar();
  }

  document.getElementById('mes-anterior').addEventListener('click', function () {
    irPara(new Date(mes.getFullYear(), mes.getMonth() - 1, 1));
  });
  document.getElementById('mes-seguinte').addEventListener('click', function () {
    irPara(new Date(mes.getFullYear(), mes.getMonth() + 1, 1));
  });
  botaoAtual.addEventListener('click', function () {
    irPara(mesAtual);
  });
  document.getElementById('imprimir').addEventListener('click', function () {
    window.print();
  });

  carregar();
})();
