-- SmartAgenda: esquema inicial do banco (Supabase / PostgreSQL)
--
-- Tradução do diagrama de classes de projeto (docs/uml-tecnica.png):
-- cada classe vira uma tabela com os mesmos atributos e valores padrão.
-- Rode uma vez no SQL Editor do Supabase ou com `supabase db push`.
--
-- Convenções
--   * Tabelas e colunas em snake_case; a API devolve camelCase.
--   * Além dos atributos da UML, só existem as colunas que ligam as tabelas
--     (as associações do diagrama) e as chaves primárias.
--   * Cada instalação atende uma estética (RNF-12), então `empresa` tem uma linha.
--   * RLS ligado em todas as tabelas e sem políticas: só o servidor, com a
--     chave de serviço, lê e grava. A chave pública (anon) não acessa nada.

-- ---------------------------------------------------------------------------
-- Enumerações
-- ---------------------------------------------------------------------------
create type perfil_usuario as enum ('DONO', 'SOCIO', 'FUNCIONARIO');

-- «enumeration» StatusAgendamento (RN-16)
create type status_agendamento as enum (
  'PENDENTE',
  'AGUARDANDO_CLIENTE',
  'CONFIRMADO',
  'RECUSADO',
  'EXPIRADO',
  'CANCELADO',
  'CONCLUIDO',
  'NAO_COMPARECEU'
);

-- ---------------------------------------------------------------------------
-- Empresa (RF-23)
-- ---------------------------------------------------------------------------
create table empresa (
  id                bigint generated always as identity primary key,
  nome              text not null,
  descricao         text,
  logotipo_url      text,
  cor_primaria      text check (cor_primaria ~ '^#[0-9a-fA-F]{6}$'), -- ex.: #1f1f1f
  endereco          text,
  telefone_whatsapp text
);

-- ---------------------------------------------------------------------------
-- ConfiguracaoAgenda e BloqueioAgenda (RF-22)
-- Empresa ◆ ConfiguracaoAgenda (1 para 1): a chave é a própria empresa.
-- ---------------------------------------------------------------------------
create table configuracao_agenda (
  empresa_id                bigint primary key references empresa (id) on delete cascade,
  -- List<String>: dias da semana em que a estética atende
  dias_funcionamento        text[] not null default '{SEG,TER,QUA,QUI,SEX,SAB}'
                            check (dias_funcionamento <@ '{DOM,SEG,TER,QUA,QUI,SEX,SAB}'::text[]),
  hora_abertura             time not null default '08:00',
  hora_fechamento           time not null default '18:00',
  intervalo_minutos         integer not null default 30 check (intervalo_minutos > 0),
  capacidade_simultanea     integer not null default 1 check (capacidade_simultanea >= 1),      -- RN-06
  antecedencia_minima_horas integer not null default 2 check (antecedencia_minima_horas >= 0),  -- RN-07
  limite_dias_futuros       integer not null default 30 check (limite_dias_futuros >= 1),       -- RN-07
  prazo_resposta_horas      integer not null default 12 check (prazo_resposta_horas >= 1),      -- RN-08
  prazo_cancelamento_horas  integer not null default 2 check (prazo_cancelamento_horas >= 0),   -- RN-12
  check (hora_fechamento > hora_abertura)
);

-- ConfiguracaoAgenda ◆ BloqueioAgenda (1 para 0..*): uma data bloqueada por linha.
create table bloqueio_agenda (
  empresa_id bigint not null references configuracao_agenda (empresa_id) on delete cascade,
  data       date not null,
  motivo     text,
  primary key (empresa_id, data)
);

-- ---------------------------------------------------------------------------
-- «abstract» UsuarioAdmin -> Dono, Socio, Funcionario (RF-14, RF-15)
-- A superclasse guarda os atributos comuns e o perfil; cada subclasse tem
-- a sua tabela com os atributos próprios. O gatilho mais abaixo cria (ou
-- troca) a linha da subclasse sempre que um usuário é criado ou muda de perfil.
-- ---------------------------------------------------------------------------
create table usuario_admin (
  id         bigint generated always as identity primary key,
  empresa_id bigint not null references empresa (id),  -- Empresa ◇ UsuarioAdmin
  nome       text not null,
  email      text not null unique check (email = lower(email)), -- login sem diferença de maiúsculas
  senha_hash text not null,                             -- bcrypt (RNF-07)
  telefone   text,
  ativo      boolean not null default true,
  perfil     perfil_usuario not null
);

create table dono (
  usuario_id          bigint primary key references usuario_admin (id) on delete cascade,
  recebe_notificacoes boolean not null default true
);

create table socio (
  usuario_id bigint primary key references usuario_admin (id) on delete cascade
);

create table funcionario (
  usuario_id bigint primary key references usuario_admin (id) on delete cascade,
  cargo      text
);

create function sincronizar_subclasse_usuario()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  delete from dono        where usuario_id = new.id and new.perfil <> 'DONO';
  delete from socio       where usuario_id = new.id and new.perfil <> 'SOCIO';
  delete from funcionario where usuario_id = new.id and new.perfil <> 'FUNCIONARIO';

  if new.perfil = 'DONO' then
    insert into dono (usuario_id) values (new.id) on conflict do nothing;
  elsif new.perfil = 'SOCIO' then
    insert into socio (usuario_id) values (new.id) on conflict do nothing;
  else
    insert into funcionario (usuario_id) values (new.id) on conflict do nothing;
  end if;

  return null;
