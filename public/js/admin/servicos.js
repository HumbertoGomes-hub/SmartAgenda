/*
 * Serviços (RF-20): cadastrar, editar, ativar e desativar, com foto opcional.
 *
 * Não existe excluir: desativar tira o serviço do site e do agendamento e
 * mantém o histórico dos pedidos. Sem foto, o serviço aparece só com o texto.
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
  var f = Painel.formatar;
  var el = Painel.el;

  var areaLista = document.getElementById('lista-servicos');
  var areaErro = document.getElementById('erro-servicos');
  var dialogo = document.getElementById('dialogo-servico');
  var formulario = document.getElementById('form-servico');
  var botaoSalvar = document.getElementById('servico-salvar');
  var alerta = document.getElementById('alerta-servico');
  var areaFoto = document.getElementById('servico-foto');
  var arquivo = document.getElementById('servico-arquivo');
  var campoDuracao = document.getElementById('servico-duracao');

  var servicos = [];
  var emEdicao = null; // serviço aberto no formulário; null = novo
  var fotoPendente = null; // foto escolhida para um serviço novo, enviada depois de criar

  /* Lista ----------------------------------------------------------------- */

  function porCategoria(lista) {
    var grupos = [];
    lista.forEach(function (s) {
      var grupo = grupos.filter(function (g) {
        return g.categoria === s.categoria;
      })[0];
      if (!grupo) {
        grupo = { categoria: s.categoria, itens: [] };
        grupos.push(grupo);
      }
      grupo.itens.push(s);
    });
    return grupos;
  }

  function miniatura(url, alternativo, classe) {
    var img = el('img', { classe: classe, atributos: { src: Imagem.urlDaFoto(url), alt: alternativo, loading: 'lazy' } });
    if (Imagem.ehIlustracao(url)) {
      img.classList.add('ilustracao');
    }
    return img;
  }

  function item(servico) {
    var titulo = el('h3', { classe: 'item-servico__nome', texto: servico.nome });
    if (!servico.ativo) {
      titulo.append(el('span', { classe: 'selo selo--apagado', texto: 'Desativado' }));
    }
    var texto = el('div', { classe: 'item-servico__texto' }, [
      titulo,
      servico.descricao ? el('p', { classe: 'item-servico__descricao', texto: servico.descricao }) : null,
      el('p', {
        classe: 'item-servico__dados',
        texto: f.duracao(servico.duracaoMinutos) + ', a partir de ' + f.preco(servico.precoBase),
      }),
    ]);

    var editar = el('button', {
      classe: 'botao botao--contorno botao--pequeno',
      texto: 'Editar',
      atributos: { type: 'button', 'aria-label': 'Editar ' + servico.nome },
    });
    editar.addEventListener('click', function () {
      abrir(servico);
    });
    var alternar = el('button', {
      classe: 'botao-texto',
      texto: servico.ativo ? 'Desativar' : 'Ativar',
      atributos: { type: 'button', 'aria-label': (servico.ativo ? 'Desativar ' : 'Ativar ') + servico.nome },
    });
    alternar.addEventListener('click', function () {
      mudarAtivo(servico, !servico.ativo, alternar);
    });

    var linha = el('li', { classe: 'item-servico', atributos: servico.ativo ? {} : { 'data-inativo': 'true' } }, [
      servico.fotoUrl ? miniatura(servico.fotoUrl, servico.nome, 'item-servico__foto') : null,
      texto,
      el('div', { classe: 'item-servico__acoes' }, [editar, alternar]),
    ]);
    if (servico.fotoUrl) {
      linha.classList.add('item-servico--com-foto');
    }
    return linha;
  }

  function desenhar() {
    if (!servicos.length) {
      areaLista.replaceChildren(el('p', { classe: 'vazio', texto: 'Nenhum serviço cadastrado. Comece pelo botão "Novo serviço".' }));
      return;
    }
    areaLista.replaceChildren.apply(
      areaLista,
      porCategoria(servicos).map(function (grupo) {
        return el('section', { classe: 'bloco grupo-servicos' }, [
          el('h2', { classe: 'grupo-servicos__titulo', texto: grupo.categoria }),
          el('ul', { classe: 'itens-catalogo' }, grupo.itens.map(item)),
        ]);
      }),
    );
    // Categorias já usadas viram sugestões no formulário.
    var sugestoes = document.getElementById('categorias');
    sugestoes.replaceChildren.apply(
      sugestoes,
      porCategoria(servicos).map(function (g) {
        return el('option', { atributos: { value: g.categoria } });
      }),
    );
  }

  function carregar() {
    return API.servicosPainel()
      .then(function (r) {
        servicos = r.servicos;
        areaErro.textContent = '';
        desenhar();
      })
      .catch(function (erro) {
        areaErro.textContent = erro.message || 'Não foi possível carregar os serviços. Recarregue a página.';
      })
      .then(function () {
        areaLista.removeAttribute('aria-busy');
      });
  }

  function mudarAtivo(servico, ativo, botao) {
    botao.setAttribute('aria-busy', 'true');
    API.editarServico(servico.id, { ativo: ativo })
      .then(function () {
        var desfazer = el('button', { classe: 'aviso-acao__fechar', texto: 'Desfazer', atributos: { type: 'button' } });
        desfazer.addEventListener('click', function () {
          Aviso.esconder();
          API.editarServico(servico.id, { ativo: !ativo }).then(carregar);
        });
        Aviso.mostrar(
          ativo
            ? servico.nome + ' voltou para o site e para o agendamento.'
            : servico.nome + ' foi desativado. Saiu do site e do agendamento; o histórico continua.',
          desfazer,
        );
        return carregar();
      })
      .catch(function (erro) {
        botao.removeAttribute('aria-busy');
        areaErro.textContent = erro.message;
      });
  }

  /* Formulário ------------------------------------------------------------ */

  // Durações de 15 em 15 minutos até 8h, mais 10h e 12h.
  function opcoesDeDuracao(atual) {
    var valores = [];
    for (var m = 15; m <= 480; m += 15) {
      valores.push(m);
    }
    valores.push(600, 720);
    if (atual && valores.indexOf(atual) === -1) {
      valores.push(atual);
      valores.sort(function (a, b) {
        return a - b;
      });
    }
    campoDuracao.replaceChildren.apply(
      campoDuracao,
      valores.map(function (m) {
        return el('option', { texto: f.duracao(m), atributos: { value: String(m) } });
      }),
    );
  }

  // Aceita "450", "450,50", "1.250,00" e "R$ 80".
  function lerPreco(texto) {
    var limpo = String(texto).replace(/R\$|\s/g, '');
    if (limpo.indexOf(',') !== -1) {
      limpo = limpo.replace(/\./g, '').replace(',', '.');
    }
    return limpo === '' ? NaN : Number(limpo);
  }

  function precoParaCampo(valor) {
    return valor.toLocaleString('pt-BR', { minimumFractionDigits: valor % 1 ? 2 : 0, maximumFractionDigits: 2 });
  }

  function desenharFoto() {
    var url = fotoPendente ? fotoPendente.url : emEdicao && emEdicao.fotoUrl;
    var escolher = el('button', {
      classe: 'botao botao--contorno botao--pequeno',
      texto: url ? 'Trocar foto' : 'Adicionar foto',
      atributos: { type: 'button' },
    });
    escolher.addEventListener('click', function () {
      arquivo.click();
    });

    if (!url) {
      areaFoto.replaceChildren(el('div', { classe: 'foto-campo__vazio' }, [escolher]));
      return;
    }
    var remover = el('button', { classe: 'botao-texto botao-texto--perigo', texto: 'Remover foto', atributos: { type: 'button' } });
    remover.addEventListener('click', removerFoto);
    areaFoto.replaceChildren(
      el('div', { classe: 'foto-campo__previa' }, [
        miniatura(url, 'Foto do serviço', 'foto-campo__imagem'),
        el('div', { classe: 'foto-campo__acoes' }, [escolher, remover]),
      ]),
    );
  }

  function ocupado(texto) {
    areaFoto.replaceChildren(el('p', { classe: 'foto-campo__enviando', texto: texto, atributos: { role: 'status' } }));
  }

  arquivo.addEventListener('change', function () {
    var escolhido = arquivo.files[0];
    arquivo.value = '';
    if (!escolhido) {
      return;
    }
    alerta.textContent = '';
    ocupado('Preparando a foto…');
    Imagem.preparar(escolhido)
      .then(function (blob) {
        if (!emEdicao) {
          // Serviço novo: a foto vai depois de criar.
          if (fotoPendente) {
            URL.revokeObjectURL(fotoPendente.url);
          }
          fotoPendente = { blob: blob, url: URL.createObjectURL(blob) };
          return null;
        }
        ocupado('Enviando a foto…');
        return API.enviarFotoServico(emEdicao.id, blob).then(function (salvo) {
          emEdicao = salvo;
          carregar();
        });
      })
      .catch(function (erro) {
        alerta.textContent = erro.message || 'Não foi possível enviar a foto. Tente de novo.';
      })
      .then(desenharFoto);
  });

  function removerFoto() {
    if (!emEdicao) {
      URL.revokeObjectURL(fotoPendente.url);
      fotoPendente = null;
      desenharFoto();
      return;
    }
    ocupado('Removendo a foto…');
    API.removerFotoServico(emEdicao.id)
      .then(function (salvo) {
        emEdicao = salvo;
        carregar();
      })
      .catch(function (erro) {
        alerta.textContent = erro.message;
      })
      .then(desenharFoto);
  }

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

  function abrir(servico) {
    emEdicao = servico;
    if (fotoPendente) {
      URL.revokeObjectURL(fotoPendente.url);
    }
    fotoPendente = null;
    formulario.reset();
    alerta.textContent = '';
    ['servico-nome', 'servico-categoria', 'servico-preco'].forEach(function (id) {
      marcar(id, '');
    });

    document.getElementById('servico-titulo').textContent = servico ? 'Editar serviço' : 'Novo serviço';
    botaoSalvar.textContent = servico ? 'Salvar alterações' : 'Criar serviço';
    opcoesDeDuracao(servico ? servico.duracaoMinutos : 60);

    document.getElementById('servico-nome').value = servico ? servico.nome : '';
    document.getElementById('servico-categoria').value = servico ? servico.categoria : '';
    document.getElementById('servico-preco').value = servico ? precoParaCampo(servico.precoBase) : '';
    document.getElementById('servico-descricao').value = servico ? servico.descricao : '';
    document.getElementById('servico-ativo').checked = servico ? servico.ativo : true;
    campoDuracao.value = String(servico ? servico.duracaoMinutos : 60);

    desenharFoto();
    dialogo.showModal();
    document.getElementById('servico-nome').focus();
  }

  formulario.addEventListener('submit', function (evento) {
    evento.preventDefault();
    if (botaoSalvar.getAttribute('aria-busy') === 'true') {
      return;
    }
    alerta.textContent = '';
    var nome = document.getElementById('servico-nome').value.trim();
    var categoria = document.getElementById('servico-categoria').value.trim();
    var preco = lerPreco(document.getElementById('servico-preco').value);

    var ok = [
      marcar('servico-nome', nome.length >= 2 ? '' : 'Informe o nome do serviço.'),
      marcar('servico-categoria', categoria.length >= 2 ? '' : 'Informe a categoria, como Lavagem ou Polimento.'),
      marcar('servico-preco', isFinite(preco) && preco >= 0 ? '' : 'Informe o preço inicial em reais, como 80 ou 120,50.'),
    ];
    if (ok.indexOf(false) !== -1) {
      formulario.querySelector('[aria-invalid="true"]').focus();
      return;
    }

    var dados = {
      nome: nome,
      categoria: categoria,
      precoBase: preco,
      duracaoMinutos: Number(campoDuracao.value),
      descricao: document.getElementById('servico-descricao').value.trim(),
      ativo: document.getElementById('servico-ativo').checked,
    };
    var texto = botaoSalvar.textContent;
    botaoSalvar.setAttribute('aria-busy', 'true');
    botaoSalvar.textContent = 'Salvando…';

    var novo = !emEdicao;
    var salvar = novo ? API.criarServico(dados) : API.editarServico(emEdicao.id, dados);
    salvar
      .then(function (salvo) {
        if (novo && fotoPendente) {
          return API.enviarFotoServico(salvo.id, fotoPendente.blob);
        }
        return salvo;
      })
      .then(function (salvo) {
        dialogo.close();
        Aviso.mostrar(novo ? salvo.nome + ' foi criado.' : 'Alterações de ' + salvo.nome + ' salvas.');
        return carregar();
      })
      .catch(function (erro) {
        alerta.textContent = erro.message || 'Não foi possível salvar. Tente de novo.';
      })
      .then(function () {
        botaoSalvar.removeAttribute('aria-busy');
        botaoSalvar.textContent = texto;
      });
  });

  document.getElementById('servico-novo').addEventListener('click', function () {
    abrir(null);
  });

  document.querySelectorAll('[data-fechar]').forEach(function (botao) {
    botao.addEventListener('click', function () {
      botao.closest('dialog').close();
    });
  });

  carregar();
})();
