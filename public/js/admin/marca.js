/*
 * Identidade da estética nas páginas do painel: nome, logotipo e cor vêm da
 * configuração (RF-23), não do HTML, para que outra estética use o sistema
 * sem mexer no código (RNF-12).
 *
 * Preenche os elementos marcados com:
 *   data-empresa-nome  -> nome da estética
 *   data-empresa-logo  -> <img> do logotipo (fica oculto se não houver)
 *   data-empresa-icone -> <link rel="icon">
 * e aplica a cor em --marca e --marca-texto (tokens.css).
 */
(function () {
  'use strict';

  var API = window.SmartAgendaPainelAPI;
  var raiz = document.documentElement;

  // Luminância relativa (WCAG) de uma cor #rrggbb.
  function luminancia(hex) {
    var canais = [1, 3, 5].map(function (inicio) {
      var c = parseInt(hex.slice(inicio, inicio + 2), 16) / 255;
      return c <= 0.03928 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4);
    });
    return 0.2126 * canais[0] + 0.7152 * canais[1] + 0.0722 * canais[2];
  }

  // Texto branco ou escuro, o que tiver mais contraste com a cor da marca.
  function aplicarCor(cor) {
    if (!/^#[0-9a-f]{6}$/i.test(cor)) {
      return; // Sem cor configurada: fica a padrão do tokens.css.
    }
    var l = luminancia(cor);
    var contrasteBranco = 1.05 / (l + 0.05);
    var contrasteEscuro = (l + 0.05) / (luminancia('#1f1f1f') + 0.05);
    var textoBranco = contrasteBranco >= contrasteEscuro;

    raiz.style.setProperty('--marca', cor);
    raiz.style.setProperty('--marca-texto', textoBranco ? '#ffffff' : '#1f1f1f');
    raiz.style.setProperty('--sobre-marca-suave', textoBranco ? 'rgb(255 255 255 / 0.75)' : 'rgb(31 31 31 / 0.72)');
  }

  function aplicar(empresa) {
    document.querySelectorAll('[data-empresa-nome]').forEach(function (no) {
      no.textContent = empresa.nome;
    });

    document.querySelectorAll('img[data-empresa-logo]').forEach(function (imagem) {
      if (empresa.logotipoUrl) {
        imagem.src = empresa.logotipoUrl;
        imagem.hidden = false;
      }
    });

    var icone = document.querySelector('link[data-empresa-icone]');
    if (icone && empresa.logotipoUrl) {
      icone.href = empresa.logotipoUrl;
    }

    if (empresa.nome) {
      document.title = document.title + ' | ' + empresa.nome;
    }

    aplicarCor(empresa.corPrimaria);
  }

  API.empresa()
    .then(aplicar)
    .catch(function () {
      // Sem a identidade, o painel segue com o visual padrão do tokens.css.
    });
})();
