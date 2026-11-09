/*
 * Portfólio (RF-21): trabalhos com fotos e onde cada um aparece no site.
 *
 *   publicado   -> página Portfólio
 *   naCapa      -> comparador antes/depois do início (um só; precisa de
 *                  foto ANTES e DEPOIS; função definir_capa no banco)
 *   emDestaque  -> "Trabalhos recentes" do início (até 4)
 *
 * Fotos: no máximo uma ANTES e uma DEPOIS (enviar outra substitui) e até
 * 12 GERAL, na ordem escolhida no painel.
 */
'use strict';

const { supabase, exigirSucesso } = require('../banco/supabase');
const armazenamento = require('../banco/armazenamento');
const empresa = require('./empresa');
const { MAXIMO_DESTAQUES, MAXIMO_FOTOS_GERAIS } = require('../dominio/catalogo');
const { ErroHttp } = require('../util/erros');

const SELECAO = `
  id, titulo, descricao, servico_id, data_realizacao, publicado, na_capa, em_destaque,
  servico:servico_id ( id, nome ),
  fotos:foto ( id, url, legenda, tipo, ordem, caminho_storage )
`;

const ORDEM_DO_TIPO = { ANTES: 0, DEPOIS: 1, GERAL: 2 };

function paraResposta(linha) {
  const fotos = (linha.fotos || [])
    .slice()
    .sort((a, b) => ORDEM_DO_TIPO[a.tipo] - ORDEM_DO_TIPO[b.tipo] || a.ordem - b.ordem || a.id - b.id)
    .map((f) => ({ id: f.id, url: f.url, legenda: f.legenda || '', tipo: f.tipo, ordem: f.ordem }));
  return {
    id: linha.id,
    titulo: linha.titulo,
    descricao: linha.descricao || '',
    servicoId: linha.servico_id,
    servico: linha.servico ? { id: linha.servico.id, nome: linha.servico.nome } : null,
    dataRealizacao: linha.data_realizacao || null,
    publicado: linha.publicado,
    naCapa: linha.na_capa,
    emDestaque: linha.em_destaque,
    fotos,
  };
}

function naoEncontrado() {
  return new ErroHttp(404, 'NAO_ENCONTRADO', 'Trabalho não encontrado.');
}

async function buscarLinha(id, { apenasPublicado = false } = {}) {
  let consulta = supabase.from('trabalho_portfolio').select(SELECAO).eq('id', id);
  if (apenasPublicado) {
    consulta = consulta.eq('publicado', true);
  }
  const linha = exigirSucesso(await consulta.maybeSingle(), 'portfolio.buscar');
  if (!linha) {
    throw naoEncontrado();
  }
  return linha;
}

async function buscar(id, opcoes) {
  return paraResposta(await buscarLinha(id, opcoes));
}

// Painel: todos. Site: só os publicados. Mais recentes primeiro.
async function listar({ apenasPublicados = false } = {}) {
  let consulta = supabase
    .from('trabalho_portfolio')
    .select(SELECAO)
    .order('data_realizacao', { ascending: false, nullsFirst: false })
    .order('id', { ascending: false });
  if (apenasPublicados) {
    consulta = consulta.eq('publicado', true);
  }
  return exigirSucesso(await consulta, 'portfolio.listar').map(paraResposta);
}

async function criar(dados) {
  const resposta = await supabase
    .from('trabalho_portfolio')
    .insert({ ...dados, empresa_id: await empresa.buscarId() })
    .select('id')
    .single();
  return buscar(exigirSucesso(resposta, 'portfolio.criar').id);
}

async function definirCapa(id) {
  const resposta = await supabase.rpc('definir_capa', { p_trabalho: id });
  if (resposta.error && (resposta.error.message || '').includes('CAPA_SEM_FOTOS')) {
    throw new ErroHttp(
      409,
      'CAPA_SEM_FOTOS',
      'Para ir para a capa, o trabalho precisa estar publicado e ter a foto de antes e a de depois.',
    );
  }
  exigirSucesso(resposta, 'portfolio.definirCapa');
}

/*
 * dados: colunas já validadas (dominio/catalogo.js). naCapa vem à parte.
 * Ocultar um trabalho também o tira da capa e dos destaques.
 */
