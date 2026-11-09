/*
 * Peças comuns às telas de Pedidos e Agenda: textos de um agendamento,
 * links do WhatsApp com mensagem pronta e o aviso que aparece depois de
 * cada ação. Usa as formatações de painel.js (SmartAgendaPainel.formatar).
 */
(function () {
  'use strict';

  var Painel = window.SmartAgendaPainel;
  if (!Painel) {
    return; // Sem sessão: painel.js já mandou para o login.
  }

  var API = window.SmartAgendaPainelAPI;
  var f = Painel.formatar;
  var el = Painel.el;
  var nomeEmpresa = '';

  API.empresa()
    .then(function (empresa) {
      nomeEmpresa = empresa.nome || '';
    })
    .catch(function () {
      // Sem o nome, as mensagens saem sem ele.
    });

  var CAMINHO_WHATSAPP =
    'M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 0 1-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 0 1-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 0 1 2.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0 0 12.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 0 0 5.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 0 0-3.48-8.413z';

  function iconeWhatsApp() {
    var ns = 'http://www.w3.org/2000/svg';
    var svg = document.createElementNS(ns, 'svg');
    svg.setAttribute('width', '18');
    svg.setAttribute('height', '18');
    svg.setAttribute('viewBox', '0 0 24 24');
    svg.setAttribute('fill', 'currentColor');
    svg.setAttribute('aria-hidden', 'true');
    var caminho = document.createElementNS(ns, 'path');
    caminho.setAttribute('d', CAMINHO_WHATSAPP);
    svg.append(caminho);
    return svg;
  }

  /* Textos ---------------------------------------------------------------- */

  function primeiroNome(agendamento) {
    return agendamento.cliente.nome.split(' ')[0];
  }

  // "Lavagem detalhada e Cristalização de vidros"
  function servicosTexto(agendamento) {
    var nomes = agendamento.itens.map(function (item) {
      return item.nome;
    });
    if (nomes.length <= 1) {
      return nomes.join('');
    }
    return nomes.slice(0, -1).join(', ') + ' e ' + nomes[nomes.length - 1];
  }

  // "14:00 às 16:00"
  function intervalo(agendamento) {
    return f.hora(agendamento.dataHoraInicio) + ' às ' + f.hora(agendamento.dataHoraFim);
  }

  // "quarta, 11 de novembro, às 14:00"
  function quandoTexto(agendamento) {
    var dia = f.dataLonga(agendamento.dataHoraInicio);
    return dia.charAt(0).toLowerCase() + dia.slice(1) + ', às ' + f.hora(agendamento.dataHoraInicio);
  }

  /* WhatsApp -------------------------------------------------------------- */

  function linkWhatsApp(telefone, mensagem) {
    var numero = String(telefone).replace(/\D/g, '');
    return 'https://wa.me/' + numero + (mensagem ? '?text=' + encodeURIComponent(mensagem) : '');
  }

  function assinatura() {
    return nomeEmpresa ? ' Aqui é da ' + nomeEmpresa + '.' : '';
  }

  var MENSAGENS = {
    pedido: function (a) {
      return (
        'Olá, ' + primeiroNome(a) + '!' + assinatura() + ' Recebemos seu pedido ' + a.codigo + ' de ' +
        servicosTexto(a) + ' para ' + quandoTexto(a) + '. '
      );
    },
    confirmacao: function (a) {
      return (
        'Olá, ' + primeiroNome(a) + '! Seu horário está confirmado: ' + servicosTexto(a) + ', ' + quandoTexto(a) +
        '. Código do agendamento: ' + a.codigo + '.'
      );
    },
    remarcado: function (a) {
      return (
        'Olá, ' + primeiroNome(a) + '! Seu horário mudou para ' + quandoTexto(a) + ' (' + servicosTexto(a) +
        '). Código do agendamento: ' + a.codigo + '.'
      );
    },
    desmarcado: function (a) {
      return (
        'Olá, ' + primeiroNome(a) + '! Seu horário de ' + quandoTexto(a) +
        ' foi desmarcado. Se quiser marcar outro, é só responder esta mensagem.'
      );
    },
  };

  // Link com o ícone e a mensagem pronta. Abre em outra aba para o painel continuar aberto.
  function botaoWhatsApp(agendamento, tipo, rotulo, classe) {
    var link = el('a', {
      classe: classe || 'botao botao--contorno botao-whatsapp',
      atributos: {
        href: linkWhatsApp(agendamento.cliente.telefone, MENSAGENS[tipo](agendamento)),
        target: '_blank',
        rel: 'noopener',
      },
    });
    link.append(iconeWhatsApp(), document.createTextNode(rotulo));
    return link;
  }

  /* Aviso depois de uma ação ---------------------------------------------- */

  var aviso = document.getElementById('aviso-acao');

  function avisar(texto, extra) {
    if (!aviso) {
      return;
    }
    var fechar = el('button', {
      classe: 'aviso-acao__fechar',
      texto: 'Fechar',
      atributos: { type: 'button' },
    });
    fechar.addEventListener('click', function () {
      aviso.hidden = true;
    });
    aviso.replaceChildren(el('p', { classe: 'aviso-acao__texto', texto: texto }), extra || null, fechar);
    aviso.hidden = false;
  }

  window.SmartAgendaAgendamento = {
    servicosTexto: servicosTexto,
    intervalo: intervalo,
    quandoTexto: quandoTexto,
    linkWhatsApp: linkWhatsApp,
    botaoWhatsApp: botaoWhatsApp,
    avisar: avisar,
  };
})();
