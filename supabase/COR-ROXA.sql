-- =====================================================================
-- O azul que sobrou do tempo em que o app era azul
--
-- Rode no SQL Editor do Supabase (Database > SQL Editor > New query >
-- cole > Run). É idempotente: rodar duas vezes não faz mal.
--
-- O app passou a ser roxo e o que NASCE hoje já nasce roxo — a tela manda
-- `color` na criação. Mas duas coisas ficaram para trás:
--
-- 1. o PADRÃO DA COLUNA continuou 'blue', então qualquer gravação que não
--    mande a cor ainda nasce azul;
-- 2. o que foi criado ANTES continuou azul no banco. Era o alfinete azul
--    da anotação fixada na tela de início.
--
-- Conferido antes de escrever este arquivo, lendo as consultas da própria
-- tela: 13 anotações azuis de 13, 5 hábitos azuis de 5, 1 evento azul de
-- 17 (os outros 16 já nasceram roxos). Nenhum item de nenhuma cor que não
-- fosse azul ou roxo. Ou seja: azul aqui nunca foi escolha de ninguém, é o
-- padrão antigo da coluna aparecendo. Por isso trocar é seguro.
--
-- O que este arquivo NÃO faz: não encosta em quem está verde, âmbar, rosa
-- ou cinza. Se um dia você pintar algo de azul de propósito, rodar isto de
-- novo vai desfazer — então, a partir do momento em que azul virar escolha
-- sua, não rode mais.
-- =====================================================================

-- --------------------------- o padrão novo ---------------------------
--
-- Cinco tabelas guardam cor da mesma paleta. Duas delas (cartoes,
-- clientes) já não tinham linha azul nenhuma; o padrão muda do mesmo
-- jeito, para que amanhã não volte a nascer azul por esquecimento.

alter table public.notes    alter column color set default 'violet';
alter table public.events   alter column color set default 'violet';
alter table public.habits   alter column color set default 'violet';
alter table public.cartoes  alter column cor   set default 'violet';
alter table public.clientes alter column cor   set default 'violet';

-- ------------------------- o que ficou azul -------------------------

update public.notes  set color = 'violet' where color = 'blue';
update public.events set color = 'violet' where color = 'blue';
update public.habits set color = 'violet' where color = 'blue';

-- ------------------------------ conferência ------------------------------
--
-- Depois de rodar, isto deve voltar sem nenhuma linha 'blue':
--
--   select 'notes' as tabela, color, count(*) from public.notes  group by 2
--   union all
--   select 'events',          color, count(*) from public.events group by 2
--   union all
--   select 'habits',          color, count(*) from public.habits group by 2
--   order by 1, 2;
