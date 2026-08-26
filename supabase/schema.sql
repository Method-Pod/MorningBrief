-- ============================================================
-- Morning Brief - schema
-- Cole tudo isto no Supabase > SQL Editor > New query > Run
-- ============================================================

-- ---------- ANOTAÇÕES ----------
create table if not exists public.notes (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null references auth.users(id) on delete cascade,
  title       text not null default '',
  content     text not null default '',
  color       text not null default 'blue',
  pinned      boolean not null default false,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

-- ---------- CONTAS A PAGAR ----------
create table if not exists public.bills (
  id           uuid primary key default gen_random_uuid(),
  user_id      uuid not null references auth.users(id) on delete cascade,
  description  text not null,
  amount       numeric(14,2) not null default 0,
  due_date     date not null,
  category     text not null default 'Outros',
  status       text not null default 'pending' check (status in ('pending','paid')),
  paid_at      timestamptz,
  recurring    boolean not null default false,
  notes        text not null default '',
  created_at   timestamptz not null default now()
);

-- ---------- DEMANDAS ----------
create table if not exists public.tasks (
  id           uuid primary key default gen_random_uuid(),
  user_id      uuid not null references auth.users(id) on delete cascade,
  title        text not null,
  description  text not null default '',
  client       text not null default '',
  priority     text not null default 'medium' check (priority in ('low','medium','high','urgent')),
  status       text not null default 'todo' check (status in ('todo','doing','review','done')),
  due_date     date,
  origin_id    uuid,
  created_at   timestamptz not null default now(),
  completed_at timestamptz
);

-- ---------- DEMANDAS RECORRENTES ----------
create table if not exists public.recurring_tasks (
  id            uuid primary key default gen_random_uuid(),
  user_id       uuid not null references auth.users(id) on delete cascade,
  title         text not null,
  description   text not null default '',
  client        text not null default '',
  priority      text not null default 'medium' check (priority in ('low','medium','high','urgent')),
  frequency     text not null default 'weekly' check (frequency in ('daily','weekly','biweekly','monthly','quarterly','yearly')),
  weekday       int check (weekday between 0 and 6),
  day_of_month  int check (day_of_month between 1 and 31),
  active        boolean not null default true,
  last_run_on   date,
  created_at    timestamptz not null default now()
);

-- ---------- CALENDÁRIO ----------
create table if not exists public.events (
  id           uuid primary key default gen_random_uuid(),
  user_id      uuid not null references auth.users(id) on delete cascade,
  title        text not null,
  description  text not null default '',
  start_at     timestamptz not null,
  end_at       timestamptz,
  all_day      boolean not null default false,
  color        text not null default 'blue',
  location     text not null default '',
  created_at   timestamptz not null default now()
);

-- ---------- ÍNDICES ----------
create index if not exists notes_user_idx      on public.notes(user_id, pinned desc, updated_at desc);
create index if not exists bills_user_idx      on public.bills(user_id, due_date);
create index if not exists tasks_user_idx      on public.tasks(user_id, status, due_date);
create index if not exists recurring_user_idx  on public.recurring_tasks(user_id, active);
create index if not exists events_user_idx     on public.events(user_id, start_at);

-- ---------- ROW LEVEL SECURITY ----------
-- Cada usuário só enxerga e mexe nas próprias linhas.
alter table public.notes            enable row level security;
alter table public.bills            enable row level security;
alter table public.tasks            enable row level security;
alter table public.recurring_tasks  enable row level security;
alter table public.events           enable row level security;

do $$
declare t text;
begin
  foreach t in array array['notes','bills','tasks','recurring_tasks','events'] loop
    execute format('drop policy if exists "own_select" on public.%I', t);
    execute format('drop policy if exists "own_insert" on public.%I', t);
    execute format('drop policy if exists "own_update" on public.%I', t);
    execute format('drop policy if exists "own_delete" on public.%I', t);
    execute format('create policy "own_select" on public.%I for select using (auth.uid() = user_id)', t);
    execute format('create policy "own_insert" on public.%I for insert with check (auth.uid() = user_id)', t);
    execute format('create policy "own_update" on public.%I for update using (auth.uid() = user_id) with check (auth.uid() = user_id)', t);
    execute format('create policy "own_delete" on public.%I for delete using (auth.uid() = user_id)', t);
  end loop;
end $$;

-- ---------- updated_at automático em notes ----------
create or replace function public.touch_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end $$;

drop trigger if exists notes_touch on public.notes;
create trigger notes_touch before update on public.notes
  for each row execute function public.touch_updated_at();
