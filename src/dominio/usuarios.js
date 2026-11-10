/*
 * Usuários do painel (RF-15): o dono cadastra, edita e desativa a equipe.
 * Só regras, sem banco: lê o que chega do painel (lança ErroHttp 400) e
 * confere o que o dono não pode fazer com o próprio acesso.
 *
 * RN-14 (sempre pelo menos um dono ativo) também é garantida no banco, pelo
 * gatilho da migração 20261111000000_configuracoes_e_usuarios.sql.
 */
'use strict';

const { lerTexto, lerTelefone } = require('./agenda');
const { ErroHttp } = require('../util/erros');

const PERFIS = Object.freeze(['DONO', 'SOCIO', 'FUNCIONARIO']);
const SENHA_MINIMA = 8;
const SENHA_MAXIMA = 72; // o bcrypt só usa os primeiros 72 bytes
const CUSTO_BCRYPT = 12; // o mesmo de scripts/criar-dono.js

function invalido(mensagem) {
  return new ErroHttp(400, 'DADOS_INVALIDOS', mensagem);
}

function lerEmail(valor) {
  const email = typeof valor === 'string' ? valor.trim().toLowerCase() : '';
  if (email.length > 254 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    throw invalido('Informe um e-mail válido, como nome@exemplo.com.');
  }
  return email;
}

function lerSenha(valor) {
  if (typeof valor !== 'string' || valor.length < SENHA_MINIMA || Buffer.byteLength(valor) > SENHA_MAXIMA) {
    throw invalido(`A senha precisa ter de ${SENHA_MINIMA} a ${SENHA_MAXIMA} caracteres.`);
  }
  return valor;
}

/*
 * completo = true no cadastro (nome, e-mail, perfil e senha obrigatórios).
 * Na edição, só os campos enviados. Devolve os campos no formato do painel;
 * o repositório separa o que vai para cada tabela.
 */
function lerUsuario(corpo, { completo }) {
  corpo = corpo || {};
  const dados = {};
  const tem = (campo) => completo || corpo[campo] !== undefined;

  if (tem('nome')) {
    const nome = lerTexto(corpo.nome, { minimo: 2, maximo: 80 });
    if (!nome) {
      throw invalido('O nome precisa ter de 2 a 80 caracteres.');
    }
    dados.nome = nome;
  }
  if (tem('email')) {
    dados.email = lerEmail(corpo.email);
  }
  if (tem('perfil')) {
    if (!PERFIS.includes(corpo.perfil)) {
      throw invalido('Escolha o perfil: dono, sócio ou funcionário.');
    }
    dados.perfil = corpo.perfil;
  }
  if (corpo.telefone !== undefined) {
    if (corpo.telefone === null || String(corpo.telefone).trim() === '') {
      dados.telefone = null;
    } else {
      dados.telefone = lerTelefone(corpo.telefone);
      if (!dados.telefone) {
        throw invalido('Informe o telefone com DDD.');
      }
    }
  }
  if (corpo.cargo !== undefined) {
    const cargo = lerTexto(corpo.cargo, { maximo: 60 });
    if (cargo === null) {
      throw invalido('O cargo pode ter até 60 caracteres.');
    }
    dados.cargo = cargo || null;
  }
  if (corpo.recebeNotificacoes !== undefined) {
    if (typeof corpo.recebeNotificacoes !== 'boolean') {
      throw invalido('Receber notificações deve ser verdadeiro ou falso.');
    }
    dados.recebeNotificacoes = corpo.recebeNotificacoes;
  }
  if (!completo && corpo.ativo !== undefined) {
    if (typeof corpo.ativo !== 'boolean') {
      throw invalido('Ativo deve ser verdadeiro ou falso.');
    }
    dados.ativo = corpo.ativo;
  }
  if (completo) {
    dados.senha = lerSenha(corpo.senha);
  }
  return dados;
}

/*
 * O dono não desativa nem muda o perfil do próprio acesso: perderia o
 * painel na hora. Para isso, outro dono faz a mudança.
 */
function conferirProprioAcesso(alvoId, usuarioLogadoId, dados) {
  if (alvoId !== usuarioLogadoId) {
    return;
  }
  if (dados.ativo === false || (dados.perfil !== undefined && dados.perfil !== 'DONO')) {
    throw new ErroHttp(
      409,
      'PROPRIO_ACESSO',
      'Você não pode desativar nem mudar o perfil do seu próprio acesso. Peça para outro dono fazer isso.',
    );
  }
}

module.exports = {
  PERFIS,
  SENHA_MINIMA,
  CUSTO_BCRYPT,
  lerEmail,
  lerSenha,
  lerUsuario,
  conferirProprioAcesso,
};
