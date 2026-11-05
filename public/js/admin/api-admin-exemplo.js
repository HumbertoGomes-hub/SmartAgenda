/*
 * Simulação do servidor do painel administrativo, usada só enquanto o
 * back-end não existe (mesma ideia de ../api-exemplo.js).
 *
 * Todas as telas do painel falam com o servidor por este objeto. Na etapa do
 * back-end, troque cada função pela chamada real e mantenha o formato de retorno:
 *   entrar        -> POST /api/admin/entrar  (RF-14; senha conferida com bcrypt)
 *   sair          -> POST /api/admin/sair
 *   sessao        -> GET  /api/admin/sessao  (401 quando não há sessão)
 *   renovarSessao -> cada requisição renova o cookie (sessão "rolling")
 *   resumoDoDia   -> GET  /api/admin/resumo
 *   empresa       -> GET  /api/empresa       (nome, logotipo e cor; RF-23)
 * As rotas reais estão em src/rotas/.
 *
 * Contas de teste (a senha de todas é: smartagenda)
 *   dono@exemplo.test         -> Dono: vê o menu completo
 *   socio@exemplo.test        -> Sócio: sem Configurações e Usuários
 *   funcionario@exemplo.test  -> Funcionário: Pedidos, Agenda e Portfólio
 *   inativo@exemplo.test      -> usuário desativado: não consegue entrar
 *
 * A sessão expira após 30 minutos sem uso (RNF-07). Para testar sem esperar,
 * rode no console do navegador: SmartAgendaPainelAPI.envelhecerSessao(31)
 */
