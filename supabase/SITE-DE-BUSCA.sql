-- =====================================================================
-- "É um site para buscar referência" como propriedade do link
--
-- Rode no SQL Editor do Supabase (Database > SQL Editor > New query >
-- cole > Run). É idempotente: rodar duas vezes não faz mal.
-- =====================================================================

-- Coluna, e não coleção.
--
-- O site onde se garimpa (Dribbble, Mobbin, Awwwards) e o exemplo que se
-- guardou (aquela landing que ficou boa) são coisas de natureza
-- diferente: o primeiro se abre para procurar, o segundo para comparar. E
-- como o app passa a mostrar os dois de formas diferentes — lista fixa no
-- topo contra parede de quadros —, a distinção precisa ser um dado do
-- link, não o nome de uma coleção.
--
-- Se fosse coleção, a seção fixa dependeria de uma coleção chamada
-- exatamente "Sites de busca": renomeá-la faria a seção sumir sem
-- explicação, e apagá-la sem querer levaria a distinção embora.
alter table public.referencias
  add column if not exists busca boolean not null default false;

-- Para "quais são os sites de busca" não varrer a tabela.
create index if not exists referencias_busca
  on public.referencias (user_id, busca);


-- ------------------ passa o que já estava na coleção ------------------
--
-- Quem já tinha links numa coleção chamada "Sites de busca" não perde a
-- organização: eles nascem com a coluna marcada. Depois disso a coleção
-- fica sobrando e pode ser apagada na tela — apagar coleção não apaga
-- link nenhum.
--
-- Seguro de repetir: na segunda vez os links já estão marcados e o
-- `where busca = false` não acha nada.
update public.referencias r
   set busca = true
 where r.busca = false
   and exists (
     select 1
       from public.referencia_colecao rc
       join public.colecoes c on c.id = rc.colecao_id
      where rc.referencia_id = r.id
        and lower(btrim(c.name)) in ('sites de busca', 'site de busca', 'busca')
   );
