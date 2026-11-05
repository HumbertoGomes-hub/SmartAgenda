'use strict';

// O módulo carrega a configuração; valores fictícios bastam, nada é consultado.
process.env.SESSION_SECRET = process.env.SESSION_SECRET || 'segredo-de-teste';
process.env.SUPABASE_URL = process.env.SUPABASE_URL || 'http://localhost:54321';
process.env.SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_KEY || 'chave-de-teste';

const test = require('node:test');
const assert = require('node:assert/strict');
const { identidadeParaResposta } = require('../src/repositorios/empresa');

test('devolve só nome, logotipo e cor', () => {
  const resposta = identidadeParaResposta({
    nome: 'Estética Modelo',
    logotipo_url: 'https://exemplo.supabase.co/storage/v1/object/public/portfolio/logo.svg',
    cor_primaria: '#1f1f1f',
    telefone_whatsapp: '+5511999999999',
  });
  assert.deepEqual(resposta, {
    nome: 'Estética Modelo',
    logotipoUrl: 'https://exemplo.supabase.co/storage/v1/object/public/portfolio/logo.svg',
    corPrimaria: '#1f1f1f',
  });
});

test('logotipo e cor vazios viram texto vazio', () => {
  const resposta = identidadeParaResposta({ nome: 'Estética', logotipo_url: null, cor_primaria: null });
  assert.equal(resposta.logotipoUrl, '');
  assert.equal(resposta.corPrimaria, '');
});
