/*
 * Dados públicos do site (RF-01 a RF-05). Não exigem sessão e só trazem o
 * que pode aparecer: serviços ativos, trabalhos publicados, contatos da
 * estética e a agenda para o calendário.
 *
 *   GET  /api/vitrine/empresa            -> nome, descrição, contatos, cor, logotipo e horário
 *   GET  /api/vitrine/agenda             -> dias, horário, intervalo, limite e datas bloqueadas
 *   GET  /api/vitrine/servicos           -> { servicos }
 *   GET  /api/vitrine/portfolio          -> { trabalhos } (com naCapa e emDestaque para o início)
 *   GET  /api/vitrine/portfolio/:id      -> trabalho publicado, ou 404
 *   GET  /api/vitrine/horarios?data=AAAA-MM-DD&servicos=1,2 -> { data, horarios }
 *   POST /api/vitrine/agendamentos       -> 201 { codigo } (pedido PENDENTE)
 */
'use strict';

const express = require('express');
const { rateLimit } = require('express-rate-limit');
const servicos = require('../repositorios/servicos');
const portfolio = require('../repositorios/portfolio');
const vitrine = require('../repositorios/vitrine');
const { lerId } = require('../dominio/catalogo');
const dominio = require('../dominio/agenda');
const { ErroHttp } = require('../util/erros');

const rotas = express.Router();

// O navegador sempre confere com o servidor antes de reaproveitar a resposta
// (sem mudança, volta só um 304 pelo ETag). Assim o que o dono muda no
// painel aparece no site na hora.
function emCache(res) {
  res.set('Cache-Control', 'no-cache');
}

function invalido(mensagem) {
  return new ErroHttp(400, 'DADOS_INVALIDOS', mensagem);
}

// Pedidos por IP: 10 a cada 15 minutos, contra envio em massa.
const limitarPedidos = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 10,
  standardHeaders: 'draft-7',
  legacyHeaders: false,
  message: {
    erro: {
      codigo: 'MUITOS_PEDIDOS',
      mensagem: 'Muitos pedidos em pouco tempo. Espere alguns minutos ou fale com a estética pelo WhatsApp.',
    },
  },
});

/* Estética e agenda ----------------------------------------------------- */

rotas.get('/empresa', async (req, res) => {
  emCache(res);
  res.json(await vitrine.empresaPublica());
});

rotas.get('/agenda', async (req, res) => {
  emCache(res);
  res.json(await vitrine.agendaPublica());
});

/* Serviços e portfólio -------------------------------------------------- */

rotas.get('/servicos', async (req, res) => {
  emCache(res);
  res.json({ servicos: await servicos.listar({ apenasAtivos: true }) });
});

rotas.get('/portfolio', async (req, res) => {
  emCache(res);
  res.json({ trabalhos: await portfolio.listar({ apenasPublicados: true }) });
});

rotas.get('/portfolio/:id', async (req, res) => {
  const id = lerId(req.params.id);
  if (!id) {
    throw new ErroHttp(404, 'NAO_ENCONTRADO', 'Trabalho não encontrado.');
  }
  emCache(res);
  res.json(await portfolio.buscar(id, { apenasPublicado: true }));
});

/* Agendamento pelo site ------------------------------------------------- */

// "1,2" ou ["1","2"] -> [1, 2]
function lerListaDeServicos(valor) {
  const lista = Array.isArray(valor) ? valor : String(valor || '').split(',').filter(Boolean);
  return dominio.lerServicos(lista);
}

rotas.get('/horarios', async (req, res) => {
  const data = dominio.lerData(req.query.data);
  if (!data) {
    throw invalido('Informe a data no formato AAAA-MM-DD.');
  }
  const ids = lerListaDeServicos(req.query.servicos);
  if (!ids) {
    throw invalido('Escolha pelo menos um serviço.');
  }
  // Sem cache: a agenda muda a cada pedido.
  res.set('Cache-Control', 'no-store');
  res.json({ data: req.query.data, horarios: await vitrine.horarios(data, ids) });
});

// Celular brasileiro com DDD (RN-01): 11 dígitos, começando com 9.
function lerCelular(texto) {
  const telefone = dominio.lerTelefone(texto);
  return telefone && /^\+55[1-9]{2}9\d{8}$/.test(telefone) ? telefone : null;
}

rotas.post('/agendamentos', limitarPedidos, async (req, res) => {
  const corpo = req.body || {};
  if (corpo.consentimentoLgpd !== true) {
    throw invalido('Para enviar o pedido, é preciso autorizar o uso do nome e do telefone (LGPD).');
  }
  const nome = dominio.lerTexto(corpo.nome, { minimo: 3, maximo: 120 });
  if (!nome) {
    throw invalido('Informe seu nome, com pelo menos 3 letras.');
  }
  const telefone = lerCelular(corpo.telefone);
  if (!telefone) {
    throw invalido('Informe o celular com DDD, com 11 números.');
  }
  const ids = lerListaDeServicos(corpo.servicos);
  if (!ids) {
    throw invalido('Escolha pelo menos um serviço.');
  }
  const data = dominio.lerData(corpo.data);
  const minutos = dominio.lerHora(corpo.horario);
  if (!data || minutos === null) {
    throw invalido('Escolha o dia e o horário.');
  }
  const modeloVeiculo = dominio.lerTexto(corpo.modeloVeiculo, { maximo: 80 });
  const observacoes = dominio.lerTexto(corpo.observacoes, { maximo: 500 });
  if (modeloVeiculo === null || observacoes === null) {
    throw invalido('O modelo do veículo pode ter até 80 caracteres e as observações, até 500.');
  }

  const codigo = await vitrine.criarPedido({
    nome,
    telefone,
    servicos: ids,
    inicio: dominio.instanteLocal(data, minutos),
    modeloVeiculo,
    observacoes,
  });
  res.status(201).json({ codigo });
});

module.exports = rotas;
