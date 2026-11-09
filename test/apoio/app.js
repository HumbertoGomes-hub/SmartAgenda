'use strict';

/*
 * App de verdade numa porta local, para testar rotas. O banco é trocado por
 * respostas falsas: o usuário de teste e os repositórios que o teste pedir.
 *
 *   const app = require('./apoio/app');
 *   const falso = app.substituir(require('../src/repositorios/agenda'));
 *   test.before(app.iniciar); test.after(app.parar);
 *   await app.entrar('FUNCIONARIO');
 *   const r = await app.pedir('GET', '/api/admin/pedidos');
 */
process.env.SESSION_SECRET = process.env.SESSION_SECRET || 'segredo-de-teste';
process.env.SUPABASE_URL = process.env.SUPABASE_URL || 'http://localhost:54321';
process.env.SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_KEY || 'chave-de-teste';
process.env.TZ = 'America/Sao_Paulo';

const assert = require('node:assert/strict');
const bcrypt = require('bcrypt');
const usuarios = require('../../src/repositorios/usuarios');
const { criarApp } = require('../../src/app');

const SENHA = 'senha-de-teste';
const HASH = bcrypt.hashSync(SENHA, 4);
const USUARIO_ID = 7;
let perfilAtual = 'FUNCIONARIO';

usuarios.buscarParaLogin = async () => ({ id: USUARIO_ID, nome: 'Lucas', email: 'lucas@teste.test', perfil: perfilAtual, ativo: true, senha_hash: HASH });
usuarios.buscarPorId = async () => ({ id: USUARIO_ID, nome: 'Lucas', email: 'lucas@teste.test', perfil: perfilAtual, ativo: true });

/*
 * Troca todas as funções de um repositório por uma versão que registra a
 * chamada e responde `falso.resposta` (ou lança, se for um erro).
 */
function substituir(modulo) {
  const falso = { chamadas: [], resposta: null };
  for (const nome of Object.keys(modulo)) {
    if (typeof modulo[nome] !== 'function') {
      continue;
    }
    modulo[nome] = async (...argumentos) => {
      falso.chamadas.push({ nome, argumentos });
      if (falso.resposta instanceof Error) {
        throw falso.resposta;
      }
      return falso.resposta ?? { ok: nome };
    };
  }
  falso.ultima = (nome) => falso.chamadas.filter((c) => c.nome === nome).pop();
  return falso;
}

let servidor;
let base;
let cookie = '';

async function iniciar() {
  servidor = criarApp().listen(0);
  await new Promise((resolver) => servidor.once('listening', resolver));
  base = `http://127.0.0.1:${servidor.address().port}`;
}

function parar() {
  servidor.close();
}

// corpo: objeto (vai como JSON) ou { bytes, tipo } para enviar um arquivo.
async function pedir(metodo, caminho, corpo) {
  const cabecalhos = { cookie };
  let body;
  if (corpo && corpo.bytes) {
    cabecalhos['content-type'] = corpo.tipo;
    body = corpo.bytes;
  } else if (corpo !== undefined) {
    cabecalhos['content-type'] = 'application/json';
    body = JSON.stringify(corpo);
  }
  const resposta = await fetch(base + caminho, { method: metodo, headers: cabecalhos, body });
  const definido = resposta.headers.get('set-cookie');
  if (definido) {
    cookie = definido.split(';')[0];
  }
  const texto = await resposta.text();
  let json = null;
  try {
    json = texto ? JSON.parse(texto) : null;
  } catch (erro) {
    json = texto;
  }
  return { status: resposta.status, corpo: json, cabecalhos: resposta.headers };
}

async function entrar(perfil) {
  perfilAtual = perfil;
  cookie = '';
  const r = await pedir('POST', '/api/admin/entrar', { email: 'lucas@teste.test', senha: SENHA });
  assert.equal(r.status, 200);
}

function sair() {
  cookie = '';
}

module.exports = { USUARIO_ID, substituir, iniciar, parar, pedir, entrar, sair };
