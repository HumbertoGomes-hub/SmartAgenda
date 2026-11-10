-- SmartAgenda: configurações (RF-22, RF-23) e usuários (RF-15, RN-14)
--
--   * Empresa ganha os contatos que aparecem no site (telefone e Instagram)
--     e o caminho do logotipo no Storage, para apagar o antigo ao trocar.
--   * O banco garante que sempre exista pelo menos um dono ativo (RN-14),
--     mesmo com duas pessoas mexendo nos usuários ao mesmo tempo.

-- ---------------------------------------------------------------------------
-- Empresa: contatos e logotipo
-- ---------------------------------------------------------------------------
alter table empresa
  add column telefone_contato text,  -- telefone do site, fixo ou celular (+55...)
  add column instagram        text,  -- só o perfil, sem @ (ex.: esteticamodelo)
  add column logotipo_caminho text;  -- caminho no Storage

-- ---------------------------------------------------------------------------
-- RN-14: sempre pelo menos um dono ativo.
-- Confere no fim da transação, depois de todas as mudanças, com uma trava
-- para duas pessoas não tirarem os dois últimos donos ao mesmo tempo.
-- ---------------------------------------------------------------------------
create function conferir_dono_ativo()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  perform pg_advisory_xact_lock(hashtext('usuarios:donos'));
  if not exists (select 1 from usuario_admin where perfil = 'DONO' and ativo) then
    raise exception 'ULTIMO_DONO';
  end if;
  return null;
end;
$$;

create constraint trigger usuario_admin_dono_ativo
after update of perfil, ativo or delete on usuario_admin
deferrable initially deferred
for each row execute function conferir_dono_ativo();

-- ---------------------------------------------------------------------------
-- Só o servidor (chave de serviço) chama a função.
-- ---------------------------------------------------------------------------
do $$
declare
  v_papel text;
begin
  execute 'revoke execute on function conferir_dono_ativo() from public';
  foreach v_papel in array array['anon', 'authenticated'] loop
    if exists (select 1 from pg_roles where rolname = v_papel) then
      execute format('revoke execute on function conferir_dono_ativo() from %I', v_papel);
    end if;
  end loop;
end;
$$;
