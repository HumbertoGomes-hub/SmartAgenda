/*
 * Pedidos e agenda do painel (RF-16 a RF-19).
 *
 * Leituras e mudanças de status passam pelo supabase-js. Criar e remarcar
 * horários chamam as funções SQL de supabase/migrations, que conferem a
 * capacidade (RN-06) com a agenda do dia travada.
 */
'use strict';

const config = require('../config');
const { supabase, exigirSucesso } = require('../banco/supabase');
const { SELECAO, paraResposta, prazoRespostaHoras } = require('./agendamentos');
const { STATUS_QUE_OCUPAM, podeMudar } = require('../dominio/agenda');
const { ErroHttp } = require('../util/erros');

// Status que saem da agenda: só aparecem quando o painel pede.
const STATUS_LIBERADOS = ['RECUSADO', 'EXPIRADO', 'CANCELADO'];
const DIAS_SEMANA = ['DOM', 'SEG', 'TER', 'QUA', 'QUI', 'SEX', 'SAB'];

// Exceções levantadas pelas funções SQL -> respostas para o painel.
const ERROS_DO_BANCO = {
  HORARIO_OCUPADO: [409, 'Esse horário já está ocupado. Escolha outro horário ou mude os serviços.'],
  NAO_ENCONTRADO: [404, 'Agendamento não encontrado.'],
  STATUS_NAO_PERMITE: [409, 'Este agendamento já foi encerrado e não pode mais mudar de horário.'],
  SEM_SERVICO: [400, 'Escolha pelo menos um serviço.'],
  SERVICO_REPETIDO: [400, 'O mesmo serviço foi escolhido duas vezes.'],
  SERVICO_INVALIDO: [400, 'Um dos serviços não existe ou foi desativado. Recarregue a página.'],
};

function exigirSucessoDaAgenda(resposta, contexto) {
  const erro = resposta.error;
  if (erro) {
    const conhecido = Object.keys(ERROS_DO_BANCO).find((codigo) => (erro.message || '').includes(codigo));
    if (conhecido) {
      const [status, mensagem] = ERROS_DO_BANCO[conhecido];
      throw new ErroHttp(status, conhecido, mensagem);
    }
    // 23514: violação de check (ex.: nome do cliente com menos de 3 letras).
    if (erro.code === '23514') {
      throw new ErroHttp(400, 'DADOS_INVALIDOS', 'Confira o nome e o telefone do cliente.');
    }
  }
  return exigirSucesso(resposta, contexto);
}

function naoEncontrado() {
  return new ErroHttp(404, 'NAO_ENCONTRADO', 'Agendamento não encontrado.');
}

async function buscar(codigo) {
  const [prazo, resposta] = await Promise.all([
    prazoRespostaHoras(),
    supabase.from('agendamento').select(SELECAO).eq('codigo', codigo).maybeSingle(),
  ]);
  const linha = exigirSucesso(resposta, 'agenda.buscar');
  return linha ? paraResposta(linha, prazo) : null;
}

async function exigir(codigo) {
  const agendamento = await buscar(codigo);
  if (!agendamento) {
    throw naoEncontrado();
  }
  return agendamento;
}

/* Pedidos (RF-16) ------------------------------------------------------- */

// Pedidos do site esperando resposta (o que expira primeiro vem antes) e
// propostas de novo horário esperando o cliente.
async function listarPedidos() {
  const [prazo, resposta] = await Promise.all([
    prazoRespostaHoras(),
    supabase
      .from('agendamento')
      .select(SELECAO)
      .in('status', ['PENDENTE', 'AGUARDANDO_CLIENTE'])
      .order('data_hora_inicio'),
  ]);
  const linhas = exigirSucesso(resposta, 'agenda.listarPedidos').map((linha) => paraResposta(linha, prazo));
  return {
    prazoRespostaHoras: prazo,
    pendentes: linhas
      .filter((a) => a.status === 'PENDENTE')
      .sort((a, b) => new Date(a.expiraEm) - new Date(b.expiraEm)),
    aguardandoCliente: linhas.filter((a) => a.status === 'AGUARDANDO_CLIENTE'),
  };
}

/* Agenda (RF-17) -------------------------------------------------------- */

async function listarPeriodo(inicio, fim, { incluirLiberados = false } = {}) {
  let consulta = supabase
    .from('agendamento')
    .select(SELECAO)
    .gte('data_hora_inicio', inicio.toISOString())
    .lt('data_hora_inicio', fim.toISOString())
    .order('data_hora_inicio');
  if (!incluirLiberados) {
    consulta = consulta.not('status', 'in', `(${STATUS_LIBERADOS.join(',')})`);
  }
  const [prazo, resposta] = await Promise.all([prazoRespostaHoras(), consulta]);
  return exigirSucesso(resposta, 'agenda.listarPeriodo').map((linha) => paraResposta(linha, prazo));
}

