/*
 * Configurações (RF-22, RF-23): como a agenda funciona (dias, horários,
 * intervalo, capacidade e prazos), as datas bloqueadas e a vitrine (nome,
 * logotipo, cor e contatos). Só o dono vê esta página (permissão
 * "configuracao", RN-13).
 *
 * Cada parte salva sozinha: agenda, datas bloqueadas e vitrine têm o próprio
 * botão. O logotipo é enviado assim que é escolhido, como a foto de um serviço.
 */
(function () {
  'use strict';

  var Painel = window.SmartAgendaPainel;
  if (!Painel) {
    return; // Sem sessão ou sem permissão: painel.js já redirecionou.
  }

  var API = window.SmartAgendaPainelAPI;
  var Imagem = window.SmartAgendaImagem;
  var Aviso = window.SmartAgendaAviso;
  var Marca = window.SmartAgendaMarca;
  var f = Painel.formatar;
  var el = Painel.el;

  var DIAS = ['Dom', 'Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb'];
  var DIAS_LONGOS = ['Domingo', 'Segunda', 'Terça', 'Quarta', 'Quinta', 'Sexta', 'Sábado'];
  var INTERVALOS = [10, 15, 20, 30, 45, 60];
  var COR_PADRAO = '#1f1f1f';

  var area = document.getElementById('configuracoes');
  var areaErro = document.getElementById('erro-configuracoes');

  var vitrine = null; // a vitrine como está salva

  /* Peças ----------------------------------------------------------------- */

  function marcar(id, mensagem) {
    var campo = document.getElementById(id);
    document.getElementById(id + '-erro').textContent = mensagem || '';
    if (mensagem) {
      campo.setAttribute('aria-invalid', 'true');
    } else {
      campo.removeAttribute('aria-invalid');
    }
    return !mensagem;
  }

  // Mostra "Salvando…" no botão e devolve a função que o libera.
  function ocupar(botao, texto) {
    var antes = botao.textContent;
    botao.setAttribute('aria-busy', 'true');
    botao.textContent = texto;
    return function () {
      botao.removeAttribute('aria-busy');
      botao.textContent = antes;
    };
  }

  function ocupado(botao) {
    return botao.getAttribute('aria-busy') === 'true';
  }

  function valor(id) {
    return document.getElementById(id).value.trim();
  }

  function numero(id) {
    var texto = valor(id);
    return texto === '' ? NaN : Number(texto);
  }

  function inteiroEntre(n, minimo, maximo) {
    return Number.isInteger(n) && n >= minimo && n <= maximo;
  }

  function hojeISO() {
    var hoje = new Date();
    return [hoje.getFullYear(), String(hoje.getMonth() + 1).padStart(2, '0'), String(hoje.getDate()).padStart(2, '0')].join('-');
  }

  // +551130000000 -> (11) 3000-0000; +5511900000000 -> (11) 90000-0000
  function telefoneParaCampo(e164) {
    var d = String(e164 || '').replace(/\D/g, '').replace(/^55/, '');
    if (d.length === 10) {
      return '(' + d.slice(0, 2) + ') ' + d.slice(2, 6) + '-' + d.slice(6);
    }
    if (d.length === 11) {
      return '(' + d.slice(0, 2) + ') ' + d.slice(2, 7) + '-' + d.slice(7);
    }
    return e164 || '';
  }

  function identidade(v) {
    return { nome: v.nome, logotipoUrl: v.logotipoUrl, corPrimaria: v.corPrimaria };
  }

  /* Agenda (RF-22) -------------------------------------------------------- */

  var formAgenda = document.getElementById('form-agenda');
  var botaoAgenda = document.getElementById('salvar-agenda');
  var alertaAgenda = document.getElementById('alerta-agenda');
  var areaDias = document.getElementById('dias-funcionamento');
  var campoIntervalo = document.getElementById('intervalo');

  DIAS.forEach(function (nome, dia) {
    areaDias.append(
      el('label', { classe: 'dia-opcao' }, [
        el('input', { atributos: { type: 'checkbox', name: 'dia', value: String(dia), 'aria-label': DIAS_LONGOS[dia] } }),
        el('span', { texto: nome, atributos: { 'aria-hidden': 'true' } }),
      ]),
    );
  });

  function opcoesDeIntervalo(atual) {
    var valores = INTERVALOS.indexOf(atual) === -1 && atual ? INTERVALOS.concat(atual).sort(function (a, b) {
      return a - b;
    }) : INTERVALOS;
    campoIntervalo.replaceChildren.apply(
      campoIntervalo,
      valores.map(function (m) {
        return el('option', { texto: m + ' minutos', atributos: { value: String(m) } });
      }),
    );
    campoIntervalo.value = String(atual || 30);
  }

  function preencherAgenda(a) {
    areaDias.querySelectorAll('input').forEach(function (caixa) {
      caixa.checked = a.diasFuncionamento.indexOf(Number(caixa.value)) !== -1;
    });
    document.getElementById('hora-abertura').value = a.horaAbertura;
    document.getElementById('hora-fechamento').value = a.horaFechamento;
    opcoesDeIntervalo(a.intervaloMinutos);
    document.getElementById('capacidade').value = a.capacidadeSimultanea;
    document.getElementById('antecedencia').value = a.antecedenciaMinimaHoras;
    document.getElementById('limite-dias').value = a.limiteDiasFuturos;
    document.getElementById('prazo-resposta').value = a.prazoRespostaHoras;
    document.getElementById('prazo-cancelamento').value = a.prazoCancelamentoHoras;
  }

  formAgenda.addEventListener('submit', function (evento) {
    evento.preventDefault();
    if (ocupado(botaoAgenda)) {
      return;
    }
    alertaAgenda.textContent = '';

    var dias = Array.prototype.map.call(areaDias.querySelectorAll('input:checked'), function (caixa) {
      return Number(caixa.value);
    });
    var abertura = valor('hora-abertura');
    var fechamento = valor('hora-fechamento');
    var dados = {
      diasFuncionamento: dias,
      horaAbertura: abertura,
      horaFechamento: fechamento,
      intervaloMinutos: Number(campoIntervalo.value),
      capacidadeSimultanea: numero('capacidade'),
      antecedenciaMinimaHoras: numero('antecedencia'),
      limiteDiasFuturos: numero('limite-dias'),
      prazoRespostaHoras: numero('prazo-resposta'),
      prazoCancelamentoHoras: numero('prazo-cancelamento'),
    };

    var ok = [
      marcar('dias-funcionamento', dias.length ? '' : 'Escolha pelo menos um dia.'),
      marcar('hora-abertura', abertura ? '' : 'Informe a hora de abertura.'),
      marcar('hora-fechamento', !fechamento ? 'Informe a hora de fechamento.' : abertura && fechamento <= abertura ? 'Precisa ser depois da abertura.' : ''),
      marcar('capacidade', inteiroEntre(dados.capacidadeSimultanea, 1, 20) ? '' : 'De 1 a 20.'),
      marcar('antecedencia', inteiroEntre(dados.antecedenciaMinimaHoras, 0, 168) ? '' : 'De 0 a 168 horas.'),
      marcar('limite-dias', inteiroEntre(dados.limiteDiasFuturos, 1, 365) ? '' : 'De 1 a 365 dias.'),
      marcar('prazo-resposta', inteiroEntre(dados.prazoRespostaHoras, 1, 168) ? '' : 'De 1 a 168 horas.'),
      marcar('prazo-cancelamento', inteiroEntre(dados.prazoCancelamentoHoras, 0, 168) ? '' : 'De 0 a 168 horas.'),
    ];
    if (ok.indexOf(false) !== -1) {
      var primeiro = formAgenda.querySelector('[aria-invalid="true"]');
      (primeiro.querySelector('input') || primeiro).focus();
      return;
    }

    var liberar = ocupar(botaoAgenda, 'Salvando…');
    API.salvarAgenda(dados)
      .then(function (salva) {
        preencherAgenda(salva);
        Aviso.mostrar('Agenda salva. Os horários do site e do painel já seguem as regras novas.');
      })
      .catch(function (erro) {
        alertaAgenda.textContent = erro.message || 'Não foi possível salvar a agenda. Tente de novo.';
      })
      .then(liberar);
  });

  /* Datas bloqueadas ------------------------------------------------------ */

  var listaBloqueios = document.getElementById('lista-bloqueios');
  var formBloqueio = document.getElementById('form-bloqueio');
  var botaoBloqueio = document.getElementById('salvar-bloqueio');
  var alertaBloqueio = document.getElementById('alerta-bloqueio');
  var campoData = document.getElementById('bloqueio-data');

  // "AAAA-MM-DD" no fuso do navegador (new Date("AAAA-MM-DD") seria UTC).
  function dataLocal(texto) {
    var p = texto.split('-').map(Number);
    return new Date(p[0], p[1] - 1, p[2]);
  }

  function nomeDaData(texto) {
    var data = dataLocal(texto);
    var nome = f.dataLonga(data);
    return data.getFullYear() === new Date().getFullYear() ? nome : nome + ' de ' + data.getFullYear();
  }

  function desenharBloqueios(bloqueios) {
    if (!bloqueios.length) {
      listaBloqueios.replaceChildren(el('li', { classe: 'vazio', texto: 'Nenhuma data bloqueada daqui para a frente.' }));
      return;
    }
    listaBloqueios.replaceChildren.apply(
      listaBloqueios,
      bloqueios.map(function (b) {
        var remover = el('button', {
          classe: 'botao-texto botao-texto--perigo',
          texto: 'Liberar',
          atributos: { type: 'button', 'aria-label': 'Liberar ' + nomeDaData(b.data) },
        });
        remover.addEventListener('click', function () {
          remover.setAttribute('aria-busy', 'true');
          alertaBloqueio.textContent = '';
          API.removerBloqueio(b.data)
            .then(function (r) {
              desenharBloqueios(r.bloqueios);
              Aviso.mostrar(nomeDaData(b.data) + ' voltou a ter horários no site.');
            })
            .catch(function (erro) {
              remover.removeAttribute('aria-busy');
              alertaBloqueio.textContent = erro.message;
            });
        });
        return el('li', { classe: 'bloqueio' }, [
          el('div', {}, [
            el('p', { classe: 'bloqueio__data', texto: nomeDaData(b.data) }),
            b.motivo ? el('p', { classe: 'bloqueio__motivo', texto: b.motivo }) : null,
          ]),
          remover,
        ]);
      }),
    );
  }

  formBloqueio.addEventListener('submit', function (evento) {
    evento.preventDefault();
    if (ocupado(botaoBloqueio)) {
      return;
    }
    alertaBloqueio.textContent = '';
    var data = campoData.value;
    if (!data) {
      alertaBloqueio.textContent = 'Escolha a data que vai ficar sem atendimento.';
      campoData.focus();
      return;
    }
    var liberar = ocupar(botaoBloqueio, 'Bloqueando…');
    API.criarBloqueio({ data: data, motivo: valor('bloqueio-motivo') })
      .then(function (r) {
        desenharBloqueios(r.bloqueios);
        formBloqueio.reset();
        Aviso.mostrar(nomeDaData(data) + ' ficou sem horários no site.');
      })
      .catch(function (erro) {
        alertaBloqueio.textContent = erro.message || 'Não foi possível bloquear a data. Tente de novo.';
      })
      .then(liberar);
  });

  /* Vitrine (RF-23) ------------------------------------------------------- */

  var formVitrine = document.getElementById('form-vitrine');
  var botaoVitrine = document.getElementById('salvar-vitrine');
  var alertaVitrine = document.getElementById('alerta-vitrine');
  var areaLogotipo = document.getElementById('logotipo');
  var arquivo = document.getElementById('logotipo-arquivo');
  var campoCor = document.getElementById('vitrine-cor');
  var campoCorTexto = document.getElementById('vitrine-cor-texto');

  function preencherVitrine(v) {
    document.getElementById('vitrine-nome').value = v.nome;
    document.getElementById('vitrine-descricao').value = v.descricao;
    document.getElementById('vitrine-endereco').value = v.endereco;
    document.getElementById('vitrine-telefone').value = telefoneParaCampo(v.telefoneContato);
    document.getElementById('vitrine-instagram').value = v.instagram ? '@' + v.instagram : '';
    document.getElementById('vitrine-whatsapp').value = telefoneParaCampo(v.telefoneWhatsapp);
    campoCorTexto.value = v.corPrimaria;
    campoCor.value = v.corPrimaria || COR_PADRAO;
  }

  // O seletor de cor e o campo de texto andam juntos.
  campoCor.addEventListener('input', function () {
    campoCorTexto.value = campoCor.value;
    marcar('vitrine-cor-texto', '');
  });
  campoCorTexto.addEventListener('input', function () {
    if (/^#[0-9a-fA-F]{6}$/.test(campoCorTexto.value)) {
      campoCor.value = campoCorTexto.value.toLowerCase();
    }
  });

  function desenharLogotipo() {
    var url = vitrine && vitrine.logotipoUrl;
    var escolher = el('button', {
      classe: 'botao botao--contorno botao--pequeno',
      texto: url ? 'Trocar logotipo' : 'Adicionar logotipo',
      atributos: { type: 'button' },
    });
    escolher.addEventListener('click', function () {
      arquivo.click();
    });
    if (!url) {
      areaLogotipo.replaceChildren(el('div', { classe: 'foto-campo__vazio' }, [escolher]));
      return;
    }
    var remover = el('button', { classe: 'botao-texto botao-texto--perigo', texto: 'Remover logotipo', atributos: { type: 'button' } });
    remover.addEventListener('click', removerLogotipo);
    areaLogotipo.replaceChildren(
      el('div', { classe: 'foto-campo__previa' }, [
        el('img', { classe: 'logotipo-previa', atributos: { src: url, alt: 'Logotipo atual' } }),
        el('div', { classe: 'foto-campo__acoes' }, [escolher, remover]),
      ]),
    );
  }

  function aguardandoLogotipo(texto) {
    areaLogotipo.replaceChildren(el('p', { classe: 'foto-campo__enviando', texto: texto, atributos: { role: 'status' } }));
  }

  function logotipoSalvo(salva, mensagem) {
    vitrine = salva;
    Marca.aplicar(identidade(salva));
    Aviso.mostrar(mensagem);
  }

  arquivo.addEventListener('change', function () {
    var escolhido = arquivo.files[0];
    arquivo.value = '';
    if (!escolhido) {
      return;
    }
    alertaVitrine.textContent = '';
    aguardandoLogotipo('Preparando o logotipo…');
    Imagem.preparar(escolhido)
      .then(function (blob) {
        aguardandoLogotipo('Enviando o logotipo…');
        return API.enviarLogotipo(blob);
      })
      .then(function (salva) {
        logotipoSalvo(salva, 'Logotipo novo salvo.');
      })
      .catch(function (erro) {
        alertaVitrine.textContent = erro.message || 'Não foi possível enviar o logotipo. Tente de novo.';
      })
      .then(desenharLogotipo);
  });

  function removerLogotipo() {
    alertaVitrine.textContent = '';
    aguardandoLogotipo('Removendo o logotipo…');
    API.removerLogotipo()
      .then(function (salva) {
        logotipoSalvo(salva, 'Logotipo removido. O painel e o site mostram só o nome.');
      })
      .catch(function (erro) {
        alertaVitrine.textContent = erro.message;
      })
      .then(desenharLogotipo);
  }

  formVitrine.addEventListener('submit', function (evento) {
    evento.preventDefault();
    if (ocupado(botaoVitrine)) {
      return;
    }
    alertaVitrine.textContent = '';
    var nome = valor('vitrine-nome');
    var cor = valor('vitrine-cor-texto');

    var ok = [
      marcar('vitrine-nome', nome.length >= 2 ? '' : 'Informe o nome da estética.'),
      marcar('vitrine-cor-texto', !cor || /^#[0-9a-fA-F]{6}$/.test(cor) ? '' : 'Use o formato #rrggbb, como #1f1f1f.'),
    ];
    ['vitrine-telefone', 'vitrine-instagram', 'vitrine-whatsapp'].forEach(function (id) {
      marcar(id, '');
    });
    if (ok.indexOf(false) !== -1) {
      formVitrine.querySelector('[aria-invalid="true"]').focus();
      return;
    }

    var liberar = ocupar(botaoVitrine, 'Salvando…');
    API.salvarVitrine({
      nome: nome,
      descricao: valor('vitrine-descricao'),
      endereco: valor('vitrine-endereco'),
      telefoneContato: valor('vitrine-telefone'),
      instagram: valor('vitrine-instagram'),
      telefoneWhatsapp: valor('vitrine-whatsapp'),
      corPrimaria: cor,
    })
      .then(function (salva) {
        vitrine = salva;
        preencherVitrine(salva);
        Marca.aplicar(identidade(salva));
        Aviso.mostrar('Vitrine salva. O painel já mostra o nome e a cor novos.');
      })
      .catch(function (erro) {
        alertaVitrine.textContent = erro.message || 'Não foi possível salvar a vitrine. Tente de novo.';
      })
      .then(liberar);
  });

  /* Início ---------------------------------------------------------------- */

  campoData.min = hojeISO();

  API.configuracoes()
    .then(function (c) {
      preencherAgenda(c.agenda);
      desenharBloqueios(c.bloqueios);
      vitrine = c.vitrine;
      preencherVitrine(c.vitrine);
      desenharLogotipo();
    })
    .catch(function (erro) {
      areaErro.textContent = erro.message || 'Não foi possível carregar as configurações. Recarregue a página.';
    })
    .then(function () {
      area.removeAttribute('aria-busy');
    });
})();
