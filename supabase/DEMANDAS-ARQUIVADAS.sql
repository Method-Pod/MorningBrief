-- =====================================================================
-- Demandas arquivadas
--
-- Rode no SQL Editor do Supabase (Database > SQL Editor > New query >
-- cole > Run). É idempotente: rodar duas vezes não faz mal, e não toca em
-- nenhuma demanda existente.
--
-- Pedido dele: demandas que ficam anotadas mas guardadas por um tempo. A
-- arquivada sai do quadro, da lista, do Início e das contagens, e mora na
-- visão "Arquivadas" de Demandas até ele desarquivar — aí volta para a
-- coluna em que estava, porque o status dela não muda ao arquivar.
--
-- Uma data, e não um sim/não: além de dizer QUE está arquivada, diz desde
-- quando, que é o que a lista de arquivadas mostra. Nulo = não arquivada,
-- que é o estado de todas as demandas que já existem.
--
-- A limpeza das 6h (que apaga as concluídas de ontem) não apaga arquivada:
-- ela só sai se ele excluir. Ver `limparConcluidas` em lib/limpeza.
-- =====================================================================

alter table public.tasks
  add column if not exists arquivada_em timestamptz;

-- ------------------------------ conferência ------------------------------
--
--   select title, status, arquivada_em
--   from public.tasks
--   where arquivada_em is not null
--   order by arquivada_em desc;
