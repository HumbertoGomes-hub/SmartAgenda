/*
 * Configurações do painel: agenda (RF-22) e vitrine (RF-23).
 * Só regras, sem banco: lê o que chega do painel (lança ErroHttp 400 quando
 * algo está errado) e converte entre o formato do painel e o do banco.
 */
'use strict';

const { lerTexto, lerData, lerHora, lerTelefone } = require('./agenda');
const { ErroHttp } = require('../util/erros');

// No banco, os dias são textos (List<String> na UML); no painel, 0 = domingo
// ... 6 = sábado, como Date.getDay() no navegador.
const DIAS_SEMANA = Object.freeze(['DOM', 'SEG', 'TER', 'QUA', 'QUI', 'SEX', 'SAB']);
const INTERVALOS = Object.freeze([10, 15, 20, 30, 45, 60]);

function invalido(mensagem) {
  return new ErroHttp(400, 'DADOS_INVALIDOS', mensagem);
}

function inteiro(corpo, campo, { minimo, maximo, mensagem }) {
  const valor = corpo[campo];
  if (!Number.isInteger(valor) || valor < minimo || valor > maximo) {
    throw invalido(mensagem);
  }
  return valor;
}

function minutosParaHora(minutos) {
  return `${String(Math.floor(minutos / 60)).padStart(2, '0')}:${String(minutos % 60).padStart(2, '0')}`;
}

/* Agenda (RF-22) ----------------------------------------------------------- */

function lerAgenda(corpo) {
  corpo = corpo || {};

  const dias = corpo.diasFuncionamento;
  if (
    !Array.isArray(dias) ||
    dias.length === 0 ||
    !dias.every((dia) => Number.isInteger(dia) && dia >= 0 && dia <= 6) ||
    new Set(dias).size !== dias.length
  ) {
    throw invalido('Escolha pelo menos um dia de funcionamento.');
  }

  const abertura = lerHora(corpo.horaAbertura);
  const fechamento = lerHora(corpo.horaFechamento);
  if (abertura === null || fechamento === null) {
    throw invalido('Informe a abertura e o fechamento no formato HH:MM, em múltiplos de 5 minutos.');
  }
  if (fechamento <= abertura) {
    throw invalido('O fechamento precisa ser depois da abertura.');
  }

  if (!INTERVALOS.includes(corpo.intervaloMinutos)) {
    throw invalido(`O intervalo entre horários deve ser de ${INTERVALOS.join(', ')} minutos.`);
  }

  return {
    dias_funcionamento: [...dias].sort().map((dia) => DIAS_SEMANA[dia]),
    hora_abertura: minutosParaHora(abertura),
    hora_fechamento: minutosParaHora(fechamento),
    intervalo_minutos: corpo.intervaloMinutos,
    capacidade_simultanea: inteiro(corpo, 'capacidadeSimultanea', {
      minimo: 1,
      maximo: 20,
      mensagem: 'A capacidade deve ser de 1 a 20 atendimentos ao mesmo tempo.',
    }),
    antecedencia_minima_horas: inteiro(corpo, 'antecedenciaMinimaHoras', {
      minimo: 0,
      maximo: 168,
      mensagem: 'A antecedência mínima deve ser de 0 a 168 horas (7 dias).',
    }),
    limite_dias_futuros: inteiro(corpo, 'limiteDiasFuturos', {
      minimo: 1,
      maximo: 365,
      mensagem: 'O limite para agendar deve ser de 1 a 365 dias.',
    }),
    prazo_resposta_horas: inteiro(corpo, 'prazoRespostaHoras', {
      minimo: 1,
      maximo: 168,
      mensagem: 'O prazo para responder pedidos deve ser de 1 a 168 horas.',
    }),
    prazo_cancelamento_horas: inteiro(corpo, 'prazoCancelamentoHoras', {
      minimo: 0,
      maximo: 168,
      mensagem: 'O prazo para o cliente desmarcar deve ser de 0 a 168 horas.',
    }),
  };
}

function agendaParaResposta(linha) {
  linha = linha || {};
  return {
    diasFuncionamento: (linha.dias_funcionamento || DIAS_SEMANA.slice(1))
      .map((dia) => DIAS_SEMANA.indexOf(dia))
      .filter((dia) => dia >= 0)
      .sort(),
    horaAbertura: (linha.hora_abertura || '08:00').slice(0, 5),
    horaFechamento: (linha.hora_fechamento || '18:00').slice(0, 5),
    intervaloMinutos: linha.intervalo_minutos || 30,
    capacidadeSimultanea: linha.capacidade_simultanea || 1,
    antecedenciaMinimaHoras: linha.antecedencia_minima_horas ?? 2,
    limiteDiasFuturos: linha.limite_dias_futuros || 30,
    prazoRespostaHoras: linha.prazo_resposta_horas || 12,
    prazoCancelamentoHoras: linha.prazo_cancelamento_horas ?? 2,
  };
}

