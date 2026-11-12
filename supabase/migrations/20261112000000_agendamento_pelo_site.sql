-- SmartAgenda: agendamento pelo site (RF-04, RF-05) e expiração dos pedidos (RN-08)
--
--   * criar_agendamento_site: grava o pedido do cliente como PENDENTE, com
--     todas as regras numa transação só e a mesma trava por dia do painel
--     (travar_dia_agenda), para os dois caminhos não reservarem o mesmo lugar.
--   * expirar_pedidos: pedido PENDENTE sem resposta no prazo vira EXPIRADO e
--     libera o horário. Roda a cada 5 minutos pelo pg_cron (quando o banco
--     tem a extensão, como o Supabase) e antes de cada pedido novo.
--
-- As exceções têm códigos estáveis na mensagem (ANTECEDENCIA_MINIMA,
-- HORARIO_OCUPADO...), que o servidor traduz em respostas para o site.

-- ---------------------------------------------------------------------------
-- RN-08: expiração dos pedidos sem resposta
-- ---------------------------------------------------------------------------
create function expirar_pedidos()
returns integer
language sql
set search_path = public
as $$
  with expirados as (
    update agendamento a
       set status = 'EXPIRADO'
      from configuracao_agenda c
     where a.status = 'PENDENTE'
       and a.criado_em + make_interval(hours => c.prazo_resposta_horas) <= now()
    returning a.id
  )
  select count(*)::integer from expirados;
$$;

-- ---------------------------------------------------------------------------
-- RF-05: pedido feito pelo site. Devolve o código do agendamento.
-- ---------------------------------------------------------------------------
create function criar_agendamento_site(
  p_nome           text,
  p_telefone       text,
  p_servicos       bigint[],
  p_inicio         timestamptz,
  p_modelo_veiculo text,
  p_observacoes    text,
  p_fuso           text default 'America/Sao_Paulo'
)
returns text
language plpgsql
set search_path = public
as $$
declare
  v_config   configuracao_agenda%rowtype;
  v_dias     constant text[] := array['DOM', 'SEG', 'TER', 'QUA', 'QUI', 'SEX', 'SAB'];
  v_local    timestamp;
  v_dia      date;
  v_duracao  integer;
  v_fim      timestamptz;
  v_ativos   integer;
  v_cliente  bigint;
  v_id       bigint;
  v_codigo   text;
begin
  select * into v_config from configuracao_agenda limit 1;
  if not found then
    raise exception 'AGENDA_NAO_CONFIGURADA';
  end if;

  -- RN-04: ao menos um serviço, sem repetir, todos ativos.
  perform conferir_servicos(p_servicos);
  select sum(duracao_minutos) into v_duracao from servico where id = any (p_servicos);
  v_fim := p_inicio + make_interval(mins => v_duracao);
  v_local := p_inicio at time zone p_fuso;
  v_dia := v_local::date;

  -- RN-07: antecedência mínima e limite de dias à frente.
  if p_inicio < now() + make_interval(hours => v_config.antecedencia_minima_horas) then
    raise exception 'ANTECEDENCIA_MINIMA';
  end if;
  if v_dia > (now() at time zone p_fuso)::date + v_config.limite_dias_futuros then
    raise exception 'ALEM_DO_LIMITE';
  end if;

  -- Dia de funcionamento e não bloqueado.
  if not (v_dias[extract(dow from v_local)::integer + 1] = any (v_config.dias_funcionamento))
     or exists (select 1 from bloqueio_agenda where data = v_dia) then
    raise exception 'DIA_FECHADO';
  end if;

  -- RN-05: começa depois da abertura e termina até o fechamento.
  if v_local::time < v_config.hora_abertura
     or (v_fim at time zone p_fuso) > v_dia + v_config.hora_fechamento then
    raise exception 'FORA_DO_EXPEDIENTE';
  end if;

  -- Pedidos vencidos liberam o horário antes da conferência.
  perform expirar_pedidos();

  -- Trava do dia (capacidade, RN-06) e do telefone (limite, RN-09).
  perform travar_dia_agenda(p_inicio, p_fuso);
  perform pg_advisory_xact_lock(hashtext('telefone:' || p_telefone));

  -- RN-09: no máximo 2 agendamentos em aberto por telefone.
  select count(*) into v_ativos
    from agendamento a
    join cliente c on c.id = a.cliente_id
   where c.telefone = p_telefone
     and a.status in ('PENDENTE', 'AGUARDANDO_CLIENTE', 'CONFIRMADO')
     and a.data_hora_fim > now();
  if v_ativos >= 2 then
    raise exception 'LIMITE_ATIVOS';
  end if;

  -- RN-06: capacidade simultânea.
  if horario_lotado(p_inicio, v_fim) then
    raise exception 'HORARIO_OCUPADO';
  end if;

  -- RN-03 e RNF-13: cliente pelo telefone, nome atualizado, consentimento registrado.
  insert into cliente (nome, telefone, consentimento_lgpd, data_consentimento)
  values (p_nome, p_telefone, true, now())
  on conflict (telefone) do update
    set nome = excluded.nome, consentimento_lgpd = true, data_consentimento = now()
  returning id into v_cliente;

  v_codigo := gerar_codigo_agendamento();
  insert into agendamento (
    codigo, cliente_id, data_hora_inicio, data_hora_fim, modelo_veiculo, observacoes, status, origem
  )
  values (
    v_codigo, v_cliente, p_inicio, v_fim, nullif(p_modelo_veiculo, ''), nullif(p_observacoes, ''), 'PENDENTE', 'site'
  )
  returning id into v_id;

  -- Preço e duração copiados do serviço agora, para o histórico não mudar.
  insert into item_agendamento (agendamento_id, servico_id, preco_praticado, duracao_minutos)
  select v_id, s.id, s.preco_base, s.duracao_minutos
  from servico s
  where s.id = any (p_servicos);

  return v_codigo;
end;
$$;

-- ---------------------------------------------------------------------------
-- Permissões e agendamento da expiração
-- ---------------------------------------------------------------------------
do $$
declare
  v_funcao text;
  v_papel  text;
begin
  foreach v_funcao in array array[
    'expirar_pedidos()',
    'criar_agendamento_site(text, text, bigint[], timestamptz, text, text, text)'
  ] loop
    execute format('revoke execute on function %s from public', v_funcao);
    foreach v_papel in array array['anon', 'authenticated'] loop
      if exists (select 1 from pg_roles where rolname = v_papel) then
        execute format('revoke execute on function %s from %I', v_funcao, v_papel);
      end if;
    end loop;
  end loop;

  -- RN-08: a cada 5 minutos. O banco de testes local (PGlite) não tem pg_cron.
  if exists (select 1 from pg_available_extensions where name = 'pg_cron') then
    create extension if not exists pg_cron with schema pg_catalog;
    perform cron.schedule('smartagenda-expirar-pedidos', '*/5 * * * *', 'select public.expirar_pedidos()');
  end if;
end;
$$;
