-- =====================================================================
-- Ordem manual dos projetos
--
-- Rode no SQL Editor do Supabase (Database > SQL Editor > New query >
-- cole > Run). É idempotente: rodar duas vezes não faz mal, e rodar depois
-- de já ter arrastado não desfaz o que você arrumou.
--
-- Uma coluna só. Os projetos saíam por ordem alfabética, que é uma ordem
-- que o banco escolheu e não uma que diga alguma coisa — "Canal Oficial"
-- vinha antes de "Pedido Carol" por causa da letra C, não por importância.
-- Com `position` a ordem passa a ser sua, e ela é a mesma na ficha do
-- cliente e na lista que aparece ao criar a demanda.
-- =====================================================================

alter table public.projetos
  add column if not exists position int not null default 0;

-- A leitura é sempre "os projetos deste cliente, nesta ordem".
create index if not exists projetos_ordem
  on public.projetos (cliente_id, position);

-- ------------------------- a ordem de partida -------------------------
--
-- Semeia com a ordem alfabética que a tela já mostrava, para nada mudar de
-- lugar na primeira vez que você abrir.
--
-- O `if not exists` é a trava contra rodar de novo: se QUALQUER projeto já
-- tem posição diferente de zero, você já arrastou alguma coisa, e este
-- bloco não toca em mais nada. Sem ele, um segundo `run` jogaria tudo de
-- volta para a ordem alfabética.
do $$
begin
  if not exists (select 1 from public.projetos where position <> 0) then
    with ordenados as (
      select
        id,
        row_number() over (
          partition by cliente_id order by lower(nome), created_at
        ) - 1 as n
      from public.projetos
    )
    update public.projetos p
    set position = ordenados.n
    from ordenados
    where ordenados.id = p.id;
  end if;
end $$;

-- ------------------------------ conferência ------------------------------
--
--   select c.nome as cliente, p.position, p.nome as projeto
--   from public.projetos p
--   join public.clientes c on c.id = p.cliente_id
--   order by c.nome, p.position;
