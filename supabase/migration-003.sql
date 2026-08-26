-- ============================================================
-- Morning Brief - migração 003
-- Parcelas em contas a pagar.
-- Rode no Supabase > SQL Editor. Idempotente.
-- ============================================================

-- Uma conta parcelada mostra "2/4" ao lado do vencimento. Nulo nas duas
-- colunas significa conta simples, sem parcelamento.
alter table public.bills
  add column if not exists installment_no    int,
  add column if not exists installment_total int;

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'bills_installment_ck') then
    alter table public.bills
      add constraint bills_installment_ck check (
        (installment_no is null and installment_total is null)
        or (installment_no >= 1
            and installment_total >= 1
            and installment_no <= installment_total)
      );
  end if;
end $$;
