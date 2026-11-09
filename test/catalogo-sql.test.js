'use strict';

/*
 * SQL de serviços e portfólio (supabase/migrations) num PostgreSQL em memória.
 * Precisa do PGlite (ver test/apoio/banco.js). Sem ele, os testes são pulados.
 */
const test = require('node:test');
const assert = require('node:assert/strict');
const { bancoNovo, falhaCom: falhaComBase, pular } = require('./apoio/banco');

const falhaCom = (promessa, codigo) => falhaComBase(assert, promessa, codigo);

async function trabalho(db, { publicado = true, fotos = [] } = {}) {
  const r = await db.query(
    "insert into trabalho_portfolio (empresa_id, titulo, publicado) values (1, 'Polimento', $1) returning id",
    [publicado],
  );
  const id = r.rows[0].id;
  for (const tipo of fotos) {
    await db.query(
      "insert into foto (trabalho_id, url, tipo) values ($1, 'https://exemplo.test/' || gen_random_uuid() || '.webp', $2)",
      [id, tipo],
    );
  }
  return id;
}

async function capas(db) {
  const r = await db.query('select id from trabalho_portfolio where na_capa order by id');
  return r.rows.map((linha) => linha.id);
}

test('serviço aceita foto opcional', { skip: pular }, async () => {
  const db = await bancoNovo();
  await db.query("update servico set foto_url = 'https://exemplo.test/a.webp', foto_caminho = 'servicos/1/a.webp' where id = 1");
  const r = await db.query('select id, foto_url from servico where id in (1, 2) order by id');
  assert.deepEqual(r.rows, [
    { id: 1, foto_url: 'https://exemplo.test/a.webp' },
    { id: 2, foto_url: null },
  ]);
});

test('foto tem tipo ANTES, DEPOIS ou GERAL, com uma ANTES e uma DEPOIS por trabalho', { skip: pular }, async () => {
  const db = await bancoNovo();
  const id = await trabalho(db, { fotos: ['ANTES', 'DEPOIS', 'GERAL', 'GERAL'] });

  await falhaCom(trabalho(db, { fotos: ['OUTRA'] }), 'foto_tipo_valido');
  await falhaCom(db.query("insert into foto (trabalho_id, url, tipo) values ($1, 'https://exemplo.test/x.webp', 'ANTES')", [id]), 'foto_um_antes');
  await falhaCom(db.query("insert into foto (trabalho_id, url, tipo) values ($1, 'https://exemplo.test/y.webp', 'DEPOIS')", [id]), 'foto_um_depois');

  const r = await db.query('select count(*)::int as n from foto where trabalho_id = $1', [id]);
  assert.equal(r.rows[0].n, 4);
});

test('capa só aceita trabalho publicado com foto antes e depois', { skip: pular }, async () => {
  const db = await bancoNovo();
  const sem = await trabalho(db, { fotos: ['DEPOIS'] });
  const oculto = await trabalho(db, { publicado: false, fotos: ['ANTES', 'DEPOIS'] });
  const pronto = await trabalho(db, { fotos: ['ANTES', 'DEPOIS'] });

  await falhaCom(db.query('select definir_capa($1)', [sem]), 'CAPA_SEM_FOTOS');
  await falhaCom(db.query('select definir_capa($1)', [oculto]), 'CAPA_SEM_FOTOS');
  await db.query('select definir_capa($1)', [pronto]);
  assert.deepEqual(await capas(db), [pronto]);
});

test('trocar a capa tira a anterior; nulo deixa o início sem capa', { skip: pular }, async () => {
  const db = await bancoNovo();
  const a = await trabalho(db, { fotos: ['ANTES', 'DEPOIS'] });
  const b = await trabalho(db, { fotos: ['ANTES', 'DEPOIS'] });

  await db.query('select definir_capa($1)', [a]);
  await db.query('select definir_capa($1)', [b]);
  assert.deepEqual(await capas(db), [b]);

  await db.query('select definir_capa(null)');
  assert.deepEqual(await capas(db), []);
});

test('o banco não deixa existir duas capas nem capa oculta', { skip: pular }, async () => {
  const db = await bancoNovo();
  const a = await trabalho(db, { fotos: ['ANTES', 'DEPOIS'] });
  const b = await trabalho(db, { fotos: ['ANTES', 'DEPOIS'] });
  await db.query('select definir_capa($1)', [a]);

  await falhaCom(db.query('update trabalho_portfolio set na_capa = true where id = $1', [b]), 'trabalho_uma_capa');
  await falhaCom(db.query('update trabalho_portfolio set publicado = false where id = $1', [a]), 'trabalho_capa_publicada');
  await falhaCom(db.query('update trabalho_portfolio set publicado = false, em_destaque = true where id = $1', [b]), 'trabalho_destaque_publicado');
});

test('apagar a foto antes ou depois da capa tira o trabalho da capa', { skip: pular }, async () => {
  const db = await bancoNovo();
  const id = await trabalho(db, { fotos: ['ANTES', 'DEPOIS', 'GERAL'] });
  await db.query('select definir_capa($1)', [id]);

  await db.query("delete from foto where trabalho_id = $1 and tipo = 'GERAL'", [id]);
  assert.deepEqual(await capas(db), [id]); // foto geral não muda nada

  await db.query("delete from foto where trabalho_id = $1 and tipo = 'ANTES'", [id]);
  assert.deepEqual(await capas(db), []);
});

test('excluir o trabalho leva as fotos junto', { skip: pular }, async () => {
  const db = await bancoNovo();
  const id = await trabalho(db, { fotos: ['ANTES', 'DEPOIS', 'GERAL'] });
  await db.query('select definir_capa($1)', [id]);

  await db.query('delete from trabalho_portfolio where id = $1', [id]);
  const r = await db.query('select count(*)::int as n from foto');
  assert.equal(r.rows[0].n, 0);
});
