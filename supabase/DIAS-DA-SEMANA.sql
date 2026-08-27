-- =====================================================================
-- Vários dias da semana numa demanda recorrente semanal
--
-- Rode no SQL Editor do Supabase (Database > SQL Editor > New query >
-- cole > Run). É idempotente: rodar duas vezes não faz mal.
-- =====================================================================

-- Dias em que a regra semanal gera demanda: 0 = domingo ... 6 = sábado.
--
-- A coluna `weekday` continua existindo e não muda de significado. Regras
-- criadas antes desta migração têm `weekdays` nulo, e seguem valendo pelo
-- `weekday` de sempre — nada precisa ser convertido.
alter table public.recurring_tasks
  add column if not exists weekdays smallint[];

-- Só valores de dia válidos, e sem lista vazia.
--
-- Lista vazia seria pior que nulo: nulo cai no `weekday` e a regra continua
-- funcionando, enquanto uma lista vazia é uma regra semanal que nunca dispara,
-- silenciosamente.
do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'recurring_tasks_weekdays_check'
  ) then
    alter table public.recurring_tasks
      add constraint recurring_tasks_weekdays_check
      check (
        weekdays is null
        or (
          array_length(weekdays, 1) between 1 and 7
          and weekdays <@ array[0,1,2,3,4,5,6]::smallint[]
        )
      );
  end if;
end $$;
