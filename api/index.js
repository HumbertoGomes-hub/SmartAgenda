/*
 * Ponto de entrada na Vercel: o app Express inteiro vira uma função.
 * O vercel.json manda /api/* e /health para cá; as páginas, o CSS, o JS e as
 * imagens de public/ saem direto da CDN da Vercel, sem passar pelo Node.
 *
 * Localmente continua igual: npm run dev (src/servidor.js).
 */
'use strict';

const { criarApp } = require('../src/app');

module.exports = criarApp();