async function editar(id, dados, naCapa) {
  const atual = await buscarLinha(id);
  const mudancas = { ...dados };
  const publicado = mudancas.publicado ?? atual.publicado;

  if (mudancas.em_destaque === true && publicado === false) {
    throw new ErroHttp(409, 'NAO_PUBLICADO', 'Publique o trabalho antes de colocá-lo no início.');
  }
  if (publicado === false) {
    mudancas.em_destaque = false;
    if (atual.na_capa) {
      await definirCapa(null);
    }
  } else if (mudancas.em_destaque === true && !atual.em_destaque) {
    const resposta = await supabase
      .from('trabalho_portfolio')
      .select('id', { count: 'exact', head: true })
      .eq('em_destaque', true);
    const { count } = resposta;
    exigirSucesso(resposta, 'portfolio.contarDestaques');
    if (count >= MAXIMO_DESTAQUES) {
      throw new ErroHttp(
        409,
        'LIMITE_DESTAQUES',
        `O início mostra até ${MAXIMO_DESTAQUES} trabalhos. Tire um dos destaques antes de escolher outro.`,
      );
    }
  }
  if (Object.keys(mudancas).length > 0) {
    exigirSucesso(await supabase.from('trabalho_portfolio').update(mudancas).eq('id', id), 'portfolio.editar');
  }
  if (naCapa === true) {
    await definirCapa(id);
  } else if (naCapa === false && atual.na_capa) {
    await definirCapa(null);
  }
  return buscar(id);
}

async function excluir(id) {
  const atual = await buscarLinha(id);
  exigirSucesso(await supabase.from('trabalho_portfolio').delete().eq('id', id), 'portfolio.excluir');
  await armazenamento.remover(atual.fotos.map((f) => f.caminho_storage));
}

/* Fotos ----------------------------------------------------------------- */

// ANTES e DEPOIS substituem a anterior (a mesma linha muda de arquivo, então
// o trabalho continua na capa); GERAL entra no fim da lista.
async function adicionarFoto(id, foto, { tipo, legenda }) {
  const atual = await buscarLinha(id);
  const doTipo = atual.fotos.filter((f) => f.tipo === tipo);
  if (tipo === 'GERAL' && doTipo.length >= MAXIMO_FOTOS_GERAIS) {
    throw new ErroHttp(409, 'LIMITE_FOTOS', `Cada trabalho pode ter até ${MAXIMO_FOTOS_GERAIS} fotos extras.`);
  }

  const nova = await armazenamento.enviar(`portfolio/${id}`, foto);
  if (tipo !== 'GERAL' && doTipo.length > 0) {
    const anterior = doTipo[0];
    exigirSucesso(
      await supabase
        .from('foto')
        .update({ url: nova.url, caminho_storage: nova.caminho, legenda: legenda ?? anterior.legenda })
        .eq('id', anterior.id),
      'portfolio.trocarFoto',
    );
    await armazenamento.remover([anterior.caminho_storage]);
  } else {
    const ordem = doTipo.reduce((maior, f) => Math.max(maior, f.ordem + 1), 0);
    exigirSucesso(
      await supabase.from('foto').insert({
        trabalho_id: id,
        url: nova.url,
        caminho_storage: nova.caminho,
        tipo,
        legenda,
        ordem,
      }),
      'portfolio.adicionarFoto',
    );
  }
  return buscar(id);
}

function fotoDoTrabalho(trabalho, fotoId) {
  const foto = trabalho.fotos.find((f) => f.id === fotoId);
  if (!foto) {
    throw new ErroHttp(404, 'NAO_ENCONTRADO', 'Foto não encontrada.');
  }
  return foto;
}

async function editarFoto(id, fotoId, { legenda }) {
  fotoDoTrabalho(await buscarLinha(id), fotoId);
  exigirSucesso(await supabase.from('foto').update({ legenda }).eq('id', fotoId), 'portfolio.editarFoto');
  return buscar(id);
}

async function removerFoto(id, fotoId) {
  const foto = fotoDoTrabalho(await buscarLinha(id), fotoId);
  exigirSucesso(await supabase.from('foto').delete().eq('id', fotoId), 'portfolio.removerFoto');
  await armazenamento.remover([foto.caminho_storage]);
  return buscar(id);
}

// ids: todas as fotos GERAL do trabalho, na nova ordem.
async function ordenarFotos(id, ids) {
  const gerais = (await buscarLinha(id)).fotos.filter((f) => f.tipo === 'GERAL').map((f) => f.id);
  const mesmasFotos = ids.length === gerais.length && ids.every((fotoId) => gerais.includes(fotoId));
  if (!mesmasFotos) {
    throw new ErroHttp(409, 'FOTOS_MUDARAM', 'As fotos deste trabalho mudaram. Recarregue a página.');
  }
  for (let ordem = 0; ordem < ids.length; ordem += 1) {
    exigirSucesso(await supabase.from('foto').update({ ordem }).eq('id', ids[ordem]), 'portfolio.ordenarFotos');
  }
  return buscar(id);
}

module.exports = {
  paraResposta,
  listar,
  buscar,
  criar,
  editar,
  excluir,
  adicionarFoto,
  editarFoto,
  removerFoto,
  ordenarFotos,
};