end;
$$;

create trigger usuario_admin_subclasse
after insert or update of perfil on usuario_admin
for each row execute function sincronizar_subclasse_usuario();

-- ---------------------------------------------------------------------------
-- Servico, TrabalhoPortfolio e Foto (RF-20, RF-21)
-- ---------------------------------------------------------------------------
create table servico (
  id              bigint generated always as identity primary key,
  empresa_id      bigint not null references empresa (id),  -- Empresa ◇ Servico
  nome            text not null,
  descricao       text,
  categoria       text not null,
  preco_base      numeric(10, 2) not null check (preco_base >= 0), -- "a partir de" (RN-15)
  duracao_minutos integer not null check (duracao_minutos > 0),
  ativo           boolean not null default true
);

create table trabalho_portfolio (
  id              bigint generated always as identity primary key,
  empresa_id      bigint not null references empresa (id) on delete cascade, -- Empresa ◆ TrabalhoPortfolio
  servico_id      bigint references servico (id) on delete set null,         -- mostra 0..1 Servico
  titulo          text not null,
  descricao       text,
  data_realizacao date,
  publicado       boolean not null default false
);

-- TrabalhoPortfolio ◆ Foto (1 para 1..*). A chave é o trabalho + a URL da foto.
create table foto (
  trabalho_id bigint not null references trabalho_portfolio (id) on delete cascade,
  url         text not null,
  legenda     text,
  tipo        text,
  ordem       integer not null default 0,
  primary key (trabalho_id, url)
);

-- ---------------------------------------------------------------------------
-- Cliente, Agendamento e ItemAgendamento (RF-04 a RF-08, RF-16 a RF-19)
-- ---------------------------------------------------------------------------
create table cliente (
  id                 bigint generated always as identity primary key,
  nome               text not null check (char_length(nome) >= 3), -- RN-01
  -- {unique}, RN-03; formato internacional, como o site envia (+5511987654321)
  telefone           text not null unique check (telefone ~ '^\+[1-9][0-9]{7,14}$'),
  consentimento_lgpd boolean not null default false,               -- RNF-13
  data_consentimento timestamptz
);

create table agendamento (
  id               bigint generated always as identity primary key,
  -- {unique}; 6 caracteres sem 0, O, 1 e I, como o site valida
  codigo           text not null unique check (codigo ~ '^[A-HJ-NP-Z2-9]{6}$'),
  cliente_id       bigint not null references cliente (id),               -- Cliente solicita 0..*
  responsavel_id   bigint references usuario_admin (id) on delete set null, -- UsuarioAdmin responde 0..1
  data_hora_inicio timestamptz not null,
  data_hora_fim    timestamptz not null,
  modelo_veiculo   text,
  observacoes      text,
  status           status_agendamento not null default 'PENDENTE',
  criado_em        timestamptz not null default now(),
  check (data_hora_fim > data_hora_inicio)
);

create index agendamento_inicio_idx on agendamento (data_hora_inicio);
create index agendamento_status_idx on agendamento (status);
create index agendamento_cliente_idx on agendamento (cliente_id);

-- Classe associativa entre Agendamento (1..*) e Servico (0..*): preço e
-- duração praticados, para o histórico não mudar quando o serviço for editado.
create table item_agendamento (
  agendamento_id  bigint not null references agendamento (id) on delete cascade,
  servico_id      bigint not null references servico (id),
  preco_praticado numeric(10, 2) not null check (preco_praticado >= 0),
  duracao_minutos integer not null check (duracao_minutos > 0),
  primary key (agendamento_id, servico_id)
);

-- ---------------------------------------------------------------------------
-- Notificacao (RF-09 a RF-13, RNF-14)
-- Agendamento ◆ Notificacao (1 para 0..*)
-- ---------------------------------------------------------------------------
create table notificacao (
  id             bigint generated always as identity primary key,
  agendamento_id bigint not null references agendamento (id) on delete cascade,
  destinatario   text not null,
  tipo           text not null,
  conteudo       text not null,
  enviada_em     timestamptz,
  enviada        boolean not null default false
);

-- Mensagens ainda não enviadas, para o reenvio (RNF-14).
create index notificacao_pendente_idx on notificacao (id) where not enviada;

-- ---------------------------------------------------------------------------
-- Segurança: RLS ligado e sem políticas = acesso só pela chave de serviço.
-- ---------------------------------------------------------------------------
alter table empresa             enable row level security;
alter table configuracao_agenda enable row level security;
alter table bloqueio_agenda     enable row level security;
alter table usuario_admin       enable row level security;
alter table dono                enable row level security;
alter table socio               enable row level security;
alter table funcionario         enable row level security;
alter table servico             enable row level security;
alter table trabalho_portfolio  enable row level security;
alter table foto                enable row level security;
alter table cliente             enable row level security;
alter table agendamento         enable row level security;
alter table item_agendamento    enable row level security;
alter table notificacao         enable row level security;
