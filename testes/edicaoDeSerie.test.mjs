import { test } from "node:test";
import assert from "node:assert/strict";

import {
  ajustarTotal,
  aplicarValor,
  aplicarVencimento,
  editadasDentro,
  montarGrade,
} from "../src/lib/edicaoDeSerie.ts";

const conta = (id, data, o = {}) => ({
  id,
  due_date: data,
  amount: 106.7,
  status: "pending",
  installment_no: null,
  ...o,
});

/* O Perfumes do print: 6 parcelas, a 1a paga. */
const perfumes = [
  conta("p1", "2026-10-05", { installment_no: 1, status: "paid" }),
  conta("p2", "2026-11-05", { installment_no: 2 }),
  conta("p3", "2026-12-05", { installment_no: 3 }),
  conta("p4", "2027-01-05", { installment_no: 4 }),
  conta("p5", "2027-02-05", { installment_no: 5 }),
  conta("p6", "2027-03-05", { installment_no: 6 }),
];

test("a grade edita as em aberto e mostra a paga so para ver", () => {
  const g = montarGrade(perfumes, "p2", true);
  assert.deepEqual(g.editaveis.map((l) => l.no), [2, 3, 4, 5, 6]);
  assert.deepEqual(g.pagas.map((l) => l.no), [1]);
});

test("clicar numa paga nao a poe na grade: o valor de base a reescreveria", () => {
  const g = montarGrade(perfumes, "p1", true);
  assert.deepEqual(g.editaveis.map((l) => l.no), [2, 3, 4, 5, 6]);
  assert.deepEqual(g.pagas.map((l) => l.no), [1]);
});

test("sem nada em aberto, o lancamento clicado entra sozinho", () => {
  const fixaPaga = [
    conta("out", "2026-10-10", { status: "paid" }),
    conta("set", "2026-09-10", { status: "paid" }),
  ];
  const g = montarGrade(fixaPaga, "out", false);
  assert.deepEqual(g.editaveis.map((l) => l.id), ["out"]);
  assert.deepEqual(g.pagas.map((l) => l.id), ["set"]);
});

test("parcela sem numero recebe a posicao na ordem das datas", () => {
  const g = montarGrade(
    [conta("b", "2026-12-01"), conta("a", "2026-11-01")],
    "a",
    true
  );
  assert.deepEqual(g.editaveis.map((l) => [l.id, l.no]), [["a", 1], ["b", 2]]);
});

test("mudar o valor muda so os valores nao mexidos, e nenhuma data", () => {
  const { editaveis } = montarGrade(perfumes, "p2", true);
  const r = aplicarValor(editaveis, 120, ["1:valor"]);
  assert.deepEqual(r.map((l) => l.amount), [120, 106.7, 120, 120, 120]);
  assert.deepEqual(r.map((l) => l.due_date), editaveis.map((l) => l.due_date));
});

test("valor invalido nao apaga a grade", () => {
  const { editaveis } = montarGrade(perfumes, "p2", true);
  assert.equal(aplicarValor(editaveis, NaN, []), editaveis);
});

test("o vencimento e a 1a linha, e as nao mexidas seguem mes a mes", () => {
  const { editaveis } = montarGrade(perfumes, "p2", true);
  const r = aplicarVencimento(editaveis, "2026-11-10", ["0:data", "2:data"]);
  assert.deepEqual(r.map((l) => l.due_date), [
    "2026-11-10", // a 1a vai junto mesmo marcada
    "2026-12-10",
    "2027-01-05", // ajustada a mao, fica
    "2027-02-10",
    "2027-03-10",
  ]);
});

test("vencimento no dia 31 encolhe em fevereiro", () => {
  const { editaveis } = montarGrade(perfumes, "p2", true);
  const r = aplicarVencimento(editaveis, "2026-12-31", []);
  assert.equal(r[2].due_date, "2027-02-28");
  assert.equal(r[3].due_date, "2027-03-31");
});

test("aumentar o total cria parcelas no fim, pelo vencimento e valor de base", () => {
  const { editaveis, pagas } = montarGrade(perfumes, "p2", true);
  const r = ajustarTotal(editaveis, pagas, 8, { vencimento: "2026-11-05", valor: 106.7 });
  assert.deepEqual(r.linhas.slice(-2), [
    { id: null, no: 7, due_date: "2027-04-05", amount: 106.7, paga: false },
    { id: null, no: 8, due_date: "2027-05-05", amount: 106.7, paga: false },
  ]);
  assert.deepEqual(r.removidas, []);
});

test("diminuir o total tira as ultimas em aberto", () => {
  const { editaveis, pagas } = montarGrade(perfumes, "p2", true);
  const r = ajustarTotal(editaveis, pagas, 4, { vencimento: "2026-11-05", valor: 106.7 });
  assert.deepEqual(r.linhas.map((l) => l.no), [2, 3, 4]);
  assert.deepEqual(r.removidas.map((l) => l.id), ["p5", "p6"]);
});

test("o total nao fica abaixo de uma parcela paga", () => {
  const pagaNa3 = perfumes.map((c) => (c.id === "p3" ? { ...c, status: "paid" } : c));
  const { editaveis, pagas } = montarGrade(pagaNa3, "p2", true);
  const r = ajustarTotal(editaveis, pagas, 2, { vencimento: "2026-11-05", valor: 1 });
  assert.equal(r.erro, "A parcela 3 já está paga: o total não pode ser menor que 3.");
});

test("aumentar e voltar nao apaga o que nunca foi gravado", () => {
  const { editaveis, pagas } = montarGrade(perfumes, "p2", true);
  const mais = ajustarTotal(editaveis, pagas, 8, { vencimento: "2026-11-05", valor: 1 });
  const volta = ajustarTotal(mais.linhas, pagas, 6, { vencimento: "2026-11-05", valor: 1 });
  assert.deepEqual(volta.removidas, []);
  assert.deepEqual(volta.linhas.map((l) => l.no), [2, 3, 4, 5, 6]);
});

test("total invalido e recusado", () => {
  const { editaveis, pagas } = montarGrade(perfumes, "p2", true);
  assert.ok("erro" in ajustarTotal(editaveis, pagas, 0, { vencimento: "", valor: 1 }));
});

test("as marcas de linhas que sairam sao esquecidas", () => {
  assert.deepEqual(editadasDentro(["1:valor", "4:data", "2:data"], 3), ["1:valor", "2:data"]);
});

test("as parcelas novas seguem a ultima, e nao o vencimento", () => {
  const quinzenal = [
    conta("a", "2026-11-05", { installment_no: 1 }),
    conta("b", "2026-11-20", { installment_no: 2 }),
  ];
  const { editaveis, pagas } = montarGrade(quinzenal, "a", true);
  const r = ajustarTotal(editaveis, pagas, 3, { vencimento: "2026-11-05", valor: 1 });
  assert.equal(r.linhas[2].due_date, "2026-12-20");
});

test("sem nenhuma que fica, a nova parte do vencimento", () => {
  const r = ajustarTotal([], [], 1, { vencimento: "2026-11-05", valor: 50 });
  assert.deepEqual(r.linhas, [
    { id: null, no: 1, due_date: "2026-11-05", amount: 50, paga: false },
  ]);
});
