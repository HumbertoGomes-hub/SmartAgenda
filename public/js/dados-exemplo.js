/*
 * Dados de exemplo compartilhados entre o site e o painel, usados só enquanto
 * as páginas não falam com o servidor de verdade.
 *
 * Ficam no localStorage do navegador: o que o painel muda em Serviços e
 * Portfólio aparece no site. Caminhos de imagem são relativos à pasta public/
 * (o painel, em public/admin/, acrescenta "../"); fotos enviadas pelo painel
 * ficam como data: URL.
 *
 * Para voltar aos exemplos, rode no console: SmartAgendaDadosExemplo.reiniciar()
 */
(function () {
  'use strict';

  var CHAVE = 'smartagenda:dados-exemplo-v1';

  var SERVICOS = [
    { id: 1, nome: 'Lavagem detalhada', categoria: 'Lavagem', descricao: 'Carroceria, rodas, frisos, vidros e caixas de roda limpos um a um.', precoBase: 80, duracaoMinutos: 60, ativo: true, fotoUrl: '' },
    { id: 2, nome: 'Higienização interna', categoria: 'Lavagem', descricao: 'Bancos, carpetes, teto e painel limpos e sem odor.', precoBase: 180, duracaoMinutos: 150, ativo: true, fotoUrl: '' },
    { id: 3, nome: 'Polimento comercial', categoria: 'Polimento', descricao: 'Devolve o brilho e disfarça riscos leves da pintura.', precoBase: 250, duracaoMinutos: 180, ativo: true, fotoUrl: '' },
    { id: 4, nome: 'Polimento técnico', categoria: 'Polimento', descricao: 'Remove riscos e marcas de lavagem, em duas ou mais etapas.', precoBase: 450, duracaoMinutos: 300, ativo: true, fotoUrl: 'img/exemplo/seda-detalhe.svg' },
    { id: 5, nome: 'Vitrificação de pintura', categoria: 'Proteção', descricao: 'Camada que protege a pintura e facilita a limpeza por até dois anos.', precoBase: 900, duracaoMinutos: 480, ativo: true, fotoUrl: '' },
    { id: 6, nome: 'Cristalização de vidros', categoria: 'Proteção', descricao: 'A água escorre do para-brisa e a visão melhora na chuva.', precoBase: 120, duracaoMinutos: 60, ativo: true, fotoUrl: '' },
  ];

  function foto(id, nome, tipo, legenda, ordem) {
    return { id: id, url: 'img/exemplo/' + nome + '.svg', tipo: tipo, legenda: legenda || '', ordem: ordem || 0 };
  }

  var TRABALHOS = [
    {
      id: 1, titulo: 'Polimento técnico em sedã preto', servicoId: 4, dataRealizacao: '2026-10-15',
      descricao: 'Pintura com riscos de lavagem e perda de brilho. Fizemos descontaminação, polimento em duas etapas e aplicamos selante.',
      publicado: true, naCapa: true, emDestaque: false,
      fotos: [foto(1, 'seda-antes', 'ANTES'), foto(2, 'seda-depois', 'DEPOIS'), foto(3, 'seda-detalhe', 'GERAL', 'Detalhe da roda dianteira')],
    },
    {
      id: 2, titulo: 'Vitrificação em SUV de família', servicoId: 5, dataRealizacao: '2026-09-20',
      descricao: 'Carro zero que vai rodar em estrada de terra. A vitrificação protege a pintura e facilita a limpeza por até dois anos.',
      publicado: true, naCapa: false, emDestaque: true,
      fotos: [foto(4, 'suv-antes', 'ANTES'), foto(5, 'suv-depois', 'DEPOIS'), foto(6, 'suv-detalhe', 'GERAL', 'Detalhe da roda')],
    },
    {
      id: 3, titulo: 'Lavagem detalhada em hatch de uso diário', servicoId: 1, dataRealizacao: '2026-09-08',
      descricao: 'Rodas, frisos, vidros e caixas de roda limpos um a um, com produtos neutros que não agridem a pintura.',
      publicado: true, naCapa: false, emDestaque: true,
      fotos: [foto(7, 'hatch-antes', 'ANTES'), foto(8, 'hatch-depois', 'DEPOIS')],
    },
    {
      id: 4, titulo: 'Polimento comercial em sedã de frota', servicoId: 3, dataRealizacao: '2026-08-12',
      descricao: 'Correção leve para devolver o brilho da pintura e deixar o carro pronto para a revenda em uma tarde.',
      publicado: true, naCapa: false, emDestaque: false,
      fotos: [foto(9, 'seda-depois', 'GERAL', 'Lateral finalizada')],
    },
  ];

  function exemplos() {
    return JSON.parse(JSON.stringify({ servicos: SERVICOS, trabalhos: TRABALHOS }));
  }

  function ler() {
    try {
      var dados = JSON.parse(localStorage.getItem(CHAVE));
      if (dados && Array.isArray(dados.servicos) && Array.isArray(dados.trabalhos)) {
        return dados;
      }
    } catch (erro) {
      // Sem armazenamento ou dado estragado: volta aos exemplos.
    }
    var novos = exemplos();
    gravar(novos);
    return novos;
  }

  // false quando o navegador não guardou (sem espaço ou bloqueado).
  function gravar(dados) {
    try {
      localStorage.setItem(CHAVE, JSON.stringify(dados));
      return true;
    } catch (erro) {
      return false;
    }
  }

  function proximoId(lista) {
    return lista.reduce(function (maior, item) {
      return Math.max(maior, item.id);
    }, 0) + 1;
  }

  // Trabalho no formato das rotas: com o serviço relacionado e as fotos em ordem.
  function trabalhoCompleto(trabalho, servicos) {
    var ordemDoTipo = { ANTES: 0, DEPOIS: 1, GERAL: 2 };
    var servico = servicos.filter(function (s) {
      return s.id === trabalho.servicoId;
    })[0];
    var resultado = JSON.parse(JSON.stringify(trabalho));
    resultado.servico = servico ? { id: servico.id, nome: servico.nome } : null;
    resultado.fotos.sort(function (a, b) {
      return ordemDoTipo[a.tipo] - ordemDoTipo[b.tipo] || a.ordem - b.ordem || a.id - b.id;
    });
    return resultado;
  }

  window.SmartAgendaDadosExemplo = {
    ler: ler,
    gravar: gravar,
    proximoId: proximoId,
    trabalhoCompleto: trabalhoCompleto,
    reiniciar: function () {
      try {
        localStorage.removeItem(CHAVE);
      } catch (erro) {
        // Nada a apagar.
      }
    },
  };
})();
