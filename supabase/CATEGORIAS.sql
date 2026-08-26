-- ============================================================
-- Morning Brief — categorias de contas editáveis
-- Cole no SQL Editor e rode. Pode rodar de novo sem estragar.
-- ============================================================

create table if not exists public.bill_categories (
  id         uuid primary key default gen_random_uuid(),
  user_id    uuid not null references auth.users(id) on delete cascade,
  name       text not null,
  created_at timestamptz not null default now(),
  -- impede duas categorias com o mesmo nome para a mesma pessoa; é o que
  -- permite o app tratar 23505 como "já existe" em vez de erro
  unique (user_id, name)
);

create index if not exists bill_categories_user_idx
  on public.bill_categories (user_id, name);

alter table public.bill_categories enable row level security;

do $$
begin
  drop policy if exists "own_select" on public.bill_categories;
  drop policy if exists "own_insert" on public.bill_categories;
  drop policy if exists "own_update" on public.bill_categories;
  drop policy if exists "own_delete" on public.bill_categories;

  create policy "own_select" on public.bill_categories
    for select using (auth.uid() = user_id);
  create policy "own_insert" on public.bill_categories
    for insert with check (auth.uid() = user_id);
  create policy "own_update" on public.bill_categories
    for update using (auth.uid() = user_id) with check (auth.uid() = user_id);
  create policy "own_delete" on public.bill_categories
    for delete using (auth.uid() = user_id);
end $$;
