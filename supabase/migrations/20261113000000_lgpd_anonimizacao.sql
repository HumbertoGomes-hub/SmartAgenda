-- SmartAgenda: anonimização de clientes (RNF-13, LGPD)
--
-- Cliente sem agendamento há 12 meses perde os dados pessoais:
--   * nome vira "Cliente removido";
--   * telefone vira um número sem relação com o original. (Um hash do
--     telefone não protegeria: celular brasileiro tem 11 dígitos e o hash
--     se desfaz por força bruta.) O número segue o formato e a unicidade
--     da tabela, então o telefone verdadeiro fica livre para um pedido novo;
--   * consentimento apagado; observações e modelo do veículo dos
--     agendamentos dele também saem, porque podem ter dados pessoais.
-- Os agendamentos continuam, sem dado pessoal, para o histórico e o relatório.
--
-- Roda todo dia às 3h (horário de Brasília) pelo pg_cron, quando o banco tem
-- a extensão (como o Supabase).

alter table cliente add column anonimizado boolean not null default false;

create function anonimizar_clientes()
returns integer
language sql
set search_path = public
as $$
  with alvos as (
    select c.id
      from cliente c
     where not c.anonimizado
       and not exists (
         select 1
           from agendamento a
          where a.cliente_id = c.id
            and greatest(a.data_hora_inicio, a.criado_em) > now() - interval '12 months'
       )
  ),
  agendamentos_limpos as (
    update agendamento a
       set observacoes = null, modelo_veiculo = null
      from alvos
     where a.cliente_id = alvos.id
    returning a.id
  ),
  anonimizados as (
    update cliente c
       set nome = 'Cliente removido',
           telefone = '+9' || lpad(c.id::text, 14, '0'),
           consentimento_lgpd = false,
           data_consentimento = null,
           anonimizado = true
      from alvos
     where c.id = alvos.id
    returning c.id
  )
  select count(*)::integer from anonimizados;
$$;

do $$
declare
  v_papel text;
begin
  execute 'revoke execute on function anonimizar_clientes() from public';
  foreach v_papel in array array['anon', 'authenticated'] loop
    if exists (select 1 from pg_roles where rolname = v_papel) then
      execute format('revoke execute on function anonimizar_clientes() from %I', v_papel);
    end if;
  end loop;

  -- Todo dia às 06:00 UTC (3h em Brasília). O banco de testes local (PGlite) não tem pg_cron.
  if exists (select 1 from pg_available_extensions where name = 'pg_cron') then
    create extension if not exists pg_cron with schema pg_catalog;
    perform cron.schedule('smartagenda-anonimizar-clientes', '0 6 * * *', 'select public.anonimizar_clientes()');
  end if;
end;
$$;
