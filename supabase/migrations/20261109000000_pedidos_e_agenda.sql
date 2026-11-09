-- SmartAgenda: pedidos e agenda do painel (RF-16 a RF-19)
--
-- Acrescenta ao esquema inicial o que o painel precisa para manter a agenda:
--   * de onde veio o agendamento (site ou painel) e quando foi respondido;
--   * funções que gravam horários conferindo a capacidade (RN-06) de forma
--     atômica, com uma trava por dia: dois cliques ao mesmo tempo no último
--     lugar livre resultam em um agendamento gravado e um recusado.
--
-- As funções levantam exceções com códigos estáveis na mensagem
-- (HORARIO_OCUPADO, NAO_ENCONTRADO...), que o servidor traduz em respostas HTTP.

-- ---------------------------------------------------------------------------
-- Agendamento: origem e resposta
-- ---------------------------------------------------------------------------
alter table agendamento
  add column origem        text not null default 'site' check (origem in ('site', 'painel')),
  add column respondido_em timestamptz;

-- ---------------------------------------------------------------------------
-- Trava da agenda por dia (RN-06)
-- Toda gravação de horário chama esta função antes de conferir a capacidade.
-- O pedido feito pelo site (criar_agendamento, próxima etapa) deve usar a
-- mesma trava, para os dois caminhos não reservarem o mesmo lugar.
-- ---------------------------------------------------------------------------
create function travar_dia_agenda(p_inicio timestamptz, p_fuso text)
returns void
language sql
set search_path = public
as $$
  select pg_advisory_xact_lock(hashtext('agenda:' || to_char(p_inicio at time zone p_fuso, 'YYYY-MM-DD')));
$$;

-- Verdadeiro quando, em algum momento entre p_inicio e p_fim, os agendamentos
-- que ocupam a agenda já somam a capacidade simultânea. Basta olhar o início
-- do novo horário e os inícios que caem dentro dele: é onde a ocupação cresce.
create function horario_lotado(p_inicio timestamptz, p_fim timestamptz, p_ignorar bigint default null)
returns boolean
language plpgsql
stable
set search_path = public
as $$
declare
  v_capacidade integer;
  v_maximo     integer;
begin
  select capacidade_simultanea into v_capacidade from configuracao_agenda limit 1;
  v_capacidade := coalesce(v_capacidade, 1);

  select coalesce(max(ocupacao), 0) into v_maximo
  from (
    select (
      select count(*)
      from agendamento a
      where a.status in ('PENDENTE', 'AGUARDANDO_CLIENTE', 'CONFIRMADO')
        and a.id is distinct from p_ignorar
        and a.data_hora_inicio <= pontos.ponto
        and a.data_hora_fim > pontos.ponto
    ) as ocupacao
    from (
      select p_inicio as ponto
      union
      select a.data_hora_inicio
      from agendamento a
      where a.status in ('PENDENTE', 'AGUARDANDO_CLIENTE', 'CONFIRMADO')
        and a.id is distinct from p_ignorar
        and a.data_hora_inicio > p_inicio
        and a.data_hora_inicio < p_fim
    ) as pontos
  ) as ocupacoes;

  return v_maximo >= v_capacidade;
end;
$$;

-- Código de 6 caracteres sem 0, O, 1 e I, que ainda não exista.
create function gerar_codigo_agendamento()
returns text
language plpgsql
volatile
set search_path = public
as $$
declare
  v_alfabeto constant text := 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  v_codigo   text;
begin
  loop
    v_codigo := '';
    for i in 1..6 loop
      v_codigo := v_codigo || substr(v_alfabeto, 1 + floor(random() * length(v_alfabeto))::int, 1);
    end loop;
    exit when not exists (select 1 from agendamento where codigo = v_codigo);
  end loop;
  return v_codigo;
end;
$$;

-- Confere a lista de serviços: ao menos um (RN-04), sem repetição e todos ativos.
create function conferir_servicos(p_servicos bigint[])
returns void
language plpgsql
stable
set search_path = public
as $$
declare
  v_distintos integer;
  v_ativos    integer;
begin
  select count(distinct s) into v_distintos from unnest(p_servicos) as s;
  if v_distintos = 0 then
    raise exception 'SEM_SERVICO';
  end if;
  if v_distintos <> coalesce(array_length(p_servicos, 1), 0) then
    raise exception 'SERVICO_REPETIDO';
  end if;
  select count(*) into v_ativos from servico where id = any (p_servicos) and ativo;
  if v_ativos <> v_distintos then
    raise exception 'SERVICO_INVALIDO';
  end if;
end;
$$;

