-- ============================================================
-- Morning Brief — trava contra conta fixa duplicada no mês,
-- e o vínculo de cliente nas demandas recorrentes antigas.
--
-- ANTES: baixe o backup em Conta → Seus dados → Exportar tudo.
-- Depois cole este arquivo inteiro no SQL Editor do Supabase e rode.
-- Pode rodar de novo sem estragar nada.
-- ============================================================


-- ------------------------------------------------------------
-- 1. Contas fixas duplicadas que JÁ existem
--
-- Só lista; não apaga nada. Se esta consulta devolver linhas, o índice do
-- passo 2 não pode ser criado enquanto elas existirem: apague o lançamento
-- sobrando pelo app (Contas a pagar) e rode o arquivo de novo.
-- ------------------------------------------------------------

select description,
       to_char(due_date, 'YYYY-MM') as mes,
       count(*)                     as lancamentos,
       string_agg(to_char(due_date, 'DD/MM') || ' R$ ' || amount::text, '  |  ') as quais
  from public.bills
 where recurring
   and installment_total is null
 group by user_id, description, to_char(due_date, 'YYYY-MM')
having count(*) > 1
 order by mes, description;


-- ------------------------------------------------------------
-- 2. A trava
--
-- A automação das 6h e uma aba aberta podiam lançar a mesma conta fixa ao
-- mesmo tempo, e o total do mês saía dobrado. O código já tratava a recusa
-- do banco (erro 23505) como "já existe" — faltava o índice que recusa.
--
-- Uma conta fixa por descrição por mês. Parcelas ficam de fora: cada parcela
-- tem a mesma descrição e mês próprio, e não se repetem por natureza.
-- ------------------------------------------------------------

do $$
begin
  if not exists (
    select 1
      from public.bills
     where recurring and installment_total is null
     group by user_id, description,
              extract(year from due_date), extract(month from due_date)
    having count(*) > 1
  ) then
    create unique index if not exists bills_fixa_mes_uniq
      on public.bills (
        user_id,
        description,
        (extract(year from due_date) * 100 + extract(month from due_date))
      )
      where recurring and installment_total is null;
    raise notice 'Trava criada: bills_fixa_mes_uniq';
  else
    raise notice 'Há contas fixas duplicadas (veja a consulta 1). Apague a sobra pelo app e rode de novo.';
  end if;
end $$;


-- ------------------------------------------------------------
-- 3. Demandas recorrentes antigas sem o cliente
--
-- As geradas pela automação nasciam só com o nome do cliente em texto, sem o
-- vínculo com o cadastro — por isso a tela de Clientes dizia "nada em aberto"
-- para quem tinha demanda aberta. O código já foi corrigido para as novas;
-- isto preenche as antigas, copiando da regra que as gerou. Só toca onde o
-- vínculo está vazio.
-- ------------------------------------------------------------

update public.tasks t
   set cliente_id = r.cliente_id
  from public.recurring_tasks r
 where t.origin_id = r.id
   and t.cliente_id is null
   and r.cliente_id is not null;

update public.tasks t
   set projeto_id = r.projeto_id
  from public.recurring_tasks r
 where t.origin_id = r.id
   and t.projeto_id is null
   and r.projeto_id is not null;
