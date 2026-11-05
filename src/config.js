/*
 * Configuração lida das variáveis de ambiente (RNF-12).
 * Em desenvolvimento, os valores vêm do arquivo .env na raiz do projeto.
 */
'use strict';

const path = require('node:path');

// O .env fica na raiz do projeto, qualquer que seja a pasta de onde o Node é chamado.
try {
  process.loadEnvFile(path.join(__dirname, '..', '.env'));
} catch (erro) {
  // Sem .env: em produção as variáveis vêm do provedor de hospedagem.
  if (erro.code !== 'ENOENT') {
    throw erro;
  }
}

// NODE_ENV e TZ são variáveis padrão do Node e do sistema, definidas pelo
// provedor de hospedagem; não fazem parte da configuração da estética.
// Atribuir TZ faz o Node recalcular o fuso: "hoje" passa a ser o dia da estética.
process.env.TZ = process.env.TZ || 'America/Sao_Paulo';

const producao = process.env.NODE_ENV === 'production';

function obrigatoria(nome) {
  const valor = process.env[nome];
  if (!valor) {
    throw new Error(`Variável de ambiente ${nome} não definida. Veja o arquivo .env.example.`);
  }
  return valor;
}

const sessionSecret = obrigatoria('SESSION_SECRET');
if (producao && sessionSecret.length < 32) {
  throw new Error('SESSION_SECRET precisa ter pelo menos 32 caracteres em produção.');
}

module.exports = Object.freeze({
  producao,
  porta: Number(process.env.PORT) || 3000,
  fusoHorario: process.env.TZ,

  sessao: Object.freeze({
    segredo: sessionSecret,
    minutos: 30, // RNF-07: expira após 30 minutos sem uso
  }),

  supabase: Object.freeze({
    url: obrigatoria('SUPABASE_URL'),
    chaveServico: obrigatoria('SUPABASE_SERVICE_KEY'),
    bucket: process.env.SUPABASE_BUCKET || 'portfolio',
  }),

  whatsapp: Object.freeze({
    url: process.env.WHATSAPP_API_URL || '',
    token: process.env.WHATSAPP_API_TOKEN || '',
  }),
});
