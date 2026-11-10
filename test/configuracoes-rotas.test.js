'use strict';

/*
 * Rotas de configurações com o app de verdade, numa porta local. O banco é
 * trocado por respostas falsas: aqui se testa sessão, permissão (só o dono),
 * a leitura dos dados e o envio do logotipo.
 */
const test = require('node:test');
const assert = require('node:assert/strict');
const app = require('./apoio/app');
const configuracoes = require('../src/repositorios/configuracoes');

const falso = app.substituir(configuracoes);
const { pedir, entrar } = app;

const WEBP = Buffer.concat([Buffer.from('RIFF'), Buffer.alloc(4), Buffer.from('WEBPVP8 '), Buffer.alloc(32)]);

const AGENDA = {
  diasFuncionamento: [1, 2, 3, 4, 5, 6],
  horaAbertura: '08:00',
  horaFechamento: '18:00',
  intervaloMinutos: 30,
  capacidadeSimultanea: 1,
  antecedenciaMinimaHoras: 2,
  limiteDiasFuturos: 30,
  prazoRespostaHoras: 12,
  prazoCancelamentoHoras: 2,
};

test.before(app.iniciar);
test.after(app.parar);
test.beforeEach(() => {
  falso.resposta = null;
});

test('sem sessão, configurações respondem 401', async () => {
  app.sair();
  assert.equal((await pedir('GET', '/api/admin/configuracoes')).status, 401);
  assert.equal((await pedir('PUT', '/api/admin/configuracoes/agenda', AGENDA)).status, 401);
});

test('só o dono configura agenda e vitrine (RN-13)', async () => {
  for (const perfil of ['SOCIO', 'FUNCIONARIO']) {
    await entrar(perfil);
    const r = await pedir('GET', '/api/admin/configuracoes');
    assert.equal(r.status, 403, perfil);
    assert.equal(r.corpo.erro.codigo, 'SEM_PERMISSAO');
    assert.equal((await pedir('PUT', '/api/admin/configuracoes/logotipo', { bytes: WEBP, tipo: 'image/webp' })).status, 403);
  }
});

test('dono salva a agenda com os dias convertidos para o banco (RF-22)', async () => {
  await entrar('DONO');
  assert.equal((await pedir('PUT', '/api/admin/configuracoes/agenda', { ...AGENDA, horaFechamento: '07:00' })).status, 400);

  const r = await pedir('PUT', '/api/admin/configuracoes/agenda', AGENDA);
  assert.equal(r.status, 200);
  const [dados] = falso.ultima('salvarAgenda').argumentos;
  assert.deepEqual(dados.dias_funcionamento, ['SEG', 'TER', 'QUA', 'QUI', 'SEX', 'SAB']);
  assert.equal(dados.capacidade_simultanea, 1);
});

test('dono salva a vitrine com telefones no formato internacional (RF-23)', async () => {
  await entrar('DONO');
  const r = await pedir('PUT', '/api/admin/configuracoes/vitrine', {
    nome: 'Auto Brilho',
    telefoneWhatsapp: '(11) 98765-4321',
    instagram: '@autobrilho',
    corPrimaria: '#F5C518',
  });
  assert.equal(r.status, 200);
  const [dados] = falso.ultima('salvarVitrine').argumentos;
  assert.equal(dados.telefone_whatsapp, '+5511987654321');
  assert.equal(dados.instagram, 'autobrilho');
  assert.equal(dados.cor_primaria, '#f5c518');
});

test('logotipo: confere o formato real da imagem', async () => {
  await entrar('DONO');
  const disfarcado = await pedir('PUT', '/api/admin/configuracoes/logotipo', { bytes: Buffer.from('<svg onload=alert(1)>'), tipo: 'image/png' });
  assert.equal(disfarcado.status, 415);

  const ok = await pedir('PUT', '/api/admin/configuracoes/logotipo', { bytes: WEBP, tipo: 'image/webp' });
  assert.equal(ok.status, 200);
  const [foto] = falso.ultima('trocarLogotipo').argumentos;
  assert.equal(foto.tipo, 'image/webp');
});

test('datas bloqueadas: cria a partir de hoje e remove pela data', async () => {
  await entrar('DONO');
  falso.resposta = [];
  assert.equal((await pedir('POST', '/api/admin/configuracoes/bloqueios', { data: '2020-01-01' })).status, 400);

  const futura = `${new Date().getFullYear() + 1}-12-25`;
  const criada = await pedir('POST', '/api/admin/configuracoes/bloqueios', { data: futura, motivo: 'Natal' });
  assert.equal(criada.status, 201);
  assert.deepEqual(falso.ultima('criarBloqueio').argumentos, [{ data: futura, motivo: 'Natal' }]);

  assert.equal((await pedir('DELETE', '/api/admin/configuracoes/bloqueios/25-12-2026')).status, 404);
  assert.equal((await pedir('DELETE', `/api/admin/configuracoes/bloqueios/${futura}`)).status, 200);
  assert.deepEqual(falso.ultima('removerBloqueio').argumentos, [futura]);
});
