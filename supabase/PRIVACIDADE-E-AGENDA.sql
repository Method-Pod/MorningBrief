-- ============================================================
-- Morning Brief — imagens sem listagem pública, evento cancelado
-- sem renascer, e os aparelhos da notificação da manhã.
--
-- Cole este arquivo inteiro no SQL Editor do Supabase e rode.
-- Pode rodar de novo sem estragar nada.
-- ============================================================


-- ------------------------------------------------------------
-- 1. Imagens: ninguém de fora lista o que existe
--
-- As três pastas (foto de perfil, capas de livro, imagens de referência)
-- tinham leitura liberada para qualquer um: com a chave pública do app dava
-- para LISTAR todos os arquivos de todos. Agora só o dono lista os próprios.
--
-- As imagens continuam aparecendo no app normalmente: pasta pública serve o
-- arquivo pelo endereço direto, sem passar por esta regra. O que fecha é o
-- "me mostre tudo que existe aí".
-- ------------------------------------------------------------

do $$
declare
  pasta text;
begin
  foreach pasta in array array['avatars', 'capas', 'referencias'] loop
    execute format('drop policy if exists %I on storage.objects', pasta || '_leitura');
    execute format(
      'create policy %I on storage.objects for select using (bucket_id = %L and (storage.foldername(name))[1] = auth.uid()::text)',
      pasta || '_leitura',
      pasta
    );
  end loop;
end $$;


-- ------------------------------------------------------------
-- 2. Ocorrência de evento excluída sozinha não renasce
--
-- A manutenção das 6h estende cada repetição a partir da ocorrência mais
-- recente. Apagar a última fazia a anterior virar "a mais recente", e a
-- apagada voltava no dia seguinte. Agora ela fica marcada como cancelada,
-- escondida da tela, e a série segue a partir dela.
-- ------------------------------------------------------------

alter table public.events
  add column if not exists cancelado boolean not null default false;


-- ------------------------------------------------------------
-- 3. Aparelhos que recebem o brief das 6h
--
-- Uma linha por aparelho em que a notificação foi ativada (Conta →
-- Notificação da manhã). A automação das 6h manda o resumo para cada um.
-- ------------------------------------------------------------

create table if not exists public.push_assinaturas (
  id         uuid primary key default gen_random_uuid(),
  user_id    uuid not null references auth.users(id) on delete cascade,
  endpoint   text not null unique,
  p256dh     text not null,
  auth       text not null,
  aparelho   text not null default '',
  created_at timestamptz not null default now()
);

create index if not exists push_assinaturas_user on public.push_assinaturas (user_id);

alter table public.push_assinaturas enable row level security;

do $$
begin
  if not exists (
    select 1 from pg_policies
     where tablename = 'push_assinaturas' and policyname = 'push_assinaturas_own'
  ) then
    create policy push_assinaturas_own on public.push_assinaturas
      for all using (auth.uid() = user_id) with check (auth.uid() = user_id);
  end if;
end $$;