// O que os formulários da agenda precisam: serviços ativos, horário de
// funcionamento e datas bloqueadas daqui para frente.
async function opcoes(hoje = new Date()) {
  const dataHoje = [
    hoje.getFullYear(),
    String(hoje.getMonth() + 1).padStart(2, '0'),
    String(hoje.getDate()).padStart(2, '0'),
  ].join('-');

  const [respostaServicos, respostaConfiguracao, respostaBloqueios] = await Promise.all([
    supabase
      .from('servico')
      .select('id, nome, categoria, preco_base, duracao_minutos')
      .eq('ativo', true)
      .order('categoria')
      .order('nome'),
    supabase
      .from('configuracao_agenda')
      .select('dias_funcionamento, hora_abertura, hora_fechamento, intervalo_minutos, capacidade_simultanea')
      .limit(1)
      .maybeSingle(),
    supabase.from('bloqueio_agenda').select('data, motivo').gte('data', dataHoje).order('data'),
  ]);

  const servicos = exigirSucesso(respostaServicos, 'agenda.opcoes.servicos');
  const configuracao = exigirSucesso(respostaConfiguracao, 'agenda.opcoes.configuracao') || {};
  const bloqueios = exigirSucesso(respostaBloqueios, 'agenda.opcoes.bloqueios');

  return {
    servicos: servicos.map((s) => ({
      id: s.id,
      nome: s.nome,
      categoria: s.categoria,
      precoBase: Number(s.preco_base),
      duracaoMinutos: s.duracao_minutos,
    })),
    configuracao: {
      // 0 = domingo ... 6 = sábado, como Date.getDay() no navegador.
      diasFuncionamento: (configuracao.dias_funcionamento || DIAS_SEMANA.slice(1))
        .map((dia) => DIAS_SEMANA.indexOf(dia))
        .filter((dia) => dia >= 0)
        .sort(),
      horaAbertura: (configuracao.hora_abertura || '08:00').slice(0, 5),
      horaFechamento: (configuracao.hora_fechamento || '18:00').slice(0, 5),
      intervaloMinutos: configuracao.intervalo_minutos || 30,
      capacidadeSimultanea: configuracao.capacidade_simultanea || 1,
    },
    bloqueios: bloqueios.map((b) => ({ data: b.data, motivo: b.motivo || '' })),
  };
}

/* Mudanças de status ---------------------------------------------------- */

/*
 * Muda o status conferindo a transição (RN-16). A gravação só acontece se o
 * status ainda for o lido: se outra pessoa respondeu no meio do caminho,
 * nada muda e o painel pede para recarregar.
 */
async function mudarStatus(codigo, para, extras = {}, conferir) {
  const atual = await exigir(codigo);
  if (!podeMudar(atual.status, para)) {
    throw new ErroHttp(
      409,
      'TRANSICAO_INVALIDA',
      'Este agendamento não pode mais receber essa ação. Recarregue para ver a situação atual.',
    );
  }
  if (conferir) {
    conferir(atual);
  }

  const resposta = await supabase
    .from('agendamento')
    .update({ status: para, ...extras })
    .eq('codigo', codigo)
    .eq('status', atual.status)
    .select('codigo');
  const alterados = exigirSucesso(resposta, 'agenda.mudarStatus');
  if (alterados.length === 0) {
    throw new ErroHttp(409, 'MUDOU_NO_MEIO', 'Outra pessoa mudou este agendamento agora há pouco. Recarregue para ver.');
  }
  return exigir(codigo);
}

// RF-16: aceitar o pedido. O horário já estava reservado desde o pedido.
function aceitar(codigo, usuarioId) {
  return mudarStatus(codigo, 'CONFIRMADO', {
    responsavel_id: usuarioId,
    respondido_em: new Date().toISOString(),
  });
}

// Desmarcar pelo painel libera o horário (RF-08).
function cancelar(codigo) {
  return mudarStatus(codigo, 'CANCELADO');
}

// RF-19: só depois do horário marcado.
function registrarAtendimento(codigo, resultado, agora = new Date()) {
  return mudarStatus(codigo, resultado, {}, (atual) => {
    if (new Date(atual.dataHoraInicio) > agora) {
      throw new ErroHttp(
        409,
        'ANTES_DO_HORARIO',
        'O atendimento só pode ser registrado a partir do horário marcado.',
      );
    }
  });
}

/* Criar e remarcar ------------------------------------------------------ */

// RF-18: agendamento manual, já confirmado.
async function criarManual({ nome, telefone, servicos, inicio, modeloVeiculo, observacoes, responsavelId }) {
  const resposta = await supabase.rpc('criar_agendamento_painel', {
    p_nome: nome,
    p_telefone: telefone,
    p_servicos: servicos,
    p_inicio: inicio.toISOString(),
    p_modelo_veiculo: modeloVeiculo,
    p_observacoes: observacoes,
    p_responsavel: responsavelId,
    p_fuso: config.fusoHorario,
  });
  const codigo = exigirSucessoDaAgenda(resposta, 'agenda.criarManual');
  return exigir(codigo);
}

/*
 * Editar: muda horário e/ou serviços (conferindo a capacidade no banco) e,
 * depois, veículo e observações. Campos ausentes ficam como estão.
 */
async function editar(codigo, { inicio, servicos, modeloVeiculo, observacoes }) {
  const atual = await exigir(codigo);
  if (!STATUS_QUE_OCUPAM.includes(atual.status)) {
    throw new ErroHttp(409, 'STATUS_NAO_PERMITE', ERROS_DO_BANCO.STATUS_NAO_PERMITE[1]);
  }

  if (inicio || servicos) {
    const resposta = await supabase.rpc('remarcar_agendamento', {
      p_codigo: codigo,
      p_inicio: (inicio || new Date(atual.dataHoraInicio)).toISOString(),
      p_servicos: servicos || null,
      p_fuso: config.fusoHorario,
    });
    exigirSucessoDaAgenda(resposta, 'agenda.editar.remarcar');
  }

  const detalhes = {};
  if (modeloVeiculo !== undefined) {
    detalhes.modelo_veiculo = modeloVeiculo || null;
  }
  if (observacoes !== undefined) {
    detalhes.observacoes = observacoes || null;
  }
  if (Object.keys(detalhes).length > 0) {
    exigirSucesso(
      await supabase.from('agendamento').update(detalhes).eq('codigo', codigo),
      'agenda.editar.detalhes',
    );
  }

  return exigir(codigo);
}

module.exports = {
  buscar,
  listarPedidos,
  listarPeriodo,
  opcoes,
  aceitar,
  cancelar,
  registrarAtendimento,
  criarManual,
  editar,
};
