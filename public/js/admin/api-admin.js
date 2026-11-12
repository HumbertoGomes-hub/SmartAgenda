/*
 * Comunicação do painel com o servidor (rotas em src/rotas/).
 *
 * As telas usam este objeto e não sabem de fetch nem de endereços. Toda
 * função que fala com o servidor devolve uma Promise; em caso de erro, ela
 * falha com um Error que traz a mensagem e o código do servidor (erro.codigo).
 *
 * Sessão: o servidor guarda o login num cookie httpOnly (o navegador não lê)
 * e manda junto o cookie "smartagenda.painel", só com nome, perfil e
 * permissões, para o painel montar o menu na hora (ver src/middlewares/sessao.js).
 * Se o servidor responder 401, a sessão acabou: o painel volta para o login.
 */
(function () {
  'use strict';

  var SESSAO_MINUTOS = 30;
  var COOKIE_PAINEL = 'smartagenda.painel';

  /* Sessão ---------------------------------------------------------------- */

  function lerCookiePainel() {
    var achado = document.cookie.split('; ').filter(function (parte) {
      return parte.indexOf(COOKIE_PAINEL + '=') === 0;
    })[0];
    if (!achado) {
      return null;
    }
    try {
      var base64 = decodeURIComponent(achado.slice(COOKIE_PAINEL.length + 1)).replace(/-/g, '+').replace(/_/g, '/');
      var bytes = Uint8Array.from(atob(base64), function (c) {
        return c.charCodeAt(0);
      });
      return JSON.parse(new TextDecoder().decode(bytes));
    } catch (erro) {
      return null;
    }
  }

  // Síncrona, como o painel espera: quem está logado, pelo cookie do painel.
  function sessao() {
    var dados = lerCookiePainel();
    if (!dados || !dados.usuario) {
      return { usuario: null, expirada: false };
    }
    if (dados.expira <= Date.now()) {
      return { usuario: null, expirada: true };
    }
    return { usuario: dados.usuario, expirada: false };
  }

  function irParaEntrar() {
    var pagina = location.pathname.split('/').pop();
    if (pagina === 'entrar.html' || pagina === 'entrar') {
      return;
    }
    var voltar = pagina && pagina !== 'index.html' ? '&voltar=' + encodeURIComponent(pagina) : '';
    location.replace('entrar.html?motivo=expirou' + voltar);
  }

  /* Requisições ----------------------------------------------------------- */

  // corpo: objeto (vai como JSON) ou Blob (foto, vai como o próprio arquivo).
  function pedir(metodo, caminho, corpo, opcoes) {
    var configuracao = { method: metodo, headers: { Accept: 'application/json' }, credentials: 'same-origin' };
    if (corpo instanceof Blob) {
      configuracao.headers['Content-Type'] = corpo.type || 'application/octet-stream';
      configuracao.body = corpo;
    } else if (corpo !== undefined) {
      configuracao.headers['Content-Type'] = 'application/json';
      configuracao.body = JSON.stringify(corpo);
    }
    return fetch(caminho, configuracao)
      .catch(function () {
        var semRede = new Error('Sem conexão com o servidor. Confira a internet e tente de novo.');
        semRede.codigo = 'SEM_CONEXAO';
        throw semRede;
      })
      .then(function (resposta) {
        if (resposta.status === 401 && !(opcoes && opcoes.semRedirecionar)) {
          irParaEntrar();
        }
        return resposta.text().then(function (texto) {
          var dados = null;
          try {
            dados = texto ? JSON.parse(texto) : null;
          } catch (erro) {
            dados = null;
          }
          if (!resposta.ok) {
            var falha = (dados && dados.erro) || {};
            var erro = new Error(falha.mensagem || 'Algo deu errado no servidor. Tente de novo em instantes.');
            erro.codigo = falha.codigo || 'ERRO_' + resposta.status;
            erro.status = resposta.status;
            throw erro;
          }
          return dados;
        });
      });
  }

  function consulta(parametros) {
    var partes = Object.keys(parametros)
      .filter(function (chave) {
        return parametros[chave] !== undefined && parametros[chave] !== null && parametros[chave] !== '';
      })
      .map(function (chave) {
        return encodeURIComponent(chave) + '=' + encodeURIComponent(parametros[chave]);
      });
    return partes.length ? '?' + partes.join('&') : '';
  }

  var id = encodeURIComponent;

  window.SmartAgendaPainelAPI = {
    SESSAO_MINUTOS: SESSAO_MINUTOS,

    /* Sessão (RF-14, RNF-07) */
    sessao: sessao,
    entrar: function (email, senha) {
      return pedir('POST', '/api/admin/entrar', { email: email, senha: senha }, { semRedirecionar: true });
    },
    sair: function () {
      return pedir('POST', '/api/admin/sair', undefined, { semRedirecionar: true }).catch(function () {
        return null; // mesmo sem resposta, o painel volta para o login
      });
    },
    // O servidor renova a sessão a cada requisição; esta só garante uma de tempos em tempos.
    renovarSessao: function () {
      pedir('GET', '/api/admin/sessao').catch(function () {
        return null;
      });
      return Boolean(sessao().usuario);
    },

    /* Identidade da estética (RF-23) */
    empresa: function () {
      return pedir('GET', '/api/empresa', undefined, { semRedirecionar: true });
    },

    /* Início, pedidos e agenda (RF-16 a RF-19) */
    resumoDoDia: function () {
      return pedir('GET', '/api/admin/resumo');
    },
    pedidos: function () {
      return pedir('GET', '/api/admin/pedidos');
    },
    agenda: function (de, ate, opcoes) {
      return pedir('GET', '/api/admin/agenda' + consulta({ de: de, ate: ate, liberados: opcoes && opcoes.liberados ? '1' : '' }));
    },
    opcoesAgenda: function () {
      return pedir('GET', '/api/admin/agenda/opcoes');
    },
    criarAgendamento: function (dados) {
      return pedir('POST', '/api/admin/agendamentos', dados);
    },
    editarAgendamento: function (codigo, dados) {
      return pedir('PATCH', '/api/admin/agendamentos/' + id(codigo), dados);
    },
    aceitar: function (codigo) {
      return pedir('POST', '/api/admin/agendamentos/' + id(codigo) + '/aceitar');
    },
    cancelar: function (codigo) {
      return pedir('POST', '/api/admin/agendamentos/' + id(codigo) + '/cancelar');
    },
    registrarAtendimento: function (codigo, resultado) {
      return pedir('POST', '/api/admin/agendamentos/' + id(codigo) + '/atendimento', { resultado: resultado });
    },

    /* Serviços (RF-20) */
    servicosPainel: function () {
      return pedir('GET', '/api/admin/servicos');
    },
    criarServico: function (dados) {
      return pedir('POST', '/api/admin/servicos', dados);
    },
    editarServico: function (servicoId, dados) {
      return pedir('PATCH', '/api/admin/servicos/' + id(servicoId), dados);
    },
    enviarFotoServico: function (servicoId, blob) {
      return pedir('PUT', '/api/admin/servicos/' + id(servicoId) + '/foto', blob);
    },
    removerFotoServico: function (servicoId) {
      return pedir('DELETE', '/api/admin/servicos/' + id(servicoId) + '/foto');
    },

    /* Portfólio (RF-21) */
    portfolioPainel: function () {
      return pedir('GET', '/api/admin/portfolio');
    },
    criarTrabalho: function (dados) {
      return pedir('POST', '/api/admin/portfolio', dados);
    },
    editarTrabalho: function (trabalhoId, dados) {
      return pedir('PATCH', '/api/admin/portfolio/' + id(trabalhoId), dados);
    },
    excluirTrabalho: function (trabalhoId) {
      return pedir('DELETE', '/api/admin/portfolio/' + id(trabalhoId));
    },
    enviarFotoTrabalho: function (trabalhoId, blob, tipo) {
      return pedir('POST', '/api/admin/portfolio/' + id(trabalhoId) + '/fotos' + consulta({ tipo: tipo }), blob);
    },
    editarFotoTrabalho: function (trabalhoId, fotoId, dados) {
      return pedir('PATCH', '/api/admin/portfolio/' + id(trabalhoId) + '/fotos/' + id(fotoId), dados);
    },
    removerFotoTrabalho: function (trabalhoId, fotoId) {
      return pedir('DELETE', '/api/admin/portfolio/' + id(trabalhoId) + '/fotos/' + id(fotoId));
    },
    ordenarFotosTrabalho: function (trabalhoId, ids) {
      return pedir('PUT', '/api/admin/portfolio/' + id(trabalhoId) + '/fotos/ordem', { ids: ids });
    },

    /* Relatório (RF-24) */
    relatorio: function (mes) {
      return pedir('GET', '/api/admin/relatorio' + consulta({ mes: mes }));
    },

    /* Configurações (RF-22, RF-23) */
    configuracoes: function () {
      return pedir('GET', '/api/admin/configuracoes');
    },
    salvarAgenda: function (dados) {
      return pedir('PUT', '/api/admin/configuracoes/agenda', dados);
    },
    salvarVitrine: function (dados) {
      return pedir('PUT', '/api/admin/configuracoes/vitrine', dados);
    },
    enviarLogotipo: function (blob) {
      return pedir('PUT', '/api/admin/configuracoes/logotipo', blob);
    },
    removerLogotipo: function () {
      return pedir('DELETE', '/api/admin/configuracoes/logotipo');
    },
    criarBloqueio: function (dados) {
      return pedir('POST', '/api/admin/configuracoes/bloqueios', dados);
    },
    removerBloqueio: function (data) {
      return pedir('DELETE', '/api/admin/configuracoes/bloqueios/' + id(data));
    },

    /* Usuários (RF-15) */
    usuariosPainel: function () {
      return pedir('GET', '/api/admin/usuarios');
    },
    criarUsuario: function (dados) {
      return pedir('POST', '/api/admin/usuarios', dados);
    },
    editarUsuario: function (usuarioId, dados) {
      return pedir('PATCH', '/api/admin/usuarios/' + id(usuarioId), dados);
    },
    redefinirSenha: function (usuarioId, senha) {
      return pedir('PUT', '/api/admin/usuarios/' + id(usuarioId) + '/senha', { senha: senha });
    },
  };
})();
