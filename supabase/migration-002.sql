-- ============================================================
-- Morning Brief - migração 002
-- Rode no Supabase > SQL Editor depois do schema.sql.
-- Pode rodar mais de uma vez sem estragar nada.
-- ============================================================

-- ---------- 1. impede recorrência duplicada ----------
-- Sem isto, abrir o Início em duas abas ao mesmo tempo gera a mesma demanda
-- duas vezes: os dois inserts passam antes de qualquer um gravar last_run_on.
-- O índice deixa o banco ser a autoridade, não a ordem das requisições.
create unique index if not exists tasks_origin_day_uniq
  on public.tasks (user_id, origin_id, due_date)
  where origin_id is not null;

-- ---------- 2. origin_id passa a ser chave estrangeira ----------
-- Apagar uma recorrência não deve apagar as demandas já geradas, mas também
-- não deve deixar ponteiro para linha inexistente. set null resolve os dois.
do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'tasks_origin_fk'
  ) then
    -- limpa ponteiros órfãos antes de criar a restrição
    update public.tasks t
       set origin_id = null
     where t.origin_id is not null
       and not exists (
         select 1 from public.recurring_tasks r where r.id = t.origin_id
       );

    alter table public.tasks
      add constraint tasks_origin_fk
      foreign key (origin_id)
      references public.recurring_tasks (id)
      on delete set null;
  end if;
end $$;
