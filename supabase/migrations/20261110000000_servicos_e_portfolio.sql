-- SmartAgenda: serviços e portfólio no painel (RF-20, RF-21)
--
--   * Serviço ganha uma foto opcional. Sem foto, o site não reserva espaço.
--   * Trabalho do portfólio diz onde aparece no site:
--       publicado   -> página Portfólio
--       na_capa     -> comparador antes/depois do início (um só por empresa)
--       em_destaque -> "Trabalhos recentes" do início
--   * Foto ganha id próprio, caminho no Storage e tipo (ANTES, DEPOIS, GERAL),
--     com no máximo uma foto ANTES e uma DEPOIS por trabalho.
--   * Cria o bucket público do Storage para as fotos (RNF-11).

-- ---------------------------------------------------------------------------
-- Serviço: foto opcional
-- ---------------------------------------------------------------------------
alter table servico
  add column foto_url     text,
  add column foto_caminho text; -- caminho no Storage, para apagar ao trocar

-- ---------------------------------------------------------------------------
-- Trabalho do portfólio: onde aparece no site
-- ---------------------------------------------------------------------------
alter table trabalho_portfolio
  add column na_capa     boolean not null default false,
  add column em_destaque boolean not null default false,
  -- Só trabalho publicado aparece no início.
  add constraint trabalho_capa_publicada check (not na_capa or publicado),
  add constraint trabalho_destaque_publicado check (not em_destaque or publicado);

create unique index trabalho_uma_capa on trabalho_portfolio (empresa_id) where na_capa;

-- ---------------------------------------------------------------------------
-- Foto: id, caminho no Storage e tipo
-- ---------------------------------------------------------------------------
alter table foto drop constraint foto_pkey;
alter table foto add column id bigint generated always as identity primary key;
alter table foto add column caminho_storage text;
alter table foto add constraint foto_url_unica unique (trabalho_id, url);

update foto set tipo = 'GERAL' where tipo is null or tipo not in ('ANTES', 'DEPOIS', 'GERAL');
alter table foto alter column tipo set default 'GERAL';
alter table foto alter column tipo set not null;
alter table foto add constraint foto_tipo_valido check (tipo in ('ANTES', 'DEPOIS', 'GERAL'));

create unique index foto_um_antes on foto (trabalho_id) where tipo = 'ANTES';
create unique index foto_um_depois on foto (trabalho_id) where tipo = 'DEPOIS';

-- ---------------------------------------------------------------------------
-- Capa do início: troca de forma atômica e só aceita trabalho publicado com
-- foto ANTES e DEPOIS (o comparador precisa das duas). Nulo tira a capa.
-- ---------------------------------------------------------------------------
create function definir_capa(p_trabalho bigint)
returns void
language plpgsql
set search_path = public
as $$
begin
  if p_trabalho is not null and not exists (
    select 1
    from trabalho_portfolio t
    where t.id = p_trabalho
      and t.publicado
      and exists (select 1 from foto f where f.trabalho_id = t.id and f.tipo = 'ANTES')
      and exists (select 1 from foto f where f.trabalho_id = t.id and f.tipo = 'DEPOIS')
  ) then
    raise exception 'CAPA_SEM_FOTOS';
  end if;

  update trabalho_portfolio set na_capa = false where na_capa and id is distinct from p_trabalho;
  if p_trabalho is not null then
    update trabalho_portfolio set na_capa = true where id = p_trabalho;
  end if;
end;
$$;

-- Ao apagar a foto ANTES ou DEPOIS da capa, o trabalho deixa de ser capa.
create function capa_perde_foto()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if old.tipo in ('ANTES', 'DEPOIS') then
    update trabalho_portfolio set na_capa = false where id = old.trabalho_id and na_capa;
  end if;
  return old;
end;
$$;

create trigger foto_capa_perde_foto
after delete or update of tipo on foto
for each row execute function capa_perde_foto();

-- ---------------------------------------------------------------------------
-- Permissões e Storage
-- ---------------------------------------------------------------------------
do $$
declare
  v_funcao text;
  v_papel  text;
begin
  foreach v_funcao in array array['definir_capa(bigint)', 'capa_perde_foto()'] loop
    execute format('revoke execute on function %s from public', v_funcao);
    foreach v_papel in array array['anon', 'authenticated'] loop
      if exists (select 1 from pg_roles where rolname = v_papel) then
        execute format('revoke execute on function %s from %I', v_funcao, v_papel);
      end if;
    end loop;
  end loop;

  -- Bucket público de leitura (as fotos aparecem no site); só o servidor grava.
  -- Se mudar SUPABASE_BUCKET, crie o bucket com o mesmo nome.
  if exists (select 1 from pg_namespace where nspname = 'storage') then
    insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
    values ('portfolio', 'portfolio', true, 5242880, array['image/webp', 'image/jpeg', 'image/png'])
    on conflict (id) do nothing;
  end if;
end;
$$;
