import { test } from "node:test";
import assert from "node:assert/strict";
import { fechamentoDoMes, mesAnterior, nomeDoMes } from "../src/lib/brief.ts";

const conta = (x) => ({
  id: "b" + Math.random(),
  user_id: "u1",
  description: "Internet",
  amount: 100,
  due_date: "2026-10-03",
  category: "Internet",
  status: "pending",
  paid_at: null,
  recurring: true,
  notes: "",
  installment_no: null,
  installment_total: null,
  paid_amount: null,
  cartao_id: null,
  valor_variavel: false,
  fecha_dia: null,
  ...x,
});

test("fechamento soma pago, em aberto e as categorias que mais pesaram", () => {
  const f = fechamentoDoMes(
    [
      conta({ due_date: "2026-09-10", status: "paid", amount: 100, category: "Internet" }),
      conta({ due_date: "2026-09-15", status: "paid", amount: 300, category: "Moradia" }),
      conta({ due_date: "2026-09-20", amount: 50, category: "Saúde" }),
      conta({ due_date: "2026-08-10", status: "paid", amount: 200 }),
      conta({ due_date: "2026-08-12", status: "paid", amount: 0 }),
      conta({ due_date: "2026-08-14", status: "paid", amount: 0 }),
      conta({ due_date: "2026-10-10", amount: 999 }),
    ],
    "2026-09"
  );
  assert.equal(f.pago, 400);
  assert.equal(f.qtdPagas, 2);
  assert.equal(f.aberto, 50);
  assert.equal(f.total, 450);
  assert.equal(f.totalAnterior, 200);
  assert.deepEqual(f.categorias.map((c) => c.categoria), ["Moradia", "Internet", "Saúde"]);
});

test("comparacao some quando o mes anterior tem pouca base", () => {
  const f = fechamentoDoMes(
    [
      conta({ due_date: "2026-09-10", status: "paid", amount: 100 }),
      conta({ due_date: "2026-08-30", status: "paid", amount: 10 }),
    ],
    "2026-09"
  );
  assert.equal(f.totalAnterior, null);
});

test("mes anterior na virada do ano e nome do mes", () => {
  assert.equal(mesAnterior("2026-01"), "2025-12");
  assert.equal(nomeDoMes("2026-09"), "setembro");
});
