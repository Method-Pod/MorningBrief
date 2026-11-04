-- =====================================================================
-- Registro do dia, modelos de demanda e chaves do Claude
--
-- Rode no SQL Editor do Supabase (Database > SQL Editor > New query >
-- cole > Run). É idempotente: rodar duas vezes não faz mal, e não toca em
-- nada que já existe.
-- =====================================================================


-- ------------------------------ registro do dia ------------------------------
--
-- A limpeza das 6h apaga as demandas concluídas e, depois de 7 dias, as aulas
-- assistidas. Sem guardar antes, a revisão da semana não teria o que mostrar
-- e os padrões não teriam histórico. A limpeza agora grava aqui o que vai
-- apagar, um dia por linha, e só então apaga.
--
-- `energia` é o toque de 1 a 5 do Início. O dia vai das 6h às 6h, o mesmo
-- relógio da limpeza: concluir algo à 1h da manhã conta no dia anterior.

create table if not exists public.registro_do_dia (
  user_id       uuid not null default auth.uid() references auth.users(id) on delete cascade,
  dia           date not null,
  concluidas    jsonb not null default '[]'::jsonb,
  aulas         jsonb not null default '[]'::jsonb,
  energia       smallint check (energia between 1 and 5),
  atualizado_em timestamptz not null default now(),
  primary key (user_id, dia)
);

alter table public.registro_do_dia enable row level security;

do $$
begin
  if not exists (
    select 1 from pg_policies
     where tablename = 'registro_do_dia' and policyname = 'registro_do_dia_own'
  ) then
    create policy registro_do_dia_own on public.registro_do_dia
      for all using (auth.uid() = user_id) with check (auth.uid() = user_id);
  end if;
end $$;


-- ------------------------------ modelos de demanda ------------------------------
--
-- "Carrossel" já nasce com cliente, prioridade, checklist, links e prazo.
-- `prazo_dias` conta a partir do dia em que a demanda é criada; nulo = sem
-- prazo. Cliente ou projeto apagado deixa o modelo sem ele, não apaga o
-- modelo.

create table if not exists public.modelos_de_demanda (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null default auth.uid() references auth.users(id) on delete cascade,
  nome        text not null check (char_length(nome) between 1 and 80),
  titulo      text not null default '',
  descricao   text not null default '',
  cliente_id  uuid references public.clientes(id) on delete set null,
  projeto_id  uuid references public.projetos(id) on delete set null,
  priority    text not null default 'medium' check (priority in ('low','medium','high','urgent')),
  checklist   text[] not null default '{}',
  links       text[] not null default '{}',
  prazo_dias  int check (prazo_dias between 0 and 365),
  created_at  timestamptz not null default now()
);

create unique index if not exists modelos_de_demanda_nome_unico
  on public.modelos_de_demanda (user_id, lower(nome));

alter table public.modelos_de_demanda enable row level security;

do $$
begin
  if not exists (
    select 1 from pg_policies
     where tablename = 'modelos_de_demanda' and policyname = 'modelos_de_demanda_own'
  ) then
    create policy modelos_de_demanda_own on public.modelos_de_demanda
      for all using (auth.uid() = user_id) with check (auth.uid() = user_id);
  end if;
end $$;


-- ------------------------------ chaves do Claude ------------------------------
--
-- A chave que liga o Claude Code ao app. O banco guarda só a impressão
-- digital dela (SHA-256), nunca a chave: quem ler esta tabela não consegue
-- usar nada. A chave aparece uma vez, ao ser criada em Conta.
--
-- Quem cria e confere é o servidor do app. Pelo navegador a pessoa só vê as
-- próprias chaves e pode revogar -- não há política de inserção aqui.

create table if not exists public.chaves_do_claude (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null references auth.users(id) on delete cascade,
  nome        text not null default 'Claude Code' check (char_length(nome) <= 60),
  prefixo     text not null,
  hash        text not null unique,
  criada_em   timestamptz not null default now(),
  usada_em    timestamptz,
  revogada_em timestamptz
);

create index if not exists chaves_do_claude_da_pessoa
  on public.chaves_do_claude (user_id);

alter table public.chaves_do_claude enable row level security;

do $$
begin
  if not exists (
    select 1 from pg_policies
     where tablename = 'chaves_do_claude' and policyname = 'chaves_do_claude_ver'
  ) then
    create policy chaves_do_claude_ver on public.chaves_do_claude
      for select using (auth.uid() = user_id);
  end if;
  if not exists (
    select 1 from pg_policies
     where tablename = 'chaves_do_claude' and policyname = 'chaves_do_claude_revogar'
  ) then
    create policy chaves_do_claude_revogar on public.chaves_do_claude
      for update using (auth.uid() = user_id) with check (auth.uid() = user_id);
  end if;
end $$;
