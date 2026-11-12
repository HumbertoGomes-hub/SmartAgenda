/*
 * Dados públicos do site (RF-01, RF-04, RF-05): identidade e contatos da
 * estética, agenda para o calendário, horários livres e o pedido do cliente.
 * Só sai o que pode aparecer no site: o telefone das notificações do dono
 * (telefone_whatsapp) fica no servidor.
 */
'use strict';

const config = require('../config');
const { supabase, exigirSucesso } = require('../banco/supabase');
const empresa = require('./empresa');
const { agendaParaResposta, dataISO } = require('../dominio/configuracoes');
const { STATUS_QUE_OCUPAM } = require('../dominio/agenda');
const { horariosLivres } = require('../dominio/horarios');
const { ErroHttp } = require('../util/erros');

const COLUNAS_AGENDA =
  'dias_funcionamento, hora_abertura, hora_fechamento, intervalo_minutos, capacidade_simultanea, ' +
  'antecedencia_minima_horas, limite_dias_futuros, prazo_resposta_horas, prazo_cancelamento_horas';

// Exceções de criar_agendamento_site -> respostas para o cliente.
const ERROS_DO_PEDIDO = {
  ANTECEDENCIA_MINIMA: [409, 'Esse horário ficou muito em cima da hora. Escolha um horário mais tarde.'],
  ALEM_DO_LIMITE: [409, 'Essa data está além do período aberto para agendamento. Escolha uma data mais próxima.'],
  DIA_FECHADO: [409, 'A estética não atende nesse dia. Escolha outra data.'],
  FORA_DO_EXPEDIENTE: [409, 'Os serviços escolhidos não terminam antes do fechamento nesse horário. Escolha um horário mais cedo.'],
  HORARIO_OCUPADO: [409, 'Esse horário acabou de ser ocupado. Escolha outro horário.'],
  LIMITE_ATIVOS: [
    409,
    'Este telefone já tem 2 agendamentos em aberto. Para marcar outro, fale com a estética pelo WhatsApp ou aguarde um dos atendimentos.',
  ],
  SEM_SERVICO: [400, 'Escolha pelo menos um serviço.'],
  SERVICO_REPETIDO: [400, 'O mesmo serviço foi escolhido duas vezes.'],
  SERVICO_INVALIDO: [409, 'Um dos serviços escolhidos não está mais disponível. Recarregue a página.'],
  AGENDA_NAO_CONFIGURADA: [503, 'O agendamento pelo site ainda não está disponível. Fale com a estética pelo WhatsApp.'],
};

async function lerAgenda(empresaId) {
  const resposta = await supabase
    .from('configuracao_agenda')
    .select(COLUNAS_AGENDA)
    .eq('empresa_id', empresaId)
    .maybeSingle();
  return agendaParaResposta(exigirSucesso(resposta, 'vitrine.lerAgenda'));
}

// Identidade, contatos e horário de funcionamento, para todas as páginas.
async function empresaPublica() {
  const empresaId = await empresa.buscarId();
  const [resposta, agenda] = await Promise.all([
    supabase
      .from('empresa')
      .select('nome, descricao, endereco, telefone_contato, instagram, cor_primaria, logotipo_url')
      .eq('id', empresaId)
      .single(),
    lerAgenda(empresaId),
  ]);
  const linha = exigirSucesso(resposta, 'vitrine.empresaPublica');
  return {
    nome: linha.nome,
    descricao: linha.descricao || '',
    endereco: linha.endereco || '',
    telefoneContato: linha.telefone_contato || '',
    instagram: linha.instagram || '',
    corPrimaria: linha.cor_primaria || '',
    logotipoUrl: linha.logotipo_url || '',
    horario: {
      diasFuncionamento: agenda.diasFuncionamento,
      horaAbertura: agenda.horaAbertura,
      horaFechamento: agenda.horaFechamento,
    },
  };
}