(function () {
  'use strict';

  var CHAVE_SESSAO = 'smartagenda:painel-sessao';
  var SESSAO_MINUTOS = 30;
  var PRAZO_RESPOSTA_HORAS = 12; // RN-08, vem de ConfiguracaoAgenda.prazoRespostaHoras
  var ATRASO_MS = 350;
  var SENHA_TESTE = 'smartagenda';

  // Matriz de permissões (RN-13). No back-end, vem de UsuarioAdmin.podeExecutar().
  //   agenda             -> ver agenda, responder pedidos, registrar atendimento
  //   agendamento-manual -> criar agendamento para cliente de balcão ou telefone
  //   portfolio          -> gerenciar portfólio
  //   servicos           -> gerenciar serviços
  //   relatorio          -> gerar relatório mensal
  //   configuracao       -> configurar agenda e vitrine
  //   usuarios           -> gerenciar usuários
  var PERMISSOES = {
    DONO: ['agenda', 'agendamento-manual', 'portfolio', 'servicos', 'relatorio', 'configuracao', 'usuarios'],
    SOCIO: ['agenda', 'agendamento-manual', 'portfolio', 'servicos', 'relatorio'],
    FUNCIONARIO: ['agenda', 'agendamento-manual', 'portfolio'],
  };

  // Identidade da estética. No servidor, vem da tabela empresa (RF-23).
  var EMPRESA = {
    nome: 'Estética Modelo',
    logotipoUrl: '../img/exemplo/logotipo.svg',
    corPrimaria: '#1f1f1f',
  };

  var USUARIOS = [
    { id: 1, nome: 'Marcos Oliveira', email: 'dono@exemplo.test', perfil: 'DONO', ativo: true },
    { id: 2, nome: 'Ana Ribeiro', email: 'socio@exemplo.test', perfil: 'SOCIO', ativo: true },
    { id: 3, nome: 'Lucas Ferreira', email: 'funcionario@exemplo.test', perfil: 'FUNCIONARIO', ativo: true },
    { id: 4, nome: 'Paulo Mendes', email: 'inativo@exemplo.test', perfil: 'FUNCIONARIO', ativo: false },
  ];

  var SERVICOS = {
    'lavagem-detalhada': { nome: 'Lavagem detalhada', preco: 80, duracao: 60 },
    'higienizacao-interna': { nome: 'Higienização interna', preco: 180, duracao: 150 },
    'polimento-comercial': { nome: 'Polimento comercial', preco: 250, duracao: 180 },
    'polimento-tecnico': { nome: 'Polimento técnico', preco: 450, duracao: 300 },
    'vitrificacao-pintura': { nome: 'Vitrificação de pintura', preco: 900, duracao: 480 },
    'cristalizacao-vidros': { nome: 'Cristalização de vidros', preco: 120, duracao: 60 },
  };

  // Agendamentos de exemplo, posicionados a partir de hoje para a tela nunca
  // ficar vazia. dia: 0 = hoje, 1 = amanhã...; criadoHa: minutos desde o pedido.
  var AGENDAMENTOS = [
    { codigo: 'K7M2QX', dia: 0, inicio: '08:00', servicos: ['lavagem-detalhada'], cliente: 'Carlos Andrade', telefone: '+5511987654321', veiculo: 'Chevrolet Onix', status: 'CONFIRMADO', criadoHa: 2880 },
    { codigo: 'T4HB9R', dia: 0, inicio: '09:00', servicos: ['polimento-tecnico'], cliente: 'Fernanda Lima', telefone: '+5511976543210', veiculo: 'Jeep Compass', status: 'CONFIRMADO', criadoHa: 4320 },
    { codigo: 'H6VR2L', dia: 0, inicio: '11:00', servicos: ['lavagem-detalhada'], cliente: 'Eduardo Nunes', telefone: '+5511943210987', veiculo: 'Fiat Argo', status: 'CANCELADO', criadoHa: 3000 },
    { codigo: 'W2ZP6M', dia: 0, inicio: '14:00', servicos: ['higienizacao-interna'], cliente: 'Rafael Souza', telefone: '+5511965432109', veiculo: 'Hyundai HB20', observacoes: 'Mancha de café no banco traseiro.', status: 'CONFIRMADO', criadoHa: 1500 },
    { codigo: 'N8QK3D', dia: 0, inicio: '16:30', servicos: ['cristalizacao-vidros'], cliente: 'Juliana Prado', telefone: '+5511954321098', veiculo: 'Toyota Corolla', status: 'CONFIRMADO', criadoHa: 1440 },
    { codigo: 'B3XJ7P', dia: 1, inicio: '08:00', servicos: ['vitrificacao-pintura'], cliente: 'Bruno Teixeira', telefone: '+5511932109876', veiculo: 'Volkswagen Nivus', status: 'PENDENTE', criadoHa: 570 },
    { codigo: 'R5MC8T', dia: 2, inicio: '10:00', servicos: ['polimento-comercial'], cliente: 'Patrícia Gomes', telefone: '+5511921098765', veiculo: 'Fiat Pulse', observacoes: 'Quero tirar uns riscos na porta do motorista.', status: 'PENDENTE', criadoHa: 180 },
    { codigo: 'M2PW5Z', dia: 2, inicio: '15:00', servicos: ['lavagem-detalhada'], cliente: 'Mariana Costa', telefone: '+5511998877665', veiculo: 'Renault Kwid', status: 'AGUARDANDO_CLIENTE', criadoHa: 900 },
    { codigo: 'D9LF4K', dia: 3, inicio: '14:00', servicos: ['lavagem-detalhada', 'cristalizacao-vidros'], cliente: 'Diego Martins', telefone: '+5511910987654', veiculo: 'Honda Civic', status: 'PENDENTE', criadoHa: 25 },
  ];

  // Status que ocupam a agenda do dia (RF-08 libera os demais).
  var STATUS_DA_AGENDA = ['CONFIRMADO', 'CONCLUIDO', 'NAO_COMPARECEU'];

  function aguardar(valor) {
    return new Promise(function (resolver) {
      setTimeout(function () {
        resolver(valor);
      }, ATRASO_MS);
    });
  }

  function falhar(codigo, mensagem) {
    return new Promise(function (_, rejeitar) {
      setTimeout(function () {
        var erro = new Error(mensagem);
        erro.codigo = codigo;
        rejeitar(erro);
      }, ATRASO_MS);
    });
  }

  /* Sessão ---------------------------------------------------------------- */

  function lerSessao() {
    try {
      return JSON.parse(sessionStorage.getItem(CHAVE_SESSAO));
    } catch (erro) {
      return null;
    }
  }

  function gravarSessao(sessao) {
    try {
      sessionStorage.setItem(CHAVE_SESSAO, JSON.stringify(sessao));
      return true;
    } catch (erro) {
      return false;
    }
  }

  function apagarSessao() {
    try {
      sessionStorage.removeItem(CHAVE_SESSAO);
    } catch (erro) {
      // Nada a apagar.
    }
  }

  function dadosPublicos(usuario) {
    return {
      id: usuario.id,
      nome: usuario.nome,
      email: usuario.email,
      perfil: usuario.perfil,
      permissoes: PERMISSOES[usuario.perfil].slice(),
    };
  }

  function sessao() {
    var atual = lerSessao();
    if (!atual || !atual.usuario) {
      return { usuario: null, expirada: false };
    }
    if (Date.now() - atual.ultimaAtividade > SESSAO_MINUTOS * 60000) {
      apagarSessao();
      return { usuario: null, expirada: true };
    }
    return { usuario: atual.usuario, expirada: false };
  }

  // Não ressuscita uma sessão vencida: devolve false e o painel pede login.
  function renovarSessao() {
    if (!sessao().usuario) {
      return false;
    }
    var atual = lerSessao();
    atual.ultimaAtividade = Date.now();
    return gravarSessao(atual);
  }

  function entrar(email, senha) {
    var procurado = email.trim().toLowerCase();
    var usuario = USUARIOS.filter(function (u) {
      return u.email === procurado;
    })[0];

    // Mesma mensagem para e-mail e senha errados, para não revelar quem tem conta.
    if (!usuario || senha !== SENHA_TESTE) {
      return falhar('CREDENCIAIS_INVALIDAS', 'E-mail ou senha incorretos. Confira os dados e tente de novo.');
    }
    if (!usuario.ativo) {
      return falhar('USUARIO_INATIVO', 'Este acesso foi desativado. Peça ao dono da estética para reativá-lo.');
    }

    var dados = dadosPublicos(usuario);
    if (!gravarSessao({ usuario: dados, ultimaAtividade: Date.now() })) {
      return falhar('SEM_ARMAZENAMENTO', 'O navegador bloqueou o armazenamento da sessão. Saia da janela anônima ou libere os dados do site e tente de novo.');
    }
    return aguardar({ usuario: dados });
  }

  function sair() {
    apagarSessao();
    return aguardar(true);
  }

  /* Agendamentos ---------------------------------------------------------- */

  function montarAgendamento(base, agora) {
    var hora = base.inicio.split(':').map(Number);
    var inicio = new Date(agora.getFullYear(), agora.getMonth(), agora.getDate() + base.dia, hora[0], hora[1]);
    var itens = base.servicos.map(function (id) {
      return {
        servicoId: id,
        nome: SERVICOS[id].nome,
        precoPraticado: SERVICOS[id].preco,
        duracaoMinutos: SERVICOS[id].duracao,
      };
    });
    var duracao = itens.reduce(function (total, item) {
      return total + item.duracaoMinutos;
    }, 0);
    var valor = itens.reduce(function (total, item) {
      return total + item.precoPraticado;
    }, 0);
    var criadoEm = new Date(agora.getTime() - base.criadoHa * 60000);

    var agendamento = {
      codigo: base.codigo,
      dataHoraInicio: inicio.toISOString(),
      dataHoraFim: new Date(inicio.getTime() + duracao * 60000).toISOString(),
      cliente: { nome: base.cliente, telefone: base.telefone },
      modeloVeiculo: base.veiculo || '',
      observacoes: base.observacoes || '',
      status: base.status,
      criadoEm: criadoEm.toISOString(),
      itens: itens,
      duracaoMinutos: duracao,
      valorEstimado: valor,
    };

    if (base.status === 'PENDENTE') {
      agendamento.expiraEm = new Date(criadoEm.getTime() + PRAZO_RESPOSTA_HORAS * 36e5).toISOString();
    }
    return agendamento;
  }

  function mesmoDia(a, b) {
    return a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate();
  }

  function porInicio(a, b) {
    return new Date(a.dataHoraInicio) - new Date(b.dataHoraInicio);
  }

  function resumoDoDia() {
    if (!sessao().usuario) {
      return falhar('SESSAO_EXPIRADA', 'Sua sessão terminou. Entre de novo para continuar.');
    }

    var agora = new Date();
    var todos = AGENDAMENTOS.map(function (base) {
      return montarAgendamento(base, agora);
    });

    var hoje = todos
      .filter(function (a) {
        return mesmoDia(new Date(a.dataHoraInicio), agora) && STATUS_DA_AGENDA.indexOf(a.status) !== -1;
      })
      .sort(porInicio);

    var pendentes = todos
      .filter(function (a) {
        return a.status === 'PENDENTE';
      })
      .sort(function (a, b) {
        return new Date(a.expiraEm) - new Date(b.expiraEm);
      });

    var aguardandoCliente = todos
      .filter(function (a) {
        return a.status === 'AGUARDANDO_CLIENTE';
      })
      .sort(porInicio);

    return aguardar({
      geradoEm: agora.toISOString(),
      prazoRespostaHoras: PRAZO_RESPOSTA_HORAS,
      hoje: hoje,
      pendentes: pendentes,
      aguardandoCliente: aguardandoCliente,
    });
  }

  function empresa() {
    return aguardar({ nome: EMPRESA.nome, logotipoUrl: EMPRESA.logotipoUrl, corPrimaria: EMPRESA.corPrimaria });
  }

  window.SmartAgendaPainelAPI = {
    SESSAO_MINUTOS: SESSAO_MINUTOS,
    empresa: empresa,
    entrar: entrar,
    sair: sair,
    sessao: sessao,
    renovarSessao: renovarSessao,
    resumoDoDia: resumoDoDia,
    // Só para testes: faz a sessão parecer parada há N minutos.
    envelhecerSessao: function (minutos) {
      var atual = lerSessao();
      if (atual) {
        atual.ultimaAtividade -= minutos * 60000;
        gravarSessao(atual);
      }
    },
  };
})();
