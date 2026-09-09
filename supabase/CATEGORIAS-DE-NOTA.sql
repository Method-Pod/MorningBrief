-- =====================================================================
-- Categorias de anotação
--
-- Rode no SQL Editor do Supabase (Database > SQL Editor > New query >
-- cole > Run). É idempotente: rodar duas vezes não faz mal.
-- =====================================================================

-- Categoria própria da anotação, e não as etiquetas de assunto.
--
-- As etiquetas de `subjects` (Design, IA) respondem "sobre o que é" e
-- servem às aulas e aos canais; as coleções de `colecoes` (Landing page,
-- Dashboard) respondem "para que serve" e servem às referências. A nota
-- se organiza por um terceiro eixo — o seu — e misturar os três faria uma
-- categoria de anotação aparecer no filtro das Aulas, onde não diz nada.
create table if not exists public.note_categories (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null references auth.users(id) on delete cascade,
  name        text not null,
  created_at  timestamptz not null default now()
);

alter table public.note_categories enable row level security;

do $$
begin
  if not exists (
    select 1 from pg_policies
    where tablename = 'note_categories' and policyname = 'note_categories_own'
  ) then
    create policy note_categories_own on public.note_categories
      for all using (auth.uid() = user_id) with check (auth.uid() = user_id);
  end if;
end $$;

-- Sem categoria repetida, ignorando maiúscula: é o que impede a lista de
-- encher de variação do mesmo nome.
create unique index if not exists note_categories_nome_unico
  on public.note_categories (user_id, lower(name));


-- ------------------------ nota × categoria ------------------------
--
-- Tabela de ligação, e não uma coluna na nota, porque uma anotação pode
-- pertencer a mais de uma categoria — "Estudo Design - Claude" é estudo e
-- é IA ao mesmo tempo. Com uma coluna só ela obrigaria a escolher.
--
-- `user_id` está repetido aqui de propósito: é o que a política do RLS
-- consegue conferir sem ir buscar nas outras duas tabelas.
create table if not exists public.note_in_category (
  note_id      uuid not null references public.notes(id) on delete cascade,
  category_id  uuid not null references public.note_categories(id) on delete cascade,
  user_id      uuid not null references auth.users(id) on delete cascade,
  primary key (note_id, category_id)
);

alter table public.note_in_category enable row level security;

do $$
begin
  if not exists (
    select 1 from pg_policies
    where tablename = 'note_in_category' and policyname = 'note_in_category_own'
  ) then
    create policy note_in_category_own on public.note_in_category
      for all using (auth.uid() = user_id) with check (auth.uid() = user_id);
  end if;
end $$;

-- Para "quais notas estão nesta categoria" não varrer a tabela.
create index if not exists note_in_category_por_categoria
  on public.note_in_category (category_id);
