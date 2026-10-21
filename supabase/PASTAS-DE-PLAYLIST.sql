-- =====================================================================
-- Playlist vira pasta em Aulas
--
-- Rode no SQL Editor do Supabase (Database > SQL Editor > New query >
-- cole > Run). É idempotente: rodar duas vezes não faz mal, e não toca em
-- nenhuma aula que já existe.
--
-- Pedido dele: importar uma playlist despejava todos os vídeos soltos na
-- lista. Agora a playlist é uma linha só — uma pasta — que abre ali mesmo
-- mostrando as aulas dela.
--
-- Duas coisas:
--
-- 1. a tabela das pastas, uma por playlist do YouTube por pessoa;
-- 2. em cada aula, de qual pasta ela é e em que posição da playlist.
--
-- Aula solta continua com `playlist_id` nulo e se comporta como sempre,
-- inclusive saindo da lista 7 dias depois de assistida. Aula de pasta NÃO
-- sai: pedido dele, para o "5 de 20 assistidas" continuar fazendo sentido.
-- Essa regra mora no código (lib/limpeza), não aqui.
-- =====================================================================

create table if not exists public.playlists (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null references auth.users(id) on delete cascade,

  -- O id da playlist no YouTube (o "list=" do link). É ele que impede a
  -- mesma playlist de virar duas pastas quando é importada de novo.
  youtube_id  text not null,

  title       text not null,
  canal       text,
  thumb_url   text,
  url         text,
  subject_id  uuid references public.subjects(id) on delete set null,

  created_at  timestamptz not null default now(),

  unique (user_id, youtube_id)
);

alter table public.playlists enable row level security;

do $$
begin
  if not exists (
    select 1 from pg_policies
    where tablename = 'playlists' and policyname = 'playlists_own'
  ) then
    create policy playlists_own on public.playlists
      for all using (auth.uid() = user_id) with check (auth.uid() = user_id);
  end if;
end $$;

-- `on delete cascade`: tirar a pasta tira as aulas dela. É o que a tela
-- promete na confirmação; deixá-las órfãs faria reaparecerem soltas na
-- lista, que é exatamente o que ele não queria.
alter table public.lessons
  add column if not exists playlist_id uuid
    references public.playlists(id) on delete cascade;

-- A ordem da playlist, para a pasta abrir na mesma sequência do YouTube e
-- não na ordem em que o banco devolveu.
alter table public.lessons
  add column if not exists posicao int;

create index if not exists lessons_por_playlist
  on public.lessons (playlist_id, posicao);

-- ------------------------------ conferência ------------------------------
--
--   select p.title, count(l.id) as aulas,
--          count(l.id) filter (where l.feita) as assistidas
--   from public.playlists p
--   left join public.lessons l on l.playlist_id = p.id
--   group by p.id, p.title
--   order by p.created_at desc;
