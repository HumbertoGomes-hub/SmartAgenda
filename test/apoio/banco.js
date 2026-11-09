'use strict';

/*
 * Banco PostgreSQL em memória (PGlite) com todas as migrações aplicadas,
 * para testar o SQL de supabase/migrations sem o Supabase.
 *
 * Sem o PGlite instalado, `pular` traz o motivo e os testes ficam pulados:
 *   npm install --save-dev @electric-sql/pglite
 */
const fs = require('node:fs');
const path = require('node:path');

let PGlite = null;
try {
  ({ PGlite } = require('@electric-sql/pglite'));
} catch (erro) {
  // Sem PGlite: os testes de SQL ficam pulados.
}

const PASTA_MIGRACOES = path.join(__dirname, '..', '..', 'supabase', 'migrations');
const pular = PGlite ? false : 'instale @electric-sql/pglite para testar o SQL';

// Empresa, configuração, um dono e serviços de exemplo (o 4 está desativado).
async function bancoNovo({ capacidade = 1 } = {}) {
  const db = new PGlite();
  for (const arquivo of fs.readdirSync(PASTA_MIGRACOES).sort()) {
    await db.exec(fs.readFileSync(path.join(PASTA_MIGRACOES, arquivo), 'utf8'));
  }
  await db.exec(`
    insert into empresa (nome) values ('Estética de Teste');
    insert into configuracao_agenda (empresa_id, capacidade_simultanea) values (1, ${Number(capacidade)});
    insert into usuario_admin (empresa_id, nome, email, senha_hash, perfil)
      values (1, 'Dono', 'dono@teste.test', 'x', 'DONO');
    insert into servico (empresa_id, nome, categoria, preco_base, duracao_minutos, ativo) values
      (1, 'Lavagem', 'Lavagem', 80, 60, true),            -- 1
      (1, 'Polimento', 'Polimento', 450, 120, true),      -- 2
      (1, 'Vidros', 'Proteção', 120, 30, true),           -- 3
      (1, 'Serviço antigo', 'Lavagem', 50, 60, false);    -- 4
  `);
  return db;
}

async function falhaCom(assert, promessa, codigo) {
  await assert.rejects(promessa, (erro) => {
    assert.match(erro.message, new RegExp(codigo));
    return true;
  });
}

module.exports = { bancoNovo, falhaCom, pular };
