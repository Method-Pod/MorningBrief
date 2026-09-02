-- =====================================================================
-- Leitura: estante e sessões
--
-- Rode no SQL Editor do Supabase (Database > SQL Editor > New query >
-- cole > Run). É idempotente: rodar duas vezes não faz mal.
-- =====================================================================

create table if not exists public.books (
  id             uuid primary key default gen_random_uuid(),
  user_id        uuid not null references auth.users(id) on delete cascade,

  -- Identificação. `title` é o único obrigatório: livro sem ISBN existe
  -- (edição antiga, cópia solta), e a estante não pode recusar por isso.
  title          text not null,
  authors        text,
  isbn           text,
  cover_url      text,
  publisher      text,
  published_on   text,
  -- A API devolve data em três formatos ("2015", "2015-03", "2015-03-11"),
  -- então é texto: converter para date obrigaria a inventar mês e dia.
  description    text,
  categories     text,
  language       text,

  -- Progresso. `total_pages` pode ser nulo — a API nem sempre traz, e nesse
  -- caso a barra não aparece mas o registro de leitura continua valendo.
  total_pages    int,
  current_page   int not null default 0 check (current_page >= 0),

  status         text not null default 'reading'
                   check (status in ('want', 'reading', 'done')),
  started_on     date,
  finished_on    date,

  created_at     timestamptz not null default now()
);

alter table public.books enable row level security;

do $$
begin
  if not exists (
    select 1 from pg_policies where tablename = 'books' and policyname = 'books_own'
  ) then
    create policy books_own on public.books
      for all using (auth.uid() = user_id) with check (auth.uid() = user_id);
  end if;
end $$;

-- A leitura é sempre "a minha estante, nesta prateleira, mais recente antes".
create index if not exists books_da_pessoa
  on public.books (user_id, status, created_at desc);


create table if not exists public.reading_sessions (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null references auth.users(id) on delete cascade,
  -- on delete cascade: tirar o livro da estante leva as sessões dele. Sem
  -- isso sobrariam sessões órfãs que nenhuma tela alcança.
  book_id     uuid not null references public.books(id) on delete cascade,

  day         date not null,
  -- Quantas páginas naquela marcação, e onde parou. Guardar as duas evita
  -- recalcular a página atual somando a série toda, e mantém o histórico
  -- honesto quando alguém corrige a página para trás.
  pages       int not null,
  end_page    int not null,

  created_at  timestamptz not null default now()
);

alter table public.reading_sessions enable row level security;

do $$
begin
  if not exists (
    select 1 from pg_policies
    where tablename = 'reading_sessions' and policyname = 'reading_sessions_own'
  ) then
    create policy reading_sessions_own on public.reading_sessions
      for all using (auth.uid() = user_id) with check (auth.uid() = user_id);
  end if;
end $$;

-- Duas leituras: o histórico de um livro, e o ritmo por dia da pessoa.
create index if not exists sessoes_do_livro
  on public.reading_sessions (book_id, day desc);
create index if not exists sessoes_por_dia
  on public.reading_sessions (user_id, day desc);
