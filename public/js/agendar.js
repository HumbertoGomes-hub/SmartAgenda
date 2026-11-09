/* Fluxo de agendamento: serviços, data e horário, dados e envio. */
(function () {
  'use strict';

  var API = window.SmartAgendaAPI;
  var Site = window.SmartAgendaSite;

  var formulario = document.getElementById('form-agendar');
  var calendario = document.getElementById('calendario');
  var alerta = document.getElementById('alerta-fluxo');
  var botaoVoltar = document.getElementById('botao-voltar');
  var botaoAvancar = document.getElementById('botao-avancar');
  var passos = Array.prototype.slice.call(document.querySelectorAll('.fluxo__passo'));
  var marcadores = Array.prototype.slice.call(document.querySelectorAll('.etapas li'));
  var caixas = Array.prototype.slice.call(formulario.querySelectorAll('input[name="servicos"]'));

  var ROTULOS_PASSO = ['Serviços', 'Data e horário', 'Seus dados'];
  var agenda = {
    dias: calendario.dataset.diasFuncionamento.split(',').map(Number),
    limiteDias: Number(calendario.dataset.limiteDias),
    bloqueios: calendario.dataset.bloqueios.split(','),
    abertura: calendario.dataset.abertura,
    fechamento: calendario.dataset.fechamento,
    intervalo: Number(calendario.dataset.intervalo),
  };

  var hoje = inicioDoDia(new Date());
  var ultimoDia = new Date(hoje.getFullYear(), hoje.getMonth(), hoje.getDate() + agenda.limiteDias);

  var estado = {
    passo: 0,
    mes: new Date(hoje.getFullYear(), hoje.getMonth(), 1),
    data: null,
    horario: null,
    consulta: 0,
  };

  function inicioDoDia(data) {
    return new Date(data.getFullYear(), data.getMonth(), data.getDate());
  }

  function dataISO(data) {
    return [
      data.getFullYear(),
      String(data.getMonth() + 1).padStart(2, '0'),
      String(data.getDate()).padStart(2, '0'),
    ].join('-');
  }

  function dataDeISO(texto) {
    var partes = texto.split('-').map(Number);
    return new Date(partes[0], partes[1] - 1, partes[2]);
  }

  function formatarDuracao(minutos) {
    var h = Math.floor(minutos / 60);
    var m = minutos % 60;
    if (!h) {
      return m + ' min';
    }
    return m ? h + 'h' + String(m).padStart(2, '0') : h + 'h';
  }

  function formatarPreco(valor) {
    return valor.toLocaleString('pt-BR', {
      style: 'currency',
      currency: 'BRL',
      maximumFractionDigits: 0,
    });
  }

  function formatarData(iso) {
    var texto = dataDeISO(iso).toLocaleDateString('pt-BR', {
      weekday: 'long',
      day: 'numeric',
      month: 'long',
    });
    return texto.charAt(0).toUpperCase() + texto.slice(1).replace('-feira', '');
  }

  function formatarDataCurta(iso) {
    var data = dataDeISO(iso);
    return data.getDate() + '/' + (data.getMonth() + 1);
  }

  function servicosEscolhidos() {
    return caixas
      .filter(function (caixa) {
        return caixa.checked;
      })
      .map(function (caixa) {
        return {
          id: caixa.value,
          nome: caixa.dataset.nome,
          preco: Number(caixa.dataset.preco),
          duracao: Number(caixa.dataset.duracao),
        };
      });
  }

  function somar(lista, chave) {
    return lista.reduce(function (total, item) {
      return total + item[chave];
    }, 0);
  }

  function mostrarAlerta(mensagem) {
    alerta.textContent = mensagem || '';
  }

  /* Resumo */
  function atualizarResumo() {
    var escolhidos = servicosEscolhidos();
    var duracao = somar(escolhidos, 'duracao');
    var preco = somar(escolhidos, 'preco');
    var quando = estado.data
      ? formatarData(estado.data) + (estado.horario ? ', às ' + estado.horario : '')
      : '';

    var itens = document.getElementById('resumo-itens');
    itens.replaceChildren();
    escolhidos.forEach(function (servico) {
      var li = document.createElement('li');
      var nome = document.createElement('span');
      var valor = document.createElement('span');
      nome.textContent = servico.nome;
      valor.textContent = formatarPreco(servico.preco);
      li.append(nome, valor);
      itens.append(li);
    });

    var temServico = escolhidos.length > 0;
    document.getElementById('resumo-vazio').hidden = temServico;
    document.getElementById('resumo-totais').hidden = !temServico;
    document.getElementById('resumo-duracao').textContent = formatarDuracao(duracao);
    document.getElementById('resumo-preco').textContent = 'A partir de ' + formatarPreco(preco);
    document.getElementById('resumo-quando').textContent = quando || 'A escolher';

    var curto = document.getElementById('resumo-curto');
    if (temServico) {
      var linha = escolhidos.length === 1 ? '1 serviço' : escolhidos.length + ' serviços';
      var detalhe = document.createElement('span');
      detalhe.textContent = estado.data
        ? formatarDataCurta(estado.data) + (estado.horario ? ' às ' + estado.horario : '')
        : 'A partir de ' + formatarPreco(preco);
      curto.replaceChildren(linha + ', ' + formatarDuracao(duracao), detalhe);
    } else {
      curto.textContent = '';
    }
  }

  /* Navegação entre passos */
  function irPara(indice, focar, veioDoHistorico) {
    // Cada passo entra no histórico para o botão Voltar do navegador não
    // abandonar o agendamento. A URL não muda: recarregar recomeça do passo 1.
    if (focar && !veioDoHistorico) {
      window.history.pushState({ passo: indice }, '');
    }

    estado.passo = indice;
    mostrarAlerta('');

    passos.forEach(function (passo, i) {
      passo.hidden = i !== indice;
    });

    marcadores.forEach(function (marcador, i) {
      var situacao = i < indice ? 'feita' : i === indice ? 'atual' : 'futura';
      marcador.dataset.estado = situacao;
      marcador.replaceChildren();
      if (situacao === 'feita') {
        var botao = document.createElement('button');
        botao.type = 'button';
        botao.textContent = ROTULOS_PASSO[i];
        botao.addEventListener('click', function () {
          irPara(i, true);
        });
        marcador.append(botao);
      } else {
        marcador.textContent = i < 3 ? ROTULOS_PASSO[i] : 'Confirmação';
      }
      if (situacao === 'atual') {
        marcador.setAttribute('aria-current', 'step');
      } else {
        marcador.removeAttribute('aria-current');
      }
    });

    botaoVoltar.hidden = indice === 0;
    botaoAvancar.textContent = indice === 2 ? 'Enviar pedido' : 'Continuar';

    if (indice === 1) {
      desenharCalendario();
      if (estado.data) {
        buscarHorarios();
      }
    }

    if (focar) {
      var titulo = passos[indice].querySelector('h2');
      titulo.focus({ preventScroll: true });
      window.scrollTo({ top: 0 });
    }
  }

  /* Calendário */
  function diaDisponivel(data) {
    return (
      data >= hoje &&
      data <= ultimoDia &&
      agenda.dias.indexOf(data.getDay()) !== -1 &&
      agenda.bloqueios.indexOf(dataISO(data)) === -1
    );
  }

  function desenharCalendario() {
    var ano = estado.mes.getFullYear();
    var mes = estado.mes.getMonth();
    var dias = document.getElementById('calendario-dias');

    document.getElementById('calendario-mes').textContent = estado.mes.toLocaleDateString('pt-BR', {
      month: 'long',
      year: 'numeric',
    });

    document.getElementById('mes-anterior').disabled =
      ano === hoje.getFullYear() && mes === hoje.getMonth();
    document.getElementById('mes-seguinte').disabled =
      ano === ultimoDia.getFullYear() && mes === ultimoDia.getMonth();

    dias.replaceChildren();
    var deslocamento = new Date(ano, mes, 1).getDay();
    for (var i = 0; i < deslocamento; i += 1) {
      dias.append(document.createElement('span'));
    }

    var total = new Date(ano, mes + 1, 0).getDate();
    for (var dia = 1; dia <= total; dia += 1) {
      dias.append(criarDia(new Date(ano, mes, dia)));
    }
  }

  function criarDia(data) {
    var iso = dataISO(data);
    var botao = document.createElement('button');
    var disponivel = diaDisponivel(data);
    var bloqueado = agenda.bloqueios.indexOf(iso) !== -1 && data >= hoje && data <= ultimoDia;

    botao.type = 'button';
    botao.className = 'dia';
    botao.textContent = data.getDate();
    botao.disabled = !disponivel;
    botao.setAttribute(
      'aria-label',
      formatarData(iso) + (bloqueado ? ', estética fechada' : disponivel ? '' : ', indisponível'),
    );
    botao.setAttribute('aria-pressed', String(iso === estado.data));
    if (bloqueado) {
      botao.dataset.bloqueado = 'true';
    }
    if (data.getTime() === hoje.getTime()) {
      botao.dataset.hoje = 'true';
    }

    botao.addEventListener('click', function () {
      estado.data = iso;
      estado.horario = null;
      desenharCalendario();
      buscarHorarios();
      atualizarResumo();
      mostrarAlerta('');
    });

    return botao;
  }

  /* Horários */
  function gradeDoDia() {
    var paraMinutos = function (texto) {
      var partes = texto.split(':').map(Number);
      return partes[0] * 60 + partes[1];
    };
    var grade = [];
    var fim = paraMinutos(agenda.fechamento);
    for (var m = paraMinutos(agenda.abertura); m < fim; m += agenda.intervalo) {
      grade.push(
        String(Math.floor(m / 60)).padStart(2, '0') + ':' + String(m % 60).padStart(2, '0'),
      );
    }
    return grade;
  }

  function mensagemHorarios(texto) {
    var grade = document.getElementById('horarios-grade');
    var aviso = document.createElement('p');
    aviso.className = 'horarios__mensagem';
    aviso.textContent = texto;
    grade.replaceChildren(aviso);
    grade.dataset.mensagem = 'true';
  }

  function desenharHorarios(livres) {
    var grade = document.getElementById('horarios-grade');
    grade.replaceChildren();
    delete grade.dataset.mensagem;

    if (estado.horario && livres.indexOf(estado.horario) === -1) {
      estado.horario = null;
      atualizarResumo();
    }

    gradeDoDia().forEach(function (horario) {
      var botao = document.createElement('button');
      var livre = livres.indexOf(horario) !== -1;
      botao.type = 'button';
      botao.className = 'horario';
      botao.textContent = horario;
      botao.disabled = !livre;
      botao.setAttribute('aria-pressed', String(horario === estado.horario));
      if (!livre) {
        botao.setAttribute('aria-label', horario + ', ocupado');
      }
      botao.addEventListener('click', function () {
        estado.horario = horario;
        grade.querySelectorAll('.horario').forEach(function (outro) {
          outro.setAttribute('aria-pressed', String(outro === botao));
        });
        atualizarResumo();
        mostrarAlerta('');
      });
      grade.append(botao);
    });
  }

  function buscarHorarios() {
    var titulo = document.getElementById('horarios-titulo');
    var legenda = document.getElementById('legenda');
    var ids = servicosEscolhidos().map(function (servico) {
      return servico.id;
    });
    var consulta = (estado.consulta += 1);
    var data = estado.data;

    titulo.textContent = formatarData(data);
    legenda.hidden = true;
    mensagemHorarios('Buscando horários livres…');

    API.buscarHorarios(data, ids)
      .then(function (resposta) {
        if (consulta !== estado.consulta) {
          return;
        }
        if (resposta.horarios.length === 0) {
          estado.horario = null;
          atualizarResumo();
          mensagemHorarios(
            'Não há horário livre neste dia para a duração escolhida. Escolha outra data ou tire um serviço do pedido.',
          );
          return;
        }
        desenharHorarios(resposta.horarios);
        legenda.hidden = false;
      })
      .catch(function () {
        if (consulta === estado.consulta) {
          mensagemHorarios('Não foi possível buscar os horários. Toque no dia para tentar de novo.');
        }
      });
  }

  /* Validação dos dados */
  function marcarCampo(id, mensagem) {
    var campo = document.getElementById(id);
    var erro = document.getElementById(id + '-erro');
    erro.textContent = mensagem || '';
    if (mensagem) {
      campo.setAttribute('aria-invalid', 'true');
    } else {
      campo.removeAttribute('aria-invalid');
    }
    return !mensagem;
  }

  function validarDados() {
    var nome = document.getElementById('nome').value.trim();
    var telefone = document.getElementById('telefone').value;
    var consentimento = document.getElementById('consentimento').checked;

    var nomeOk = marcarCampo(
      'nome',
      nome.length >= 3 ? '' : 'Informe seu nome, com pelo menos 3 letras.',
    );
    var telefoneOk = marcarCampo(
      'telefone',
      Site.telefoneValido(telefone) ? '' : 'Informe o celular com DDD, com 11 números.',
    );
    var consentimentoOk = marcarCampo(
      'consentimento',
      consentimento ? '' : 'Marque esta opção para enviar o pedido.',
    );

    if (!nomeOk) {
      document.getElementById('nome').focus();
    } else if (!telefoneOk) {
      document.getElementById('telefone').focus();
    } else if (!consentimentoOk) {
      document.getElementById('consentimento').focus();
    }

    return nomeOk && telefoneOk && consentimentoOk;
  }

  /* Envio */
  function enviar() {
    if (!validarDados()) {
      return;
    }

    var escolhidos = servicosEscolhidos();
    var telefone = Site.telefoneE164(document.getElementById('telefone').value);
    var pedido = {
      servicos: escolhidos.map(function (servico) {
        return servico.id;
      }),
      data: estado.data,
      horario: estado.horario,
      nome: document.getElementById('nome').value.trim(),
      telefone: telefone,
      modeloVeiculo: document.getElementById('modelo').value.trim(),
      observacoes: document.getElementById('observacoes').value.trim(),
      consentimentoLgpd: true,
    };

    botaoAvancar.setAttribute('aria-busy', 'true');
    botaoAvancar.textContent = 'Enviando pedido…';

    API.criarAgendamento(pedido)
      .then(function (resposta) {
        API.guardarPedido({
          codigo: resposta.codigo,
          dataHoraTexto: formatarData(estado.data) + ', às ' + estado.horario,
          servicosTexto: escolhidos
            .map(function (servico) {
              return servico.nome;
            })
            .join(', '),
          duracaoTexto: formatarDuracao(somar(escolhidos, 'duracao')),
          precoTexto: 'A partir de ' + formatarPreco(somar(escolhidos, 'preco')),
        });
        window.location.href =
          'agendamento-sucesso.html?codigo=' + encodeURIComponent(resposta.codigo);
      })
      .catch(function (erro) {
        botaoAvancar.removeAttribute('aria-busy');
        botaoAvancar.textContent = 'Enviar pedido';
        if (erro.codigo === 'TELEFONE_SEM_WHATSAPP') {
          marcarCampo('telefone', erro.message);
          document.getElementById('telefone').focus();
        } else {
          mostrarAlerta(erro.message || 'Não foi possível enviar o pedido. Tente de novo.');
        }
      });
  }

  function avancar() {
    if (botaoAvancar.getAttribute('aria-busy') === 'true') {
      return;
    }
    if (estado.passo === 0 && servicosEscolhidos().length === 0) {
      mostrarAlerta('Escolha pelo menos um serviço para continuar.');
      return;
    }
    if (estado.passo === 1 && !(estado.data && estado.horario)) {
      mostrarAlerta(
        estado.data ? 'Escolha um horário para continuar.' : 'Escolha um dia para continuar.',
      );
      return;
    }
    if (estado.passo === 2) {
      enviar();
      return;
    }
    irPara(estado.passo + 1, true);
  }

  /* Eventos */
  botaoAvancar.addEventListener('click', avancar);
  botaoVoltar.addEventListener('click', function () {
    irPara(estado.passo - 1, true);
  });

  window.addEventListener('popstate', function (evento) {
    irPara(evento.state ? evento.state.passo : 0, true, true);
  });

  formulario.addEventListener('submit', function (evento) {
    evento.preventDefault();
    avancar();
  });

  caixas.forEach(function (caixa) {
    caixa.addEventListener('change', function () {
      // Mudar os serviços muda a duração, então o horário precisa ser revisto.
      estado.horario = null;
      atualizarResumo();
      mostrarAlerta('');
    });
  });

  document.getElementById('mes-anterior').addEventListener('click', function () {
    estado.mes = new Date(estado.mes.getFullYear(), estado.mes.getMonth() - 1, 1);
    desenharCalendario();
  });

  document.getElementById('mes-seguinte').addEventListener('click', function () {
    estado.mes = new Date(estado.mes.getFullYear(), estado.mes.getMonth() + 1, 1);
    desenharCalendario();
  });

  ['nome', 'telefone'].forEach(function (id) {
    document.getElementById(id).addEventListener('input', function () {
      marcarCampo(id, '');
    });
  });

  document.getElementById('consentimento').addEventListener('change', function () {
    marcarCampo('consentimento', '');
  });

  /* Serviço já escolhido quando a pessoa vem da vitrine */
  var servicoInicial = new URLSearchParams(window.location.search).get('servico');
  caixas.forEach(function (caixa) {
    if (caixa.value === servicoInicial) {
      caixa.checked = true;
    }
  });

  window.history.replaceState({ passo: 0 }, '');
  atualizarResumo();
  irPara(0, false);
})();
