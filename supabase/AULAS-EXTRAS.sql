-- =====================================================================
-- Meta semanal de aulas
--
-- Rode no SQL Editor do Supabase (Database > SQL Editor > New query >
-- cole > Run). É idempotente: rodar duas vezes não faz mal.
-- =====================================================================

-- Uma linha por pessoa, não uma por semana.
--
-- Diferente da meta de livros, que é por ano: ali comparar 2026 com 2027
-- é o que dá sentido à meta. Aqui o número é um ritmo — "três por semana"
-- — e guardar uma linha por semana encheria a tabela para responder a
-- mesma pergunta.
create table if not exists public.lesson_goals (
  user_id   uuid primary key references auth.users(id) on delete cascade,
  per_week  int not null check (per_week between 1 and 99)
);

alter table public.lesson_goals enable row level security;

do $$
begin
  if not exists (
    select 1 from pg_policies
    where tablename = 'lesson_goals' and policyname = 'lesson_goals_own'
  ) then
    create policy lesson_goals_own on public.lesson_goals
      for all using (auth.uid() = user_id) with check (auth.uid() = user_id);
  end if;
end $$;
