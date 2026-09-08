-- =====================================================================
-- Duração da aula em segundos, e não em minutos arredondados
--
-- Rode no SQL Editor do Supabase (Database > SQL Editor > New query >
-- cole > Run). É idempotente: rodar duas vezes não faz mal.
-- =====================================================================

-- Uma coluna só, em segundos.
--
-- Antes a duração era `minutos int`, e um vídeo de 1h23m45s virava 84 no
-- banco: os 45 segundos eram jogados fora na gravação, sem jeito de
-- recuperar depois. Guardar minuto e segundo em duas colunas seria pior —
-- dois lugares dizendo a mesma coisa acabam discordando. Em segundos, o
-- minuto é uma divisão na hora de mostrar, e nada se perde.
alter table public.lessons
  add column if not exists duracao_seg int
    check (duracao_seg is null or duracao_seg > 0);

-- Passa o que já existe e aposenta a coluna antiga.
--
-- O `if exists` faz o bloco ser seguro de repetir: na segunda vez a coluna
-- `minutos` já foi e nada acontece. O valor convertido é o que se tinha —
-- 84 minutos viram 5040 segundos. Os 45 segundos originais não voltam,
-- porque nunca foram gravados; daqui para frente vêm do link.
do $$
begin
  if exists (
    select 1 from information_schema.columns
    where table_schema = 'public'
      and table_name = 'lessons'
      and column_name = 'minutos'
  ) then
    update public.lessons
      set duracao_seg = minutos * 60
      where duracao_seg is null and minutos is not null and minutos > 0;

    alter table public.lessons drop column minutos;
  end if;
end $$;
