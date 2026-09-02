-- =====================================================================
-- Leitura: nota do livro e meta do ano
--
-- Rode no SQL Editor do Supabase (Database > SQL Editor > New query >
-- cole > Run). É idempotente: rodar duas vezes não faz mal.
-- =====================================================================

-- Nota de 1 a 5, só depois de ler.
--
-- Nula por padrão, e nula é diferente de zero: "não avaliei" não é "achei
-- ruim". A escala vai a 5 e não a 10 porque meia estrela em 10 pontos é
-- decisão que ninguém quer tomar ao fechar um livro.
alter table public.books
  add column if not exists rating int;

do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'books_rating_faixa'
  ) then
    alter table public.books
      add constraint books_rating_faixa check (rating between 1 and 5);
  end if;
end $$;


-- Meta de livros por ano.
--
-- Tabela e não coluna em outro lugar: a meta é por ano, então mudar de ano não
-- pode apagar a do ano passado — é justamente a comparação que dá sentido a
-- ter meta. A chave primária composta impede duas metas para o mesmo ano.
create table if not exists public.reading_goals (
  user_id  uuid not null references auth.users(id) on delete cascade,
  year     int  not null check (year between 2000 and 2100),
  target   int  not null check (target between 1 and 999),
  primary key (user_id, year)
);

alter table public.reading_goals enable row level security;

do $$
begin
  if not exists (
    select 1 from pg_policies
    where tablename = 'reading_goals' and policyname = 'reading_goals_own'
  ) then
    create policy reading_goals_own on public.reading_goals
      for all using (auth.uid() = user_id) with check (auth.uid() = user_id);
  end if;
end $$;
