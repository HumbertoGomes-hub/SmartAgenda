/*
 * Equipe do painel (RF-15): cadastro, edição, desativação e troca de senha
 * dos usuários. O login e a sessão continuam em repositorios/usuarios.js.
 *
 * usuario_admin guarda os dados comuns e o perfil; o gatilho do banco cria
 * (ou troca) a linha em dono, socio ou funcionario. Os campos próprios de
 * cada perfil (recebe_notificacoes do dono, cargo do funcionário) são
 * gravados depois, na tabela da subclasse.
 */
'use strict';

const { supabase, exigirSucesso } = require('../banco/supabase');
const empresa = require('./empresa');
const { PERFIS } = require('../dominio/usuarios');
const { ErroHttp } = require('../util/erros');

const COLUNAS = 'id, nome, email, telefone, perfil, ativo, dono ( recebe_notificacoes ), funcionario ( cargo )';

// Relação de um para um: o PostgREST pode devolver objeto ou lista.
function um(valor) {
  return Array.isArray(valor) ? valor[0] || null : valor || null;
}

function paraResposta(linha) {
  const dono = um(linha.dono);
  const funcionario = um(linha.funcionario);
  return {
    id: linha.id,
    nome: linha.nome,
    email: linha.email,
    telefone: linha.telefone || '',
    perfil: linha.perfil,
    ativo: linha.ativo,
    cargo: funcionario ? funcionario.cargo || '' : '',
    recebeNotificacoes: dono ? dono.recebe_notificacoes : false,
  };
}

// Erros do banco -> respostas para o painel.
function exigirSucessoDaEquipe(resposta, contexto) {
  const erro = resposta.error;
  if (erro && erro.code === '23505') {
    throw new ErroHttp(409, 'EMAIL_EM_USO', 'Já existe um usuário com esse e-mail.');
  }
  if (erro && (erro.message || '').includes('ULTIMO_DONO')) {
    throw new ErroHttp(409, 'ULTIMO_DONO', 'Precisa existir pelo menos um dono ativo. Cadastre ou ative outro dono antes.');
  }
  return exigirSucesso(resposta, contexto);
}

function naoEncontrado() {
  return new ErroHttp(404, 'NAO_ENCONTRADO', 'Usuário não encontrado.');
}

async function buscar(id) {
  const resposta = await supabase.from('usuario_admin').select(COLUNAS).eq('id', id).maybeSingle();
  const linha = exigirSucesso(resposta, 'equipe.buscar');
  if (!linha) {
    throw naoEncontrado();
  }
  return paraResposta(linha);
}

// Ativos primeiro; depois dono, sócio e funcionário; por fim, o nome.
async function listar() {
  const resposta = await supabase.from('usuario_admin').select(COLUNAS);
  return exigirSucesso(resposta, 'equipe.listar')
    .map(paraResposta)
    .sort(
      (a, b) =>
        Number(b.ativo) - Number(a.ativo) ||
        PERFIS.indexOf(a.perfil) - PERFIS.indexOf(b.perfil) ||
        a.nome.localeCompare(b.nome, 'pt-BR'),
    );
}

// Campos próprios do perfil, na tabela da subclasse (se o perfil tiver).
async function gravarSubclasse(id, perfil, { cargo, recebeNotificacoes }) {
  if (perfil === 'FUNCIONARIO' && cargo !== undefined) {
    exigirSucesso(
      await supabase.from('funcionario').update({ cargo }).eq('usuario_id', id),
      'equipe.gravarSubclasse.funcionario',
    );
  }
  if (perfil === 'DONO' && recebeNotificacoes !== undefined) {
    exigirSucesso(
      await supabase.from('dono').update({ recebe_notificacoes: recebeNotificacoes }).eq('usuario_id', id),
      'equipe.gravarSubclasse.dono',
    );
  }
}

// dados: { nome, email, telefone, perfil, senhaHash, cargo, recebeNotificacoes }
async function criar(dados) {
  const resposta = await supabase
    .from('usuario_admin')
    .insert({
      empresa_id: await empresa.buscarId(),
      nome: dados.nome,
      email: dados.email,
      telefone: dados.telefone || null,
      perfil: dados.perfil,
      senha_hash: dados.senhaHash,
    })
    .select('id')
    .single();
  const { id } = exigirSucessoDaEquipe(resposta, 'equipe.criar');
  await gravarSubclasse(id, dados.perfil, dados);
  return buscar(id);
}

// dados: só os campos que mudam (nome, email, telefone, perfil, ativo, cargo, recebeNotificacoes)
async function editar(id, dados) {
  const atual = await buscar(id);
  const comuns = {};
  for (const campo of ['nome', 'email', 'telefone', 'perfil', 'ativo']) {
    if (dados[campo] !== undefined) {
      comuns[campo] = dados[campo];
    }
  }
  if (Object.keys(comuns).length > 0) {
    exigirSucessoDaEquipe(await supabase.from('usuario_admin').update(comuns).eq('id', id), 'equipe.editar');
  }
  await gravarSubclasse(id, dados.perfil || atual.perfil, dados);
  return buscar(id);
}

async function definirSenha(id, senhaHash) {
  await buscar(id);
  exigirSucesso(
    await supabase.from('usuario_admin').update({ senha_hash: senhaHash }).eq('id', id),
    'equipe.definirSenha',
  );
}

module.exports = { paraResposta, buscar, listar, criar, editar, definirSenha };
