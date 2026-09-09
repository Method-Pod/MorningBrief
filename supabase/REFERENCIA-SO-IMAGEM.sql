-- =====================================================================
-- Referência que é só uma imagem, sem link
--
-- Rode no SQL Editor do Supabase (Database > SQL Editor > New query >
-- cole > Run). É idempotente: rodar duas vezes não faz mal.
-- =====================================================================

-- O endereço deixa de ser obrigatório.
--
-- Nem toda referência tem página: às vezes o que se quer guardar é a
-- imagem em si — um print de um layout, um recorte que apareceu numa
-- conversa, uma foto. Exigir um endereço obrigava a inventar um, ou a não
-- guardar.
--
-- Sem link, a imagem passa a ser a referência: a tela exige uma das duas
-- coisas, e recusa o cadastro vazio.
alter table public.referencias
  alter column url drop not null;

-- O índice único continua valendo, e continua fazendo o que deve.
--
-- Em Postgres dois NULL não colidem num índice único, então várias
-- referências sem link convivem sem problema, enquanto o mesmo endereço
-- continua não entrando duas vezes. Nada a mudar aqui — este comentário
-- existe para o próximo leitor não achar que faltou.
