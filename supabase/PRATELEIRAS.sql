-- =====================================================================
-- Mais prateleiras na estante
--
-- Rode no SQL Editor do Supabase (Database > SQL Editor > New query >
-- cole > Run). É idempotente: rodar duas vezes não faz mal.
--
-- LEITURA.sql criou a coluna aceitando só três valores. Agora são cinco:
--
--   reading  Lendo        está aberto na mesa
--   queue    Ler          já é seu, ainda não começou
--   done     Lido         terminou
--   dropped  Abandonado   começou e parou — sem culpa, é informação
--   want     Lista de Desejos   ainda não é seu
--
-- "Ler" e "Lista de Desejos" são coisas diferentes de propósito: um está
-- na estante esperando, o outro nem foi comprado. Misturar os dois é o
-- que faz a lista de desejos virar cobrança.
-- =====================================================================

do $$
declare
  nome text;
begin
  -- Derruba qualquer CHECK de `status` que exista, sem depender do nome que
  -- o Postgres deu ao da declaração original.
  for nome in
    select con.conname
    from pg_constraint con
    join pg_class rel on rel.oid = con.conrelid
    join pg_namespace ns on ns.oid = rel.relnamespace
    where ns.nspname = 'public'
      and rel.relname = 'books'
      and con.contype = 'c'
      and pg_get_constraintdef(con.oid) ilike '%status%'
  loop
    execute format('alter table public.books drop constraint %I', nome);
  end loop;

  alter table public.books
    add constraint books_status_prateleiras
    check (status in ('want', 'queue', 'reading', 'done', 'dropped'));
end $$;
