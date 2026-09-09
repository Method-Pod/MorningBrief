-- =====================================================================
-- Referências: links salvos, em coleções
--
-- Rode no SQL Editor do Supabase (Database > SQL Editor > New query >
-- cole > Run). É idempotente: rodar duas vezes não faz mal.
--
-- Os nomes das tabelas estão em português, diferente de `bills` e
-- `lessons`, por um motivo concreto: `references` é palavra reservada do
-- Postgres e não pode nomear tabela sem aspas — e uma tabela que só
-- funciona entre aspas viraria uma pegadinha em toda consulta futura.
-- =====================================================================

-- ------------------------------ coleções ------------------------------
--
-- Tabela, e não texto solto na referência, pelo mesmo motivo das
-- etiquetas de assunto: renomear "Landing" para "Landing page" é uma
-- linha aqui, e não uma varredura em todos os links.
--
-- Separada de `subjects` de propósito. Assunto responde "sobre o que é"
-- (Design, IA) e serve às aulas e aos canais; coleção responde "para que
-- serve" (Landing page, Dashboard, Sites de busca). Misturar as duas
-- faria "landing page" aparecer no filtro das Aulas, onde não diz nada.
create table if not exists public.colecoes (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null references auth.users(id) on delete cascade,
  name        text not null,
  created_at  timestamptz not null default now()
);

alter table public.colecoes enable row level security;

do $$
begin
  if not exists (
    select 1 from pg_policies where tablename = 'colecoes' and policyname = 'colecoes_own'
  ) then
    create policy colecoes_own on public.colecoes
      for all using (auth.uid() = user_id) with check (auth.uid() = user_id);
  end if;
end $$;

-- Sem coleção repetida, ignorando maiúscula.
create unique index if not exists colecoes_nome_unico
  on public.colecoes (user_id, lower(name));


-- ----------------------------- referências -----------------------------
--
-- `name`, `description` e `image_url` vêm das metatags do site quando ele
-- responde, e podem ser trocados à mão quando não responde — Dribbble,
-- Behance e Pinterest costumam bloquear a leitura. `image_own` marca a
-- imagem que você subiu, para uma releitura do link não sobrescrever a
-- escolha que você fez.
create table if not exists public.referencias (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null references auth.users(id) on delete cascade,

  url         text not null,
  name        text not null,
  description text,
  image_url   text,
  image_own   boolean not null default false,

  -- Por que você salvou. Sem isso, uma parede de prints em três meses não
  -- diz mais o que era para olhar ali.
  notes       text,

  created_at  timestamptz not null default now()
);

alter table public.referencias enable row level security;

do $$
begin
  if not exists (
    select 1 from pg_policies where tablename = 'referencias' and policyname = 'referencias_own'
  ) then
    create policy referencias_own on public.referencias
      for all using (auth.uid() = user_id) with check (auth.uid() = user_id);
  end if;
end $$;

-- O mesmo link não entra duas vezes. O endereço é o que identifica,
-- porque o nome do site muda quando o dono resolve mudar.
create unique index if not exists referencias_url_unico
  on public.referencias (user_id, url);

create index if not exists referencias_da_pessoa
  on public.referencias (user_id, created_at desc);


-- ------------------------ referência × coleção ------------------------
--
-- Tabela de ligação, e não uma coluna de coleção na referência, porque um
-- link pode servir a dois fins: um site que é referência de landing page
-- e de dashboard ao mesmo tempo. Com uma coluna só, ele obrigaria a
-- escolher — ou a ser cadastrado duas vezes, e aí renomear a coleção
-- consertaria metade.
--
-- `user_id` está repetido aqui de propósito: é o que a política do RLS
-- consegue conferir sem precisar ir buscar nas outras duas tabelas.
create table if not exists public.referencia_colecao (
  referencia_id uuid not null references public.referencias(id) on delete cascade,
  colecao_id    uuid not null references public.colecoes(id) on delete cascade,
  user_id       uuid not null references auth.users(id) on delete cascade,
  primary key (referencia_id, colecao_id)
);

alter table public.referencia_colecao enable row level security;

do $$
begin
  if not exists (
    select 1 from pg_policies
    where tablename = 'referencia_colecao' and policyname = 'referencia_colecao_own'
  ) then
    create policy referencia_colecao_own on public.referencia_colecao
      for all using (auth.uid() = user_id) with check (auth.uid() = user_id);
  end if;
end $$;

-- Para "quais links estão nesta coleção" não varrer a tabela.
create index if not exists referencia_colecao_por_colecao
  on public.referencia_colecao (colecao_id);


-- --------------------- bucket da imagem própria ---------------------
--
-- Mesmo desenho do bucket de capas: leitura pública, escrita só na
-- própria pasta. O caminho é referencias/<seu id>/<id da referência>.<ext>,
-- e a política exige que a primeira pasta seja o id de quem está enviando
-- — é o que impede subir arquivo na pasta de outra pessoa.
insert into storage.buckets (id, name, public)
values ('referencias', 'referencias', true)
on conflict (id) do update set public = true;

do $$
begin
  drop policy if exists "referencias_leitura" on storage.objects;
  drop policy if exists "referencias_envio"   on storage.objects;
  drop policy if exists "referencias_troca"   on storage.objects;
  drop policy if exists "referencias_remocao" on storage.objects;

  -- Leitura pública: a imagem aparece na parede sem link assinado, e link
  -- assinado expiraria no meio da navegação.
  create policy "referencias_leitura" on storage.objects
    for select using (bucket_id = 'referencias');

  create policy "referencias_envio" on storage.objects
    for insert with check (
      bucket_id = 'referencias'
      and (storage.foldername(name))[1] = auth.uid()::text
    );

  create policy "referencias_troca" on storage.objects
    for update using (
      bucket_id = 'referencias'
      and (storage.foldername(name))[1] = auth.uid()::text
    );

  create policy "referencias_remocao" on storage.objects
    for delete using (
      bucket_id = 'referencias'
      and (storage.foldername(name))[1] = auth.uid()::text
    );
end $$;
