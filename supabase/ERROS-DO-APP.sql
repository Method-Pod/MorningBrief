-- =====================================================================
-- Registro de erros do app
--
-- Rode no SQL Editor do Supabase (Database > SQL Editor > New query >
-- cole > Run). É idempotente: rodar duas vezes não faz mal.
--
-- Quando uma tela quebra, ou um pedido ao banco falha sem ninguém ver, o
-- app grava aqui o que aconteceu: a mensagem, a tela, o aparelho e a
-- versão. A lista aparece em Conta > Dados, com um botão para copiar e
-- mandar para o Claude -- sem precisar descrever o erro de memória.
--
-- Cada pessoa só grava, lê e apaga os próprios erros (RLS). Os textos têm
-- teto de tamanho para um laço de erro não encher o banco, e o app guarda
-- no máximo 15 por visita, sem repetir o mesmo dentro de 10 minutos.
-- =====================================================================

create table if not exists public.app_erros (
  id         uuid primary key default gen_random_uuid(),
  user_id    uuid not null default auth.uid() references auth.users(id) on delete cascade,
  criado_em  timestamptz not null default now(),
  mensagem   text not null check (char_length(mensagem) <= 500),
  detalhe    text not null default '' check (char_length(detalhe) <= 4000),
  pagina     text not null default '' check (char_length(pagina) <= 300),
  aparelho   text not null default '' check (char_length(aparelho) <= 300),
  versao     text not null default '' check (char_length(versao) <= 40)
);

create index if not exists app_erros_da_pessoa
  on public.app_erros (user_id, criado_em desc);

alter table public.app_erros enable row level security;

do $$
begin
  if not exists (
    select 1 from pg_policies
     where tablename = 'app_erros' and policyname = 'app_erros_own'
  ) then
    create policy app_erros_own on public.app_erros
      for all using (auth.uid() = user_id) with check (auth.uid() = user_id);
  end if;
end $$;

-- ------------------------------ conferência ------------------------------
--
--   select criado_em, pagina, mensagem
--   from public.app_erros
--   order by criado_em desc
--   limit 20;
