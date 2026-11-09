/*
 * Agenda (RF-17 a RF-19): calendário com visão mensal, semanal e diária.
 *
 * Daqui a equipe aceita pedidos, cria agendamentos manuais (cliente que veio
 * por telefone ou no balcão), edita, realoca, desmarca e registra se o
 * cliente foi atendido ou faltou. Visão, data e agendamento aberto ficam no
 * endereço (?visao=semana&data=2026-11-10&codigo=K7M2QX).
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

  var PX_POR_MINUTO = 1.1;
  var MAXIMO_NO_MES = 3; // eventos por dia antes do "+N"
  var DIAS_CURTOS = ['Dom', 'Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb'];
  var STATUS_PADRAO = ['PENDENTE', 'AGUARDANDO_CLIENTE', 'CONFIRMADO', 'CONCLUIDO', 'NAO_COMPARECEU'];
  var ROTULOS = {
    PENDENTE: 'Pendente',
    AGUARDANDO_CLIENTE: 'Aguardando cliente',
    CONFIRMADO: 'Confirmado',
    CONCLUIDO: 'Concluído',
    NAO_COMPARECEU: 'Não compareceu',
    CANCELADO: 'Desmarcado',
    EXPIRADO: 'Expirado',
    RECUSADO: 'Recusado',
  };

  var areaCalendario = document.getElementById('calendario');
  var titulo = document.getElementById('agenda-periodo');
  var areaErro = document.getElementById('erro-agenda');
  var podeCriar = Painel.pode('agendamento-manual');

  var estado = {
    visao: 'mes',
    data: inicioDoDia(new Date()),
    codigoAberto: null,
    agendamentos: [],
    opcoes: null,
    status: STATUS_PADRAO.slice(),
    liberados: false,
    servico: '',
    consulta: 0,
  };

  /* Datas ----------------------------------------------------------------- */

  function inicioDoDia(data) {
    return new Date(data.getFullYear(), data.getMonth(), data.getDate());
  }

  function somarDias(data, dias) {
    return new Date(data.getFullYear(), data.getMonth(), data.getDate() + dias);
  }

  function dataISO(data) {
    return [data.getFullYear(), String(data.getMonth() + 1).padStart(2, '0'), String(data.getDate()).padStart(2, '0')].join('-');
  }

  function dataDeISO(texto) {
    var partes = /^(\d{4})-(\d{2})-(\d{2})$/.exec(texto || '');
    if (!partes) {
      return null;
    }
    var data = new Date(Number(partes[1]), Number(partes[2]) - 1, Number(partes[3]));
    return isNaN(data) ? null : data;
  }

  function mesmoDia(a, b) {
    return a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate();
  }

  function minutosDoDia(data) {
    return data.getHours() * 60 + data.getMinutes();
  }

  function paraMinutos(hora) {
    var partes = hora.split(':').map(Number);
    return partes[0] * 60 + partes[1];
  }

  function horaDe(minutos) {
    return String(Math.floor(minutos / 60)).padStart(2, '0') + ':' + String(minutos % 60).padStart(2, '0');
  }

  function maiuscula(texto) {
    return texto.charAt(0).toUpperCase() + texto.slice(1);
  }

  // Dias visíveis em cada visão. A semana começa no domingo, como no site.
  function periodo() {
    var d = estado.data;
    if (estado.visao === 'dia') {
      return { inicio: d, fim: d };
    }
    if (estado.visao === 'semana') {
      var domingo = somarDias(d, -d.getDay());
      return { inicio: domingo, fim: somarDias(domingo, 6) };
    }
    var primeiro = new Date(d.getFullYear(), d.getMonth(), 1);
    var ultimo = new Date(d.getFullYear(), d.getMonth() + 1, 0);
    return { inicio: somarDias(primeiro, -primeiro.getDay()), fim: somarDias(ultimo, 6 - ultimo.getDay()) };
  }

  function diasDoPeriodo(p) {
    var dias = [];
    for (var d = p.inicio; d <= p.fim; d = somarDias(d, 1)) {
      dias.push(d);
    }
    return dias;
  }

  function rotuloPeriodo() {
    var d = estado.data;
    if (estado.visao === 'dia') {
      return f.dataLonga(d);
    }
    if (estado.visao === 'semana') {
      var p = periodo();
      var mesmoMes = p.inicio.getMonth() === p.fim.getMonth();
      return (
        p.inicio.getDate() +
        (mesmoMes ? '' : ' de ' + p.inicio.toLocaleDateString('pt-BR', { month: 'long' })) +
        ' a ' +
        p.fim.getDate() +
        ' de ' +
        p.fim.toLocaleDateString('pt-BR', { month: 'long' })
      );
    }
    return maiuscula(d.toLocaleDateString('pt-BR', { month: 'long', year: 'numeric' }));
  }

  /* Configuração da agenda ------------------------------------------------- */

  function bloqueioDe(data) {
    var iso = dataISO(data);
    return (estado.opcoes ? estado.opcoes.bloqueios : []).filter(function (b) {
      return b.data === iso;
    })[0];
  }

  function diaFechado(data) {
    return estado.opcoes && estado.opcoes.configuracao.diasFuncionamento.indexOf(data.getDay()) === -1;
  }

  function expediente() {
    var c = estado.opcoes.configuracao;
    return { abertura: paraMinutos(c.horaAbertura), fechamento: paraMinutos(c.horaFechamento) };
  }

  /* Endereço -------------------------------------------------------------- */

  function lerEndereco() {
    var parametros = new URLSearchParams(location.search);
    if (['mes', 'semana', 'dia'].indexOf(parametros.get('visao')) !== -1) {
      estado.visao = parametros.get('visao');
    }
    estado.data = dataDeISO(parametros.get('data')) || estado.data;
    estado.codigoAberto = parametros.get('codigo');
  }

  function gravarEndereco() {
    var parametros = new URLSearchParams();
    parametros.set('visao', estado.visao);
    parametros.set('data', dataISO(estado.data));
    if (estado.codigoAberto) {
      parametros.set('codigo', estado.codigoAberto);
    }
    try {
      history.replaceState(null, '', location.pathname + '?' + parametros.toString());
    } catch (erro) {
      // Alguns navegadores não deixam mudar o endereço de arquivos locais.
    }
  }

  /* Carregar -------------------------------------------------------------- */

  function visiveis() {
    return estado.agendamentos.filter(function (a) {
      var statusOk = estado.status.indexOf(a.status) !== -1 || (estado.liberados && ['CANCELADO', 'EXPIRADO', 'RECUSADO'].indexOf(a.status) !== -1);
      var servicoOk =
        !estado.servico ||
        a.itens.some(function (item) {
          return String(item.servicoId) === estado.servico;
        });
      return statusOk && servicoOk;
    });
  }

  function doDia(lista, data) {
    return lista
      .filter(function (a) {
        return mesmoDia(new Date(a.dataHoraInicio), data);
      })
      .sort(function (a, b) {
        return new Date(a.dataHoraInicio) - new Date(b.dataHoraInicio);
      });
  }

  function carregar() {
    var p = periodo();
    var consulta = (estado.consulta += 1);
    titulo.textContent = rotuloPeriodo();
    document.querySelectorAll('[data-visao]').forEach(function (botao) {
      botao.setAttribute('aria-pressed', String(botao.dataset.visao === estado.visao));
    });
    gravarEndereco();
    areaCalendario.setAttribute('aria-busy', 'true');

    return API.agenda(dataISO(p.inicio), dataISO(p.fim), { liberados: estado.liberados })
      .then(function (resposta) {
        if (consulta !== estado.consulta) {
          return;
        }
        areaErro.textContent = '';
        estado.agendamentos = resposta.agendamentos;
        desenhar();
      })
      .catch(function (erro) {
        if (consulta === estado.consulta) {
          areaErro.textContent = erro.message || 'Não foi possível carregar a agenda. Tente de novo.';
        }
      })
      .then(function () {
        areaCalendario.removeAttribute('aria-busy');
      });
  }

  function desenhar() {
    var lista = visiveis();
    var conteudo;
    if (estado.visao === 'mes') {
      conteudo = visaoMes(lista);
    } else if (estado.visao === 'semana') {
      conteudo = el('div', {}, [visaoGrade(lista, diasDoPeriodo(periodo()), 'grade--semana'), listaPorDia(lista, diasDoPeriodo(periodo()))]);
    } else {
      conteudo = visaoGrade(lista, [estado.data], 'grade--dia');
    }
    areaCalendario.dataset.visao = estado.visao;
    areaCalendario.replaceChildren(conteudo);
    rolarParaManha();
  }

  /* Eventos --------------------------------------------------------------- */

  function rotuloEvento(a) {
    return (
      ROTULOS[a.status] + ': ' + a.cliente.nome + ', ' + f.dataLonga(a.dataHoraInicio) + ', ' + A.intervalo(a) + ', ' + A.servicosTexto(a)
    );
  }

  function botaoEvento(a, classe, filhos) {
    var botao = el('button', {
      classe: 'evento ' + classe,
      atributos: { type: 'button', 'data-status': a.status, 'data-codigo': a.codigo, 'aria-label': rotuloEvento(a) },
    }, filhos);
    botao.addEventListener('click', function () {
      abrirDetalhe(a.codigo);
    });
    return botao;
  }

  /* Visão mensal ---------------------------------------------------------- */

  function visaoMes(lista) {
    var dias = diasDoPeriodo(periodo());
    var hoje = inicioDoDia(new Date());
    var cabecalho = el('thead', {}, [
      el('tr', {}, DIAS_CURTOS.map(function (dia) {
        return el('th', { texto: dia, atributos: { scope: 'col' } });
      })),
    ]);
    var corpo = el('tbody');
    var linha;

    dias.forEach(function (dia, indice) {
      if (indice % 7 === 0) {
        linha = el('tr');
        corpo.append(linha);
      }
      var doDiaLista = doDia(lista, dia);
      var bloqueio = bloqueioDe(dia);
      var celula = el('td', { classe: 'mes__dia' });
      if (dia.getMonth() !== estado.data.getMonth()) {
        celula.dataset.foraDoMes = 'true';
      }
      if (diaFechado(dia) || bloqueio) {
        celula.dataset.fechado = 'true';
      }
      if (mesmoDia(dia, hoje)) {
        celula.dataset.hoje = 'true';
      }

      var quantidade = doDiaLista.length;
      var numero = el('button', {
        classe: 'mes__numero',
        texto: String(dia.getDate()),
        atributos: {
          type: 'button',
          'aria-label':
            f.dataLonga(dia) +
            (quantidade ? ', ' + quantidade + (quantidade === 1 ? ' agendamento' : ' agendamentos') : ', sem agendamentos') +
            '. Abrir o dia.',
        },
      });
      numero.addEventListener('click', function () {
        irPara('dia', dia);
      });

      var topo = el('div', { classe: 'mes__topo' }, [numero]);
      if (quantidade) {
        topo.append(el('span', { classe: 'mes__contagem', texto: String(quantidade), atributos: { 'aria-hidden': 'true' } }));
      }
      celula.append(topo);

      if (bloqueio) {
        celula.append(el('p', { classe: 'mes__nota', texto: bloqueio.motivo || 'Dia bloqueado' }));
      } else if (diaFechado(dia) && !quantidade) {
        celula.append(el('p', { classe: 'mes__nota', texto: 'Fechado' }));
      }

      var itens = doDiaLista.slice(0, MAXIMO_NO_MES).map(function (a) {
        return el('li', {}, [
          botaoEvento(a, 'evento--linha', [
            el('span', { classe: 'evento__hora', texto: f.hora(a.dataHoraInicio) }),
            el('span', { classe: 'evento__nome', texto: a.cliente.nome }),
          ]),
        ]);
      });
      if (quantidade > MAXIMO_NO_MES) {
        var mais = el('button', {
          classe: 'mes__mais',
          texto: '+' + (quantidade - MAXIMO_NO_MES) + ' no dia',
          atributos: { type: 'button' },
        });
        mais.addEventListener('click', function () {
          irPara('dia', dia);
        });
        itens.push(el('li', {}, [mais]));
      }
      if (itens.length) {
        celula.append(el('ul', { classe: 'mes__eventos' }, itens));
      }
      linha.append(celula);
    });

    return el('table', { classe: 'mes', atributos: { 'aria-label': rotuloPeriodo() } }, [cabecalho, corpo]);
  }

  /* Visões semanal e diária (grade de horários) ---------------------------- */

  // Agendamentos que se sobrepõem ficam lado a lado (raias).
  function distribuirEmRaias(lista) {
    var grupos = [];
    var grupo = null;
    var fimDoGrupo = 0;
    lista.forEach(function (a) {
      var inicio = new Date(a.dataHoraInicio).getTime();
      var fim = new Date(a.dataHoraFim).getTime();
      if (!grupo || inicio >= fimDoGrupo) {
        grupo = { raias: [], itens: [] };
        grupos.push(grupo);
        fimDoGrupo = fim;
      }
      fimDoGrupo = Math.max(fimDoGrupo, fim);
      var raia = 0;
      while (grupo.raias[raia] > inicio) {
        raia += 1;
      }
      grupo.raias[raia] = fim;
      grupo.itens.push({ agendamento: a, raia: raia });
    });
    var resultado = [];
    grupos.forEach(function (g) {
      g.itens.forEach(function (item) {
        resultado.push({ agendamento: item.agendamento, raia: item.raia, raias: g.raias.length });
      });
    });
    return resultado;
  }

  function limitesDaGrade(lista) {
    var e = expediente();
    var inicio = e.abertura;
    var fim = e.fechamento;
    lista.forEach(function (a) {
      var i = new Date(a.dataHoraInicio);
      var t = new Date(a.dataHoraFim);
      inicio = Math.min(inicio, minutosDoDia(i));
      fim = Math.max(fim, mesmoDia(i, t) ? minutosDoDia(t) : 24 * 60);
    });
    return { inicio: Math.floor(inicio / 60) * 60, fim: Math.min(24 * 60, Math.ceil(fim / 60) * 60) };
  }

  function faixaFechada(topo, altura, rotulo) {
    var faixa = el('div', { classe: 'grade__fechado', atributos: { 'aria-hidden': 'true' } });
    faixa.style.top = topo + 'px';
    faixa.style.height = altura + 'px';
    if (rotulo) {
      faixa.append(el('span', { texto: rotulo }));
    }
    return faixa;
  }

  function visaoGrade(lista, dias, classe) {
    var noPeriodo = lista.filter(function (a) {
      return dias.some(function (d) {
        return mesmoDia(new Date(a.dataHoraInicio), d);
      });
    });
    var limites = limitesDaGrade(noPeriodo);
    var e = expediente();
    var altura = (limites.fim - limites.inicio) * PX_POR_MINUTO;
    var hoje = inicioDoDia(new Date());
    var agora = new Date();

    var grade = el('div', { classe: 'grade ' + classe });
    grade.style.setProperty('--colunas', dias.length);
    grade.style.setProperty('--hora', 60 * PX_POR_MINUTO + 'px');

    // Cabeçalho com os dias
    var cabecalho = el('div', { classe: 'grade__cabecalho' }, [el('span', { classe: 'grade__canto' })]);
    dias.forEach(function (dia) {
      var botao = el('button', { classe: 'grade__dia', atributos: { type: 'button', 'aria-label': 'Abrir ' + f.dataLonga(dia) } }, [
        el('span', { classe: 'grade__semana', texto: DIAS_CURTOS[dia.getDay()] }),
        el('span', { classe: 'grade__numero', texto: String(dia.getDate()) }),
      ]);
      if (mesmoDia(dia, hoje)) {
        botao.dataset.hoje = 'true';
      }
      botao.addEventListener('click', function () {
        irPara('dia', dia);
      });
      cabecalho.append(botao);
    });

    // Régua de horas
    var regua = el('div', { classe: 'grade__regua', atributos: { 'aria-hidden': 'true' } });
    regua.style.height = altura + 'px';
    for (var m = limites.inicio; m < limites.fim; m += 60) {
      var marca = el('span', { texto: horaDe(m) });
      marca.style.top = (m - limites.inicio) * PX_POR_MINUTO + 'px';
      regua.append(marca);
    }

    var corpo = el('div', { classe: 'grade__corpo' }, [regua]);

    dias.forEach(function (dia) {
      var coluna = el('div', { classe: 'grade__coluna', atributos: { 'aria-label': f.dataLonga(dia) } });
      coluna.style.height = altura + 'px';
      var bloqueio = bloqueioDe(dia);

      // Fora do expediente, dia fechado e dia bloqueado aparecem hachurados.
      if (diaFechado(dia) || bloqueio) {
        coluna.append(faixaFechada(0, altura, bloqueio ? bloqueio.motivo || 'Dia bloqueado' : 'Fechado'));
      } else {
        if (e.abertura > limites.inicio) {
          coluna.append(faixaFechada(0, (e.abertura - limites.inicio) * PX_POR_MINUTO));
        }
        if (e.fechamento < limites.fim) {
          coluna.append(faixaFechada((e.fechamento - limites.inicio) * PX_POR_MINUTO, (limites.fim - e.fechamento) * PX_POR_MINUTO));
        }
      }

      if (mesmoDia(dia, hoje)) {
        var minutoAgora = minutosDoDia(agora);
        if (minutoAgora >= limites.inicio && minutoAgora <= limites.fim) {
          var linhaAgora = el('div', { classe: 'grade__agora', atributos: { 'aria-hidden': 'true' } });
          linhaAgora.style.top = (minutoAgora - limites.inicio) * PX_POR_MINUTO + 'px';
          coluna.append(linhaAgora);
        }
      }

      distribuirEmRaias(doDia(noPeriodo, dia)).forEach(function (item) {
        var a = item.agendamento;
        var inicio = new Date(a.dataHoraInicio);
        var fim = new Date(a.dataHoraFim);
        var minutoFim = mesmoDia(inicio, fim) ? minutosDoDia(fim) : limites.fim;
        var bloco = botaoEvento(a, 'evento--bloco', [
          el('span', { classe: 'evento__hora', texto: A.intervalo(a) }),
          el('span', { classe: 'evento__nome', texto: a.cliente.nome }),
          el('span', { classe: 'evento__servicos', texto: A.servicosTexto(a) }),
          el('span', { classe: 'evento__status', texto: ROTULOS[a.status] }),
        ]);
        var alturaBloco = Math.max(22, (minutoFim - minutosDoDia(inicio)) * PX_POR_MINUTO - 2);
        bloco.style.top = (minutosDoDia(inicio) - limites.inicio) * PX_POR_MINUTO + 'px';
        bloco.style.height = alturaBloco + 'px';
        bloco.style.left = 'calc(' + (item.raia * 100) / item.raias + '% + 2px)';
        bloco.style.width = 'calc(' + 100 / item.raias + '% - 4px)';
        // Quanto menor o bloco, menos linhas: o nome completo fica no aria-label e no detalhe.
        bloco.dataset.tamanho = alturaBloco < 40 ? 'curto' : alturaBloco < 78 ? 'medio' : alturaBloco < 100 ? 'normal' : 'grande';
        coluna.append(bloco);
      });

      // Clique num horário vazio abre um agendamento manual naquele horário.
      if (podeCriar) {
        coluna.title = 'Clique num horário vazio para agendar';
        coluna.addEventListener('click', function (evento) {
          if (evento.target.closest('.evento')) {
            return;
          }
          var y = evento.clientY - coluna.getBoundingClientRect().top;
          var intervalo = estado.opcoes.configuracao.intervaloMinutos;
          var minuto = limites.inicio + Math.floor(y / PX_POR_MINUTO / intervalo) * intervalo;
          abrirFormulario(null, { data: dia, minutos: minuto });
        });
      }

      corpo.append(coluna);
    });

    grade.append(cabecalho, corpo);
    return el('div', { classe: 'grade-rolagem' }, [grade]);
  }

  // Semana no celular: os dias viram uma lista.
  function listaPorDia(lista, dias) {
    var hoje = inicioDoDia(new Date());
    var itens = dias.map(function (dia) {
      var doDiaLista = doDia(lista, dia);
      var bloqueio = bloqueioDe(dia);
      var cabeca = el('h3', { classe: 'lista-dia__titulo', texto: (mesmoDia(dia, hoje) ? 'Hoje, ' : '') + f.dataLonga(dia) });
      var conteudo;
      if (doDiaLista.length) {
        conteudo = el('ul', { classe: 'lista-dia__eventos' }, doDiaLista.map(function (a) {
          return el('li', {}, [
            botaoEvento(a, 'evento--item', [
              el('span', { classe: 'evento__hora', texto: A.intervalo(a) }),
              el('span', { classe: 'evento__nome', texto: a.cliente.nome }),
              el('span', { classe: 'evento__servicos', texto: A.servicosTexto(a) }),
              el('span', { classe: 'evento__status', texto: ROTULOS[a.status] }),
            ]),
          ]);
        }));
      } else {
        conteudo = el('p', {
          classe: 'lista-dia__vazio',
          texto: bloqueio ? bloqueio.motivo || 'Dia bloqueado' : diaFechado(dia) ? 'Fechado' : 'Nenhum agendamento',
        });
      }
      return el('li', { classe: 'lista-dia' }, [cabeca, conteudo]);
    });
    return el('ul', { classe: 'lista-semana' }, itens);
  }

  function rolarParaManha() {
    var rolagem = areaCalendario.querySelector('.grade-rolagem');
    if (rolagem) {
      rolagem.scrollTop = 0;
    }
  }

  /* Navegação ------------------------------------------------------------- */

  function irPara(visao, data) {
    estado.visao = visao;
    estado.data = inicioDoDia(data);
    carregar().then(function () {
      titulo.focus({ preventScroll: true });
    });
  }

  function mover(passo) {
    var d = estado.data;
    if (estado.visao === 'mes') {
      estado.data = new Date(d.getFullYear(), d.getMonth() + passo, 1);
    } else {
      estado.data = somarDias(d, passo * (estado.visao === 'semana' ? 7 : 1));
    }
    carregar();
  }

  document.getElementById('agenda-anterior').addEventListener('click', function () {
    mover(-1);
  });
  document.getElementById('agenda-seguinte').addEventListener('click', function () {
    mover(1);
  });
  document.getElementById('agenda-hoje').addEventListener('click', function () {
    irPara(estado.visao, new Date());
  });
  document.querySelectorAll('[data-visao]').forEach(function (botao) {
    botao.addEventListener('click', function () {
      irPara(botao.dataset.visao, estado.data);
    });
  });

  /* Filtros (RF-17) -------------------------------------------------------- */

  document.querySelectorAll('input[name="filtro-status"]').forEach(function (caixa) {
    caixa.addEventListener('change', function () {
      if (caixa.value === 'LIBERADOS') {
        estado.liberados = caixa.checked;
        carregar();
        return;
      }
      estado.status = Array.prototype.slice
        .call(document.querySelectorAll('input[name="filtro-status"]:checked'))
        .map(function (c) {
          return c.value;
        });
      desenhar();
    });
  });

  var filtroServico = document.getElementById('filtro-servico');
  filtroServico.addEventListener('change', function () {
    estado.servico = filtroServico.value;
    desenhar();
  });

  /* Detalhe do agendamento ------------------------------------------------- */

  var dialogoDetalhe = document.getElementById('dialogo-detalhe');
  var corpoDetalhe = document.getElementById('detalhe-corpo');
  var acoesDetalhe = document.getElementById('detalhe-acoes');
  var alertaDetalhe = document.getElementById('alerta-detalhe');

  function buscarCarregado(codigo) {
    return estado.agendamentos.filter(function (a) {
      return a.codigo === codigo;
    })[0];
  }

  function linhaFicha(rotulo, valor) {
    return el('div', {}, [el('dt', { texto: rotulo }), el('dd', {}, [valor])]);
  }

  function botaoAcao(texto, classe, aoClicar) {
    var botao = el('button', { classe: classe, texto: texto, atributos: { type: 'button' } });
    botao.addEventListener('click', function () {
      aoClicar(botao);
    });
    return botao;
  }

  function abrirDetalhe(codigo) {
    var a = buscarCarregado(codigo);
    if (!a) {
      return;
    }
    estado.codigoAberto = codigo;
    gravarEndereco();
    alertaDetalhe.textContent = '';

    document.getElementById('detalhe-titulo').textContent = a.cliente.nome;
    document.getElementById('detalhe-status').replaceChildren(
      Painel.status(a.status),
      el('span', { classe: 'detalhe__codigo', texto: 'Código ' + a.codigo, atributos: { translate: 'no' } }),
    );

    var servicos = el('ul', { classe: 'detalhe__servicos' }, a.itens.map(function (item) {
      return el('li', {}, [
        el('span', { texto: item.nome + ' (' + f.duracao(item.duracaoMinutos) + ')' }),
        el('span', { texto: f.preco(item.precoPraticado) }),
      ]);
    }));

    var ficha = el('dl', { classe: 'detalhe__ficha' }, [
      linhaFicha('Quando', document.createTextNode(f.dataLonga(a.dataHoraInicio) + ', ' + A.intervalo(a))),
      linhaFicha('Serviços', servicos),
      linhaFicha('Valor', document.createTextNode('A partir de ' + f.preco(a.valorEstimado))),
      linhaFicha('Telefone', el('a', { texto: f.telefone(a.cliente.telefone), atributos: { href: 'tel:' + a.cliente.telefone } })),
      a.modeloVeiculo ? linhaFicha('Veículo', document.createTextNode(a.modeloVeiculo)) : null,
      a.observacoes ? linhaFicha('Observações', document.createTextNode(a.observacoes)) : null,
      linhaFicha('Origem', document.createTextNode(a.origem === 'painel' ? 'Agendado pela equipe' : 'Pedido pelo site')),
    ]);
    corpoDetalhe.replaceChildren(ficha);

    // Ações conforme o status (RN-16).
    var comecou = new Date(a.dataHoraInicio) <= new Date();
    var acoes = [];
    if (a.status === 'PENDENTE' || a.status === 'AGUARDANDO_CLIENTE') {
      acoes.push(botaoAcao('Aceitar pedido', 'botao', function (b) {
        executar(b, API.aceitar(a.codigo), function (confirmado) {
          A.avisar('Pedido de ' + confirmado.cliente.nome + ' aceito para ' + A.quandoTexto(confirmado) + '.', A.botaoWhatsApp(confirmado, 'confirmacao', 'Avisar no WhatsApp'));
        });
      }));
    }
    if (a.status === 'CONFIRMADO' && comecou) {
      acoes.push(botaoAcao('Concluído', 'botao', function (b) {
        executar(b, API.registrarAtendimento(a.codigo, 'CONCLUIDO'), function () {
          A.avisar('Atendimento de ' + a.cliente.nome + ' registrado como concluído.');
        });
      }));
      acoes.push(botaoAcao('Não compareceu', 'botao botao--contorno', function (b) {
        executar(b, API.registrarAtendimento(a.codigo, 'NAO_COMPARECEU'), function () {
          A.avisar('Falta de ' + a.cliente.nome + ' registrada.');
        });
      }));
    }
    var ocupa = ['PENDENTE', 'AGUARDANDO_CLIENTE', 'CONFIRMADO'].indexOf(a.status) !== -1;
    if (ocupa && !(a.status === 'CONFIRMADO' && comecou)) {
      acoes.push(botaoAcao('Editar ou realocar', 'botao botao--contorno', function () {
        dialogoDetalhe.close();
        abrirFormulario(a);
      }));
    }
    acoes.push(A.botaoWhatsApp(a, a.status === 'PENDENTE' ? 'pedido' : 'confirmacao', 'WhatsApp'));
    if (ocupa) {
      acoes.push(botaoAcao('Desmarcar', 'botao-perigo', function () {
        dialogoDetalhe.close();
        confirmarDesmarcar(a);
      }));
    }
    if (!ocupa) {
      corpoDetalhe.append(el('p', { classe: 'detalhe__nota', texto: 'Este agendamento já foi encerrado e não muda mais.' }));
    }
    acoesDetalhe.replaceChildren.apply(acoesDetalhe, acoes);

    if (!dialogoDetalhe.open) {
      dialogoDetalhe.showModal();
    }
  }

  dialogoDetalhe.addEventListener('close', function () {
    if (!dialogoFormulario.open && !dialogoDesmarcar.open) {
      estado.codigoAberto = null;
      gravarEndereco();
    }
  });

  // Executa uma ação da API com o botão ocupado; ao terminar, recarrega a agenda.
  function executar(botao, promessa, depois, alerta) {
    var texto = botao.textContent;
    botao.setAttribute('aria-busy', 'true');
    botao.textContent = texto + '…';
    return promessa
      .then(function (resultado) {
        document.querySelectorAll('dialog[open]').forEach(function (d) {
          d.close();
        });
        depois(resultado);
        return carregar();
      })
      .catch(function (erro) {
        botao.removeAttribute('aria-busy');
        botao.textContent = texto;
        (alerta || alertaDetalhe).textContent = erro.message || 'Não foi possível concluir. Tente de novo.';
      });
  }

  /* Desmarcar ------------------------------------------------------------- */

  var dialogoDesmarcar = document.getElementById('dialogo-desmarcar');
  var alertaDesmarcar = document.getElementById('alerta-desmarcar');

  function confirmarDesmarcar(a) {
    alertaDesmarcar.textContent = '';
    document.getElementById('desmarcar-texto').textContent =
      maiuscula(A.quandoTexto(a)) + ', ' + A.servicosTexto(a) + '. O horário fica livre na agenda.';
    document.getElementById('desmarcar-titulo').textContent = 'Desmarcar o horário de ' + a.cliente.nome + '?';
    var botao = document.getElementById('desmarcar-confirmar');
    botao.onclick = function () {
      executar(botao, API.cancelar(a.codigo), function () {
        A.avisar(
          'Horário de ' + a.cliente.nome + ' desmarcado. O horário ficou livre.',
          A.botaoWhatsApp(a, 'desmarcado', 'Avisar no WhatsApp'),
        );
      }, alertaDesmarcar);
    };
    dialogoDesmarcar.showModal();
  }

  /* Formulário: novo, editar e realocar ------------------------------------ */

  var dialogoFormulario = document.getElementById('dialogo-formulario');
  var formulario = document.getElementById('form-agendamento');
  var campoData = document.getElementById('campo-data');
  var campoHora = document.getElementById('campo-hora');
  var resumoHorario = document.getElementById('resumo-horario');
  var avisoHorario = document.getElementById('aviso-horario');
  var alertaFormulario = document.getElementById('alerta-formulario');
  var botaoSalvar = document.getElementById('botao-salvar');
  var cacheDoDia = {};
  var emEdicao = null;

  function montarServicos() {
    var area = document.getElementById('opcoes-servicos');
    var porCategoria = {};
    estado.opcoes.servicos.forEach(function (s) {
      (porCategoria[s.categoria] = porCategoria[s.categoria] || []).push(s);
    });
    area.replaceChildren.apply(area, Object.keys(porCategoria).map(function (categoria) {
      return el('div', { classe: 'servicos-grupo' }, [
        el('p', { classe: 'servicos-grupo__titulo', texto: categoria }),
        el('div', { classe: 'servicos-grupo__opcoes' }, porCategoria[categoria].map(function (s) {
          var caixa = el('input', { atributos: { type: 'checkbox', name: 'servicos', value: String(s.id) } });
          caixa.addEventListener('change', atualizarHorarios);
          return el('label', { classe: 'servico-opcao' }, [
            caixa,
            el('span', { classe: 'servico-opcao__nome', texto: s.nome }),
            el('span', { classe: 'servico-opcao__dados', texto: f.duracao(s.duracaoMinutos) + ', a partir de ' + f.preco(s.precoBase) }),
          ]);
        })),
      ]);
    }));

    filtroServico.replaceChildren.apply(filtroServico, [el('option', { texto: 'Todos os serviços', atributos: { value: '' } })].concat(
      estado.opcoes.servicos.map(function (s) {
        return el('option', { texto: s.nome, atributos: { value: String(s.id) } });
      }),
    ));
  }

  function servicosMarcados() {
    return Array.prototype.slice.call(formulario.querySelectorAll('input[name="servicos"]:checked')).map(function (c) {
      return Number(c.value);
    });
  }

  function duracaoEscolhida() {
    var ids = servicosMarcados();
    return ids.reduce(function (total, id) {
      // Na edição, serviço que já estava no pedido mantém a duração praticada.
      var praticado = emEdicao && emEdicao.itens.filter(function (i) {
        return i.servicoId === id;
      })[0];
      var servico = estado.opcoes.servicos.filter(function (s) {
        return s.id === id;
      })[0];
      return total + (praticado ? praticado.duracaoMinutos : servico ? servico.duracaoMinutos : 0);
    }, 0);
  }

  function valorEscolhido() {
    return servicosMarcados().reduce(function (total, id) {
      var praticado = emEdicao && emEdicao.itens.filter(function (i) {
        return i.servicoId === id;
      })[0];
      var servico = estado.opcoes.servicos.filter(function (s) {
        return s.id === id;
      })[0];
      return total + (praticado ? praticado.precoPraticado : servico ? servico.precoBase : 0);
    }, 0);
  }

  // Mesma conta do banco (RN-06): a ocupação cresce no início e nos inícios dentro do horário.
  function lotado(agendamentosDoDia, inicio, fim) {
    var ocupando = agendamentosDoDia.filter(function (a) {
      return ['PENDENTE', 'AGUARDANDO_CLIENTE', 'CONFIRMADO'].indexOf(a.status) !== -1 && (!emEdicao || a.codigo !== emEdicao.codigo);
    });
    var pontos = [inicio].concat(ocupando.map(function (a) {
      return new Date(a.dataHoraInicio).getTime();
    }).filter(function (p) {
      return p > inicio && p < fim;
    }));
    return pontos.some(function (ponto) {
      return ocupando.filter(function (a) {
        return new Date(a.dataHoraInicio).getTime() <= ponto && new Date(a.dataHoraFim).getTime() > ponto;
      }).length >= estado.opcoes.configuracao.capacidadeSimultanea;
    });
  }

  function agendamentosDoDia(iso) {
    if (!cacheDoDia[iso]) {
      cacheDoDia[iso] = API.agenda(iso, iso).then(function (r) {
        return r.agendamentos;
      });
    }
    return cacheDoDia[iso];
  }

  // Monta as opções de hora do dia escolhido, marcando as que não cabem.
  function atualizarHorarios() {
    var data = dataDeISO(campoData.value);
    var duracao = duracaoEscolhida();
    var escolhida = campoHora.value || campoHora.dataset.inicial || '';
    if (!data) {
      campoHora.replaceChildren(el('option', { texto: 'Escolha a data', atributos: { value: '' } }));
      atualizarResumo();
      return;
    }
    var e = expediente();
    var intervalo = estado.opcoes.configuracao.intervaloMinutos;
    var de = Math.max(0, e.abertura - 120);
    var ate = Math.min(24 * 60, e.fechamento + 120);

    agendamentosDoDia(dataISO(data)).then(function (lista) {
      var opcoes = [el('option', { texto: 'Escolha a hora', atributos: { value: '' } })];
      var minutosEscolhidos = escolhida ? paraMinutos(escolhida) : null;
      var horarios = [];
      for (var m = de; m < ate; m += intervalo) {
        horarios.push(m);
      }
      if (minutosEscolhidos !== null && horarios.indexOf(minutosEscolhidos) === -1) {
        horarios.push(minutosEscolhidos);
        horarios.sort(function (x, y) {
          return x - y;
        });
      }
      horarios.forEach(function (m) {
        var inicio = new Date(data.getFullYear(), data.getMonth(), data.getDate(), Math.floor(m / 60), m % 60);
        var fim = inicio.getTime() + Math.max(duracao, intervalo) * 60000;
        var ocupado = lotado(lista, inicio.getTime(), fim);
        var fora = m < e.abertura || m + duracao > e.fechamento;
        var rotulo = horaDe(m) + (ocupado ? ' (ocupado)' : fora ? ' (fora do expediente)' : '');
        var opcao = el('option', { texto: rotulo, atributos: { value: horaDe(m) } });
        opcao.disabled = ocupado;
        opcoes.push(opcao);
      });
      campoHora.replaceChildren.apply(campoHora, opcoes);
      var valida = opcoes.filter(function (o) {
        return o.value === escolhida && !o.disabled;
      })[0];
      campoHora.value = valida ? escolhida : '';
      atualizarResumo();
    });
  }

  function atualizarResumo() {
    var data = dataDeISO(campoData.value);
    var duracao = duracaoEscolhida();
    var avisos = [];
    if (data && campoHora.value && duracao) {
      var m = paraMinutos(campoHora.value);
      resumoHorario.textContent =
        'Das ' + campoHora.value + ' às ' + horaDe(Math.min(m + duracao, 24 * 60 - 1)) + ', ' + f.duracao(duracao) + ', a partir de ' + f.preco(valorEscolhido()) + '.';
      if (m < expediente().abertura || m + duracao > expediente().fechamento) {
        avisos.push('Fica fora do horário de funcionamento.');
      }
    } else {
      resumoHorario.textContent = duracao ? 'Duração: ' + f.duracao(duracao) + '.' : '';
    }
    if (data) {
      var bloqueio = bloqueioDe(data);
      if (bloqueio) {
        avisos.push('Dia bloqueado na agenda (' + (bloqueio.motivo || 'sem motivo informado') + ').');
      } else if (diaFechado(data)) {
        avisos.push('A estética não abre neste dia da semana.');
      }
    }
    avisoHorario.textContent = avisos.length ? avisos.join(' ') + ' O agendamento é gravado mesmo assim.' : '';
  }

  campoData.addEventListener('change', atualizarHorarios);
  campoHora.addEventListener('change', atualizarResumo);

  function marcarErro(id, mensagem) {
    var campo = document.getElementById(id);
    document.getElementById(id + '-erro').textContent = mensagem || '';
    if (campo) {
      if (mensagem) {
        campo.setAttribute('aria-invalid', 'true');
      } else {
        campo.removeAttribute('aria-invalid');
      }
    }
    return !mensagem;
  }

  // a: agendamento a editar, ou null para um novo. sugestao: { data, minutos }.
  function abrirFormulario(a, sugestao) {
    emEdicao = a;
    cacheDoDia = {};
    formulario.reset();
    alertaFormulario.textContent = '';
    ['campo-nome', 'campo-telefone', 'servicos', 'campo-data', 'campo-hora'].forEach(function (id) {
      marcarErro(id, '');
    });

    document.getElementById('formulario-titulo').textContent = a ? 'Editar agendamento' : 'Novo agendamento';
    botaoSalvar.textContent = a ? 'Salvar alterações' : 'Criar agendamento';
    document.getElementById('campos-cliente').hidden = Boolean(a);
    var clienteFixo = document.getElementById('cliente-fixo');
    clienteFixo.hidden = !a;

    if (a) {
      clienteFixo.textContent = a.cliente.nome + ', ' + f.telefone(a.cliente.telefone);
      a.itens.forEach(function (item) {
        var caixa = formulario.querySelector('input[name="servicos"][value="' + item.servicoId + '"]');
        if (caixa) {
          caixa.checked = true;
        }
      });
      var inicio = new Date(a.dataHoraInicio);
      campoData.value = dataISO(inicio);
      campoHora.dataset.inicial = f.hora(a.dataHoraInicio);
      document.getElementById('campo-modelo').value = a.modeloVeiculo;
      document.getElementById('campo-observacoes').value = a.observacoes;
    } else {
      var data = sugestao ? sugestao.data : estado.visao === 'mes' ? new Date() : estado.data;
      campoData.value = dataISO(data);
      campoHora.dataset.inicial = sugestao ? horaDe(sugestao.minutos) : '';
    }
    campoHora.value = '';
    atualizarHorarios();
    dialogoFormulario.showModal();
    (a ? document.getElementById('opcoes-servicos').querySelector('input') : document.getElementById('campo-nome')).focus();
  }

  formulario.addEventListener('submit', function (evento) {
    evento.preventDefault();
    if (botaoSalvar.getAttribute('aria-busy') === 'true') {
      return;
    }
    alertaFormulario.textContent = '';

    var nome = document.getElementById('campo-nome').value.trim();
    var telefone = document.getElementById('campo-telefone').value;
    var digitos = telefone.replace(/\D/g, '');
    var ok = [
      emEdicao || marcarErro('campo-nome', nome.length >= 3 ? '' : 'Informe o nome do cliente, com pelo menos 3 letras.'),
      emEdicao || marcarErro('campo-telefone', /^[1-9]{2}\d{8,9}$/.test(digitos) ? '' : 'Informe o telefone com DDD.'),
      marcarErro('servicos', servicosMarcados().length ? '' : 'Escolha pelo menos um serviço.'),
      marcarErro('campo-data', campoData.value ? '' : 'Escolha a data.'),
      marcarErro('campo-hora', campoHora.value ? '' : 'Escolha a hora.'),
    ];
    var primeiroErro = formulario.querySelector('[aria-invalid="true"], #servicos-erro:not(:empty)');
    if (ok.indexOf(false) !== -1) {
      if (primeiroErro && primeiroErro.id === 'servicos-erro') {
        formulario.querySelector('input[name="servicos"]').focus();
      } else if (primeiroErro) {
        primeiroErro.focus();
      }
      return;
    }

    var dados = {
      servicos: servicosMarcados(),
      data: campoData.value,
      hora: campoHora.value,
      modeloVeiculo: document.getElementById('campo-modelo').value.trim(),
      observacoes: document.getElementById('campo-observacoes').value.trim(),
    };
    var antes = emEdicao;
    var promessa;
    if (antes) {
      promessa = API.editarAgendamento(antes.codigo, dados);
    } else {
      dados.nome = nome;
      dados.telefone = telefone;
      promessa = API.criarAgendamento(dados);
    }

    executar(botaoSalvar, promessa, function (salvo) {
      estado.data = inicioDoDia(new Date(salvo.dataHoraInicio));
      if (!antes) {
        A.avisar(
          'Agendamento de ' + salvo.cliente.nome + ' criado para ' + A.quandoTexto(salvo) + '.',
          A.botaoWhatsApp(salvo, 'confirmacao', 'Avisar no WhatsApp'),
        );
      } else if (antes.dataHoraInicio !== salvo.dataHoraInicio || antes.dataHoraFim !== salvo.dataHoraFim) {
        A.avisar(
          'Horário de ' + salvo.cliente.nome + ' alterado para ' + A.quandoTexto(salvo) + '.',
          A.botaoWhatsApp(salvo, 'remarcado', 'Avisar no WhatsApp'),
        );
      } else {
        A.avisar('Alterações de ' + salvo.cliente.nome + ' salvas.');
      }
    }, alertaFormulario).then(function () {
      botaoSalvar.removeAttribute('aria-busy');
      botaoSalvar.textContent = emEdicao ? 'Salvar alterações' : 'Criar agendamento';
    });
  });

  // Fechar os diálogos pelos botões marcados com data-fechar.
  document.querySelectorAll('[data-fechar]').forEach(function (botao) {
    botao.addEventListener('click', function () {
      botao.closest('dialog').close();
    });
  });

  var botaoNovo = document.getElementById('agenda-novo');
  if (podeCriar) {
    botaoNovo.addEventListener('click', function () {
      abrirFormulario(null);
    });
  } else {
    botaoNovo.remove();
  }

  /* Início ---------------------------------------------------------------- */

  lerEndereco();
  API.opcoesAgenda()
    .then(function (opcoes) {
      estado.opcoes = opcoes;
      montarServicos();
      return carregar();
    })
    .then(function () {
      if (estado.codigoAberto) {
        abrirDetalhe(estado.codigoAberto);
      }
    })
    .catch(function (erro) {
      areaErro.textContent = erro.message || 'Não foi possível carregar a agenda. Recarregue a página.';
    });
})();
