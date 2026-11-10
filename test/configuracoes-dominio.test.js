'use strict';

// "Hoje" das datas bloqueadas é o dia da estética, como no servidor (config.js).
process.env.TZ = 'America/Sao_Paulo';

const test = require('node:test');
const assert = require('node:assert/strict');
const {
  lerAgenda,
  agendaParaResposta,
  lerVitrine,
  lerInstagram,
  vitrineParaResposta,
  lerBloqueio,
} = require('../src/dominio/configuracoes');

const AGENDA = {
  diasFuncionamento: [6, 1, 2, 3, 4, 5],
  horaAbertura: '08:00',
  horaFechamento: '18:00',
  intervaloMinutos: 30,
  capacidadeSimultanea: 2,
  antecedenciaMinimaHoras: 2,
  limiteDiasFuturos: 30,
  prazoRespostaHoras: 12,
  prazoCancelamentoHoras: 2,
};

function recusa(fn, trecho) {
  assert.throws(fn, (erro) => erro.status === 400 && erro.codigo === 'DADOS_INVALIDOS' && erro.message.includes(trecho));
}

test('agenda vai para o banco com os dias em texto (RF-22)', () => {
  assert.deepEqual(lerAgenda(AGENDA), {
    dias_funcionamento: ['SEG', 'TER', 'QUA', 'QUI', 'SEX', 'SAB'],
    hora_abertura: '08:00',
    hora_fechamento: '18:00',
    intervalo_minutos: 30,
    capacidade_simultanea: 2,
    antecedencia_minima_horas: 2,
    limite_dias_futuros: 30,
    prazo_resposta_horas: 12,
    prazo_cancelamento_horas: 2,
  });
});

test('agenda volta para o painel com os dias em número', () => {
  const linha = lerAgenda(AGENDA);
  assert.deepEqual(agendaParaResposta({ ...linha, hora_abertura: '08:00:00', hora_fechamento: '18:00:00' }), {
    ...AGENDA,
    diasFuncionamento: [1, 2, 3, 4, 5, 6],
  });
});

test('agenda recusa dias, horários e números fora das regras', () => {
  recusa(() => lerAgenda({ ...AGENDA, diasFuncionamento: [] }), 'pelo menos um dia');
  recusa(() => lerAgenda({ ...AGENDA, diasFuncionamento: [1, 1] }), 'pelo menos um dia');
  recusa(() => lerAgenda({ ...AGENDA, diasFuncionamento: [7] }), 'pelo menos um dia');
  recusa(() => lerAgenda({ ...AGENDA, horaAbertura: '8h' }), 'HH:MM');
  recusa(() => lerAgenda({ ...AGENDA, horaFechamento: '08:00' }), 'depois da abertura');
  recusa(() => lerAgenda({ ...AGENDA, intervaloMinutos: 25 }), 'intervalo');
  recusa(() => lerAgenda({ ...AGENDA, capacidadeSimultanea: 0 }), 'capacidade');
  recusa(() => lerAgenda({ ...AGENDA, capacidadeSimultanea: 1.5 }), 'capacidade');
  recusa(() => lerAgenda({ ...AGENDA, limiteDiasFuturos: 0 }), 'limite');
  recusa(() => lerAgenda({ ...AGENDA, prazoRespostaHoras: 0 }), 'responder');
  recusa(() => lerAgenda({ ...AGENDA, prazoCancelamentoHoras: '2' }), 'desmarcar');
});

test('vitrine: campos opcionais vazios viram nulo e a cor vai em minúsculas (RF-23)', () => {
  assert.deepEqual(lerVitrine({ nome: '  Auto   Brilho ', corPrimaria: '#F5C518', descricao: '', telefoneContato: '' }), {
    nome: 'Auto Brilho',
    descricao: null,
    endereco: null,
    telefone_contato: null,
    instagram: null,
    telefone_whatsapp: null,
    cor_primaria: '#f5c518',
  });
});

test('vitrine: telefone do site aceita fixo; WhatsApp precisa ser celular', () => {
  const dados = lerVitrine({ nome: 'Auto Brilho', telefoneContato: '(11) 3000-0000', telefoneWhatsapp: '(11) 98765-4321' });
  assert.equal(dados.telefone_contato, '+551130000000');
  assert.equal(dados.telefone_whatsapp, '+5511987654321');
  recusa(() => lerVitrine({ nome: 'Auto Brilho', telefoneWhatsapp: '(11) 3000-0000' }), 'celular');
  recusa(() => lerVitrine({ nome: 'Auto Brilho', telefoneContato: '3000-0000' }), 'DDD');
});

test('vitrine: recusa nome curto e cor em outro formato', () => {
  recusa(() => lerVitrine({ nome: 'A' }), 'nome');
  recusa(() => lerVitrine({ nome: 'Auto Brilho', corPrimaria: 'amarelo' }), '#rrggbb');
  recusa(() => lerVitrine({ nome: 'Auto Brilho', descricao: 'x'.repeat(301) }), 'descrição');
});

test('Instagram: aceita @perfil, perfil ou o endereço, e guarda só o perfil', () => {
  assert.equal(lerInstagram('@Estetica.Modelo'), 'estetica.modelo');
  assert.equal(lerInstagram('https://www.instagram.com/esteticamodelo/'), 'esteticamodelo');
  assert.equal(lerInstagram(''), null);
  recusa(() => lerInstagram('estética modelo'), 'Instagram');
});

test('vitrine volta para o painel sem os campos internos', () => {
  const resposta = vitrineParaResposta({ nome: 'Auto Brilho', logotipo_url: 'https://x.test/logo.webp', logotipo_caminho: 'empresa/a.webp' });
  assert.equal(resposta.logotipoUrl, 'https://x.test/logo.webp');
  assert.equal(resposta.corPrimaria, '');
  assert.equal('logotipo_caminho' in resposta || 'logotipoCaminho' in resposta, false);
});

test('data bloqueada: só hoje ou depois, com motivo opcional', () => {
  const hoje = new Date(2026, 10, 9, 15, 0);
  assert.deepEqual(lerBloqueio({ data: '2026-11-09' }, hoje), { data: '2026-11-09', motivo: null });
  assert.deepEqual(lerBloqueio({ data: '2026-12-25', motivo: ' Natal ' }, hoje), { data: '2026-12-25', motivo: 'Natal' });
  recusa(() => lerBloqueio({ data: '2026-11-08' }, hoje), 'futuras');
  recusa(() => lerBloqueio({ data: '2026-02-30' }, hoje), 'AAAA-MM-DD');
  recusa(() => lerBloqueio({ data: '2026-12-25', motivo: 'x'.repeat(81) }, hoje), 'motivo');
});
