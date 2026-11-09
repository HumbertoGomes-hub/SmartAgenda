/*
 * Portfólio (RF-21): trabalhos, fotos e onde cada um aparece no site.
 *
 *   Página Portfólio      -> trabalhos publicados
 *   Comparador do início  -> um trabalho publicado com foto de antes e de depois
 *   Trabalhos recentes    -> até 4 trabalhos publicados em destaque
 *
 * Fotos: um campo para "Antes", um para "Depois" e até 12 "Mais fotos",
 * com legenda e ordem. Cada foto é enviada na hora; textos e lugares onde o
 * trabalho aparece são gravados no "Salvar".
 */
(function () {
  'use strict';

  var Painel = window.SmartAgendaPainel;
  if (!Painel) {
    return;
  }

  var API = window.SmartAgendaPainelAPI;
  var Imagem = window.SmartAgendaImagem;
  var Aviso = window.SmartAgendaAviso;
  var el = Painel.el;

  var MAXIMO_DESTAQUES = 4;
  var MAXIMO_FOTOS_GERAIS = 12;

  var listaTrabalhos = document.getElementById('lista-trabalhos');
  var areaErro = document.getElementById('erro-portfolio');
  var seletorCapa = document.getElementById('capa-trabalho');
  var dialogo = document.getElementById('dialogo-trabalho');
  var formulario = document.getElementById('form-trabalho');
  var alerta = document.getElementById('alerta-trabalho');
  var botaoSalvar = document.getElementById('trabalho-salvar');
  var botaoExcluir = document.getElementById('trabalho-excluir');
  var arquivo = document.getElementById('trabalho-arquivo');

  var estado = { trabalhos: [], servicos: [] };
  var emEdicao = null; // trabalho aberto no editor; null = novo
  var tipoEscolhido = 'GERAL'; // para qual campo vai a foto escolhida

  /* Peças ----------------------------------------------------------------- */

  function fotosDoTipo(trabalho, tipo) {
    return trabalho.fotos.filter(function (foto) {
      return foto.tipo === tipo;
    });
  }

  function temComparador(trabalho) {
    return fotosDoTipo(trabalho, 'ANTES').length > 0 && fotosDoTipo(trabalho, 'DEPOIS').length > 0;
  }

  function capaDe(trabalho) {
    return fotosDoTipo(trabalho, 'DEPOIS')[0] || fotosDoTipo(trabalho, 'GERAL')[0] || fotosDoTipo(trabalho, 'ANTES')[0];
  }

  function foto(url, alternativo, classe) {
    var img = el('img', { classe: classe, atributos: { src: Imagem.urlDaFoto(url), alt: alternativo, loading: 'lazy' } });
    if (Imagem.ehIlustracao(url)) {
      img.classList.add('ilustracao');
    }
    return img;
  }

  function botao(texto, classe, aoClicar, rotulo) {
    var b = el('button', { classe: classe, texto: texto, atributos: { type: 'button' } });
    if (rotulo) {
      b.setAttribute('aria-label', rotulo);
    }
    b.addEventListener('click', aoClicar);
    return b;
  }

  function mesAno(data) {
    if (!data) {
      return '';
    }
    var partes = data.split('-').map(Number);
    return new Date(partes[0], partes[1] - 1, 1).toLocaleDateString('pt-BR', { month: 'long', year: 'numeric' });
  }

  function falhou(erro, area) {
    (area || areaErro).textContent = erro.message || 'Não foi possível concluir. Tente de novo.';
  }

  // Com o editor aberto, o aviso do canto ficaria atrás do fundo escuro do
  // diálogo: a confirmação vai para a linha de status do próprio editor.
  function avisar(texto) {
    if (dialogo.open) {
      document.getElementById('trabalho-fotos-status').textContent = texto;
    } else {
      Aviso.mostrar(texto);
    }
  }

  /* Página inicial do site ------------------------------------------------ */

  function desenharInicio() {
    var publicados = estado.trabalhos.filter(function (t) {
      return t.publicado;
    });
    var naCapa = estado.trabalhos.filter(function (t) {
      return t.naCapa;
    })[0];

    // Comparador da abertura
    var previa = document.getElementById('capa-previa');
    if (naCapa) {
      previa.replaceChildren(
        el('div', { classe: 'par-fotos' }, [
          el('figure', {}, [foto(fotosDoTipo(naCapa, 'ANTES')[0].url, 'Antes'), el('figcaption', { texto: 'Antes' })]),
          el('figure', {}, [foto(fotosDoTipo(naCapa, 'DEPOIS')[0].url, 'Depois'), el('figcaption', { texto: 'Depois' })]),
        ]),
      );
    } else {
      previa.replaceChildren(el('p', { classe: 'lugar__vazio', texto: 'Sem comparador: a abertura do site mostra só o nome e a descrição.' }));
    }

    var opcoes = [el('option', { texto: 'Nenhum', atributos: { value: '' } })];
    publicados.filter(temComparador).forEach(function (t) {
      opcoes.push(el('option', { texto: t.titulo, atributos: { value: String(t.id) } }));
    });
    seletorCapa.replaceChildren.apply(seletorCapa, opcoes);
    seletorCapa.value = naCapa ? String(naCapa.id) : '';
    var semOpcao = opcoes.length === 1;
    document.getElementById('capa-ajuda').textContent = semOpcao
      ? 'Nenhum trabalho publicado tem foto de antes e de depois ainda.'
      : 'Só aparecem trabalhos publicados com foto de antes e de depois.';

    // Trabalhos recentes
    var destaques = estado.trabalhos.filter(function (t) {
      return t.emDestaque;
    });
    var lista = document.getElementById('destaques-previa');
    document.getElementById('destaques-contagem').textContent = destaques.length + ' de ' + MAXIMO_DESTAQUES;
    if (!destaques.length) {
      lista.replaceChildren(el('li', { classe: 'lugar__vazio', texto: 'Nenhum destaque: a seção "Trabalhos recentes" não aparece no site.' }));
      return;
    }
    lista.replaceChildren.apply(
      lista,
      destaques.map(function (t) {
        var imagem = capaDe(t);
        return el('li', { classe: 'destaque' }, [
          imagem ? foto(imagem.url, '', 'destaque__foto') : el('span', { classe: 'destaque__foto destaque__foto--vazia', atributos: { 'aria-hidden': 'true' } }),
          el('span', { classe: 'destaque__titulo', texto: t.titulo }),
          botao('Tirar do início', 'botao-texto', function (evento) {
            salvarRapido(t, { emDestaque: false }, t.titulo + ' saiu dos trabalhos recentes do início.', evento.currentTarget);
          }, 'Tirar ' + t.titulo + ' do início'),
        ]);
      }),
    );
  }

  seletorCapa.addEventListener('change', function () {
    var id = Number(seletorCapa.value);
    var atual = estado.trabalhos.filter(function (t) {
      return t.naCapa;
    })[0];
    seletorCapa.disabled = true;
    var mudar = id ? API.editarTrabalho(id, { naCapa: true }) : API.editarTrabalho(atual.id, { naCapa: false });
    mudar
      .then(function (salvo) {
        Aviso.mostrar(id ? salvo.titulo + ' agora abre o site no comparador.' : 'A abertura do site ficou sem comparador.');
        return carregar();
      })
      .catch(function (erro) {
        falhou(erro);
        desenharInicio();
      })
      .then(function () {
        seletorCapa.disabled = false;
      });
  });

  // Mudança de um clique (tirar do início), sem abrir o editor.
  function salvarRapido(trabalho, dados, mensagem, origem) {
    if (origem) {
      origem.setAttribute('aria-busy', 'true');
    }
    API.editarTrabalho(trabalho.id, dados)
      .then(function () {
        Aviso.mostrar(mensagem);
        return carregar();
      })
      .catch(function (erro) {
        if (origem) {
          origem.removeAttribute('aria-busy');
        }
        falhou(erro);
      });
  }

  /* Lista de trabalhos ---------------------------------------------------- */

  function selos(trabalho) {
    var lista = [el('span', { classe: trabalho.publicado ? 'selo' : 'selo selo--apagado', texto: trabalho.publicado ? 'No portfólio' : 'Oculto' })];
    if (trabalho.naCapa) {
      lista.push(el('span', { classe: 'selo selo--forte', texto: 'Comparador do início' }));
    }
    if (trabalho.emDestaque) {
      lista.push(el('span', { classe: 'selo selo--forte', texto: 'Trabalhos recentes' }));
    }
    return el('p', { classe: 'selos' }, lista);
  }

  function cartao(trabalho) {
    var imagem = capaDe(trabalho);
    var quantidade = trabalho.fotos.length;
    var detalhes = [
      trabalho.servico ? trabalho.servico.nome : '',
      mesAno(trabalho.dataRealizacao),
      quantidade ? quantidade + (quantidade === 1 ? ' foto' : ' fotos') : 'sem fotos',
    ].filter(Boolean).join(', ');

    return el('li', { classe: 'cartao-trabalho' }, [
      imagem
        ? el('div', { classe: 'cartao-trabalho__foto' }, [foto(imagem.url, '')])
        : el('div', { classe: 'cartao-trabalho__foto cartao-trabalho__foto--vazia' }, [el('span', { texto: 'Sem fotos ainda' })]),
      el('div', { classe: 'cartao-trabalho__corpo' }, [
        el('h3', { texto: trabalho.titulo }),
        el('p', { classe: 'cartao-trabalho__meta', texto: detalhes.charAt(0).toUpperCase() + detalhes.slice(1) }),
        selos(trabalho),
        botao('Editar fotos e textos', 'botao botao--contorno botao--pequeno', function () {
          abrir(trabalho);
        }, 'Editar ' + trabalho.titulo),
      ]),
    ]);
  }

  function desenharLista() {
    if (!estado.trabalhos.length) {
      listaTrabalhos.replaceChildren(el('li', { classe: 'vazio', texto: 'Nenhum trabalho ainda. Comece pelo botão "Novo trabalho".' }));
      return;
    }
    listaTrabalhos.replaceChildren.apply(listaTrabalhos, estado.trabalhos.map(cartao));
  }

  function carregar() {
    return API.portfolioPainel()
      .then(function (r) {
        estado = r;
        areaErro.textContent = '';
        desenharInicio();
        desenharLista();
        if (emEdicao && dialogo.open) {
          var atual = r.trabalhos.filter(function (t) {
            return t.id === emEdicao.id;
          })[0];
          if (atual) {
            emEdicao = atual;
            desenharFotos();
            atualizarLugares();
          }
        }
      })
      .catch(falhou)
      .then(function () {
        listaTrabalhos.removeAttribute('aria-busy');
      });
  }

  /* Editor ---------------------------------------------------------------- */

  var campoPublicado = document.getElementById('trabalho-publicado');
  var campoDestaque = document.getElementById('trabalho-destaque');
  var campoCapa = document.getElementById('trabalho-capa');

  function desenharServicos(selecionado) {
    var campo = document.getElementById('trabalho-servico');
    var opcoes = [el('option', { texto: 'Nenhum', atributos: { value: '' } })];
    estado.servicos.forEach(function (s) {
      if (s.ativo || s.id === selecionado) {
        opcoes.push(el('option', { texto: s.nome + (s.ativo ? '' : ' (desativado)'), atributos: { value: String(s.id) } }));
      }
    });
    campo.replaceChildren.apply(campo, opcoes);
    campo.value = selecionado ? String(selecionado) : '';
  }

  // "Onde aparece": o que não pode ser marcado fica desabilitado, com o motivo.
  function atualizarLugares() {
    var publicado = campoPublicado.checked;
    var destaques = estado.trabalhos.filter(function (t) {
      return t.emDestaque && (!emEdicao || t.id !== emEdicao.id);
    }).length;
    var podeDestaque = publicado && (campoDestaque.checked || destaques < MAXIMO_DESTAQUES);
    var podeCapa = publicado && emEdicao && temComparador(emEdicao);

    if (!publicado) {
      campoDestaque.checked = false;
      campoCapa.checked = false;
    }
    campoDestaque.disabled = !podeDestaque;
    campoCapa.disabled = !podeCapa;
    if (!podeCapa) {
      campoCapa.checked = false;
    }

    document.getElementById('trabalho-destaque-ajuda').textContent = !publicado
      ? 'Publique o trabalho para colocá-lo no início.'
      : !podeDestaque
        ? 'O início já tem ' + MAXIMO_DESTAQUES + ' trabalhos. Tire um deles para escolher este.'
        : 'Aparece na seção "Trabalhos recentes" do início.';
    document.getElementById('trabalho-capa-ajuda').textContent = !publicado
      ? 'Publique o trabalho para usá-lo na abertura.'
      : !podeCapa
        ? 'Precisa da foto de antes e da de depois.'
        : 'Substitui o comparador atual da abertura do site.';
  }

  campoPublicado.addEventListener('change', atualizarLugares);
  campoDestaque.addEventListener('change', atualizarLugares);

  /* Fotos do editor ------------------------------------------------------- */

  function escolherFoto(tipo) {
    tipoEscolhido = tipo;
    arquivo.multiple = tipo === 'GERAL';
    arquivo.click();
  }

  function campoUnico(tipo, rotulo) {
    var atual = fotosDoTipo(emEdicao, tipo)[0];
    var area = el('div', { classe: 'campo-foto', atributos: { 'data-tipo': tipo } });
    var titulo = el('p', { classe: 'campo-foto__rotulo', texto: rotulo });
    if (!atual) {
      area.append(
        titulo,
        botao('Enviar foto de ' + rotulo.toLowerCase(), 'campo-foto__vazio', function () {
          escolherFoto(tipo);
        }),
      );
      return area;
    }
    area.append(
      titulo,
      foto(atual.url, rotulo, 'campo-foto__imagem'),
      el('div', { classe: 'campo-foto__acoes' }, [
        botao('Trocar', 'botao-texto', function () {
          escolherFoto(tipo);
        }, 'Trocar a foto de ' + rotulo.toLowerCase()),
        botao('Remover', 'botao-texto botao-texto--perigo', function () {
          removerFoto(atual, 'A foto de ' + rotulo.toLowerCase() + ' foi removida.');
        }, 'Remover a foto de ' + rotulo.toLowerCase()),
      ]),
    );
    return area;
  }

  function moverFoto(gerais, indice, passo) {
    var ids = gerais.map(function (f) {
      return f.id;
    });
    var destino = indice + passo;
    var movido = ids.splice(indice, 1)[0];
    ids.splice(destino, 0, movido);
    fotosOcupadas(true);
    API.ordenarFotosTrabalho(emEdicao.id, ids)
      .then(function (salvo) {
        emEdicao = salvo;
        fotosOcupadas(false);
        desenharFotos();
        avisar('Ordem das fotos salva.');
        // Mantém o foco no mesmo botão da foto movida, agora na nova posição.
        var alvo = document.querySelector('[data-foto="' + movido + '"] [data-mover="' + (passo < 0 ? 'cima' : 'baixo') + '"]');
        (alvo && !alvo.disabled ? alvo : document.querySelector('[data-foto="' + movido + '"] input')).focus();
        carregar();
      })
      .catch(function (erro) {
        falhou(erro, alerta);
        fotosOcupadas(false);
      });
  }

  function itemGeral(fotoGeral, indice, gerais) {
    var legenda = el('input', {
      classe: 'foto-extra__legenda',
      atributos: {
        type: 'text',
        value: fotoGeral.legenda,
        maxlength: '140',
        placeholder: 'Legenda (opcional)',
        'aria-label': 'Legenda da foto ' + (indice + 1),
      },
    });
    legenda.addEventListener('change', function () {
      API.editarFotoTrabalho(emEdicao.id, fotoGeral.id, { legenda: legenda.value })
        .then(function (salvo) {
          emEdicao = salvo;
          avisar('Legenda salva.');
        })
        .catch(function (erro) {
          falhou(erro, alerta);
        });
    });

    var subir = botao('↑', 'botao-icone', function () {
      moverFoto(gerais, indice, -1);
    }, 'Mover a foto ' + (indice + 1) + ' para antes');
    subir.dataset.mover = 'cima';
    subir.disabled = indice === 0;
    var descer = botao('↓', 'botao-icone', function () {
      moverFoto(gerais, indice, 1);
    }, 'Mover a foto ' + (indice + 1) + ' para depois');
    descer.dataset.mover = 'baixo';
    descer.disabled = indice === gerais.length - 1;

    return el('li', { classe: 'foto-extra', atributos: { 'data-foto': String(fotoGeral.id) } }, [
      foto(fotoGeral.url, fotoGeral.legenda || 'Foto ' + (indice + 1), 'foto-extra__imagem'),
      legenda,
      el('div', { classe: 'foto-extra__acoes' }, [
        subir,
        descer,
        botao('Remover', 'botao-texto botao-texto--perigo', function () {
          removerFoto(fotoGeral, 'Foto removida.');
        }, 'Remover a foto ' + (indice + 1)),
      ]),
    ]);
  }

  function desenharFotos() {
    var area = document.getElementById('trabalho-fotos');
    if (!emEdicao) {
      area.replaceChildren(el('p', { classe: 'lugar__vazio', texto: 'Crie o trabalho para enviar as fotos.' }));
      return;
    }
    var gerais = fotosDoTipo(emEdicao, 'GERAL');
    var adicionar = botao('Adicionar fotos', 'botao botao--contorno botao--pequeno', function () {
      escolherFoto('GERAL');
    });
    adicionar.disabled = gerais.length >= MAXIMO_FOTOS_GERAIS;

    area.replaceChildren(
      el('div', { classe: 'par-campos' }, [campoUnico('ANTES', 'Antes'), campoUnico('DEPOIS', 'Depois')]),
      el('p', { classe: 'campo__ajuda', texto: 'Com as duas, o trabalho pode abrir o site no comparador antes/depois.' }),
      el('div', { classe: 'fotos-extras-topo' }, [
        el('p', { classe: 'campo-foto__rotulo', texto: 'Mais fotos (' + gerais.length + ' de ' + MAXIMO_FOTOS_GERAIS + ')' }),
        adicionar,
      ]),
      gerais.length
        ? el('ol', { classe: 'fotos-extras-lista' }, gerais.map(itemGeral))
        : el('p', { classe: 'campo__ajuda', texto: 'Detalhes, interior, rodas: aparecem abaixo do comparador na página do trabalho.' }),
    );
  }

  function fotosOcupadas(ocupadas, texto) {
    var area = document.getElementById('trabalho-fotos');
    area.setAttribute('aria-busy', String(ocupadas));
    if (ocupadas) {
      document.getElementById('trabalho-fotos-status').textContent = texto || 'Salvando as fotos…';
    }
  }

  arquivo.addEventListener('change', function () {
    var escolhidos = Array.prototype.slice.call(arquivo.files);
    arquivo.value = '';
    if (!escolhidos.length) {
      return;
    }
    var tipo = tipoEscolhido;
    var espaco = MAXIMO_FOTOS_GERAIS - fotosDoTipo(emEdicao, 'GERAL').length;
    if (tipo === 'GERAL' && escolhidos.length > espaco) {
      alerta.textContent = 'Cabem só mais ' + espaco + ' fotos neste trabalho. As primeiras ' + espaco + ' serão enviadas.';
      escolhidos = escolhidos.slice(0, espaco);
    } else {
      alerta.textContent = '';
    }

    // Uma de cada vez, na ordem escolhida.
    var enviadas = 0;
    var corrente = Promise.resolve();
    escolhidos.forEach(function (escolhido, i) {
      corrente = corrente.then(function () {
        fotosOcupadas(true, escolhidos.length > 1 ? 'Enviando a foto ' + (i + 1) + ' de ' + escolhidos.length + '…' : 'Enviando a foto…');
        return Imagem.preparar(escolhido)
          .then(function (blob) {
            return API.enviarFotoTrabalho(emEdicao.id, blob, tipo);
          })
          .then(function (salvo) {
            emEdicao = salvo;
            enviadas += 1;
          });
      });
    });
    corrente
      .catch(function (erro) {
        falhou(erro, alerta);
      })
      .then(function () {
        fotosOcupadas(false);
        desenharFotos();
        atualizarLugares();
        if (enviadas) {
          avisar(enviadas === 1 ? 'Foto enviada.' : enviadas + ' fotos enviadas.');
        }
        carregar();
      });
  });

  function removerFoto(fotoRemovida, mensagem) {
    fotosOcupadas(true, 'Removendo a foto…');
    API.removerFotoTrabalho(emEdicao.id, fotoRemovida.id)
      .then(function (salvo) {
        emEdicao = salvo;
        avisar(mensagem);
        carregar();
      })
      .catch(function (erro) {
        falhou(erro, alerta);
      })
      .then(function () {
        fotosOcupadas(false);
        desenharFotos();
        atualizarLugares();
      });
  }

  /* Abrir, salvar e excluir ------------------------------------------------ */

  function abrir(trabalho) {
    emEdicao = trabalho;
    formulario.reset();
    alerta.textContent = '';
    document.getElementById('trabalho-fotos-status').textContent = '';
    document.getElementById('trabalho-titulo-erro').textContent = '';
    document.getElementById('trabalho-titulo').removeAttribute('aria-invalid');

    document.getElementById('editor-titulo').textContent = trabalho ? 'Editar trabalho' : 'Novo trabalho';
    botaoSalvar.textContent = trabalho ? 'Salvar alterações' : 'Criar e enviar fotos';
    botaoExcluir.hidden = !trabalho;

    document.getElementById('trabalho-titulo').value = trabalho ? trabalho.titulo : '';
    document.getElementById('trabalho-descricao').value = trabalho ? trabalho.descricao : '';
    document.getElementById('trabalho-data').value = trabalho && trabalho.dataRealizacao ? trabalho.dataRealizacao : '';
    desenharServicos(trabalho ? trabalho.servicoId : null);
    campoPublicado.checked = trabalho ? trabalho.publicado : false;
    campoDestaque.checked = trabalho ? trabalho.emDestaque : false;
    campoCapa.checked = trabalho ? trabalho.naCapa : false;

    desenharFotos();
    atualizarLugares();
    if (!dialogo.open) {
      dialogo.showModal();
    }
    document.getElementById('trabalho-titulo').focus();
  }

  formulario.addEventListener('submit', function (evento) {
    evento.preventDefault();
    if (botaoSalvar.getAttribute('aria-busy') === 'true') {
      return;
    }
    alerta.textContent = '';
    var titulo = document.getElementById('trabalho-titulo').value.trim();
    if (titulo.length < 3) {
      document.getElementById('trabalho-titulo-erro').textContent = 'Informe um título com pelo menos 3 letras.';
      document.getElementById('trabalho-titulo').setAttribute('aria-invalid', 'true');
      document.getElementById('trabalho-titulo').focus();
      return;
    }

    var servico = document.getElementById('trabalho-servico').value;
    var dados = {
      titulo: titulo,
      descricao: document.getElementById('trabalho-descricao').value.trim(),
      servicoId: servico ? Number(servico) : null,
      dataRealizacao: document.getElementById('trabalho-data').value || null,
      publicado: campoPublicado.checked,
      emDestaque: campoDestaque.checked,
    };
    if (emEdicao && campoCapa.checked !== emEdicao.naCapa) {
      dados.naCapa = campoCapa.checked;
    }

    var texto = botaoSalvar.textContent;
    botaoSalvar.setAttribute('aria-busy', 'true');
    botaoSalvar.textContent = 'Salvando…';
    var novo = !emEdicao;

    (novo ? API.criarTrabalho(dados) : API.editarTrabalho(emEdicao.id, dados))
      .then(function (salvo) {
        if (novo) {
          // Continua aberto, agora com os campos de foto.
          Aviso.mostrar(salvo.titulo + ' foi criado. Agora envie as fotos.');
          abrir(salvo);
          document.getElementById('trabalho-fotos').querySelector('button').focus();
        } else {
          dialogo.close();
          Aviso.mostrar('Alterações de ' + salvo.titulo + ' salvas.');
        }
        return carregar();
      })
      .catch(function (erro) {
        falhou(erro, alerta);
      })
      .then(function () {
        botaoSalvar.removeAttribute('aria-busy');
        botaoSalvar.textContent = emEdicao ? 'Salvar alterações' : texto;
      });
  });

  var dialogoExcluir = document.getElementById('dialogo-excluir');
  botaoExcluir.addEventListener('click', function () {
    document.getElementById('excluir-titulo').textContent = 'Excluir ' + emEdicao.titulo + '?';
    document.getElementById('alerta-excluir').textContent = '';
    dialogoExcluir.showModal();
  });

  document.getElementById('excluir-confirmar').addEventListener('click', function (evento) {
    var confirmar = evento.currentTarget;
    var titulo = emEdicao.titulo;
    confirmar.setAttribute('aria-busy', 'true');
    API.excluirTrabalho(emEdicao.id)
      .then(function () {
        dialogoExcluir.close();
        dialogo.close();
        emEdicao = null;
        Aviso.mostrar(titulo + ' foi excluído, com as fotos.');
        return carregar();
      })
      .catch(function (erro) {
        falhou(erro, document.getElementById('alerta-excluir'));
      })
      .then(function () {
        confirmar.removeAttribute('aria-busy');
      });
  });

  document.getElementById('trabalho-novo').addEventListener('click', function () {
    abrir(null);
  });

  document.querySelectorAll('[data-fechar]').forEach(function (b) {
    b.addEventListener('click', function () {
      b.closest('dialog').close();
    });
  });

  carregar();
})();
