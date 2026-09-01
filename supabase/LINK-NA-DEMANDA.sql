-- =====================================================================
-- Links da demanda
--
-- Rode no SQL Editor do Supabase (Database > SQL Editor > New query >
-- cole > Run). É idempotente: rodar duas vezes não faz mal.
--
-- Se você já rodou a versão anterior deste arquivo, que criava uma coluna
-- `link` de um endereço só, pode rodar esta por cima: o que estiver lá é
-- copiado para a lista nova antes de a coluna antiga sair.
-- =====================================================================

-- Os endereços do trabalho: vídeo bruto, pasta do Drive, referência, roteiro.
--
-- Um array e não uma tabela de anexos: a lista é lida e escrita inteira, junto
-- com a demanda, e nunca em parte. Uma tabela somaria junção, ordem própria e
-- tela de gerenciamento para resolver o que uma coluna resolve.
alter table public.tasks
  add column if not exists links text[];

-- A regra recorrente guarda os mesmos links, e cada ocorrência nasce com eles.
--
-- Sem isso, a recorrente diária de cortes geraria toda manhã uma demanda sem os
-- endereços do material — e eles teriam que ser colados à mão todo dia, que é
-- exatamente a repetição que a recorrência existe para tirar.
alter table public.recurring_tasks
  add column if not exists links text[];

-- Migração da coluna antiga de link único, quando ela existir.
--
-- O `if exists` é o que torna este bloco seguro de repetir: na segunda vez a
-- coluna já saiu e nada acontece. E o update roda antes do drop, então nenhum
-- endereço se perde no caminho.
do $$
begin
  if exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'tasks' and column_name = 'link'
  ) then
    update public.tasks
      set links = array[link]
      where link is not null and link <> ''
        and (links is null or cardinality(links) = 0);
    alter table public.tasks drop column link;
  end if;

  if exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'recurring_tasks' and column_name = 'link'
  ) then
    update public.recurring_tasks
      set links = array[link]
      where link is not null and link <> ''
        and (links is null or cardinality(links) = 0);
    alter table public.recurring_tasks drop column link;
  end if;
end $$;