-- ---------------------------------------------------------------------------
-- Agendamento manual (RF-18): cliente atendido por telefone ou no balcão.
-- Já nasce CONFIRMADO, com origem 'painel'. O cliente é reaproveitado pelo
-- telefone e tem o nome atualizado (RN-03).
-- Devolve o código do agendamento.
-- ---------------------------------------------------------------------------
create function criar_agendamento_painel(
  p_nome           text,
  p_telefone       text,
  p_servicos       bigint[],
  p_inicio         timestamptz,
  p_modelo_veiculo text,
  p_observacoes    text,
  p_responsavel    bigint,
  p_fuso           text default 'America/Sao_Paulo'
)
returns text
language plpgsql
set search_path = public
as $$
declare
  v_duracao integer;
  v_fim     timestamptz;
  v_cliente bigint;
  v_id      bigint;
  v_codigo  text;
begin
  perform conferir_servicos(p_servicos);
  select sum(duracao_minutos) into v_duracao from servico where id = any (p_servicos);
  v_fim := p_inicio + make_interval(mins => v_duracao);

  perform travar_dia_agenda(p_inicio, p_fuso);
  if horario_lotado(p_inicio, v_fim) then
    raise exception 'HORARIO_OCUPADO';
  end if;

  insert into cliente (nome, telefone)
  values (p_nome, p_telefone)
  on conflict (telefone) do update set nome = excluded.nome
  returning id into v_cliente;

  v_codigo := gerar_codigo_agendamento();
  insert into agendamento (
    codigo, cliente_id, responsavel_id, data_hora_inicio, data_hora_fim,
    modelo_veiculo, observacoes, status, origem, respondido_em
  )
  values (
    v_codigo, v_cliente, p_responsavel, p_inicio, v_fim,
    nullif(p_modelo_veiculo, ''), nullif(p_observacoes, ''), 'CONFIRMADO', 'painel', now()
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
-- Remarcar (realocar e/ou trocar serviços) um agendamento que ocupa a agenda.
-- p_servicos nulo mantém os serviços. Serviços que continuam no pedido mantêm
-- o preço e a duração praticados; os novos entram com os valores atuais.
-- O status não muda: um pedido pendente remarcado continua esperando o aceite.
-- ---------------------------------------------------------------------------
create function remarcar_agendamento(
  p_codigo   text,
  p_inicio   timestamptz,
  p_servicos bigint[] default null,
  p_fuso     text default 'America/Sao_Paulo'
)
returns text
language plpgsql
set search_path = public
as $$
declare
  v_id      bigint;
  v_status  status_agendamento;
  v_duracao integer;
  v_fim     timestamptz;
begin
  select id, status into v_id, v_status from agendamento where codigo = p_codigo for update;
  if not found then
    raise exception 'NAO_ENCONTRADO';
  end if;
  if v_status not in ('PENDENTE', 'AGUARDANDO_CLIENTE', 'CONFIRMADO') then
    raise exception 'STATUS_NAO_PERMITE';
  end if;

  perform travar_dia_agenda(p_inicio, p_fuso);

  if p_servicos is not null then
    perform conferir_servicos(p_servicos);
    delete from item_agendamento
    where agendamento_id = v_id and not (servico_id = any (p_servicos));
    insert into item_agendamento (agendamento_id, servico_id, preco_praticado, duracao_minutos)
    select v_id, s.id, s.preco_base, s.duracao_minutos
    from servico s
    where s.id = any (p_servicos)
    on conflict (agendamento_id, servico_id) do nothing;
  end if;

  select sum(duracao_minutos) into v_duracao from item_agendamento where agendamento_id = v_id;
  v_fim := p_inicio + make_interval(mins => v_duracao);

  if horario_lotado(p_inicio, v_fim, v_id) then
    raise exception 'HORARIO_OCUPADO';
  end if;

  update agendamento set data_hora_inicio = p_inicio, data_hora_fim = v_fim where id = v_id;
  return p_codigo;
end;
$$;

-- ---------------------------------------------------------------------------
-- Só o servidor (chave de serviço) chama estas funções.
-- No Supabase, funções novas também ganham permissão para os papéis da chave
-- pública (anon) e de usuários logados (authenticated); por isso a revogação
-- explícita. O bloco ignora papéis que não existem (ex.: banco de testes local).
-- ---------------------------------------------------------------------------
do $$
declare
  v_funcao text;
  v_papel  text;
begin
  foreach v_funcao in array array[
    'travar_dia_agenda(timestamptz, text)',
    'horario_lotado(timestamptz, timestamptz, bigint)',
    'gerar_codigo_agendamento()',
    'conferir_servicos(bigint[])',
    'criar_agendamento_painel(text, text, bigint[], timestamptz, text, text, bigint, text)',
    'remarcar_agendamento(text, timestamptz, bigint[], text)'
  ] loop
    execute format('revoke execute on function %s from public', v_funcao);
    foreach v_papel in array array['anon', 'authenticated'] loop
      if exists (select 1 from pg_roles where rolname = v_papel) then
        execute format('revoke execute on function %s from %I', v_funcao, v_papel);
      end if;
    end loop;
  end loop;
end;
$$;
