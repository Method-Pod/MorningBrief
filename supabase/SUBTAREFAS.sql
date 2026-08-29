-- =====================================================================
-- Checklist dentro da demanda
--
-- Rode no SQL Editor do Supabase (Database > SQL Editor > New query >
-- cole > Run). É idempotente: rodar duas vezes não faz mal.
-- =====================================================================

create table if not exists public.task_items (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null references auth.users(id) on delete cascade,
  -- on delete cascade: quando a demanda sai (inclusive pela limpeza das 24h),
  -- os itens vão junto. Sem isso sobrariam itens órfãos que ninguém alcança.
  task_id     uuid not null references public.tasks(id) on delete cascade,
  title       text not null,
  done        boolean not null default false,
  -- Ordem de exibição. É um número e não a data de criação porque itens
  -- gerados em lote nascem no mesmo instante, e "Thumb 1..5" precisa sair
  -- na ordem certa.
  position    int not null default 0,
  created_at  timestamptz not null default now()
);

alter table public.task_items enable row level security;

do $$
begin
  if not exists (
    select 1 from pg_policies
    where tablename = 'task_items' and policyname = 'task_items_own'
  ) then
    create policy task_items_own on public.task_items
      for all
      using (auth.uid() = user_id)
      with check (auth.uid() = user_id);
  end if;
end $$;

-- A leitura é sempre "os itens desta demanda", nesta ordem.
create index if not exists task_items_da_demanda
  on public.task_items (task_id, position);

-- Modelo do checklist na regra recorrente: os títulos dos itens.
--
-- Um array de texto, e não uma tabela: o modelo é lido e escrito inteiro, nunca
-- em parte, e cada ocorrência gera cópias próprias em task_items. Uma tabela
-- só para o modelo somaria junção sem resolver nada.
alter table public.recurring_tasks
  add column if not exists checklist text[];
