-- =====================================================================
-- Clientes e projetos
--
-- Rode no SQL Editor do Supabase (Database > SQL Editor > New query >
-- cole > Run). É idempotente: rodar duas vezes não faz mal.
--
-- O problema que isto resolve está escrito na sua própria base. O campo
-- "Cliente / projeto" das demandas é texto livre, então cada grafia nova
-- cria um cliente novo em silêncio — e a Bia virou cinco: "Bia",
-- "Bia - Canal Oficial", "Bia - Pedido Carol", "Bia - Pedido Nero" e
-- "Bia - Setembro Amarelo". No filtro elas aparecem como cinco linhas com
-- contagens separadas, e nenhum número diz quantas demandas a Bia tem.
--
-- Agora são duas tabelas e dois níveis: o CLIENTE é quem paga, o PROJETO é
-- o que está sendo feito para ele.
--
-- **Nada é apagado nem reescrito.** Este arquivo só CRIA tabelas, CRIA
-- colunas e LIGA as demandas que já existem aos cartões correspondentes. A
-- coluna `client`, com o texto original, continua intacta na linha — se
-- alguma ligação sair errada, o texto de origem está lá para conferir.
-- =====================================================================

-- ------------------------------ clientes ------------------------------
create table if not exists public.clientes (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null references auth.users(id) on delete cascade,

  /* Como você chama o cliente. É o que aparece na lista e no filtro. */
  nome        text not null,

  /*
   * A cor do cliente, da mesma paleta dos cartões de banco.
   *
   * Serve para bater o olho na lista de demandas e saber de quem é sem ler
   * o nome. É o único enfeite do cartão — sem observações, sem link, sem
   * contato: nada disso foi pedido, e campo que ninguém preenche é campo
   * que atrapalha quem cadastra.
   */
  cor         text not null default 'blue',

  created_at  timestamptz not null default now()
);

alter table public.clientes enable row level security;

do $$
begin
  if not exists (
    select 1 from pg_policies where tablename = 'clientes' and policyname = 'clientes_own'
  ) then
    create policy clientes_own on public.clientes
      for all using (auth.uid() = user_id) with check (auth.uid() = user_id);
  end if;
end $$;

-- Sem dois clientes de mesmo nome, ignorando maiúscula. É esta trava que
-- impede a volta do problema: "bia" e "Bia" deixam de poder coexistir.
create unique index if not exists clientes_nome_unico
  on public.clientes (user_id, lower(nome));


-- ------------------------------ projetos ------------------------------
--
-- `on delete cascade` e não `set null`: projeto sem cliente não quer dizer
-- nada — ele existe PARA um cliente. Apagar o cliente leva os projetos
-- dele junto, e as demandas ficam soltas (ver `on delete set null` lá
-- embaixo), que é o comportamento certo: a demanda aconteceu, o cadastro é
-- que deixou de existir.
create table if not exists public.projetos (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null references auth.users(id) on delete cascade,
  cliente_id  uuid not null references public.clientes(id) on delete cascade,

  nome        text not null,
  created_at  timestamptz not null default now()
);

alter table public.projetos enable row level security;

do $$
begin
  if not exists (
    select 1 from pg_policies where tablename = 'projetos' and policyname = 'projetos_own'
  ) then
    create policy projetos_own on public.projetos
      for all using (auth.uid() = user_id) with check (auth.uid() = user_id);
  end if;
end $$;

-- Dois projetos de mesmo nome DENTRO do mesmo cliente é que não pode.
-- "Setembro Amarelo" pode existir na Bia e no Alef ao mesmo tempo.
create unique index if not exists projetos_nome_unico
  on public.projetos (cliente_id, lower(nome));

create index if not exists projetos_do_cliente
  on public.projetos (user_id, cliente_id);


-- ------------------- as demandas apontam para o cadastro -------------------
--
-- `on delete set null` nas duas: apagar um cliente não pode apagar o
-- histórico de demandas dele. A demanda continua existindo, só deixa de
-- apontar para um cadastro que não existe mais — e a tela volta a mostrar
-- o texto da coluna `client`, que nunca foi tocado.
alter table public.tasks
  add column if not exists cliente_id uuid references public.clientes(id) on delete set null;
alter table public.tasks
  add column if not exists projeto_id uuid references public.projetos(id) on delete set null;

alter table public.recurring_tasks
  add column if not exists cliente_id uuid references public.clientes(id) on delete set null;
alter table public.recurring_tasks
  add column if not exists projeto_id uuid references public.projetos(id) on delete set null;

create index if not exists tasks_cliente on public.tasks (user_id, cliente_id);


