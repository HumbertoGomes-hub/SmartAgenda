'use strict';

process.env.TZ = 'America/Sao_Paulo';

const test = require('node:test');
const assert = require('node:assert/strict');
const imagens = require('../src/dominio/imagens');
const catalogo = require('../src/dominio/catalogo');

// Primeiros bytes de cada formato, completados até 16 bytes.
const completar = (bytes) => Buffer.concat([Buffer.from(bytes), Buffer.alloc(16)]);
const WEBP = Buffer.concat([Buffer.from('RIFF'), Buffer.alloc(4), Buffer.from('WEBPVP8 '), Buffer.alloc(8)]);
const JPEG = completar([0xff, 0xd8, 0xff, 0xe0]);
const PNG = completar([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);

test('reconhece WebP, JPG e PNG pelos primeiros bytes, não pela extensão', () => {
  assert.equal(imagens.tipoReal(WEBP), 'image/webp');
  assert.equal(imagens.tipoReal(JPEG), 'image/jpeg');
  assert.equal(imagens.tipoReal(PNG), 'image/png');
  assert.equal(imagens.tipoReal(completar([0x47, 0x49, 0x46, 0x38])), null); // GIF
  assert.equal(imagens.tipoReal(Buffer.from('<svg xmlns="http://www.w3.org/2000/svg"/>')), null);
});

test('foto: até 5 MB, formato aceito e extensão do formato real (RNF-09)', () => {
  assert.deepEqual(imagens.lerFoto(Buffer.alloc(0)), { erro: 'SEM_FOTO' });
  assert.deepEqual(imagens.lerFoto(Buffer.from('não é foto nenhuma')), { erro: 'FORMATO_INVALIDO' });
  const grande = Buffer.concat([JPEG, Buffer.alloc(imagens.LIMITE_BYTES)]);
  assert.deepEqual(imagens.lerFoto(grande), { erro: 'FOTO_GRANDE' });
  const ok = imagens.lerFoto(WEBP);
  assert.equal(ok.tipo, 'image/webp');
  assert.equal(ok.extensao, 'webp');
});

test('serviço novo exige nome, categoria, preço e duração', () => {
  const dados = catalogo.lerServico(
    { nome: ' Polimento  técnico ', categoria: 'Polimento', precoBase: 450.5, duracaoMinutos: 300, descricao: '' },
    { completo: true },
  );
  assert.deepEqual(dados, {
    nome: 'Polimento técnico',
    categoria: 'Polimento',
    descricao: null,
    preco_base: 450.5,
    duracao_minutos: 300,
  });
  assert.throws(() => catalogo.lerServico({ nome: 'Polimento', categoria: 'Polimento', precoBase: 450 }, { completo: true }), /duração/);
});

test('serviço: preço em número de 0 a 100 mil e duração de 5 em 5 minutos', () => {
  const editar = (corpo) => catalogo.lerServico(corpo, { completo: false });
  assert.throws(() => editar({ precoBase: '450' }), /preço/);
  assert.throws(() => editar({ precoBase: -1 }), /preço/);
  assert.throws(() => editar({ duracaoMinutos: 42 }), /duração/);
  assert.throws(() => editar({ duracaoMinutos: 0 }), /duração/);
  assert.deepEqual(editar({ precoBase: 99.999 }), { preco_base: 100 });
  assert.deepEqual(editar({ ativo: false }), { ativo: false });
  assert.throws(() => editar({}), /Nada para alterar/);
});

test('trabalho: título obrigatório; serviço e data podem ficar vazios', () => {
  const { dados } = catalogo.lerTrabalho(
    { titulo: 'Polimento em sedã', servicoId: null, dataRealizacao: '2026-10-15', publicado: true },
    { completo: true },
  );
  assert.deepEqual(dados, { titulo: 'Polimento em sedã', servico_id: null, data_realizacao: '2026-10-15', publicado: true });
  assert.throws(() => catalogo.lerTrabalho({ descricao: 'x' }, { completo: true }), /título/);
  assert.throws(() => catalogo.lerTrabalho({ dataRealizacao: '15/10/2026' }, { completo: false }), /data/);
  assert.throws(() => catalogo.lerTrabalho({ servicoId: 'um' }, { completo: false }), /Serviço/);
});

test('trabalho: a capa vem separada dos outros campos', () => {
  assert.deepEqual(catalogo.lerTrabalho({ naCapa: true }, { completo: false }), { dados: {}, naCapa: true });
  assert.throws(() => catalogo.lerTrabalho({ naCapa: 'sim' }, { completo: false }), /verdadeiro ou falso/);
});

test('tipo de foto: ANTES, DEPOIS ou GERAL (padrão)', () => {
  assert.equal(catalogo.lerTipoDeFoto(undefined), 'GERAL');
  assert.equal(catalogo.lerTipoDeFoto('antes'), 'ANTES');
  assert.throws(() => catalogo.lerTipoDeFoto('CAPA'), /tipo da foto/);
});
