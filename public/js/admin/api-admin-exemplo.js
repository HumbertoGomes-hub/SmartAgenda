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
 *   pedidos             -> GET   /api/admin/pedidos
 *   agenda              -> GET   /api/admin/agenda?de=&ate=[&liberados=1]
 *   opcoesAgenda        -> GET   /api/admin/agenda/opcoes
 *   criarAgendamento    -> POST  /api/admin/agendamentos
 *   editarAgendamento   -> PATCH /api/admin/agendamentos/:codigo
 *   aceitar             -> POST  /api/admin/agendamentos/:codigo/aceitar
 *   cancelar            -> POST  /api/admin/agendamentos/:codigo/cancelar
 *   registrarAtendimento-> POST  /api/admin/agendamentos/:codigo/atendimento
 *   servicosPainel      -> GET   /api/admin/servicos
 *   criarServico        -> POST  /api/admin/servicos
 *   editarServico       -> PATCH /api/admin/servicos/:id
 *   enviarFotoServico   -> PUT   /api/admin/servicos/:id/foto      (corpo: a foto)
 *   removerFotoServico  -> DELETE /api/admin/servicos/:id/foto
 *   portfolioPainel     -> GET   /api/admin/portfolio
 *   criarTrabalho       -> POST  /api/admin/portfolio
 *   editarTrabalho      -> PATCH /api/admin/portfolio/:id
 *   excluirTrabalho     -> DELETE /api/admin/portfolio/:id
 *   enviarFotoTrabalho  -> POST  /api/admin/portfolio/:id/fotos?tipo= (corpo: a foto)
 *   editarFotoTrabalho  -> PATCH /api/admin/portfolio/:id/fotos/:fotoId
 *   removerFotoTrabalho -> DELETE /api/admin/portfolio/:id/fotos/:fotoId
 *   ordenarFotosTrabalho-> PUT   /api/admin/portfolio/:id/fotos/ordem
 * As rotas reais estão em src/rotas/.
 *
 * Serviços e portfólio vêm de ../dados-exemplo.js, os mesmos dados que o site
 * mostra: o que for mudado aqui aparece no site.
 *
 * Os agendamentos ficam salvos no navegador (localStorage), para o que for
 * feito em Pedidos aparecer na Agenda e no Início. Para voltar aos dados de
 * exemplo, rode no console: SmartAgendaPainelAPI.reiniciarDemonstracao()
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

  // Serviços e portfólio ficam em ../dados-exemplo.js, compartilhados com o site.
  var Dados = window.SmartAgendaDadosExemplo;

  // Os agendamentos de exemplo citam o serviço por um nome curto; no banco é o id.
  var ID_DO_SERVICO = {
    'lavagem-detalhada': 1,
    'higienizacao-interna': 2,
    'polimento-comercial': 3,
    'polimento-tecnico': 4,
    'vitrificacao-pintura': 5,
    'cristalizacao-vidros': 6,
  };

  // ConfiguracaoAgenda (RF-22). Dias: 0 = domingo ... 6 = sábado.
  var CONFIGURACAO = {
    diasFuncionamento: [1, 2, 3, 4, 5, 6],
    horaAbertura: '08:00',
    horaFechamento: '18:00',
    intervaloMinutos: 30,
    capacidadeSimultanea: 1,
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
    // Semanas ao redor, para a agenda não ficar vazia.
    { codigo: 'P4GN7S', dia: -6, inicio: '09:00', servicos: ['polimento-comercial'], cliente: 'Sérgio Almeida', telefone: '+5511987001122', veiculo: 'Fiat Toro', status: 'CONCLUIDO', criadoHa: 12000 },
    { codigo: 'Q8VT3H', dia: -5, inicio: '14:00', servicos: ['lavagem-detalhada'], cliente: 'Camila Rocha', telefone: '+5511987002233', veiculo: 'VW Polo', status: 'NAO_COMPARECEU', criadoHa: 11000 },
    { codigo: 'S2KW8N', dia: -3, inicio: '10:00', servicos: ['higienizacao-interna'], cliente: 'Thiago Barros', telefone: '+5511987003344', veiculo: 'Chevrolet Tracker', status: 'CONCLUIDO', criadoHa: 9000, origem: 'painel' },
    { codigo: 'U6XP2D', dia: -1, inicio: '08:30', servicos: ['vitrificacao-pintura'], cliente: 'Renata Lopes', telefone: '+5511987004455', veiculo: 'Toyota SW4', status: 'CONCLUIDO', criadoHa: 7000 },
    { codigo: 'V3JR9B', dia: 1, inicio: '16:30', servicos: ['lavagem-detalhada'], cliente: 'André Pires', telefone: '+5511987005566', veiculo: 'Ford Ka', status: 'CONFIRMADO', criadoHa: 2600, origem: 'painel' },
    { codigo: 'X7FM4C', dia: 4, inicio: '09:00', servicos: ['polimento-tecnico'], cliente: 'Luana Freitas', telefone: '+5511987006677', veiculo: 'BMW 320i', status: 'CONFIRMADO', criadoHa: 3000 },
    { codigo: 'Y5HL8E', dia: 5, inicio: '13:00', servicos: ['higienizacao-interna', 'cristalizacao-vidros'], cliente: 'Gustavo Reis', telefone: '+5511987007788', veiculo: 'Jeep Renegade', status: 'CONFIRMADO', criadoHa: 2000 },
    { codigo: 'Z9CQ3T', dia: 8, inicio: '10:00', servicos: ['polimento-comercial'], cliente: 'Beatriz Nogueira', telefone: '+5511987008899', veiculo: 'Honda HR-V', status: 'CONFIRMADO', criadoHa: 1500 },
    { codigo: 'A4MZ6R', dia: 10, inicio: '08:00', servicos: ['lavagem-detalhada', 'cristalizacao-vidros'], cliente: 'Felipe Duarte', telefone: '+5511987009900', veiculo: 'Nissan Kicks', status: 'CONFIRMADO', criadoHa: 900 },
  ];

  // Datas bloqueadas (BloqueioAgenda), em dias a partir de hoje.
  var BLOQUEIOS = [{ dia: 13, motivo: 'Feriado municipal' }];

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

  var CHAVE_AGENDA = 'smartagenda:painel-agenda-v1';
  var STATUS_QUE_OCUPAM = ['PENDENTE', 'AGUARDANDO_CLIENTE', 'CONFIRMADO'];
  var STATUS_LIBERADOS = ['RECUSADO', 'EXPIRADO', 'CANCELADO'];
  var ALFABETO_CODIGO = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';

  // RN-16, igual a src/dominio/agenda.js
  var TRANSICOES = {
    PENDENTE: ['CONFIRMADO', 'RECUSADO', 'AGUARDANDO_CLIENTE', 'EXPIRADO', 'CANCELADO'],
    AGUARDANDO_CLIENTE: ['CONFIRMADO', 'CANCELADO'],
    CONFIRMADO: ['CANCELADO', 'CONCLUIDO', 'NAO_COMPARECEU'],
  };

  // Mesmas mensagens de src/repositorios/agenda.js
  var MENSAGENS = {
    HORARIO_OCUPADO: 'Esse horário já está ocupado. Escolha outro horário ou mude os serviços.',
    NAO_ENCONTRADO: 'Agendamento não encontrado.',
    STATUS_NAO_PERMITE: 'Este agendamento já foi encerrado e não pode mais mudar de horário.',
    TRANSICAO_INVALIDA: 'Este agendamento não pode mais receber essa ação. Recarregue para ver a situação atual.',
    ANTES_DO_HORARIO: 'O atendimento só pode ser registrado a partir do horário marcado.',
  };

  function servicoPorId(id) {
    return Dados.ler().servicos.filter(function (servico) {
      return servico.id === Number(id);
    })[0];
  }

  function totalizar(agendamento) {
    agendamento.duracaoMinutos = agendamento.itens.reduce(function (total, item) {
      return total + item.duracaoMinutos;
    }, 0);
    agendamento.valorEstimado = agendamento.itens.reduce(function (total, item) {
      return total + item.precoPraticado;
    }, 0);
    agendamento.dataHoraFim = new Date(
      new Date(agendamento.dataHoraInicio).getTime() + agendamento.duracaoMinutos * 60000,
    ).toISOString();
    return agendamento;
  }

  function montarAgendamento(base, agora) {
    var hora = base.inicio.split(':').map(Number);
    var inicio = new Date(agora.getFullYear(), agora.getMonth(), agora.getDate() + base.dia, hora[0], hora[1]);
    var criadoEm = new Date(agora.getTime() - base.criadoHa * 60000);

    var agendamento = totalizar({
      codigo: base.codigo,
      dataHoraInicio: inicio.toISOString(),
      cliente: { nome: base.cliente, telefone: base.telefone },
      modeloVeiculo: base.veiculo || '',
      observacoes: base.observacoes || '',
      status: base.status,
      origem: base.origem || 'site',
      criadoEm: criadoEm.toISOString(),
      itens: base.servicos.map(function (chave) {
        var servico = servicoPorId(ID_DO_SERVICO[chave]);
        return { servicoId: servico.id, nome: servico.nome, precoPraticado: servico.precoBase, duracaoMinutos: servico.duracaoMinutos };
      }),
    });

    if (base.status === 'PENDENTE') {
      agendamento.expiraEm = new Date(criadoEm.getTime() + PRAZO_RESPOSTA_HORAS * 36e5).toISOString();
    }
    return agendamento;
  }

  function dataISO(data) {
    return [data.getFullYear(), String(data.getMonth() + 1).padStart(2, '0'), String(data.getDate()).padStart(2, '0')].join('-');
  }

  function lerEstado() {
    try {
      var estado = JSON.parse(localStorage.getItem(CHAVE_AGENDA));
      if (estado && Array.isArray(estado.agendamentos)) {
        return estado;
      }
    } catch (erro) {
      // Sem armazenamento: recomeça dos exemplos.
    }
    var agora = new Date();
    var novo = {
      agendamentos: AGENDAMENTOS.map(function (base) {
        return montarAgendamento(base, agora);
      }),
      bloqueios: BLOQUEIOS.map(function (bloqueio) {
        var data = new Date(agora.getFullYear(), agora.getMonth(), agora.getDate() + bloqueio.dia);
        return { data: dataISO(data), motivo: bloqueio.motivo };
      }),
    };
    gravarEstado(novo);
    return novo;
  }

  function gravarEstado(estado) {
    try {
      localStorage.setItem(CHAVE_AGENDA, JSON.stringify(estado));
    } catch (erro) {
      // Sem armazenamento, as mudanças valem só até recarregar a página.
    }
  }

  // Simula o job da RN-08: pedido pendente sem resposta no prazo expira.
  function estadoAtual() {
    var estado = lerEstado();
    var agora = Date.now();
    var mudou = false;
    estado.agendamentos.forEach(function (a) {
      if (a.status === 'PENDENTE' && new Date(a.expiraEm).getTime() <= agora) {
        a.status = 'EXPIRADO';
        delete a.expiraEm;
        mudou = true;
      }
    });
    if (mudou) {
      gravarEstado(estado);
    }
    return estado;
  }

  function copia(valor) {
    return JSON.parse(JSON.stringify(valor));
  }

  function exigirSessao() {
    return sessao().usuario ? null : falhar('SESSAO_EXPIRADA', 'Sua sessão terminou. Entre de novo para continuar.');
  }

  function porCodigo(estado, codigo) {
    return estado.agendamentos.filter(function (a) {
      return a.codigo === String(codigo).toUpperCase();
    })[0];
  }

  // RN-06: a ocupação só cresce no início do novo horário e nos inícios que caem dentro dele.
  function lotado(estado, inicio, fim, ignorar) {
    var ocupando = estado.agendamentos.filter(function (a) {
      return STATUS_QUE_OCUPAM.indexOf(a.status) !== -1 && a.codigo !== ignorar;
    });
    var pontos = [inicio].concat(
      ocupando
        .map(function (a) {
          return new Date(a.dataHoraInicio).getTime();
        })
        .filter(function (p) {
          return p > inicio && p < fim;
        }),
    );
    return pontos.some(function (ponto) {
      var simultaneos = ocupando.filter(function (a) {
        return new Date(a.dataHoraInicio).getTime() <= ponto && new Date(a.dataHoraFim).getTime() > ponto;
      }).length;
      return simultaneos >= CONFIGURACAO.capacidadeSimultanea;
    });
  }

  function lerInstante(data, hora) {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(data || '') || !/^([01]\d|2[0-3]):[0-5]\d$/.test(hora || '')) {
      return null;
    }
    var d = data.split('-').map(Number);
    var h = hora.split(':').map(Number);
    return new Date(d[0], d[1] - 1, d[2], h[0], h[1]);
  }

  function lerItens(ids, anteriores) {
    if (!Array.isArray(ids) || ids.length === 0) {
      return null;
    }
    var itens = [];
    for (var i = 0; i < ids.length; i += 1) {
      var mantido = (anteriores || []).filter(function (item) {
        return item.servicoId === Number(ids[i]);
      })[0];
      var servico = servicoPorId(ids[i]);
      if (!servico || (!mantido && !servico.ativo)) {
        return null;
      }
      itens.push(mantido || { servicoId: servico.id, nome: servico.nome, precoPraticado: servico.precoBase, duracaoMinutos: servico.duracaoMinutos });
    }
    return itens;
  }

  function gerarCodigo(estado) {
    var codigo;
    do {
      codigo = '';
      for (var i = 0; i < 6; i += 1) {
        codigo += ALFABETO_CODIGO[Math.floor(Math.random() * ALFABETO_CODIGO.length)];
      }
    } while (porCodigo(estado, codigo));
    return codigo;
  }

  function porInicio(a, b) {
    return new Date(a.dataHoraInicio) - new Date(b.dataHoraInicio);
  }

  function mesmoDia(a, b) {
    return a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate();
  }

  /* Leituras -------------------------------------------------------------- */

  function resumoDoDia() {
    var semSessao = exigirSessao();
    if (semSessao) {
      return semSessao;
    }
    var agora = new Date();
    var todos = estadoAtual().agendamentos;

    return aguardar(
      copia({
        geradoEm: agora.toISOString(),
        prazoRespostaHoras: PRAZO_RESPOSTA_HORAS,
        hoje: todos
          .filter(function (a) {
            return mesmoDia(new Date(a.dataHoraInicio), agora) && ['CONFIRMADO', 'CONCLUIDO', 'NAO_COMPARECEU'].indexOf(a.status) !== -1;
          })
          .sort(porInicio),
        pendentes: todos
          .filter(function (a) {
            return a.status === 'PENDENTE';
          })
          .sort(function (a, b) {
            return new Date(a.expiraEm) - new Date(b.expiraEm);
          }),
        aguardandoCliente: todos
          .filter(function (a) {
            return a.status === 'AGUARDANDO_CLIENTE';
          })
          .sort(porInicio),
      }),
    );
  }

  function pedidos() {
    var semSessao = exigirSessao();
    if (semSessao) {
      return semSessao;
    }
    var todos = estadoAtual().agendamentos;
    return aguardar(
      copia({
        prazoRespostaHoras: PRAZO_RESPOSTA_HORAS,
        pendentes: todos
          .filter(function (a) {
            return a.status === 'PENDENTE';
          })
          .sort(function (a, b) {
            return new Date(a.expiraEm) - new Date(b.expiraEm);
          }),
        aguardandoCliente: todos
          .filter(function (a) {
            return a.status === 'AGUARDANDO_CLIENTE';
          })
          .sort(porInicio),
      }),
    );
  }

  // de e ate em AAAA-MM-DD, como a rota real.
  function agenda(de, ate, opcoes) {
    var semSessao = exigirSessao();
    if (semSessao) {
      return semSessao;
    }
    var inicio = lerInstante(de, '00:00');
    var fim = lerInstante(ate, '00:00');
    if (!inicio || !fim) {
      return falhar('DADOS_INVALIDOS', 'Informe o período em de e ate (AAAA-MM-DD), com até 62 dias.');
    }
    fim = new Date(fim.getFullYear(), fim.getMonth(), fim.getDate() + 1);
    var liberados = opcoes && opcoes.liberados;

    var lista = estadoAtual()
      .agendamentos.filter(function (a) {
        var momento = new Date(a.dataHoraInicio);
        return momento >= inicio && momento < fim && (liberados || STATUS_LIBERADOS.indexOf(a.status) === -1);
      })
      .sort(porInicio);
    return aguardar(copia({ agendamentos: lista }));
  }

  function opcoesAgenda() {
    var semSessao = exigirSessao();
    if (semSessao) {
      return semSessao;
    }
    var hoje = dataISO(new Date());
    return aguardar(
      copia({
        servicos: Dados.ler()
          .servicos.filter(function (s) {
            return s.ativo;
          })
          .map(function (s) {
            return { id: s.id, nome: s.nome, categoria: s.categoria, precoBase: s.precoBase, duracaoMinutos: s.duracaoMinutos };
          }),
        configuracao: CONFIGURACAO,
        bloqueios: estadoAtual().bloqueios.filter(function (b) {
          return b.data >= hoje;
        }),
      }),
    );
  }

  /* Mudanças -------------------------------------------------------------- */

  function mudarStatus(codigo, para, conferir) {
    var semSessao = exigirSessao();
    if (semSessao) {
      return semSessao;
    }
    var estado = estadoAtual();
    var agendamento = porCodigo(estado, codigo);
    if (!agendamento) {
      return falhar('NAO_ENCONTRADO', MENSAGENS.NAO_ENCONTRADO);
    }
    if ((TRANSICOES[agendamento.status] || []).indexOf(para) === -1) {
      return falhar('TRANSICAO_INVALIDA', MENSAGENS.TRANSICAO_INVALIDA);
    }
    var problema = conferir && conferir(agendamento);
    if (problema) {
      return falhar(problema, MENSAGENS[problema]);
    }
    agendamento.status = para;
    delete agendamento.expiraEm;
    if (para === 'CONFIRMADO') {
      agendamento.respondidoEm = new Date().toISOString();
    }
    gravarEstado(estado);
    return aguardar(copia(agendamento));
  }

  function aceitar(codigo) {
    return mudarStatus(codigo, 'CONFIRMADO');
  }

  function cancelar(codigo) {
    return mudarStatus(codigo, 'CANCELADO');
  }

  function registrarAtendimento(codigo, resultado) {
    if (['CONCLUIDO', 'NAO_COMPARECEU'].indexOf(resultado) === -1) {
      return falhar('DADOS_INVALIDOS', 'Informe o resultado: CONCLUIDO ou NAO_COMPARECEU.');
    }
    return mudarStatus(codigo, resultado, function (agendamento) {
      return new Date(agendamento.dataHoraInicio) > new Date() ? 'ANTES_DO_HORARIO' : null;
    });
  }

  // dados: { nome, telefone, servicos: [ids], data, hora, modeloVeiculo, observacoes }
  function criarAgendamento(dados) {
    var semSessao = exigirSessao();
    if (semSessao) {
      return semSessao;
    }
    var nome = String(dados.nome || '').trim();
    var digitos = String(dados.telefone || '').replace(/\D/g, '');
    if (digitos.length >= 12 && digitos.indexOf('55') === 0) {
      digitos = digitos.slice(2);
    }
    var itens = lerItens(dados.servicos);
    var inicio = lerInstante(dados.data, dados.hora);

    if (nome.length < 3) {
      return falhar('DADOS_INVALIDOS', 'Informe o nome do cliente, com pelo menos 3 letras.');
    }
    if (!/^[1-9]{2}\d{8,9}$/.test(digitos)) {
      return falhar('DADOS_INVALIDOS', 'Informe o telefone com DDD.');
    }
    if (!itens) {
      return falhar('DADOS_INVALIDOS', 'Escolha pelo menos um serviço.');
    }
    if (!inicio) {
      return falhar('DADOS_INVALIDOS', 'Informe a data e a hora.');
    }

    var estado = estadoAtual();
    var telefone = '+55' + digitos;
    var agendamento = totalizar({
      codigo: gerarCodigo(estado),
      dataHoraInicio: inicio.toISOString(),
      cliente: { nome: nome, telefone: telefone },
      modeloVeiculo: String(dados.modeloVeiculo || '').trim(),
      observacoes: String(dados.observacoes || '').trim(),
      status: 'CONFIRMADO',
      origem: 'painel',
      criadoEm: new Date().toISOString(),
      respondidoEm: new Date().toISOString(),
      itens: itens,
    });

    if (lotado(estado, inicio.getTime(), new Date(agendamento.dataHoraFim).getTime(), null)) {
      return falhar('HORARIO_OCUPADO', MENSAGENS.HORARIO_OCUPADO);
    }

    // RN-03: mesmo telefone, mesmo cliente; o nome é atualizado.
    estado.agendamentos.forEach(function (a) {
      if (a.cliente.telefone === telefone) {
        a.cliente.nome = nome;
      }
    });
    estado.agendamentos.push(agendamento);
    gravarEstado(estado);
    return aguardar(copia(agendamento));
  }

  // dados: qualquer combinação de { data + hora, servicos, modeloVeiculo, observacoes }
  function editarAgendamento(codigo, dados) {
    var semSessao = exigirSessao();
    if (semSessao) {
      return semSessao;
    }
    var estado = estadoAtual();
    var atual = porCodigo(estado, codigo);
    if (!atual) {
      return falhar('NAO_ENCONTRADO', MENSAGENS.NAO_ENCONTRADO);
    }
    if (STATUS_QUE_OCUPAM.indexOf(atual.status) === -1) {
      return falhar('STATUS_NAO_PERMITE', MENSAGENS.STATUS_NAO_PERMITE);
    }

    var novo = copia(atual);
    if (dados.servicos !== undefined) {
      novo.itens = lerItens(dados.servicos, atual.itens);
      if (!novo.itens) {
        return falhar('DADOS_INVALIDOS', 'Escolha pelo menos um serviço.');
      }
    }
    if (dados.data !== undefined || dados.hora !== undefined) {
      var inicio = lerInstante(dados.data, dados.hora);
      if (!inicio) {
        return falhar('DADOS_INVALIDOS', 'Informe a data e a hora.');
      }
      novo.dataHoraInicio = inicio.toISOString();
    }
    totalizar(novo);
    if (lotado(estado, new Date(novo.dataHoraInicio).getTime(), new Date(novo.dataHoraFim).getTime(), atual.codigo)) {
      return falhar('HORARIO_OCUPADO', MENSAGENS.HORARIO_OCUPADO);
    }
    if (dados.modeloVeiculo !== undefined) {
      novo.modeloVeiculo = String(dados.modeloVeiculo).trim();
    }
    if (dados.observacoes !== undefined) {
      novo.observacoes = String(dados.observacoes).trim();
    }

    estado.agendamentos[estado.agendamentos.indexOf(atual)] = novo;
    gravarEstado(estado);
    return aguardar(copia(novo));
  }

  /* Serviços (RF-20) e portfólio (RF-21) ------------------------------------- */

  var MAXIMO_DESTAQUES = 4;
  var MAXIMO_FOTOS_GERAIS = 12;

  function exigirPermissao(acao) {
    var semSessao = exigirSessao();
    if (semSessao) {
      return semSessao;
    }
    if (sessao().usuario.permissoes.indexOf(acao) === -1) {
      return falhar('SEM_PERMISSAO', 'Seu perfil não tem acesso a essa área do painel.');
    }
    return null;
  }

  function invalido(mensagem) {
    return falhar('DADOS_INVALIDOS', mensagem);
  }

  function gravarDados(dados) {
    return Dados.gravar(dados)
      ? null
      : falhar(
          'SEM_ESPACO',
          'A demonstração guarda as fotos no navegador e o espaço acabou. Remova algumas fotos para enviar outras.',
        );
  }

  function textoLimpo(valor) {
    return typeof valor === 'string' ? valor.trim().replace(/\s+/g, ' ') : valor;
  }

  // Mesmas regras de src/dominio/catalogo.js. Devolve { campos } ou { erro }.
  function lerServico(corpo, completo) {
    var campos = {};
    var tem = function (campo) {
      return completo || corpo[campo] !== undefined;
    };
    if (tem('nome')) {
      var nome = textoLimpo(corpo.nome);
      if (typeof nome !== 'string' || nome.length < 2 || nome.length > 80) {
        return { erro: 'O nome precisa ter de 2 a 80 caracteres.' };
      }
      campos.nome = nome;
    }
    if (tem('categoria')) {
      var categoria = textoLimpo(corpo.categoria);
      if (typeof categoria !== 'string' || categoria.length < 2 || categoria.length > 40) {
        return { erro: 'A categoria precisa ter de 2 a 40 caracteres.' };
      }
      campos.categoria = categoria;
    }
    if (corpo.descricao !== undefined) {
      var descricao = textoLimpo(corpo.descricao || '');
      if (descricao.length > 300) {
        return { erro: 'A descrição pode ter até 300 caracteres.' };
      }
      campos.descricao = descricao;
    }
    if (tem('precoBase')) {
      if (typeof corpo.precoBase !== 'number' || !isFinite(corpo.precoBase) || corpo.precoBase < 0 || corpo.precoBase > 100000) {
        return { erro: 'Informe o preço inicial em reais, de 0 a 100.000.' };
      }
      campos.precoBase = Math.round(corpo.precoBase * 100) / 100;
    }
    if (tem('duracaoMinutos')) {
      var minutos = corpo.duracaoMinutos;
      if (!Number.isInteger(minutos) || minutos < 5 || minutos > 1440 || minutos % 5 !== 0) {
        return { erro: 'Informe a duração em minutos, de 5 em 5, até 24 horas.' };
      }
      campos.duracaoMinutos = minutos;
    }
    if (corpo.ativo !== undefined) {
      campos.ativo = Boolean(corpo.ativo);
    }
    return { campos: campos };
  }

  function servicoDe(dados, id) {
    return dados.servicos.filter(function (s) {
      return s.id === Number(id);
    })[0];
  }

  function servicosPainel() {
    var bloqueio = exigirPermissao('servicos');
    if (bloqueio) {
      return bloqueio;
    }
    var lista = Dados.ler().servicos.slice().sort(function (a, b) {
      return a.categoria.localeCompare(b.categoria, 'pt-BR') || a.nome.localeCompare(b.nome, 'pt-BR');
    });
    return aguardar(copia({ servicos: lista }));
  }

  function criarServico(corpo) {
    var bloqueio = exigirPermissao('servicos');
    if (bloqueio) {
      return bloqueio;
    }
    var lido = lerServico(corpo || {}, true);
    if (lido.erro) {
      return invalido(lido.erro);
    }
    var dados = Dados.ler();
    var servico = Object.assign({ id: Dados.proximoId(dados.servicos), descricao: '', ativo: true, fotoUrl: '' }, lido.campos);
    dados.servicos.push(servico);
    return gravarDados(dados) || aguardar(copia(servico));
  }

  function editarServico(id, corpo) {
    var bloqueio = exigirPermissao('servicos');
    if (bloqueio) {
      return bloqueio;
    }
    var lido = lerServico(corpo || {}, false);
    if (lido.erro) {
      return invalido(lido.erro);
    }
    var dados = Dados.ler();
    var servico = servicoDe(dados, id);
    if (!servico) {
      return falhar('NAO_ENCONTRADO', 'Serviço não encontrado.');
    }
    Object.assign(servico, lido.campos);
    return gravarDados(dados) || aguardar(copia(servico));
  }

  /*
   * A foto chega como Blob (já em WebP, até 1600 px, por imagem.js). Aqui ela
   * vira data: URL, menor ainda, porque o localStorage tem pouco espaço.
   */
  function fotoParaDemonstracao(blob) {
    return createImageBitmap(blob).then(function (bitmap) {
      var escala = Math.min(1, 960 / Math.max(bitmap.width, bitmap.height));
      var tela = document.createElement('canvas');
      tela.width = Math.round(bitmap.width * escala);
      tela.height = Math.round(bitmap.height * escala);
      tela.getContext('2d').drawImage(bitmap, 0, 0, tela.width, tela.height);
      return tela.toDataURL('image/webp', 0.72);
    });
  }

  function enviarFotoServico(id, blob) {
    var bloqueio = exigirPermissao('servicos');
    if (bloqueio) {
      return bloqueio;
    }
    return fotoParaDemonstracao(blob).then(function (url) {
      var dados = Dados.ler();
      var servico = servicoDe(dados, id);
      if (!servico) {
        return falhar('NAO_ENCONTRADO', 'Serviço não encontrado.');
      }
      servico.fotoUrl = url;
      return gravarDados(dados) || aguardar(copia(servico));
    });
  }

  function removerFotoServico(id) {
    var bloqueio = exigirPermissao('servicos');
    if (bloqueio) {
      return bloqueio;
    }
    var dados = Dados.ler();
    var servico = servicoDe(dados, id);
    if (!servico) {
      return falhar('NAO_ENCONTRADO', 'Serviço não encontrado.');
    }
    servico.fotoUrl = '';
    return gravarDados(dados) || aguardar(copia(servico));
  }

  /* Portfólio --------------------------------------------------------------- */

  function trabalhoDe(dados, id) {
    return dados.trabalhos.filter(function (t) {
      return t.id === Number(id);
    })[0];
  }

  function completo(dados, trabalho) {
    return Dados.trabalhoCompleto(trabalho, dados.servicos);
  }

  function temAntesEDepois(trabalho) {
    var tipos = trabalho.fotos.map(function (f) {
      return f.tipo;
    });
    return tipos.indexOf('ANTES') !== -1 && tipos.indexOf('DEPOIS') !== -1;
  }

  // Mesmas regras de src/dominio/catalogo.js e src/repositorios/portfolio.js.
  function lerTrabalho(corpo, novo) {
    var campos = {};
    if (novo || corpo.titulo !== undefined) {
      var titulo = textoLimpo(corpo.titulo);
      if (typeof titulo !== 'string' || titulo.length < 3 || titulo.length > 100) {
        return { erro: 'O título precisa ter de 3 a 100 caracteres.' };
      }
      campos.titulo = titulo;
    }
    if (corpo.descricao !== undefined) {
      var descricao = textoLimpo(corpo.descricao || '');
      if (descricao.length > 1000) {
        return { erro: 'A descrição pode ter até 1000 caracteres.' };
      }
      campos.descricao = descricao;
    }
    if (corpo.servicoId !== undefined) {
      campos.servicoId = corpo.servicoId === null ? null : Number(corpo.servicoId);
    }
    if (corpo.dataRealizacao !== undefined) {
      if (corpo.dataRealizacao !== null && !/^\d{4}-\d{2}-\d{2}$/.test(corpo.dataRealizacao)) {
        return { erro: 'Informe a data no formato AAAA-MM-DD.' };
      }
      campos.dataRealizacao = corpo.dataRealizacao;
    }
    ['publicado', 'emDestaque', 'naCapa'].forEach(function (campo) {
      if (corpo[campo] !== undefined) {
        campos[campo] = Boolean(corpo[campo]);
      }
    });
    return { campos: campos };
  }

  function portfolioPainel() {
    var bloqueio = exigirPermissao('portfolio');
    if (bloqueio) {
      return bloqueio;
    }
    var dados = Dados.ler();
    var trabalhos = dados.trabalhos
      .slice()
      .sort(function (a, b) {
        return String(b.dataRealizacao || '').localeCompare(String(a.dataRealizacao || '')) || b.id - a.id;
      })
      .map(function (t) {
        return completo(dados, t);
      });
    var servicos = dados.servicos.map(function (s) {
      return { id: s.id, nome: s.nome, ativo: s.ativo };
    });
    return aguardar(copia({ trabalhos: trabalhos, servicos: servicos }));
  }

  function criarTrabalho(corpo) {
    var bloqueio = exigirPermissao('portfolio');
    if (bloqueio) {
      return bloqueio;
    }
    var lido = lerTrabalho(corpo || {}, true);
    if (lido.erro) {
      return invalido(lido.erro);
    }
    var dados = Dados.ler();
    var trabalho = Object.assign(
      { id: Dados.proximoId(dados.trabalhos), descricao: '', servicoId: null, dataRealizacao: null, publicado: false, naCapa: false, emDestaque: false, fotos: [] },
      lido.campos,
      { naCapa: false, emDestaque: false },
    );
    dados.trabalhos.push(trabalho);
    return gravarDados(dados) || aguardar(completo(dados, trabalho));
  }

  function editarTrabalho(id, corpo) {
    var bloqueio = exigirPermissao('portfolio');
    if (bloqueio) {
      return bloqueio;
    }
    var lido = lerTrabalho(corpo || {}, false);
    if (lido.erro) {
      return invalido(lido.erro);
    }
    var dados = Dados.ler();
    var trabalho = trabalhoDe(dados, id);
    if (!trabalho) {
      return falhar('NAO_ENCONTRADO', 'Trabalho não encontrado.');
    }
    var c = lido.campos;
    var publicado = c.publicado !== undefined ? c.publicado : trabalho.publicado;

    if (c.emDestaque === true && !publicado) {
      return falhar('NAO_PUBLICADO', 'Publique o trabalho antes de colocá-lo no início.');
    }
    if (c.emDestaque === true && !trabalho.emDestaque) {
      var destaques = dados.trabalhos.filter(function (t) {
        return t.emDestaque;
      }).length;
      if (destaques >= MAXIMO_DESTAQUES) {
        return falhar('LIMITE_DESTAQUES', 'O início mostra até ' + MAXIMO_DESTAQUES + ' trabalhos. Tire um dos destaques antes de escolher outro.');
      }
    }
    if (c.naCapa === true && !(publicado && temAntesEDepois(trabalho))) {
      return falhar('CAPA_SEM_FOTOS', 'Para ir para a capa, o trabalho precisa estar publicado e ter a foto de antes e a de depois.');
    }

    ['titulo', 'descricao', 'servicoId', 'dataRealizacao', 'publicado', 'emDestaque'].forEach(function (campo) {
      if (c[campo] !== undefined) {
        trabalho[campo] = c[campo];
      }
    });
    if (!publicado) {
      trabalho.emDestaque = false;
      trabalho.naCapa = false;
    }
    if (c.naCapa === true) {
      dados.trabalhos.forEach(function (t) {
        t.naCapa = t === trabalho;
      });
    } else if (c.naCapa === false) {
      trabalho.naCapa = false;
    }
    return gravarDados(dados) || aguardar(completo(dados, trabalho));
  }

  function excluirTrabalho(id) {
    var bloqueio = exigirPermissao('portfolio');
    if (bloqueio) {
      return bloqueio;
    }
    var dados = Dados.ler();
    var trabalho = trabalhoDe(dados, id);
    if (!trabalho) {
      return falhar('NAO_ENCONTRADO', 'Trabalho não encontrado.');
    }
    dados.trabalhos.splice(dados.trabalhos.indexOf(trabalho), 1);
    return gravarDados(dados) || aguardar(true);
  }

  // ANTES e DEPOIS substituem a anterior; GERAL entra no fim da lista.
  function enviarFotoTrabalho(id, blob, tipo) {
    var bloqueio = exigirPermissao('portfolio');
    if (bloqueio) {
      return bloqueio;
    }
    if (['ANTES', 'DEPOIS', 'GERAL'].indexOf(tipo) === -1) {
      return invalido('O tipo da foto deve ser ANTES, DEPOIS ou GERAL.');
    }
    return fotoParaDemonstracao(blob).then(function (url) {
      var dados = Dados.ler();
      var trabalho = trabalhoDe(dados, id);
      if (!trabalho) {
        return falhar('NAO_ENCONTRADO', 'Trabalho não encontrado.');
      }
      var doTipo = trabalho.fotos.filter(function (f) {
        return f.tipo === tipo;
      });
      if (tipo === 'GERAL' && doTipo.length >= MAXIMO_FOTOS_GERAIS) {
        return falhar('LIMITE_FOTOS', 'Cada trabalho pode ter até ' + MAXIMO_FOTOS_GERAIS + ' fotos extras.');
      }
      if (tipo !== 'GERAL' && doTipo.length) {
        doTipo[0].url = url;
      } else {
        var todasAsFotos = dados.trabalhos.reduce(function (lista, t) {
          return lista.concat(t.fotos);
        }, []);
        trabalho.fotos.push({
          id: Dados.proximoId(todasAsFotos),
          url: url,
          tipo: tipo,
          legenda: '',
          ordem: doTipo.reduce(function (maior, f) {
            return Math.max(maior, f.ordem + 1);
          }, 0),
        });
      }
      return gravarDados(dados) || aguardar(completo(dados, trabalho));
    });
  }

  function fotoDe(trabalho, fotoId) {
    return trabalho.fotos.filter(function (f) {
      return f.id === Number(fotoId);
    })[0];
  }

  function editarFotoTrabalho(id, fotoId, corpo) {
    var bloqueio = exigirPermissao('portfolio');
    if (bloqueio) {
      return bloqueio;
    }
    var legenda = textoLimpo((corpo && corpo.legenda) || '');
    if (legenda.length > 140) {
      return invalido('A legenda pode ter até 140 caracteres.');
    }
    var dados = Dados.ler();
    var trabalho = trabalhoDe(dados, id);
    var foto = trabalho && fotoDe(trabalho, fotoId);
    if (!foto) {
      return falhar('NAO_ENCONTRADO', 'Foto não encontrada.');
    }
    foto.legenda = legenda;
    return gravarDados(dados) || aguardar(completo(dados, trabalho));
  }

  // Apagar a foto ANTES ou DEPOIS tira o trabalho da capa (como o gatilho do banco).
  function removerFotoTrabalho(id, fotoId) {
    var bloqueio = exigirPermissao('portfolio');
    if (bloqueio) {
      return bloqueio;
    }
    var dados = Dados.ler();
    var trabalho = trabalhoDe(dados, id);
    var foto = trabalho && fotoDe(trabalho, fotoId);
    if (!foto) {
      return falhar('NAO_ENCONTRADO', 'Foto não encontrada.');
    }
    trabalho.fotos.splice(trabalho.fotos.indexOf(foto), 1);
    if (foto.tipo !== 'GERAL') {
      trabalho.naCapa = false;
    }
    return gravarDados(dados) || aguardar(completo(dados, trabalho));
  }

  function ordenarFotosTrabalho(id, ids) {
    var bloqueio = exigirPermissao('portfolio');
    if (bloqueio) {
      return bloqueio;
    }
    var dados = Dados.ler();
    var trabalho = trabalhoDe(dados, id);
    if (!trabalho) {
      return falhar('NAO_ENCONTRADO', 'Trabalho não encontrado.');
    }
    var gerais = trabalho.fotos.filter(function (f) {
      return f.tipo === 'GERAL';
    });
    var mesmas = ids.length === gerais.length && gerais.every(function (f) {
      return ids.indexOf(f.id) !== -1;
    });
    if (!mesmas) {
      return falhar('FOTOS_MUDARAM', 'As fotos deste trabalho mudaram. Recarregue a página.');
    }
    gerais.forEach(function (f) {
      f.ordem = ids.indexOf(f.id);
    });
    return gravarDados(dados) || aguardar(completo(dados, trabalho));
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
    pedidos: pedidos,
    agenda: agenda,
    opcoesAgenda: opcoesAgenda,
    criarAgendamento: criarAgendamento,
    editarAgendamento: editarAgendamento,
    aceitar: aceitar,
    cancelar: cancelar,
    registrarAtendimento: registrarAtendimento,
    servicosPainel: servicosPainel,
    criarServico: criarServico,
    editarServico: editarServico,
    enviarFotoServico: enviarFotoServico,
    removerFotoServico: removerFotoServico,
    portfolioPainel: portfolioPainel,
    criarTrabalho: criarTrabalho,
    editarTrabalho: editarTrabalho,
    excluirTrabalho: excluirTrabalho,
    enviarFotoTrabalho: enviarFotoTrabalho,
    editarFotoTrabalho: editarFotoTrabalho,
    removerFotoTrabalho: removerFotoTrabalho,
    ordenarFotosTrabalho: ordenarFotosTrabalho,
    // Só para testes: faz a sessão parecer parada há N minutos.
    envelhecerSessao: function (minutos) {
      var atual = lerSessao();
      if (atual) {
        atual.ultimaAtividade -= minutos * 60000;
        gravarSessao(atual);
      }
    },
    // Só para testes: volta aos agendamentos, serviços e trabalhos de exemplo.
    reiniciarDemonstracao: function () {
      try {
        localStorage.removeItem(CHAVE_AGENDA);
      } catch (erro) {
        // Nada a apagar.
      }
      Dados.reiniciar();
    },
  };
})();
