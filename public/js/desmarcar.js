/* Cancelamento de agendamento com telefone e código. */
(function () {
  'use strict';

  var API = window.SmartAgendaAPI;
  var Site = window.SmartAgendaSite;

  var formulario = document.getElementById('form-desmarcar');
  var telefone = document.getElementById('telefone');
  var codigo = document.getElementById('codigo');
  var alerta = document.getElementById('alerta-desmarcar');
  var botao = document.getElementById('botao-desmarcar');
  var resultado = document.getElementById('resultado');
  var entrada = document.getElementById('entrada');

  function marcar(campo, mensagem) {
    document.getElementById(campo.id + '-erro').textContent = mensagem || '';
    if (mensagem) {
      campo.setAttribute('aria-invalid', 'true');
    } else {
      campo.removeAttribute('aria-invalid');
    }
    return !mensagem;
  }

  codigo.addEventListener('input', function () {
    codigo.value = codigo.value.toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 6);
    marcar(codigo, '');
  });

  telefone.addEventListener('input', function () {
    marcar(telefone, '');
  });

  formulario.addEventListener('submit', function (evento) {
    evento.preventDefault();
    alerta.textContent = '';

    var telefoneOk = marcar(
      telefone,
      Site.telefoneValido(telefone.value) ? '' : 'Informe o celular com DDD, com 11 números.',
    );
    var codigoOk = marcar(
      codigo,
      /^[A-HJ-NP-Z2-9]{6}$/.test(codigo.value)
        ? ''
        : 'O código tem 6 letras e números e não usa 0, O, 1 nem I.',
    );

    if (!telefoneOk) {
      telefone.focus();
      return;
    }
    if (!codigoOk) {
      codigo.focus();
      return;
    }

    botao.setAttribute('aria-busy', 'true');
    botao.textContent = 'Desmarcando horário…';

    API.desmarcar(Site.telefoneE164(telefone.value), codigo.value)
      .then(function (resposta) {
        document.getElementById('resultado-quando').textContent = resposta.dataHora;
        document.getElementById('resultado-codigo').textContent = resposta.codigo;
        entrada.hidden = true;
        resultado.hidden = false;
        resultado.focus();
      })
      .catch(function (erro) {
        alerta.textContent = erro.message;
      })
      .finally(function () {
        botao.removeAttribute('aria-busy');
        botao.textContent = 'Desmarcar horário';
      });
  });
})();
