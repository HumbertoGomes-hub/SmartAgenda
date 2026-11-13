/*
 * Trabalhos de exemplo do site, com fotos reais de banco de imagens livre
 * (public/img/fotos/, licença CC0).
 *
 * Só aparecem enquanto o painel não tem nenhum trabalho publicado: basta
 * publicar o primeiro para eles sumirem. Não há serviços de exemplo; os
 * serviços mostrados são sempre os cadastrados no painel.
 *
 * Os ids começam com "exemplo-" para nunca se confundirem com os do banco.
 */
(function () {
  'use strict';

  function foto(nome, tipo, legenda) {
    return { url: 'img/fotos/' + nome + '.webp', tipo: tipo, legenda: legenda || '' };
  }

  var TRABALHOS = [
    {
      id: 'exemplo-1', titulo: 'Polimento técnico em cupê preto', servico: { id: 'exemplo-4', nome: 'Polimento técnico' }, dataRealizacao: '2026-10-15',
      descricao: 'Pintura opaca, com marcas de lavagem e poeira impregnada. Fizemos descontaminação, polimento em duas etapas e aplicamos selante.',
      naCapa: true, emDestaque: false,
      fotos: [foto('cupe-estudio-antes', 'ANTES'), foto('cupe-estudio', 'DEPOIS'), foto('cupe-estudio-frente', 'GERAL', 'Frente depois do polimento')],
    },
    {
      id: 'exemplo-2', titulo: 'Vitrificação em sedã executivo', servico: { id: 'exemplo-5', nome: 'Vitrificação de pintura' }, dataRealizacao: '2026-09-20',
      descricao: 'Sedã de uso diário que roda em estrada de terra. A vitrificação protege a pintura e facilita a limpeza por até dois anos.',
      naCapa: false, emDestaque: true,
      fotos: [foto('seda-floresta-antes', 'ANTES'), foto('seda-floresta', 'DEPOIS'), foto('roda-asfalto', 'GERAL', 'Rodas também protegidas')],
    },
    {
      id: 'exemplo-3', titulo: 'Lavagem detalhada em sedã preto', servico: { id: 'exemplo-1', nome: 'Lavagem detalhada' }, dataRealizacao: '2026-09-08',
      descricao: 'Rodas, frisos, vidros e caixas de roda limpos um a um, com espuma de pH neutro que não agride a pintura.',
      naCapa: false, emDestaque: true,
      fotos: [foto('frente-preta', 'DEPOIS'), foto('lavagem-espuma', 'GERAL', 'Lavagem com espuma neutra')],
    },
    {
      id: 'exemplo-4', titulo: 'Descontaminação de rodas em esportivo', servico: { id: 'exemplo-1', nome: 'Lavagem detalhada' }, dataRealizacao: '2026-08-12',
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
