import { test } from "node:test";
import assert from "node:assert/strict";

import { evolucaoDosGastos } from "../src/lib/evolucao.ts";

const contas = [
  { due_date: "2026-09-10", amount: 100 },
  { due_date: "2026-11-05", amount: "50.5" },
  { due_date: "2026-11-20", amount: 49.5 },
  { due_date: "2027-01-03", amount: 10 },
];

test("soma as contas pelo mes do vencimento, do passado ao futuro", () => {
  const r = evolucaoDosGastos(contas, "2026-11-02", 2, 2);
  assert.deepEqual(
    r.map((p) => p.valor),
    [100, 0, 100, 0, 10]
  );
});

test("marca o mes atual, e so ele", () => {
  const r = evolucaoDosGastos(contas, "2026-11-02", 2, 2);
  assert.deepEqual(r.map((p) => !!p.mesAtual), [false, false, true, false, false]);
});

test("atravessa a virada do ano", () => {
  const r = evolucaoDosGastos(contas, "2027-01-15", 2, 0);
  assert.equal(r.length, 3);
  assert.equal(r[2].valor, 10);
  assert.equal(r[0].valor, 100);
});
