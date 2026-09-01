-- =====================================================================
-- Link na demanda
--
-- Rode no SQL Editor do Supabase (Database > SQL Editor > New query >
-- cole > Run). É idempotente: rodar duas vezes não faz mal.
-- =====================================================================

-- O endereço do trabalho: vídeo bruto, pasta do Drive, referência.
--
-- Uma coluna e não uma tabela de anexos: o caso é "abrir o material desta
-- demanda", um destino só. Uma tabela somaria junção, ordem e tela de
-- gerenciamento para resolver algo que um campo resolve.
alter table public.tasks
  add column if not exists link text;

-- A regra recorrente guarda o mesmo link, e cada ocorrência nasce com ele.
--
-- Sem isso, a recorrente diária de cortes geraria toda manhã uma demanda sem
-- o endereço do material — e o link teria que ser colado à mão todo dia,
-- que é exatamente a repetição que a recorrência existe para tirar.
alter table public.recurring_tasks
  add column if not exists link text;
