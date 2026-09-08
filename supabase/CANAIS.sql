-- =====================================================================
-- Canais para estudar
--
-- Rode no SQL Editor do Supabase (Database > SQL Editor > New query >
-- cole > Run). É idempotente: rodar duas vezes não faz mal.
-- =====================================================================

-- O canal não é aula nem curso: é uma fonte.
--
-- A aula é uma coisa para assistir hoje, e sai da lista em sete dias
-- depois de assistida. O curso é uma contagem que anda até o fim. O canal
-- não termina e não sai — ele fica ali como lugar onde procurar quando
-- der vontade de estudar um assunto. Guardar canal como aula encheria a
-- fila de coisas que não se assiste "de uma vez", e guardar como curso
-- pediria um total de aulas que não existe.
create table if not exists public.channels (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null references auth.users(id) on delete cascade,

  name        text not null,
  url         text not null,
  -- Foto do canal, do jeito que o YouTube serve. Guarda o endereço e não o
  -- arquivo: é imagem pública e estável, e copiar para o Storage seria
  -- pagar espaço por algo que já está hospedado.
  avatar_url  text,
  -- Mesma etiqueta das aulas e dos cursos, para "canais de edição" e
  -- "canais de marketing" serem uma pergunta e não duas listas.
  subject_id  uuid references public.subjects(id) on delete set null,
  -- O que estudar ali. É o motivo de o canal ter sido salvo, e sem isso
  -- uma lista de avatares em três meses não diz mais nada.
  notes       text,

  created_at  timestamptz not null default now()
);

alter table public.channels enable row level security;

do $$
begin
  if not exists (
    select 1 from pg_policies where tablename = 'channels' and policyname = 'channels_own'
  ) then
    create policy channels_own on public.channels
      for all using (auth.uid() = user_id) with check (auth.uid() = user_id);
  end if;
end $$;

-- Sem o mesmo canal duas vezes. O endereço é o que identifica, porque o
-- nome muda quando o dono resolve mudar.
create unique index if not exists channels_url_unico
  on public.channels (user_id, url);

create index if not exists channels_da_pessoa
  on public.channels (user_id, name);