// O que o calendário do agendamento precisa. Os motivos dos bloqueios não saem.
async function agendaPublica(hoje = new Date()) {
  const empresaId = await empresa.buscarId();
  const [agenda, resposta] = await Promise.all([
    lerAgenda(empresaId),
    supabase.from('bloqueio_agenda').select('data').eq('empresa_id', empresaId).gte('data', dataISO(hoje)).order('data'),
  ]);
  return {
    diasFuncionamento: agenda.diasFuncionamento,
    horaAbertura: agenda.horaAbertura,
    horaFechamento: agenda.horaFechamento,
    intervaloMinutos: agenda.intervaloMinutos,
    limiteDiasFuturos: agenda.limiteDiasFuturos,
    prazoRespostaHoras: agenda.prazoRespostaHoras,
    bloqueios: exigirSucesso(resposta, 'vitrine.agendaPublica').map((b) => b.data),
  };
}

/*
 * Horários livres de um dia para a duração dos serviços escolhidos (RF-04).
 * data: { ano, mes, dia }; servicoIds: ids validados.
 */
async function horarios(data, servicoIds) {
  // Pedidos vencidos liberam o horário antes da conta (o pg_cron também faz isso).
  exigirSucesso(await supabase.rpc('expirar_pedidos'), 'vitrine.expirar');

  const empresaId = await empresa.buscarId();
  const meiaNoite = new Date(data.ano, data.mes - 1, data.dia);
  const amanha = new Date(data.ano, data.mes - 1, data.dia + 1);

  const [agenda, respostaServicos, respostaBloqueio, respostaOcupados] = await Promise.all([
    lerAgenda(empresaId),
    supabase.from('servico').select('id, duracao_minutos').in('id', servicoIds).eq('ativo', true),
    supabase.from('bloqueio_agenda').select('data').eq('empresa_id', empresaId).eq('data', dataISO(meiaNoite)),
    supabase
      .from('agendamento')
      .select('data_hora_inicio, data_hora_fim')
      .in('status', STATUS_QUE_OCUPAM)
      .lt('data_hora_inicio', amanha.toISOString())
      .gt('data_hora_fim', meiaNoite.toISOString()),
  ]);

  const servicos = exigirSucesso(respostaServicos, 'vitrine.horarios.servicos');
  if (servicos.length !== servicoIds.length) {
    throw new ErroHttp(409, 'SERVICO_INVALIDO', ERROS_DO_PEDIDO.SERVICO_INVALIDO[1]);
  }
  const ocupados = exigirSucesso(respostaOcupados, 'vitrine.horarios.ocupados').map((a) => ({
    inicio: new Date(a.data_hora_inicio),
    fim: new Date(a.data_hora_fim),
  }));

  return horariosLivres({
    data,
    duracaoMinutos: servicos.reduce((total, s) => total + s.duracao_minutos, 0),
    agenda,
    bloqueado: exigirSucesso(respostaBloqueio, 'vitrine.horarios.bloqueio').length > 0,
    ocupados,
  });
}

// RF-05: grava o pedido (PENDENTE) com todas as regras no banco. Devolve o código.
async function criarPedido({ nome, telefone, servicos, inicio, modeloVeiculo, observacoes }) {
  const resposta = await supabase.rpc('criar_agendamento_site', {
    p_nome: nome,
    p_telefone: telefone,
    p_servicos: servicos,
    p_inicio: inicio.toISOString(),
    p_modelo_veiculo: modeloVeiculo,
    p_observacoes: observacoes,
    p_fuso: config.fusoHorario,
  });
  const erro = resposta.error;
  if (erro) {
    const conhecido = Object.keys(ERROS_DO_PEDIDO).find((codigo) => (erro.message || '').includes(codigo));
    if (conhecido) {
      const [status, mensagem] = ERROS_DO_PEDIDO[conhecido];
      throw new ErroHttp(status, conhecido, mensagem);
    }
    if (erro.code === '23514') {
      throw new ErroHttp(400, 'DADOS_INVALIDOS', 'Confira o nome e o telefone.');
    }
  }
  return exigirSucesso(resposta, 'vitrine.criarPedido');
}

module.exports = { empresaPublica, agendaPublica, horarios, criarPedido, ERROS_DO_PEDIDO };
