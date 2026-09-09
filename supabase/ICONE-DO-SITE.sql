-- =====================================================================
-- Ícone do site, para a lista "Onde buscar"
--
-- Rode no SQL Editor do Supabase (Database > SQL Editor > New query >
-- cole > Run). É idempotente: rodar duas vezes não faz mal.
-- =====================================================================

-- Coluna separada do banner, e não no lugar dele.
--
-- São imagens com trabalhos diferentes: o banner (`image_url`) mostra como
-- a página é, e serve ao quadro do exemplo; o ícone mostra de quem é o
-- site, e serve à linha da lista. Recortar o banner num quadradinho de
-- 32px entrega um pedaço do meio de um print — foi o que apareceu na tela.
--
-- Guardar os dois quer dizer que marcar e desmarcar "é site de busca" não
-- perde imagem nenhuma: o mesmo link tem o ícone para a lista e o banner
-- para o quadro.
alter table public.referencias
  add column if not exists icon_url text;
