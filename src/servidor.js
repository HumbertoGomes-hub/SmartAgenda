/* Ponto de entrada: `npm start` (produção) ou `npm run dev` (recarrega ao salvar). */
'use strict';

const config = require('./config');
const { criarApp } = require('./app');

const app = criarApp();

const servidor = app.listen(config.porta, () => {
  console.log(`SmartAgenda em http://localhost:${config.porta} (fuso ${config.fusoHorario})`);
});

// Encerra com calma ao receber o sinal do provedor de hospedagem.
function encerrar(sinal) {
  console.log(`${sinal} recebido, encerrando...`);
  servidor.close(() => process.exit(0));
  setTimeout(() => process.exit(1), 10000).unref();
}

process.on('SIGTERM', () => encerrar('SIGTERM'));
process.on('SIGINT', () => encerrar('SIGINT'));