/* Vitrine (RF-23) ---------------------------------------------------------- */

function textoOpcional(corpo, campo, rotulo, maximo) {
  const valor = lerTexto(corpo[campo], { maximo });
  if (valor === null) {
    throw invalido(`${rotulo} pode ter até ${maximo} caracteres.`);
  }
  return valor || null;
}

// "@perfil", "perfil" ou o endereço do Instagram -> "perfil".
function lerInstagram(valor) {
  if (valor === undefined || valor === null || valor === '') {
    return null;
  }
  if (typeof valor !== 'string') {
    throw invalido('Informe o Instagram como @perfil.');
  }
  const perfil = valor
    .trim()
    .replace(/^https?:\/\/(www\.)?instagram\.com\//i, '')
    .replace(/^@/, '')
    .replace(/\/.*$/, '');
  if (!/^[A-Za-z0-9._]{1,30}$/.test(perfil)) {
    throw invalido('Informe o Instagram como @perfil, só com letras, números, ponto e sublinhado.');
  }
  return perfil.toLowerCase();
}

function lerTelefoneOpcional(valor, { celular, mensagem }) {
  if (valor === undefined || valor === null || String(valor).trim() === '') {
    return null;
  }
  const telefone = lerTelefone(valor);
  // Celular: DDD + 9 + 8 dígitos (o WhatsApp das notificações precisa ser celular).
  if (!telefone || (celular && !/^\+55\d{2}9\d{8}$/.test(telefone))) {
    throw invalido(mensagem);
  }
  return telefone;
}

function lerVitrine(corpo) {
  corpo = corpo || {};
  const nome = lerTexto(corpo.nome, { minimo: 2, maximo: 80 });
  if (!nome) {
    throw invalido('O nome da estética precisa ter de 2 a 80 caracteres.');
  }

  let cor = null;
  if (corpo.corPrimaria !== undefined && corpo.corPrimaria !== null && corpo.corPrimaria !== '') {
    if (typeof corpo.corPrimaria !== 'string' || !/^#[0-9a-fA-F]{6}$/.test(corpo.corPrimaria)) {
      throw invalido('Informe a cor no formato #rrggbb, como #1f1f1f.');
    }
    cor = corpo.corPrimaria.toLowerCase();
  }

  return {
    nome,
    descricao: textoOpcional(corpo, 'descricao', 'A descrição', 300),
    endereco: textoOpcional(corpo, 'endereco', 'O endereço', 200),
    telefone_contato: lerTelefoneOpcional(corpo.telefoneContato, {
      celular: false,
      mensagem: 'Informe o telefone de contato com DDD.',
    }),
    instagram: lerInstagram(corpo.instagram),
    telefone_whatsapp: lerTelefoneOpcional(corpo.telefoneWhatsapp, {
      celular: true,
      mensagem: 'Informe o WhatsApp das notificações: um celular com DDD.',
    }),
    cor_primaria: cor,
  };
}

function vitrineParaResposta(linha) {
  return {
    nome: linha.nome,
    descricao: linha.descricao || '',
    endereco: linha.endereco || '',
    telefoneContato: linha.telefone_contato || '',
    instagram: linha.instagram || '',
    telefoneWhatsapp: linha.telefone_whatsapp || '',
    corPrimaria: linha.cor_primaria || '',
    logotipoUrl: linha.logotipo_url || '',
  };
}

/* Datas bloqueadas (RF-22) ------------------------------------------------- */

function dataISO(data) {
  return [
    data.getFullYear(),
    String(data.getMonth() + 1).padStart(2, '0'),
    String(data.getDate()).padStart(2, '0'),
  ].join('-');
}

// { data: "AAAA-MM-DD", motivo } a partir de hoje (no fuso da estética).
function lerBloqueio(corpo, hoje = new Date()) {
  corpo = corpo || {};
  if (!lerData(corpo.data)) {
    throw invalido('Informe a data no formato AAAA-MM-DD.');
  }
  if (corpo.data < dataISO(hoje)) {
    throw invalido('Só dá para bloquear hoje ou datas futuras.');
  }
  return { data: corpo.data, motivo: textoOpcional(corpo, 'motivo', 'O motivo', 80) };
}

module.exports = {
  DIAS_SEMANA,
  INTERVALOS,
  lerAgenda,
  agendaParaResposta,
  lerVitrine,
  lerInstagram,
  vitrineParaResposta,
  lerBloqueio,
  dataISO,
};
