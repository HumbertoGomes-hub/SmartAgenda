/*
 * Monta o conteúdo do site a partir dos dados (RF-01 a RF-03): serviços
 * ativos e trabalhos publicados, como o painel deixou.
 *
 * Regra de todo o site: o que não tem foto não reserva espaço. Serviço sem
 * foto é só texto; trabalho sem foto vira um cartão de texto; sem capa, a
 * abertura fica só com o nome e a descrição.
 *
 * Enquanto o painel não tem nenhum trabalho publicado, o site mostra os
 * trabalhos de exemplo de js/exemplos.js, com o selo "Exemplo".
 *
 * Cada página diz o que montar em <body data-pagina="...">.
 */
(function () {
  'use strict';

  var API = window.SmartAgendaAPI;
  var Site = window.SmartAgendaSite;
  var formatar = Site.formatar;
  var Exemplos = window.SmartAgendaExemplos;

  var ICONE_ALCA =
    '<svg width="22" height="22" viewBox="0 0 22 22" fill="none" aria-hidden="true"><path d="M8.5 6 3.5 11l5 5M13.5 6l5 5-5 5" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg>';

  /* Peças ----------------------------------------------------------------- */

  function el(tag, classe, texto) {
    var no = document.createElement(tag);
    if (classe) {
      no.className = classe;
    }
    if (texto !== undefined && texto !== null) {
      no.textContent = texto;
    }
    return no;
  }

  // "outubro de 2026"
  function mesAno(data) {
    if (!data) {
      return '';
    }
    var partes = data.split('-').map(Number);
    return new Date(partes[0], partes[1] - 1, 1).toLocaleDateString('pt-BR', { month: 'long', year: 'numeric' });
  }

  function imagem(url, alternativo, classe) {
    var img = el('img', classe);
    img.src = url;
    img.alt = alternativo;
    img.decoding = 'async';
    return img;
  }

  // Título com o selo "Exemplo" quando o item é de exemplo.
  function titulo(tag, item, texto) {
    var no = el(tag, '', texto);
    if (item.exemplo) {
      no.append(' ', el('span', 'selo-exemplo', 'Exemplo'));
    }
    return no;
  }

  // Lista do painel ou, se estiver vazia, os exemplos.
  function ouExemplos(lista, exemplos) {
    return lista.length ? lista : exemplos();
  }

  function fotoDoTipo(trabalho, tipo) {
    return trabalho.fotos.filter(function (f) {
      return f.tipo === tipo;
    })[0];
  }

  // Foto que representa o trabalho num cartão: o resultado, se houver.
  function fotoPrincipal(trabalho) {
    return fotoDoTipo(trabalho, 'DEPOIS') || fotoDoTipo(trabalho, 'GERAL') || fotoDoTipo(trabalho, 'ANTES');
  }

  function textoAlternativo(trabalho, foto) {
    if (foto.legenda) {
      return foto.legenda;
    }
    var momento = { ANTES: 'antes do serviço', DEPOIS: 'depois do serviço' }[foto.tipo];
    return trabalho.titulo + (momento ? ', ' + momento : '');
  }

  function meta(trabalho) {
    return [trabalho.servico ? trabalho.servico.nome : '', mesAno(trabalho.dataRealizacao)].filter(Boolean).join(', ');
  }

  /* Comparador antes/depois ----------------------------------------------- */

  function comparador(trabalho, apresentar) {
    var antes = fotoDoTipo(trabalho, 'ANTES');
    var depois = fotoDoTipo(trabalho, 'DEPOIS');
    var caixa = el('div', 'comparador');
    if (apresentar) {
      caixa.dataset.apresentar = 'true';
    }
    var camadaDepois = imagem(depois.url, textoAlternativo(trabalho, depois), 'comparador__camada comparador__camada--depois');
    var camadaAntes = imagem(antes.url, textoAlternativo(trabalho, antes), 'comparador__camada comparador__camada--antes');
    if (apresentar) {
      camadaDepois.fetchPriority = 'high';
      camadaAntes.fetchPriority = 'high';
    }
    var divisor = el('div', 'comparador__divisor');
    var alca = el('span', 'comparador__alca');
    alca.innerHTML = ICONE_ALCA; // ícone fixo, sem dado do usuário
    divisor.append(alca);
    var controle = el('input', 'comparador__controle');
    controle.type = 'range';
    controle.min = '0';
    controle.max = '100';
    controle.value = '58';
    controle.setAttribute('aria-label', 'Arraste para comparar o carro antes e depois do serviço');

    caixa.append(
      camadaDepois,
      camadaAntes,
      el('span', 'comparador__rotulo comparador__rotulo--antes', 'Antes'),
      el('span', 'comparador__rotulo comparador__rotulo--depois', 'Depois'),
      divisor,
      controle,
    );
    return caixa;
  }

  function temComparador(trabalho) {
    return Boolean(fotoDoTipo(trabalho, 'ANTES') && fotoDoTipo(trabalho, 'DEPOIS'));
  }

  /* Serviços -------------------------------------------------------------- */

  function linhaServico(servico) {
    var artigo = el('article', 'servico');
    if (servico.fotoUrl) {
      artigo.classList.add('servico--com-foto');
      var foto = imagem(servico.fotoUrl, servico.nome, 'servico__foto');
      foto.loading = 'lazy';
      artigo.append(foto);
    }
    var texto = el('div', 'servico__texto');
    texto.append(titulo('h3', servico, servico.nome));
    if (servico.descricao) {
      texto.append(el('p', '', servico.descricao));
    }
    var preco = el('p', 'servico__preco');
    preco.append(el('small', '', 'a partir de'), ' ', el('strong', '', formatar.preco(servico.precoBase)));
    var agendar = el('a', 'botao botao--contorno', 'Agendar');
    agendar.href = 'agendar.html?servico=' + servico.id;
    agendar.setAttribute('aria-label', 'Agendar ' + servico.nome);

    artigo.append(texto, el('span', 'etiqueta', formatar.duracao(servico.duracaoMinutos)), preco, agendar);
    var item = el('li');
    item.append(artigo);
    return item;
  }

  function listaDeServicos(servicos) {
    var lista = el('ul', 'servicos-lista');
    servicos.forEach(function (s) {
      lista.append(linhaServico(s));
    });
    return lista;
  }

  /* Trabalhos ------------------------------------------------------------- */

  function cartaoTrabalho(trabalho) {
    var link = el('a', 'trabalho');
    link.href = 'trabalho.html?id=' + trabalho.id;
    var foto = fotoPrincipal(trabalho);
    var cabecalho = titulo('h3', trabalho, trabalho.titulo);
    var texto = meta(trabalho);
    var linhaMeta = texto ? el('p', 'trabalho__meta', maiuscula(texto)) : null;

    if (foto) {
      var quadro = el('div', 'trabalho__foto');
      var img = imagem(foto.url, textoAlternativo(trabalho, foto));
      img.loading = 'lazy';
      quadro.append(img);
      link.append(quadro, cabecalho);
    } else {
      // Sem foto: o cartão é só texto, sem quadro vazio.
      link.classList.add('trabalho--sem-foto');
      link.append(cabecalho);
      if (trabalho.descricao) {
        link.append(el('p', 'trabalho__resumo', trabalho.descricao));
      }
    }
    if (linhaMeta) {
      link.append(linhaMeta);
    }
    var item = el('li');
    item.append(link);
    return item;
  }

  function maiuscula(texto) {
    return texto.charAt(0).toUpperCase() + texto.slice(1);
  }

  function galeria(trabalhos) {
    var lista = el('ul', 'galeria');
    trabalhos.forEach(function (t) {
      lista.append(cartaoTrabalho(t));
    });
    return lista;
  }

  function pronto(area) {
    area.removeAttribute('aria-busy');
  }

  function avisoDeFalha(area, texto) {
    area.replaceChildren(el('p', 'aviso-vitrine', texto));
    pronto(area);
  }

  /* Páginas --------------------------------------------------------------- */

  function paginaInicio() {
    var capa = document.getElementById('capa');
    var areaServicos = document.getElementById('servicos-inicio');
    var secaoDestaques = document.getElementById('secao-destaques');

    API.servicos()
      .then(function (r) {
        if (!r.servicos.length) {
          // Sem serviço cadastrado, a seção inteira some (sem título solto).
          areaServicos.closest('section').hidden = true;
          return;
        }
        areaServicos.replaceChildren(listaDeServicos(r.servicos.slice(0, 3)));
        pronto(areaServicos);
      })
      .catch(function () {
        avisoDeFalha(areaServicos, 'Não foi possível carregar os serviços agora.');
      });

    API.portfolio().then(function (r) {
      var trabalhos = ouExemplos(r.trabalhos, Exemplos.trabalhos);
      var naCapa = trabalhos.filter(function (t) {
        return t.naCapa && temComparador(t);
      })[0];
      if (naCapa) {
        var legenda = el('figcaption', 'comparador__legenda');
        var verTrabalho = el('a', 'ligacao', (naCapa.exemplo ? 'Exemplo: ' : '') + naCapa.titulo);
        verTrabalho.href = 'trabalho.html?id=' + naCapa.id;
        var verMais = el('a', 'ligacao', 'Ver mais trabalhos');
        verMais.href = 'portfolio.html';
        legenda.append(verTrabalho, verMais);
        var figura = comparador(naCapa, true);
        document.getElementById('capa-comparador').replaceChildren(figura, legenda);
        capa.hidden = false;
        Site.iniciarComparador(figura);
      }

      var destaques = trabalhos.filter(function (t) {
        return t.emDestaque;
      });
      if (destaques.length) {
        document.getElementById('galeria-inicio').replaceChildren(galeria(destaques));
        secaoDestaques.hidden = false;
      }
    });
  }

  function paginaServicos() {
    var area = document.getElementById('catalogo');
    API.servicos()
      .then(function (r) {
        if (!r.servicos.length) {
          avisoDeFalha(area, 'Os serviços da estética aparecem aqui em breve.');
          return;
        }
        var servicos = r.servicos;
        var categorias = [];
        servicos.forEach(function (s) {
          if (categorias.indexOf(s.categoria) === -1) {
            categorias.push(s.categoria);
          }
        });
        area.replaceChildren.apply(
          area,
          categorias.map(function (categoria) {
            var secao = el('section', 'categoria');
            secao.append(
              el('h2', '', categoria),
              listaDeServicos(
                servicos.filter(function (s) {
                  return s.categoria === categoria;
                }),
              ),
            );
            return secao;
          }),
        );
        pronto(area);
      })
      .catch(function () {
        avisoDeFalha(area, 'Não foi possível carregar os serviços agora. Tente de novo em instantes.');
      });
  }

  function paginaPortfolio() {
    var area = document.getElementById('galeria-portfolio');
    API.portfolio()
      .then(function (r) {
        area.replaceChildren(galeria(ouExemplos(r.trabalhos, Exemplos.trabalhos)));
        pronto(area);
      })
      .catch(function () {
        avisoDeFalha(area, 'Não foi possível carregar o portfólio agora. Tente de novo em instantes.');
      });
  }

  function paginaTrabalho() {
    var id = new URLSearchParams(location.search).get('id');
    var area = document.getElementById('obra');

    var busca = Exemplos.ehExemplo(id)
      ? new Promise(function (resolver, falhar) {
        var exemplo = Exemplos.trabalho(id);
        return exemplo ? resolver(exemplo) : falhar(new Error('não encontrado'));
      })
      : API.trabalho(id);

    busca
      .then(function (t) {
        Site.definirTitulo(t.titulo);
        var cabecalho = document.getElementById('trabalho-titulo');
        cabecalho.replaceChildren.apply(cabecalho, Array.prototype.slice.call(titulo('h1', t, t.titulo).childNodes));

        var visual = el('div', 'obra__visual');
        var extras = t.fotos.filter(function (f) {
          return f.tipo === 'GERAL';
        });
        if (temComparador(t)) {
          var figura = comparador(t, false);
          visual.append(figura);
          Site.iniciarComparador(figura);
        } else {
          // Sem o par antes/depois, a primeira foto que houver vira a principal.
          var principal = fotoPrincipal(t);
          if (principal) {
            visual.append(imagem(principal.url, textoAlternativo(t, principal), 'obra__principal'));
            extras = extras.filter(function (f) {
              return f !== principal;
            });
          }
        }
        if (extras.length) {
          var grade = el('div', 'fotos-extras');
          extras.forEach(function (f) {
            var figura = el('figure');
            var img = imagem(f.url, textoAlternativo(t, f));
            img.loading = 'lazy';
            figura.append(img);
            if (f.legenda) {
              figura.append(el('figcaption', '', f.legenda));
            }
            grade.append(figura);
          });
          visual.append(grade);
        }

        var texto = el('div', 'obra__texto');
        if (t.descricao) {
          texto.append(el('p', '', t.descricao));
        }
        var ficha = el('dl');
        if (t.servico) {
          var linhaServicoTexto = el('div');
          linhaServicoTexto.append(el('dt', '', 'Serviço'), el('dd', '', t.servico.nome));
          ficha.append(linhaServicoTexto);
        }
        if (t.dataRealizacao) {
          var linhaData = el('div');
          linhaData.append(el('dt', '', 'Realizado em'), el('dd', '', maiuscula(mesAno(t.dataRealizacao))));
          ficha.append(linhaData);
        }
        if (ficha.children.length) {
          texto.append(ficha);
        }
        var agendar = el('a', 'botao', t.servico ? 'Agendar este serviço' : 'Agendar horário');
        agendar.href = 'agendar.html' + (t.servico && !t.exemplo ? '?servico=' + t.servico.id : '');
        texto.append(agendar);

        // Sem nenhuma foto, o texto ocupa a largura toda.
        if (!visual.children.length) {
          area.classList.add('obra--sem-foto');
          area.replaceChildren(texto);
        } else {
          area.replaceChildren(visual, texto);
        }
        pronto(area);
      })
      .catch(function () {
        document.getElementById('trabalho-titulo').textContent = 'Trabalho não encontrado';
        var aviso = el('p', 'aviso-vitrine', 'Este trabalho saiu do portfólio ou o endereço está incompleto. ');
        var link = el('a', 'ligacao', 'Ver o portfólio');
        link.href = 'portfolio.html';
        aviso.append(link);
        area.replaceChildren(aviso);
        pronto(area);
      });
  }

  var PAGINAS = {
    inicio: paginaInicio,
    servicos: paginaServicos,
    portfolio: paginaPortfolio,
    trabalho: paginaTrabalho,
  };
  var pagina = PAGINAS[document.body.dataset.pagina];
  if (pagina) {
    pagina();
  }
})();
