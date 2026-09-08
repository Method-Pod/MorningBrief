-- =====================================================================
-- Cursos, e assuntos como etiqueta de verdade
--
-- Rode no SQL Editor do Supabase (Database > SQL Editor > New query >
-- cole > Run). É idempotente: rodar duas vezes não faz mal.
-- =====================================================================

-- ------------------------------ assuntos ------------------------------
--
-- Tabela e não texto solto na aula. Com texto, renomear "edicao" para
-- "Edição" exigiria varrer todas as aulas, e "edicao", "Edição" e
-- "edição" viveriam como três etiquetas diferentes. Aqui o nome mora num
-- lugar só: renomear é uma linha, e apagar solta as aulas sem apagá-las.
--
-- Sem coluna de cor de propósito: a etiqueta segue a cor do tema, como os
-- hábitos passaram a seguir.
create table if not exists public.subjects (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null references auth.users(id) on delete cascade,
  name        text not null,
  created_at  timestamptz not null default now()
);

alter table public.subjects enable row level security;

do $$
begin
  if not exists (
    select 1 from pg_policies where tablename = 'subjects' and policyname = 'subjects_own'
  ) then
    create policy subjects_own on public.subjects
      for all using (auth.uid() = user_id) with check (auth.uid() = user_id);
  end if;
end $$;

-- Sem etiqueta repetida, ignorando maiúscula: é o que impede a lista de
-- encher de variação do mesmo assunto.
create unique index if not exists subjects_nome_unico
  on public.subjects (user_id, lower(name));


-- ------------------------------ cursos ------------------------------
--
-- O curso guarda os dois números que você digita, não uma lista de aulas.
-- Cadastrar 40 linhas para acompanhar um curso seria mais trabalho que
-- assistir a ele; o que interessa é "vou na 12 de 40".
create table if not exists public.courses (
  id            uuid primary key default gen_random_uuid(),
  user_id       uuid not null references auth.users(id) on delete cascade,

  title         text not null,
  plataforma    text,
  url           text,
  subject_id    uuid references public.subjects(id) on delete set null,

  total_aulas   int not null check (total_aulas > 0),
  aulas_feitas  int not null default 0 check (aulas_feitas >= 0),

  created_at    timestamptz not null default now(),

  -- Feitas não pode passar do total: sem isto a barra de progresso iria
  -- além de 100% com um erro de digitação, e "12 de 8 aulas" ficaria na
  -- tela sem ninguém entender de onde veio.
  constraint courses_feitas_ate_o_total check (aulas_feitas <= total_aulas)
);

alter table public.courses enable row level security;

do $$
begin
  if not exists (
    select 1 from pg_policies where tablename = 'courses' and policyname = 'courses_own'
  ) then
    create policy courses_own on public.courses
      for all using (auth.uid() = user_id) with check (auth.uid() = user_id);
  end if;
end $$;

create index if not exists courses_da_pessoa
  on public.courses (user_id, created_at desc);


-- --------------------- aula aponta para o assunto ---------------------

alter table public.lessons
  add column if not exists subject_id uuid references public.subjects(id) on delete set null;

-- Migra o que existir na coluna de texto, sem perder nada.
--
-- Roda antes de a coluna antiga sair, e o `if exists` torna o bloco seguro
-- de repetir: na segunda vez a coluna já foi e nada acontece.
do $$
begin
  if exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'lessons' and column_name = 'assunto'
  ) then
    -- Cada assunto distinto vira uma etiqueta, uma vez só.
    insert into public.subjects (user_id, name)
    select distinct l.user_id, btrim(l.assunto)
    from public.lessons l
    where l.assunto is not null and btrim(l.assunto) <> ''
    on conflict do nothing;

    update public.lessons l
      set subject_id = s.id
      from public.subjects s
      where s.user_id = l.user_id
        and lower(s.name) = lower(btrim(l.assunto))
        and l.subject_id is null;

    alter table public.lessons drop column assunto;
  end if;
end $$;
