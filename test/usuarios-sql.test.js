'use strict';

/*
 * SQL de configurações e usuários (supabase/migrations) num PostgreSQL em
 * memória. Precisa do PGlite (ver test/apoio/banco.js). Sem ele, os testes
 * são pulados. O banco de teste já vem com um dono (id 1).
 */
const test = require('node:test');
const assert = require('node:assert/strict');
const { bancoNovo, falhaCom: falhaComBase, pular } = require('./apoio/banco');

const falhaCom = (promessa, codigo) => falhaComBase(assert, promessa, codigo);

async function usuario(db, email, perfil) {
  const r = await db.query(
    "insert into usuario_admin (empresa_id, nome, email, senha_hash, perfil) values (1, 'Pessoa', $1, 'x', $2) returning id",
    [email, perfil],
  );
  return r.rows[0].id;
}

test('o único dono não pode ser desativado nem rebaixado (RN-14)', { skip: pular }, async () => {
  const db = await bancoNovo();
  await falhaCom(db.query('update usuario_admin set ativo = false where id = 1'), 'ULTIMO_DONO');
  await falhaCom(db.query("update usuario_admin set perfil = 'SOCIO' where id = 1"), 'ULTIMO_DONO');
  const r = await db.query('select perfil, ativo from usuario_admin where id = 1');
  assert.deepEqual(r.rows[0], { perfil: 'DONO', ativo: true });
});

test('com outro dono ativo, dá para desativar um deles', { skip: pular }, async () => {
  const db = await bancoNovo();
  const segundo = await usuario(db, 'socia@teste.test', 'DONO');
  await db.query('update usuario_admin set ativo = false where id = 1');
  // Agora o segundo é o último dono ativo.
  await falhaCom(db.query('update usuario_admin set ativo = false where id = $1', [segundo]), 'ULTIMO_DONO');
});

test('trocar o perfil troca a linha da subclasse', { skip: pular }, async () => {
  const db = await bancoNovo();
  const id = await usuario(db, 'lucas@teste.test', 'FUNCIONARIO');
  await db.query("update funcionario set cargo = 'Polidor' where usuario_id = $1", [id]);
  await db.query("update usuario_admin set perfil = 'DONO' where id = $1", [id]);

  const dono = await db.query('select recebe_notificacoes from dono where usuario_id = $1', [id]);
  const funcionario = await db.query('select 1 from funcionario where usuario_id = $1', [id]);
  assert.equal(dono.rows[0].recebe_notificacoes, true);
  assert.equal(funcionario.rows.length, 0);
});

test('mudar outros campos não esbarra na regra do dono', { skip: pular }, async () => {
  const db = await bancoNovo();
  await db.query("update usuario_admin set nome = 'Marcos Oliveira', telefone = '+5511987654321' where id = 1");
  const r = await db.query('select nome from usuario_admin where id = 1');
  assert.equal(r.rows[0].nome, 'Marcos Oliveira');
});

test('empresa guarda contatos e logotipo; datas bloqueadas não se repetem', { skip: pular }, async () => {
  const db = await bancoNovo();
  await db.query(
    "update empresa set telefone_contato = '+551130000000', instagram = 'esteticamodelo', logotipo_url = 'https://x.test/l.webp', logotipo_caminho = 'empresa/l.webp' where id = 1",
  );
  const r = await db.query('select telefone_contato, instagram, logotipo_caminho from empresa where id = 1');
  assert.deepEqual(r.rows[0], { telefone_contato: '+551130000000', instagram: 'esteticamodelo', logotipo_caminho: 'empresa/l.webp' });

  await db.query("insert into bloqueio_agenda (empresa_id, data, motivo) values (1, '2026-12-25', 'Natal')");
  await falhaCom(db.query("insert into bloqueio_agenda (empresa_id, data) values (1, '2026-12-25')"), 'duplicate|duplicada|unique');
});

test('configuração da agenda recusa fechamento antes da abertura e dia inválido', { skip: pular }, async () => {
  const db = await bancoNovo();
  await falhaCom(db.query("update configuracao_agenda set hora_fechamento = '07:00' where empresa_id = 1"), 'check|viola');
  await falhaCom(db.query("update configuracao_agenda set dias_funcionamento = '{SEG,FERIADO}' where empresa_id = 1"), 'check|viola');
});
