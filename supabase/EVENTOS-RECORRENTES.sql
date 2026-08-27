-- =====================================================================
-- Eventos recorrentes no calendário
--
-- Rode este arquivo no SQL Editor do Supabase (Database > SQL Editor >
-- New query > cole > Run). É idempotente: rodar duas vezes não faz mal.
-- =====================================================================

-- Regra de repetição do evento. 'none' é o evento único de sempre, e é o
-- padrão, então nada do que já existe muda de comportamento.
alter table public.events
  add column if not exists recurrence text not null default 'none';

do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'events_recurrence_check'
  ) then
    alter table public.events
      add constraint events_recurrence_check
      check (recurrence in ('none', 'weekly', 'biweekly', 'monthly'));
  end if;
end $$;

-- Liga as ocorrências de uma mesma repetição. Nulo no evento único.
--
-- É um id próprio, e não o título: dois eventos podem se chamar igual sem
-- serem a mesma repetição, e o título pode ser renomeado depois.
alter table public.events
  add column if not exists series_id uuid;

-- Impede a mesma ocorrência duas vezes.
--
-- A extensão da janela roda a cada abertura do app e também no cron. Sem este
-- índice, duas passadas ao mesmo tempo — duas abas, ou uma aba e o cron —
-- criariam o mesmo evento em dobro. Com ele, a segunda recebe 23505 e o código
-- trata como "já existe", que não é falha.
create unique index if not exists events_serie_inicio_uniq
  on public.events (series_id, start_at)
  where series_id is not null;

-- Busca por série, usada para achar a última ocorrência e para excluir a
-- repetição inteira.
create index if not exists events_serie_idx
  on public.events (user_id, series_id)
  where series_id is not null;
