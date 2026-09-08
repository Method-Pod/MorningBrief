-- =====================================================================
-- Aulas: vídeos do YouTube e do Telegram que você quer assistir
--
-- Rode no SQL Editor do Supabase (Database > SQL Editor > New query >
-- cole > Run). É idempotente: rodar duas vezes não faz mal.
-- =====================================================================

create table if not exists public.lessons (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null references auth.users(id) on delete cascade,

  -- `title` é o único obrigatório. No YouTube ele vem do link; no Telegram
  -- não há metadado público para buscar, então é digitado.
  title       text not null,
  url         text,
  fonte       text not null default 'outro'
                check (fonte in ('youtube', 'telegram', 'outro')),
  canal       text,
  thumb_url   text,

  -- Assunto livre, não lista fechada: os temas mudam com o que se está
  -- estudando, e uma tabela de assuntos viraria manutenção sem ganho.
  assunto     text,

  -- Duração e onde parou, os dois opcionais: a maioria das aulas se vê de
  -- uma vez, e aí só a caixinha importa. O minuto serve para a aula longa
  -- que se vê em pedaços.
  minutos     int check (minutos is null or minutos > 0),
  em_minuto   int check (em_minuto is null or em_minuto >= 0),

  feita       boolean not null default false,
  -- Quando foi marcada. É por esta data que a limpeza dos 7 dias conta —
  -- `created_at` diria quando foi anotada, não quando foi assistida.
  feita_em    timestamptz,

  created_at  timestamptz not null default now()
);

alter table public.lessons enable row level security;

do $$
begin
  if not exists (
    select 1 from pg_policies where tablename = 'lessons' and policyname = 'lessons_own'
  ) then
    create policy lessons_own on public.lessons
      for all using (auth.uid() = user_id) with check (auth.uid() = user_id);
  end if;
end $$;

-- A leitura é sempre "as minhas, desta prateleira, mais recentes antes".
create index if not exists lessons_da_pessoa
  on public.lessons (user_id, feita, created_at desc);
