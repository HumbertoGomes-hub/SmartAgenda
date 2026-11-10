/*
 * Usuários (RF-15): o dono cadastra, edita, desativa e reativa a equipe e
 * define senhas novas. Só o dono vê esta página (permissão "usuarios", RN-13).
 *
 * Não existe excluir: desativar tira o acesso na hora e mantém o histórico.
 * O dono não desativa nem muda o perfil do próprio acesso, e sempre precisa
 * existir um dono ativo (RN-14). O servidor confere as duas regras.
 */
(function () {
  'use strict';

  var Painel = window.SmartAgendaPainel;
  if (!Painel) {
    return; // Sem sessão ou sem permissão: painel.js já redirecionou.
  }

  var API = window.SmartAgendaPainelAPI;
  var Aviso = window.SmartAgendaAviso;
  var el = Painel.el;

  var ROTULOS = { DONO: 'Dono', SOCIO: 'Sócio', FUNCIONARIO: 'Funcionário' };
  var ACESSO = {
    DONO: 'Vê tudo, inclusive Configurações e Usuários.',
    SOCIO: 'Vê Pedidos, Agenda, Serviços, Portfólio e Relatório.',
    FUNCIONARIO: 'Vê Pedidos, Agenda e Portfólio.',
  };
  var SENHA_MINIMA = 8;

  var lista = document.getElementById('lista-usuarios');
  var areaErro = document.getElementById('erro-usuarios');

  var dialogo = document.getElementById('dialogo-usuario');
  var formulario = document.getElementById('form-usuario');
  var botaoSalvar = document.getElementById('usuario-salvar');
  var alerta = document.getElementById('alerta-usuario');
  var campoPerfil = document.getElementById('usuario-perfil');

  var dialogoSenha = document.getElementById('dialogo-senha');
  var formSenha = document.getElementById('form-senha');
  var botaoSenha = document.getElementById('senha-salvar');
  var alertaSenha = document.getElementById('alerta-senha');

  var eu = Painel.usuario.id;
  var usuarios = [];
  var emEdicao = null; // usuário aberto no formulário; null = novo
  var paraSenha = null; // usuário que vai ganhar uma senha nova

  /* Peças ----------------------------------------------------------------- */

  // +551130000000 -> (11) 3000-0000; +5511900000000 -> (11) 90000-0000
  function telefoneLegivel(e164) {
    var d = String(e164 || '').replace(/\D/g, '').replace(/^55/, '');
    if (d.length === 10) {
      return '(' + d.slice(0, 2) + ') ' + d.slice(2, 6) + '-' + d.slice(6);
    }
    if (d.length === 11) {
      return '(' + d.slice(0, 2) + ') ' + d.slice(2, 7) + '-' + d.slice(7);
    }
    return e164 || '';
  }

  function marcar(id, mensagem) {
    var campo = document.getElementById(id);
    document.getElementById(id + '-erro').textContent = mensagem || '';
    if (mensagem) {
      campo.setAttribute('aria-invalid', 'true');
    } else {
      campo.removeAttribute('aria-invalid');
    }
    return !mensagem;
  }

  function ocupar(botao, texto) {
    var antes = botao.textContent;
    botao.setAttribute('aria-busy', 'true');
    botao.textContent = texto;
    return function () {
      botao.removeAttribute('aria-busy');
      botao.textContent = antes;
    };
  }

  /* Lista ----------------------------------------------------------------- */

  function item(u) {
    var proprio = u.id === eu;
    var titulo = el('h3', { classe: 'item-servico__nome', texto: u.nome }, [
      el('span', { classe: 'selo', texto: ROTULOS[u.perfil] || u.perfil }),
      proprio ? el('span', { classe: 'selo selo--forte', texto: 'Você' }) : null,
      u.ativo ? null : el('span', { classe: 'selo selo--apagado', texto: 'Desativado' }),
    ]);

    var dados = [u.email];
    if (u.telefone) {
      dados.push(telefoneLegivel(u.telefone));
    }
    if (u.perfil === 'FUNCIONARIO' && u.cargo) {
      dados.push(u.cargo);
    }
    if (u.perfil === 'DONO' && u.recebeNotificacoes) {
      dados.push('Recebe os avisos de pedidos');
    }

    var editar = el('button', {
      classe: 'botao botao--contorno botao--pequeno',
      texto: 'Editar',
      atributos: { type: 'button', 'aria-label': 'Editar ' + u.nome },
    });
    editar.addEventListener('click', function () {
      abrir(u);
    });

    var senha = el('button', {
      classe: 'botao-texto',
      texto: 'Nova senha',
      atributos: { type: 'button', 'aria-label': 'Definir uma senha nova para ' + u.nome },
    });
    senha.addEventListener('click', function () {
      abrirSenha(u);
    });

    var acoes = [editar, senha];
    // O próprio acesso não se desativa: o dono perderia o painel na hora.
    if (!proprio) {
      var alternar = el('button', {
        classe: u.ativo ? 'botao-texto botao-texto--perigo' : 'botao-texto',
        texto: u.ativo ? 'Desativar' : 'Reativar',
        atributos: { type: 'button', 'aria-label': (u.ativo ? 'Desativar ' : 'Reativar ') + u.nome },
      });
      alternar.addEventListener('click', function () {
        mudarAtivo(u, !u.ativo, alternar);
      });
      acoes.push(alternar);
    }

    return el('li', { classe: 'item-servico item-usuario', atributos: u.ativo ? {} : { 'data-inativo': 'true' } }, [
      el('div', { classe: 'item-servico__texto' }, [
        titulo,
        el('p', { classe: 'item-servico__dados', texto: dados.join(' · ') }),
      ]),
      el('div', { classe: 'item-servico__acoes' }, acoes),
    ]);
  }

  function desenhar() {
    if (!usuarios.length) {
      lista.replaceChildren(el('li', { classe: 'vazio', texto: 'Nenhum usuário cadastrado.' }));
      return;
    }
    lista.replaceChildren.apply(lista, usuarios.map(item));
  }

  function carregar() {
    return API.usuariosPainel()
      .then(function (r) {
        usuarios = r.usuarios;
        areaErro.textContent = '';
        desenhar();
      })
      .catch(function (erro) {
        areaErro.textContent = erro.message || 'Não foi possível carregar os usuários. Recarregue a página.';
      })
      .then(function () {
        lista.removeAttribute('aria-busy');
      });
  }

  function mudarAtivo(u, ativo, botao) {
    botao.setAttribute('aria-busy', 'true');
    areaErro.textContent = '';
    API.editarUsuario(u.id, { ativo: ativo })
      .then(function () {
        var desfazer = el('button', { classe: 'aviso-acao__fechar', texto: 'Desfazer', atributos: { type: 'button' } });
        desfazer.addEventListener('click', function () {
          Aviso.esconder();
          API.editarUsuario(u.id, { ativo: !ativo })
            .then(carregar)
            .catch(function (erro) {
              areaErro.textContent = erro.message;
            });
        });
        Aviso.mostrar(
          ativo ? u.nome + ' voltou a entrar no painel.' : u.nome + ' não entra mais no painel. O histórico continua.',
          desfazer,
        );
        return carregar();
      })
      .catch(function (erro) {
        botao.removeAttribute('aria-busy');
        areaErro.textContent = erro.message;
      });
  }

  /* Formulário ------------------------------------------------------------ */

  function atualizarCamposDoPerfil() {
    var perfil = campoPerfil.value;
    var proprio = emEdicao && emEdicao.id === eu;
    document.getElementById('campo-cargo').hidden = perfil !== 'FUNCIONARIO';
    document.getElementById('campo-notificacoes').hidden = perfil !== 'DONO';
    document.getElementById('usuario-perfil-ajuda').textContent = proprio
      ? 'Você é dono. Para mudar o seu perfil, peça para outro dono.'
      : ACESSO[perfil];
  }

  campoPerfil.addEventListener('change', atualizarCamposDoPerfil);

  function abrir(u) {
    emEdicao = u;
    formulario.reset();
    alerta.textContent = '';
    ['usuario-nome', 'usuario-email', 'usuario-telefone', 'usuario-senha'].forEach(function (id) {
      marcar(id, '');
    });

    document.getElementById('usuario-titulo').textContent = u ? 'Editar ' + u.nome : 'Novo usuário';
    botaoSalvar.textContent = u ? 'Salvar alterações' : 'Cadastrar';
    document.getElementById('usuario-nome').value = u ? u.nome : '';
    document.getElementById('usuario-email').value = u ? u.email : '';
    document.getElementById('usuario-telefone').value = u ? telefoneLegivel(u.telefone) : '';
    document.getElementById('usuario-cargo').value = u ? u.cargo : '';
    document.getElementById('usuario-notificacoes').checked = u ? u.recebeNotificacoes : true;
    campoPerfil.value = u ? u.perfil : 'FUNCIONARIO';
    campoPerfil.disabled = Boolean(u && u.id === eu);
    // A senha só é definida no cadastro; depois, pelo botão "Nova senha".
    document.getElementById('campo-senha').hidden = Boolean(u);

    atualizarCamposDoPerfil();
    dialogo.showModal();
    document.getElementById('usuario-nome').focus();
  }

  formulario.addEventListener('submit', function (evento) {
    evento.preventDefault();
    if (botaoSalvar.getAttribute('aria-busy') === 'true') {
      return;
    }
    alerta.textContent = '';
    var novo = !emEdicao;
    var nome = document.getElementById('usuario-nome').value.trim();
    var email = document.getElementById('usuario-email').value.trim();
    var telefone = document.getElementById('usuario-telefone').value.trim();
    var digitos = telefone.replace(/\D/g, '').replace(/^55(?=\d{10,11}$)/, '');
    var senha = document.getElementById('usuario-senha').value;

    var ok = [
      marcar('usuario-nome', nome.length >= 2 ? '' : 'Informe o nome.'),
      marcar('usuario-email', /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) ? '' : 'Informe um e-mail válido, como nome@exemplo.com.'),
      marcar('usuario-telefone', !telefone || /^\d{10,11}$/.test(digitos) ? '' : 'Informe o telefone com DDD.'),
      marcar('usuario-senha', !novo || senha.length >= SENHA_MINIMA ? '' : 'A senha precisa ter pelo menos ' + SENHA_MINIMA + ' caracteres.'),
    ];
    if (ok.indexOf(false) !== -1) {
      formulario.querySelector('[aria-invalid="true"]').focus();
      return;
    }

    var perfil = campoPerfil.value;
    var dados = { nome: nome, email: email, telefone: telefone, perfil: perfil };
    if (perfil === 'FUNCIONARIO') {
      dados.cargo = document.getElementById('usuario-cargo').value.trim();
    }
    if (perfil === 'DONO') {
      dados.recebeNotificacoes = document.getElementById('usuario-notificacoes').checked;
    }
    if (novo) {
      dados.senha = senha;
    }

    var liberar = ocupar(botaoSalvar, 'Salvando…');
    (novo ? API.criarUsuario(dados) : API.editarUsuario(emEdicao.id, dados))
      .then(function (salvo) {
        dialogo.close();
        Aviso.mostrar(
          novo
            ? salvo.nome + ' foi cadastrado como ' + ROTULOS[salvo.perfil].toLowerCase() + '. Passe o e-mail e a senha para a pessoa.'
            : 'Alterações de ' + salvo.nome + ' salvas.',
        );
        return carregar();
      })
      .catch(function (erro) {
        if (erro.codigo === 'EMAIL_EM_USO') {
          marcar('usuario-email', erro.message);
          document.getElementById('usuario-email').focus();
        } else {
          alerta.textContent = erro.message || 'Não foi possível salvar. Tente de novo.';
        }
      })
      .then(liberar);
  });

  /* Senha nova ------------------------------------------------------------ */

  function abrirSenha(u) {
    paraSenha = u;
    formSenha.reset();
    alertaSenha.textContent = '';
    marcar('nova-senha', '');
    document.getElementById('senha-titulo').textContent = 'Nova senha para ' + u.nome;
    dialogoSenha.showModal();
    document.getElementById('nova-senha').focus();
  }

  formSenha.addEventListener('submit', function (evento) {
    evento.preventDefault();
    if (botaoSenha.getAttribute('aria-busy') === 'true') {
      return;
    }
    alertaSenha.textContent = '';
    var senha = document.getElementById('nova-senha').value;
    if (!marcar('nova-senha', senha.length >= SENHA_MINIMA ? '' : 'A senha precisa ter pelo menos ' + SENHA_MINIMA + ' caracteres.')) {
      document.getElementById('nova-senha').focus();
      return;
    }
    var liberar = ocupar(botaoSenha, 'Salvando…');
    API.redefinirSenha(paraSenha.id, senha)
      .then(function () {
        dialogoSenha.close();
        Aviso.mostrar('Senha de ' + paraSenha.nome + ' trocada. Passe a nova senha para a pessoa.');
      })
      .catch(function (erro) {
        alertaSenha.textContent = erro.message || 'Não foi possível trocar a senha. Tente de novo.';
      })
      .then(liberar);
  });

  /* Comuns ---------------------------------------------------------------- */

  // Botão "Mostrar" dos campos de senha.
  document.querySelectorAll('[data-mostrar]').forEach(function (botao) {
    var campo = document.getElementById(botao.dataset.mostrar);
    botao.addEventListener('click', function () {
      var mostrando = campo.type === 'text';
      campo.type = mostrando ? 'password' : 'text';
      botao.textContent = mostrando ? 'Mostrar' : 'Ocultar';
      botao.setAttribute('aria-pressed', String(!mostrando));
      campo.focus();
    });
  });

  // Ao fechar, a senha digitada volta a ficar escondida.
  [dialogo, dialogoSenha].forEach(function (d) {
    d.addEventListener('close', function () {
      d.querySelectorAll('[data-mostrar]').forEach(function (botao) {
        document.getElementById(botao.dataset.mostrar).type = 'password';
        botao.textContent = 'Mostrar';
        botao.setAttribute('aria-pressed', 'false');
      });
    });
  });

  document.querySelectorAll('[data-fechar]').forEach(function (botao) {
    botao.addEventListener('click', function () {
      botao.closest('dialog').close();
    });
  });

  document.getElementById('usuario-novo').addEventListener('click', function () {
    abrir(null);
  });

  carregar();
})();
