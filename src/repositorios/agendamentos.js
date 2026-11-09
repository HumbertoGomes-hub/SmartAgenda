/* Consultas de agendamentos para o painel. */
'use strict';

const { supabase, exigirSucesso } = require('../banco/supabase');

// Status que ocupam a agenda do dia; os demais liberam o horário (RF-08).
const STATUS_DA_AGENDA = ['CONFIRMADO', 'CONCLUIDO', 'NAO_COMPARECEU'];
const STATUS_EM_ABERTO = ['PENDENTE', 'AGUARDANDO_CLIENTE'];

const SELECAO = `
  codigo,
  data_hora_inicio,
  data_hora_fim,
  modelo_veiculo,
  observacoes,
  status,
  origem,
  criado_em,
  cliente:cliente_id ( nome, telefone ),
  itens:item_agendamento ( servico_id, preco_praticado, duracao_minutos, servico:servico_id ( nome ) )
`;

/*
 * Converte a linha do banco para o formato que o painel usa
 * (o mesmo de public/js/admin/api-admin-exemplo.js).
 */
function paraResposta(linha, prazoRespostaHoras) {
  const itens = (linha.itens || []).map((item) => ({
    servicoId: item.servico_id,
    nome: item.servico ? item.servico.nome : '',
    precoPraticado: Number(item.preco_praticado),
    duracaoMinutos: item.duracao_minutos,
  }));

  const agendamento = {
    codigo: linha.codigo,
    dataHoraInicio: new Date(linha.data_hora_inicio).toISOString(),
    dataHoraFim: new Date(linha.data_hora_fim).toISOString(),
    cliente: {
      nome: linha.cliente ? linha.cliente.nome : '',
      telefone: linha.cliente ? linha.cliente.telefone : '',
    },
    modeloVeiculo: linha.modelo_veiculo || '',
    observacoes: linha.observacoes || '',
    status: linha.status,
    origem: linha.origem || 'site',
    criadoEm: new Date(linha.criado_em).toISOString(),
    itens,
    duracaoMinutos: itens.reduce((total, item) => total + item.duracaoMinutos, 0),
    valorEstimado: itens.reduce((total, item) => total + item.precoPraticado, 0),
  };

  // RN-08: o pedido pendente expira se ninguém responder dentro do prazo.
  if (linha.status === 'PENDENTE') {
    const criado = new Date(linha.criado_em).getTime();
    agendamento.expiraEm = new Date(criado + prazoRespostaHoras * 36e5).toISOString();
  }

  return agendamento;
}

async function prazoRespostaHoras() {
  const resposta = await supabase
    .from('configuracao_agenda')
    .select('prazo_resposta_horas')
    .limit(1)
    .maybeSingle();
  const configuracao = exigirSucesso(resposta, 'agendamentos.prazoRespostaHoras');
  return configuracao ? configuracao.prazo_resposta_horas : 12;
}

/*
 * Resumo da tela inicial do painel: atendimentos de hoje, pedidos pendentes
 * (do que expira primeiro ao último) e reagendamentos aguardando o cliente.
 * "Hoje" segue o fuso da estética (variável TZ, ver config.js).
 */
async function resumoDoDia(agora = new Date()) {
  const inicioDoDia = new Date(agora.getFullYear(), agora.getMonth(), agora.getDate());
  const inicioDeAmanha = new Date(agora.getFullYear(), agora.getMonth(), agora.getDate() + 1);

  const [prazo, respostaHoje, respostaAbertos] = await Promise.all([
    prazoRespostaHoras(),
    supabase
      .from('agendamento')
      .select(SELECAO)
      .in('status', STATUS_DA_AGENDA)
      .gte('data_hora_inicio', inicioDoDia.toISOString())
      .lt('data_hora_inicio', inicioDeAmanha.toISOString())
      .order('data_hora_inicio'),
    supabase
      .from('agendamento')
      .select(SELECAO)
      .in('status', STATUS_EM_ABERTO)
      .order('data_hora_inicio'),
  ]);

  const hoje = exigirSucesso(respostaHoje, 'agendamentos.resumoDoDia.hoje');
  const abertos = exigirSucesso(respostaAbertos, 'agendamentos.resumoDoDia.abertos');
  const formatar = (linha) => paraResposta(linha, prazo);

  return {
    geradoEm: agora.toISOString(),
    prazoRespostaHoras: prazo,
    hoje: hoje.map(formatar),
    pendentes: abertos
      .filter((linha) => linha.status === 'PENDENTE')
      .map(formatar)
      .sort((a, b) => new Date(a.expiraEm) - new Date(b.expiraEm)),
    aguardandoCliente: abertos.filter((linha) => linha.status === 'AGUARDANDO_CLIENTE').map(formatar),
  };
}

module.exports = { SELECAO, paraResposta, prazoRespostaHoras, resumoDoDia, STATUS_DA_AGENDA, STATUS_EM_ABERTO };
