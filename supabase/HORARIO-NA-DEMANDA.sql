-- =====================================================================
-- Horário na demanda
--
-- Rode no SQL Editor do Supabase (Database > SQL Editor > New query >
-- cole > Run). É idempotente: rodar duas vezes não faz mal, e não toca em
-- nenhuma demanda existente.
--
-- Uma coluna, e ela aceita nulo de propósito: a maioria das demandas não
-- tem hora, só dia. "Gravar o vídeo" é o dia inteiro; "reunião com a Bia"
-- é às 14h. Obrigar uma hora em todas faria inventar 00:00 para o resto,
-- e aí o cartão passaria a mostrar "00:00" em demanda que não tem hora
-- nenhuma — um dado falso em todo lugar, para servir a poucas.
--
-- A hora não cria evento no Calendário nem dispara notificação. Ela
-- aparece no cartão ao lado da data e serve de desempate na ordenação.
-- =====================================================================

alter table public.tasks
  add column if not exists due_time time;

-- ------------------------------ conferência ------------------------------
--
--   select title, due_date, due_time
--   from public.tasks
--   where due_time is not null
--   order by due_date, due_time;
