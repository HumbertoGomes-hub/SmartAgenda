/*
 * Monta a aplicação Express. Separado de servidor.js para que os testes
 * possam usar o app sem abrir porta.
 */
'use strict';

const path = require('node:path');
const express = require('express');
const helmet = require('helmet');
const config = require('./config');
const sessao = require('./middlewares/sessao');
const { naoEncontrado, tratarErros } = require('./middlewares/erros');
const rotasAutenticacao = require('./rotas/autenticacao');
const rotasEmpresa = require('./rotas/empresa');
const rotasPainel = require('./rotas/painel');
const rotasAgenda = require('./rotas/agenda');
const rotasCatalogo = require('./rotas/catalogo');
const rotasRelatorio = require('./rotas/relatorio');
const rotasVitrine = require('./rotas/vitrine');

const PASTA_PUBLICA = path.join(__dirname, '..', 'public');

function criarApp() {
  const app = express();

  // Confia em proxies da rede interna (os provedores com HTTPS ficam na frente
  // do app por ela), para o cookie `secure` funcionar e o limite de tentativas
  // ver o IP real. Endereços da internet não são considerados proxy.
  app.set('trust proxy', 'loopback, linklocal, uniquelocal');
  app.disable('x-powered-by');

  app.use(
    helmet({
      contentSecurityPolicy: {
        directives: {
          // Em desenvolvimento (http://localhost) não força HTTPS nos recursos.
          upgradeInsecureRequests: config.producao ? [] : null,
          // Fotos do Supabase Storage; blob: é a prévia da foto escolhida no painel.
          imgSrc: ["'self'", 'data:', 'blob:', new URL(config.supabase.url).origin],
        },
      },
    }),
  );

  app.use(express.json({ limit: '100kb' }));

  // Nome, logotipo e cor da estética para as páginas (RF-23, RNF-12).
  app.use('/api/empresa', rotasEmpresa);

  // Serviços ativos e trabalhos publicados, para o site (RF-01 a RF-03).
  app.use('/api/vitrine', rotasVitrine);

  // Painel administrativo. As rotas de sessão vêm antes, porque o login
  // não exige sessão; as demais (rotasPainel) exigem.
  app.use('/api/admin', sessao, rotasAutenticacao, rotasPainel, rotasAgenda, rotasCatalogo, rotasRelatorio);

  // Site público e páginas do painel (HTML, CSS, JS e imagens).
  // As páginas não trazem dados: tudo que é sensível vem da API, que exige sessão.
  // `extensions` permite /admin/entrar no lugar de /admin/entrar.html.
  app.use(express.static(PASTA_PUBLICA, { extensions: ['html'] }));

  app.use(naoEncontrado);
  app.use(tratarErros);

  return app;
}

module.exports = { criarApp };
