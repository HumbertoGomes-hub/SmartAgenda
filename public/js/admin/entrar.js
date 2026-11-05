/* Login do painel com e-mail e senha (RF-14). */
(function () {
  'use strict';

  var API = window.SmartAgendaPainelAPI;

  // Já tem sessão válida: vai direto para o painel.
  if (API.sessao().usuario) {
    location.replace('index.html');
    return;
  }

  var formulario = document.getElementById('form-entrar');
  var email = document.getElementById('email');
  var senha = document.getElementById('senha');
  var alternarSenha = document.getElementById('alternar-senha');
  var aviso = document.getElementById('aviso-entrar');
  var alerta = document.getElementById('alerta-entrar');
  var botao = document.getElementById('botao-entrar');
  var parametros = new URLSearchParams(location.search);

  var AVISOS = {
    expirou:
      'Sua sessão terminou depois de ' + API.SESSAO_MINUTOS + ' minutos sem uso. Entre de novo para continuar.',
    saiu: 'Você saiu do painel.',
  };

  aviso.textContent = AVISOS[parametros.get('motivo')] || '';

  // Só volta para páginas do próprio painel (evita redirecionar para fora).
  function destino() {
    var voltar = parametros.get('voltar') || '';
    return /^[a-z0-9-]+\.html$/.test(voltar) && voltar !== 'entrar.html' ? voltar : 'index.html';
  }

  function marcar(campo, mensagem) {
    document.getElementById(campo.id + '-erro').textContent = mensagem || '';
    if (mensagem) {
      campo.setAttribute('aria-invalid', 'true');
    } else {
      campo.removeAttribute('aria-invalid');
    }
    return !mensagem;
  }

  email.addEventListener('input', function () {
    marcar(email, '');
    alerta.textContent = '';
  });

  senha.addEventListener('input', function () {
    marcar(senha, '');
    alerta.textContent = '';
  });

  alternarSenha.addEventListener('click', function () {
    var mostrando = senha.type === 'text';
    senha.type = mostrando ? 'password' : 'text';
    alternarSenha.textContent = mostrando ? 'Mostrar' : 'Ocultar';
    alternarSenha.setAttribute('aria-pressed', String(!mostrando));
    senha.focus();
  });

  formulario.addEventListener('submit', function (evento) {
    evento.preventDefault();
    if (botao.getAttribute('aria-busy') === 'true') {
      return;
    }
    alerta.textContent = '';
    aviso.textContent = '';

    var emailOk = marcar(
      email,
      /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.value.trim()) ? '' : 'Informe o e-mail cadastrado, como nome@exemplo.com.',
    );
    var senhaOk = marcar(senha, senha.value ? '' : 'Informe a senha.');

    if (!emailOk) {
      email.focus();
      return;
    }
    if (!senhaOk) {
      senha.focus();
      return;
    }

    botao.setAttribute('aria-busy', 'true');
    botao.textContent = 'Entrando…';

    API.entrar(email.value, senha.value)
      .then(function () {
        location.replace(destino());
      })
      .catch(function (erro) {
        alerta.textContent = erro.message;
        senha.value = '';
        senha.focus();
        botao.removeAttribute('aria-busy');
        botao.textContent = 'Entrar';
      });
  });
})();