-- ===================== o que já existe vira cadastro =====================
--
-- Daqui para baixo é uma passada única sobre o que já está gravado. Ela lê
-- os textos distintos de `client` e monta os cartões.
--
-- **A regra de separação:** o que vem antes do primeiro " - " é o CLIENTE,
-- o que vem depois é o PROJETO. Então "Bia - Canal Oficial" vira cliente
-- "Bia" com projeto "Canal Oficial", e "Bia" sozinho vira só o cliente. É
-- um palpite, e é o palpite que bate com a sua base — mas se algum cliente
-- SEU tiver hífen no nome de verdade, ele vai ser partido no lugar errado.
-- Conserta-se na tela, renomeando; nada se perde, porque o texto original
-- continua em `tasks.client`.
--
-- O separador é " - " com espaços dos dois lados, de propósito: assim
-- "Coca-Cola" não é partido.

-- 1. Um cliente para cada nome distinto.
insert into public.clientes (user_id, nome)
select distinct
  t.user_id,
  btrim(split_part(t.client, ' - ', 1))
from public.tasks t
where coalesce(btrim(t.client), '') <> ''
  and btrim(split_part(t.client, ' - ', 1)) <> ''
on conflict do nothing;

-- O mesmo a partir das recorrências, que também têm cliente.
insert into public.clientes (user_id, nome)
select distinct
  r.user_id,
  btrim(split_part(r.client, ' - ', 1))
from public.recurring_tasks r
where coalesce(btrim(r.client), '') <> ''
  and btrim(split_part(r.client, ' - ', 1)) <> ''
on conflict do nothing;

-- 2. Um projeto para cada nome que tinha " - ".
insert into public.projetos (user_id, cliente_id, nome)
select distinct
  t.user_id,
  c.id,
  btrim(substr(t.client, position(' - ' in t.client) + 3))
from public.tasks t
join public.clientes c
  on c.user_id = t.user_id
 and lower(c.nome) = lower(btrim(split_part(t.client, ' - ', 1)))
where position(' - ' in t.client) > 0
  and btrim(substr(t.client, position(' - ' in t.client) + 3)) <> ''
on conflict do nothing;

insert into public.projetos (user_id, cliente_id, nome)
select distinct
  r.user_id,
  c.id,
  btrim(substr(r.client, position(' - ' in r.client) + 3))
from public.recurring_tasks r
join public.clientes c
  on c.user_id = r.user_id
 and lower(c.nome) = lower(btrim(split_part(r.client, ' - ', 1)))
where position(' - ' in r.client) > 0
  and btrim(substr(r.client, position(' - ' in r.client) + 3)) <> ''
on conflict do nothing;

-- 3. Liga cada demanda ao cliente e ao projeto dela.
--
-- Só as que ainda não têm ligação (`cliente_id is null`): rodar de novo não
-- desfaz nem refaz nada que você já tenha ajustado na tela.
update public.tasks t
set cliente_id = c.id
from public.clientes c
where t.cliente_id is null
  and c.user_id = t.user_id
  and coalesce(btrim(t.client), '') <> ''
  and lower(c.nome) = lower(btrim(split_part(t.client, ' - ', 1)));

update public.tasks t
set projeto_id = p.id
from public.projetos p
where t.projeto_id is null
  and t.cliente_id = p.cliente_id
  and position(' - ' in t.client) > 0
  and lower(p.nome) = lower(btrim(substr(t.client, position(' - ' in t.client) + 3)));

update public.recurring_tasks r
set cliente_id = c.id
from public.clientes c
where r.cliente_id is null
  and c.user_id = r.user_id
  and coalesce(btrim(r.client), '') <> ''
  and lower(c.nome) = lower(btrim(split_part(r.client, ' - ', 1)));

update public.recurring_tasks r
set projeto_id = p.id
from public.projetos p
where r.projeto_id is null
  and r.cliente_id = p.cliente_id
  and position(' - ' in r.client) > 0
  and lower(p.nome) = lower(btrim(substr(r.client, position(' - ' in r.client) + 3)));


-- ------------------------------ conferência ------------------------------
--
-- Rode isto depois, para ver o que saiu. Não altera nada.
--
--   select c.nome as cliente, p.nome as projeto, count(t.id) as demandas
--   from public.clientes c
--   left join public.projetos p on p.cliente_id = c.id
--   left join public.tasks t on t.cliente_id = c.id
--        and (t.projeto_id = p.id or (t.projeto_id is null and p.id is null))
--   group by c.nome, p.nome
--   order by c.nome, p.nome;
--
-- E para achar demanda que ficou sem ligação (não deveria haver nenhuma
-- com texto preenchido):
--
--   select client, count(*) from public.tasks
--   where cliente_id is null and coalesce(btrim(client),'') <> ''
--   group by client;
