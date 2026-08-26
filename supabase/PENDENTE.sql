-- ============================================================
-- Morning Brief — tudo que falta no banco, num arquivo só.
-- Cole inteiro no SQL Editor e rode. Pode rodar de novo sem estragar.
-- Inclui as migrações 002, 003, hábitos e foto de perfil.
-- ============================================================

-- ============================================================
-- 002 — impede recorrência duplicada e amarra origin_id
-- ============================================================

create unique index if not exists tasks_origin_day_uniq
  on public.tasks (user_id, origin_id, due_date)
  where origin_id is not null;

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'tasks_origin_fk') then
    update public.tasks t
       set origin_id = null
     where t.origin_id is not null
       and not exists (
         select 1 from public.recurring_tasks r where r.id = t.origin_id
       );
    alter table public.tasks
      add constraint tasks_origin_fk
      foreign key (origin_id) references public.recurring_tasks (id)
      on delete set null;
  end if;
end $$;

-- ============================================================
-- 003 — parcelas em contas a pagar ("2/4" na lista)
-- ============================================================

alter table public.bills
  add column if not exists installment_no    int,
  add column if not exists installment_total int;

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'bills_installment_ck') then
    alter table public.bills
      add constraint bills_installment_ck check (
        (installment_no is null and installment_total is null)
        or (installment_no >= 1
            and installment_total >= 1
            and installment_no <= installment_total)
      );
  end if;
end $$;

-- ============================================================
-- 004 — hábitos
-- ============================================================

create table if not exists public.habits (
  id              uuid primary key default gen_random_uuid(),
  user_id         uuid not null references auth.users(id) on delete cascade,
  name            text not null,
  color           text not null default 'blue',
  target_per_week int  not null default 7 check (target_per_week between 1 and 7),
  active          boolean not null default true,
  created_at      timestamptz not null default now()
);

-- Um registro por hábito por dia. O unique é o que impede marcar duas vezes
-- e permite o insert/delete direto sem ler antes.
create table if not exists public.habit_logs (
  id         uuid primary key default gen_random_uuid(),
  user_id    uuid not null references auth.users(id) on delete cascade,
  habit_id   uuid not null references public.habits(id) on delete cascade,
  day        date not null,
  created_at timestamptz not null default now(),
  unique (habit_id, day)
);

create index if not exists habits_user_idx     on public.habits(user_id, active);
create index if not exists habit_logs_user_idx on public.habit_logs(user_id, day desc);
create index if not exists habit_logs_hab_idx  on public.habit_logs(habit_id, day desc);

alter table public.habits     enable row level security;
alter table public.habit_logs enable row level security;

do $$
declare t text;
begin
  foreach t in array array['habits','habit_logs'] loop
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

-- ============================================================
-- 005 — foto de perfil (Storage)
-- ============================================================

-- Bucket público de leitura: a foto aparece sem link assinado. A escrita é
-- restrita pelas políticas abaixo, então ninguém sobe na pasta de outro.
insert into storage.buckets (id, name, public)
values ('avatars', 'avatars', true)
on conflict (id) do update set public = true;

do $$
begin
  drop policy if exists "avatars_leitura"  on storage.objects;
  drop policy if exists "avatars_envio"    on storage.objects;
  drop policy if exists "avatars_troca"    on storage.objects;
  drop policy if exists "avatars_remocao"  on storage.objects;

  create policy "avatars_leitura" on storage.objects
    for select using (bucket_id = 'avatars');

  -- O caminho tem de começar com o id do usuário: avatars/<uid>/arquivo
  create policy "avatars_envio" on storage.objects
    for insert with check (
      bucket_id = 'avatars'
      and (storage.foldername(name))[1] = auth.uid()::text
    );

  create policy "avatars_troca" on storage.objects
    for update using (
      bucket_id = 'avatars'
      and (storage.foldername(name))[1] = auth.uid()::text
    );

  create policy "avatars_remocao" on storage.objects
    for delete using (
      bucket_id = 'avatars'
      and (storage.foldername(name))[1] = auth.uid()::text
    );
end $$;
