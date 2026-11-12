/*
 * Prepara a foto escolhida no painel antes de enviar (RNF-09): aceita JPG,
 * PNG ou WebP, reduz para no máximo 1600 px no maior lado e converte para
 * WebP. Assim uma foto de celular de 8 MB vira algumas centenas de KB, e o
 * servidor só confere o formato e o limite de 5 MB.
 */
(function () {
  'use strict';

  var TIPOS = ['image/jpeg', 'image/png', 'image/webp'];
  var MAIOR_LADO = 1600;
  var LIMITE_ORIGINAL = 25 * 1024 * 1024; // fotos de celular grandes também servem
  var LIMITE_ENVIO = 5 * 1024 * 1024;

  function erro(mensagem) {
    var e = new Error(mensagem);
    e.codigo = 'FOTO_INVALIDA';
    return e;
  }

  function paraBlob(tela, tipo, qualidade) {
    return new Promise(function (resolver) {
      tela.toBlob(resolver, tipo, qualidade);
    });
  }

  // arquivo: File do <input type="file">. Devolve um Blob pronto para enviar.
  function preparar(arquivo) {
    if (!arquivo || TIPOS.indexOf(arquivo.type) === -1) {
      return Promise.reject(erro('Escolha uma foto JPG, PNG ou WebP.'));
    }
    if (arquivo.size > LIMITE_ORIGINAL) {
      return Promise.reject(erro('Essa foto é grande demais. Escolha uma de até 25 MB.'));
    }
    return createImageBitmap(arquivo, { imageOrientation: 'from-image' })
      .catch(function () {
        throw erro('Não foi possível abrir essa foto. Tente outra.');
      })
      .then(function (bitmap) {
        var escala = Math.min(1, MAIOR_LADO / Math.max(bitmap.width, bitmap.height));
        var tela = document.createElement('canvas');
        tela.width = Math.round(bitmap.width * escala);
        tela.height = Math.round(bitmap.height * escala);
        tela.getContext('2d').drawImage(bitmap, 0, 0, tela.width, tela.height);
        return paraBlob(tela, 'image/webp', 0.82).then(function (blob) {
          // Navegador sem WebP devolve PNG: aí vai em JPG, que é menor.
          return blob && blob.type === 'image/webp' ? blob : paraBlob(tela, 'image/jpeg', 0.85);
        });
      })
      .then(function (blob) {
        if (!blob || blob.size > LIMITE_ENVIO) {
          throw erro('Não foi possível reduzir essa foto para até 5 MB. Tente outra.');
        }
        return blob;
      });
  }

  // Fotos vêm do Storage (endereço completo); caminho relativo é de public/,
  // e o painel está em public/admin/.
  function urlDaFoto(url) {
    return /^(data:|blob:|https?:|\/)/.test(url) ? url : '../' + url;
  }

  window.SmartAgendaImagem = { preparar: preparar, urlDaFoto: urlDaFoto };
})();
