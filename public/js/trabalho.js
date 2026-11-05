/*
 * Preenche a página de um trabalho do portfólio a partir de ?id=.
 * Serve só à demonstração: com o back-end, /portfolio/:id já chega pronto do
 * servidor e este arquivo pode ser removido.
 */
(function () {
  'use strict';

  var TRABALHOS = {
    'seda-preto': {
      titulo: 'Polimento técnico em sedã preto',
      descricao:
        'Pintura com riscos de lavagem e perda de brilho. Fizemos descontaminação, polimento em duas etapas e aplicamos selante.',
      data: 'Outubro de 2026',
      servico: 'Polimento técnico',
      servicoId: 'polimento-tecnico',
      imagem: 'seda',
      veiculo: 'sedã',
    },
    'suv-familia': {
      titulo: 'Vitrificação em SUV de família',
      descricao:
        'Carro zero que vai rodar em estrada de terra. A vitrificação protege a pintura e facilita a limpeza por até dois anos.',
      data: 'Setembro de 2026',
      servico: 'Vitrificação de pintura',
      servicoId: 'vitrificacao-pintura',
      imagem: 'suv',
      veiculo: 'SUV',
    },
    'hatch-diario': {
      titulo: 'Lavagem detalhada em hatch de uso diário',
      descricao:
        'Rodas, frisos, vidros e caixas de roda limpos um a um, com produtos neutros que não agridem a pintura.',
      data: 'Setembro de 2026',
      servico: 'Lavagem detalhada',
      servicoId: 'lavagem-detalhada',
      imagem: 'hatch',
      veiculo: 'hatch',
    },
    'rodas-seda': {
      titulo: 'Polimento comercial em sedã de frota',
      descricao:
        'Correção leve para devolver o brilho da pintura e deixar o carro pronto para a revenda em uma tarde.',
      data: 'Agosto de 2026',
      servico: 'Polimento comercial',
      servicoId: 'polimento-comercial',
      imagem: 'seda',
      veiculo: 'sedã',
    },
  };

  var id = new URLSearchParams(window.location.search).get('id');
  var trabalho = TRABALHOS[id];

  if (!trabalho) {
    return;
  }

  var base = 'img/exemplo/' + trabalho.imagem;

  function texto(alvo, valor) {
    document.getElementById(alvo).textContent = valor;
  }

  function imagem(alvo, caminho, alternativo) {
    var elemento = document.getElementById(alvo);
    elemento.src = caminho;
    elemento.alt = alternativo;
  }

  document.title = trabalho.titulo + ' | Estética Modelo';
  texto('trabalho-titulo', trabalho.titulo);
  texto('trabalho-descricao', trabalho.descricao);
  texto('trabalho-data', trabalho.data);
  texto('trabalho-servico', trabalho.servico);

  imagem('foto-antes', base + '-antes.svg', 'O ' + trabalho.veiculo + ' antes do serviço');
  imagem('foto-depois', base + '-depois.svg', 'O ' + trabalho.veiculo + ' depois do serviço');
  imagem('foto-extra-1', base + '-detalhe.svg', 'Detalhe da roda dianteira do ' + trabalho.veiculo);
  imagem('foto-extra-2', base + '-depois.svg', 'Lateral do ' + trabalho.veiculo + ' finalizado');

  document.getElementById('trabalho-agendar').href =
    'agendar.html?servico=' + trabalho.servicoId;
})();
