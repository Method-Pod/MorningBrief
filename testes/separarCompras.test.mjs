import { test } from "node:test";
import assert from "node:assert/strict";

import { separarCompras } from "../src/lib/serieDeContas.ts";

let seq = 0;
const parcela = (due_date, installment_no, installment_total = 6, extra = {}) => ({
  id: "b" + ++seq,
  description: "Perfumes - Árabes Guilherme",
  due_date,
  installment_no,
  installment_total,
  amount: 106.7,
  paid_amount: null,
  status: "pending",
  recurring: false,
  ...extra,
});
const mes = (m) => `2026-${String(m).padStart(2, "0")}-20`;
const numeros = (compras) => compras.map((c) => c.map((b) => `${b.due_date.slice(5, 7)}:${b.installment_no}`).join(" "));

test("duas compras de mesmo nome em meses diferentes viram duas linhas", () => {
  const a = [9, 10, 11, 12].map((m, i) => parcela(mes(m), i + 1));
  const b = [10, 11, 12].map((m, i) => parcela(mes(m), i + 1));
  const compras = separarCompras([...b, ...a]);
  assert.deepEqual(numeros(compras), ["09:1 10:2 11:3 12:4", "10:1 11:2 12:3"]);
});

test("duas compras nos mesmos meses nao se misturam", () => {
  const a = [10, 11, 12].map((m, i) => parcela(mes(m), i + 1));
  const b = [10, 11, 12].map((m, i) => parcela(mes(m), i + 1));
  const compras = separarCompras([...a, ...b]);
  assert.equal(compras.length, 2);
  for (const c of compras) assert.deepEqual(c.map((x) => x.installment_no), [1, 2, 3]);
});

test("parcela solta de outra compra fica de fora da linha atual", () => {
  /* A de setembro e a 4 de uma compra antiga; a atual comeca em outubro. */
  const antiga = parcela("2026-09-05", 4, 6, { status: "paid" });
  const atual = [10, 11, 12, 1, 2, 3].map((m, i) => parcela(m < 10 ? `2027-0${m}-20` : mes(m), i + 1));
  const compras = separarCompras([antiga, ...atual]);
  assert.deepEqual(compras.map((c) => c.length), [1, 6]);
  assert.equal(compras[0][0].id, antiga.id);
});

test("data mexida na edicao nao quebra a compra; o numero manda", () => {
  const c = [parcela("2026-10-20", 1), parcela("2026-11-20", 2), parcela("2026-12-29", 3), parcela("2027-01-05", 4)];
  assert.equal(separarCompras(c).length, 1);
});

test("parcela apagada no meio nao parte a compra em duas", () => {
  const c = [parcela(mes(9), 1), parcela(mes(10), 2), parcela(mes(12), 4)];
  assert.equal(separarCompras(c).length, 1);
});

test("total diferente e outra compra; conta sem numero fica num grupo", () => {
  const c = [parcela(mes(10), 1, 6), parcela(mes(10), 1, 3), { ...parcela(mes(10), null, null), installment_no: null, installment_total: null }];
  const compras = separarCompras(c);
  assert.equal(compras.length, 3);
  assert.equal(compras[0][0].installment_no, null);
});
