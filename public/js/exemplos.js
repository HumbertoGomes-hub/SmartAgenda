/*
 * Conteúdo de exemplo do site: serviços e trabalhos com fotos reais de
 * banco de imagens livre (public/img/fotos/, licença CC0).
 *
 * Só aparece enquanto o painel não tem nada próprio naquela parte. Basta
 * cadastrar o primeiro serviço para os serviços de exemplo sumirem, e o
 * primeiro trabalho publicado para os trabalhos de exemplo sumirem. Os
 * exemplos não vão para o agendamento: lá só entram serviços de verdade.
 *
 * Os ids começam com "exemplo-" para nunca se confundirem com os do banco.
 */
(function () {
  'use strict';

  var SERVICOS = [
    { id: 'exemplo-1', nome: 'Lavagem detalhada', categoria: 'Lavagem', descricao: 'Carroceria, rodas, frisos, vidros e caixas de roda limpos um a um, com espuma de pH neutro.', precoBase: 80, duracaoMinutos: 60, fotoUrl: 'img/fotos/lavagem-espuma.webp' },
    { id: 'exemplo-2', nome: 'Higienização interna', categoria: 'Lavagem', descricao: 'Bancos, carpetes, teto e painel limpos e sem odor.', precoBase: 180, duracaoMinutos: 150, fotoUrl: '' },
    { id: 'exemplo-3', nome: 'Polimento comercial', categoria: 'Polimento', descricao: 'Devolve o brilho e disfarça riscos leves da pintura.', precoBase: 250, duracaoMinutos: 180, fotoUrl: '' },
    { id: 'exemplo-4', nome: 'Polimento técnico', categoria: 'Polimento', descricao: 'Remove riscos e marcas de lavagem em duas ou mais etapas, até a pintura refletir como espelho.', precoBase: 450, duracaoMinutos: 300, fotoUrl: 'img/fotos/reflexo-pintura.webp' },
    { id: 'exemplo-5', nome: 'Vitrificação de pintura', categoria: 'Proteção', descricao: 'Camada que protege a pintura e facilita a limpeza por até dois anos.', precoBase: 900, duracaoMinutos: 480, fotoUrl: 'img/fotos/roda-asfalto.webp' },
    { id: 'exemplo-6', nome: 'Cristalização de vidros', categoria: 'Proteção', descricao: 'A água escorre do para-brisa e a visão melhora na chuva.', precoBase: 120, duracaoMinutos: 60, fotoUrl: '' },
  ];

  function foto(nome, tipo, legenda) {
    return { url: 'img/fotos/' + nome + '.webp', tipo: tipo, legenda: legenda || '' };
  }

  function servico(id) {
    var s = SERVICOS.filter(function (x) {
      return x.id === id;
    })[0];
    return { id: s.id, nome: s.nome };
  }

  var TRABALHOS = [
    {
      id: 'exemplo-1', titulo: 'Polimento técnico em cupê preto', servico: servico('exemplo-4'), dataRealizacao: '2026-10-15',
      descricao: 'Pintura opaca, com marcas de lavagem e poeira impregnada. Fizemos descontaminação, polimento em duas etapas e aplicamos selante.',
      naCapa: true, emDestaque: false,
      fotos: [foto('cupe-estudio-antes', 'ANTES'), foto('cupe-estudio', 'DEPOIS'), foto('cupe-estudio-frente', 'GERAL', 'Frente depois do polimento')],
    },
    {
      id: 'exemplo-2', titulo: 'Vitrificação em sedã executivo', servico: servico('exemplo-5'), dataRealizacao: '2026-09-20',
      descricao: 'Sedã de uso diário que roda em estrada de terra. A vitrificação protege a pintura e facilita a limpeza por até dois anos.',
      naCapa: false, emDestaque: true,
      fotos: [foto('seda-floresta-antes', 'ANTES'), foto('seda-floresta', 'DEPOIS'), foto('roda-asfalto', 'GERAL', 'Rodas também protegidas')],
    },
    {
      id: 'exemplo-3', titulo: 'Lavagem detalhada em sedã preto', servico: servico('exemplo-1'), dataRealizacao: '2026-09-08',
      descricao: 'Rodas, frisos, vidros e caixas de roda limpos um a um, com espuma de pH neutro que não agride a pintura.',
      naCapa: false, emDestaque: true,
      fotos: [foto('frente-preta', 'DEPOIS'), foto('lavagem-espuma', 'GERAL', 'Lavagem com espuma neutra')],
    },
    {
      id: 'exemplo-4', titulo: 'Descontaminação de rodas em esportivo', servico: servico('exemplo-1'), dataRealizacao: '2026-08-12',
      descricao: 'Pó de freio e piche removidos das rodas e das pinças, sem agredir o verniz.',
      naCapa: false, emDestaque: false,
      fotos: [foto('roda-pinca', 'GERAL', 'Roda e pinça limpas')],
    },
  ];

  function copia(dado) {
    return JSON.parse(JSON.stringify(dado));
  }

  function marcar(lista) {
    return lista.map(function (item) {
      item.exemplo = true;
      return item;
    });
  }

  window.SmartAgendaExemplos = {
    ehExemplo: function (id) {
      return /^exemplo-/.test(String(id || ''));
    },
    servicos: function () {
      return marcar(copia(SERVICOS));
    },
    trabalhos: function () {
      return marcar(copia(TRABALHOS));
    },
    trabalho: function (id) {
      var t = TRABALHOS.filter(function (x) {
        return x.id === id;
      })[0];
      return t ? marcar([copia(t)])[0] : null;
    },
  };
})();
