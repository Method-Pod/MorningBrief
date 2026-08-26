-- ============================================================
-- Morning Brief — contas abatidas (pagas aos poucos)
-- Cole no SQL Editor e rode. Pode rodar de novo sem estragar.
-- ============================================================

-- Quanto já foi abatido da conta. Nulo = conta comum, de pagamento único.
-- Não-nulo = conta abatida: o app calcula o que falta e mantém a conta como
-- dívida do mês atual até o abatimento cobrir o valor total.
alter table public.bills
  add column if not exists paid_amount numeric(14,2);

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'bills_paid_amount_ck') then
    alter table public.bills
      add constraint bills_paid_amount_ck check (
        paid_amount is null
        or (paid_amount >= 0 and paid_amount <= amount)
      );
  end if;
end $$;
