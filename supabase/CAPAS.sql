-- =====================================================================
-- Bucket das capas de livro
--
-- Rode no SQL Editor do Supabase (Database > SQL Editor > New query >
-- cole > Run). É idempotente: rodar duas vezes não faz mal.
--
-- Mesmo desenho do bucket de avatares: leitura pública, escrita só na
-- própria pasta. O caminho é capas/<seu id>/<id do livro>.<ext>, e a
-- política exige que a primeira pasta seja o id de quem está enviando —
-- é o que impede subir arquivo na pasta de outra pessoa.
-- =====================================================================

insert into storage.buckets (id, name, public)
values ('capas', 'capas', true)
on conflict (id) do update set public = true;

do $$
begin
  drop policy if exists "capas_leitura" on storage.objects;
  drop policy if exists "capas_envio"   on storage.objects;
  drop policy if exists "capas_troca"   on storage.objects;
  drop policy if exists "capas_remocao" on storage.objects;

  -- Leitura pública: a capa aparece na estante sem link assinado, e link
  -- assinado expiraria no meio da navegação.
  create policy "capas_leitura" on storage.objects
    for select using (bucket_id = 'capas');

  create policy "capas_envio" on storage.objects
    for insert with check (
      bucket_id = 'capas'
      and (storage.foldername(name))[1] = auth.uid()::text
    );

  create policy "capas_troca" on storage.objects
    for update using (
      bucket_id = 'capas'
      and (storage.foldername(name))[1] = auth.uid()::text
    );

  create policy "capas_remocao" on storage.objects
    for delete using (
      bucket_id = 'capas'
      and (storage.foldername(name))[1] = auth.uid()::text
    );
end $$;
