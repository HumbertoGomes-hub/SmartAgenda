/*
 * Cria o primeiro acesso ao painel: a empresa (se ainda não existir), a
 * configuração da agenda com os valores padrão e um usuário Dono.
 *
 *   npm run criar-dono
 *
 * Rode uma vez, depois de aplicar supabase/migrations. Os demais usuários
 * são cadastrados pelo dono no painel (RF-15). RN-14: sempre deve existir
 * pelo menos um dono ativo.
 */
'use strict';

const readline = require('node:readline');
const { Writable } = require('node:stream');
const bcrypt = require('bcrypt');
const { supabase, exigirSucesso } = require('../src/banco/supabase');
const { normalizarEmail } = require('../src/repositorios/usuarios');

const CUSTO_BCRYPT = 12;

// Saída do terminal que pode ser silenciada, para a senha não aparecer na tela.
let silenciar = false;
const saida = new Writable({
  write(pedaco, codificacao, feito) {
    if (!silenciar) {
      process.stdout.write(pedaco, codificacao);
    }
    feito();
  },
});
const leitor = readline.createInterface({ input: process.stdin, output: saida, terminal: true });

function perguntar(pergunta, { oculta = false } = {}) {
  return new Promise((resolver) => {
    leitor.question(pergunta, (resposta) => {
      if (oculta) {
        silenciar = false;
        process.stdout.write('\n');
      }
      resolver(resposta.trim());
    });
    // A pergunta já foi escrita; a partir daqui, o que for digitado some.
    silenciar = oculta;
  });
}

async function garantirEmpresa() {
  const existente = exigirSucesso(
    await supabase.from('empresa').select('id, nome').order('id').limit(1).maybeSingle(),
    'criar-dono.empresa',
  );
  if (existente) {
    console.log(`Empresa encontrada: ${existente.nome}`);
    return existente.id;
  }

  const nome = await perguntar('Nome da estética: ');
  if (!nome) {
    throw new Error('Informe o nome da estética.');
  }
  const empresa = exigirSucesso(
    await supabase.from('empresa').insert({ nome }).select('id').single(),
    'criar-dono.inserirEmpresa',
  );
  exigirSucesso(
    await supabase.from('configuracao_agenda').insert({ empresa_id: empresa.id }),
    'criar-dono.inserirConfiguracao',
  );
  console.log('Empresa e configuração da agenda criadas com os valores padrão.');
  return empresa.id;
}

async function principal() {
  console.log('SmartAgenda: criar usuário Dono\n');
  const empresaId = await garantirEmpresa();

  const nome = await perguntar('Nome do dono: ');
  const email = normalizarEmail(await perguntar('E-mail de acesso: '));
  const senha = await perguntar('Senha: ', { oculta: true });
  const confirmacao = await perguntar('Repita a senha: ', { oculta: true });

  if (!nome) {
    throw new Error('Informe o nome do dono.');
  }
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    throw new Error('E-mail inválido.');
  }
  if (!senha) {
    throw new Error('Informe a senha.');
  }
  if (senha !== confirmacao) {
    throw new Error('As senhas não conferem.');
  }

  // O gatilho do banco cria a linha em `dono` (recebe_notificacoes = true, como na UML).
  const senhaHash = await bcrypt.hash(senha, CUSTO_BCRYPT);
  const resposta = await supabase
    .from('usuario_admin')
    .insert({
      empresa_id: empresaId,
      nome,
      email,
      senha_hash: senhaHash,
      perfil: 'DONO',
    })
    .select('id')
    .single();

  if (resposta.error && resposta.error.code === '23505') {
    throw new Error('Já existe um usuário com este e-mail.');
  }
  exigirSucesso(resposta, 'criar-dono.inserirUsuario');

  console.log(`\nDono criado. Entre em /admin/entrar com ${email}.`);
}

principal()
  .then(() => {
    leitor.close();
  })
  .catch((erro) => {
    leitor.close();
    console.error(`\nNão foi possível criar o dono: ${erro.message}`);
    if (erro.cause) {
      console.error(erro.cause);
    }
    process.exitCode = 1;
  });
