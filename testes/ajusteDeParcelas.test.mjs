import { test } from "node:test";
import assert from "node:assert/strict";

import { oQueFaltaParaAjustar } from "../src/lib/ajusteDeParcelas.ts";

const ok = { amount: "300", due_date: "2026-10-20", installment_no: 1, installment_total: 2 };
const MAX = 120;

test("com tudo preenchido, nada falta", () => {
  assert.equal(oQueFaltaParaAjustar(ok, MAX), null);
});

test("sem valor, diz que falta o valor -- o caso que parecia botao quebrado", () => {
  assert.match(oQueFaltaParaAjustar({ ...ok, amount: "" }, MAX), /valor/);
  assert.match(oQueFaltaParaAjustar({ ...ok, amount: "0" }, MAX), /valor/);
  assert.match(oQueFaltaParaAjustar({ ...ok, amount: "abc" }, MAX), /valor/);
});

test("valor com virgula e ponto de milhar vale", () => {
  assert.equal(oQueFaltaParaAjustar({ ...ok, amount: "1.500,00" }, MAX), null);
});

test("sem vencimento, diz que falta o vencimento", () => {
  assert.match(oQueFaltaParaAjustar({ ...ok, due_date: "" }, MAX), /vencimento/);
});

test("total vazio ou zero pede o total", () => {
  assert.match(oQueFaltaParaAjustar({ ...ok, installment_total: "" }, MAX), /quantas parcelas/);
  assert.match(oQueFaltaParaAjustar({ ...ok, installment_total: 0 }, MAX), /quantas parcelas/);
});

test("parcela atual maior que o total e apontada", () => {
  assert.match(
    oQueFaltaParaAjustar({ ...ok, installment_no: 5, installment_total: 4 }, MAX),
    /entre 1 e o total/
  );
});

test("acima do maximo diz o maximo", () => {
  assert.match(oQueFaltaParaAjustar({ ...ok, installment_total: 121 }, MAX), /120/);
});

test("a ordem das perguntas e a do formulario: valor antes de tudo", () => {
  /* Com tudo vazio, a primeira coisa a pedir e o valor -- o campo que vem
     antes na tela. Pedir o total primeiro mandaria o olho para baixo e
     depois de volta para cima. */
  assert.match(
    oQueFaltaParaAjustar(
      { amount: "", due_date: "", installment_no: "", installment_total: "" },
      MAX
    ),
    /valor/
  );
});

/* ------------------------- recompor a grade ------------------------- */

import { marcarEditadas, recomporParcelas } from "../src/lib/ajusteDeParcelas.ts";

const p = (d, v) => ({ due_date: d, amount: v });

test("marcar editadas acha o VALOR que mudou, sem marcar a data", () => {
  const antes = [p("2026-10-20", 300), p("2026-11-20", 300)];
  const depois = [p("2026-10-20", 300), p("2026-11-20", 450)];
  assert.deepEqual(marcarEditadas(antes, depois, []), ["1:valor"]);
});

test("marcar editadas acha a DATA que mudou, sem marcar o valor", () => {
  const antes = [p("2026-10-20", 300), p("2026-11-20", 300)];
  const depois = [p("2026-10-25", 300), p("2026-11-20", 300)];
  assert.deepEqual(marcarEditadas(antes, depois, []), ["0:data"]);
});

test("marcar editadas acumula com as que ja estavam", () => {
  const antes = [p("a", 1), p("b", 1), p("c", 1)];
  const depois = [p("a", 1), p("b", 1), p("c", 9)];
  assert.deepEqual(marcarEditadas(antes, depois, ["0:data"]), ["0:data", "2:valor"]);
});

test("o caso que ele achou: trocar para o total a dividir redistribui", () => {
  const atuais = [p("1", 300), p("2", 300), p("3", 300), p("4", 300)];
  const base = [p("1", 75), p("2", 75), p("3", 75), p("4", 75)];
  assert.deepEqual(recomporParcelas(base, atuais, []), base);
});

test("o valor ajustado a mao sobrevive a mudanca de base", () => {
  const atuais = [p("1", 300), p("2", 450), p("3", 300)];
  const base = [p("1", 100), p("2", 100), p("3", 100)];
  assert.deepEqual(recomporParcelas(base, atuais, ["1:valor"]), [p("1", 100), p("2", 450), p("3", 100)]);
});

test("valor ajustado nao prende a data: o vencimento novo vale para ela tambem", () => {
  /* O que o teste no navegador pegou: so o valor da parcela 2 foi mexido, e
     a data dela ficava no dia 20 quando o vencimento passava para o 25. */
  const atuais = [p("2026-10-20", 200), p("2026-11-20", 450)];
  const base = [p("2026-10-25", 200), p("2026-11-25", 200)];
  assert.deepEqual(recomporParcelas(base, atuais, ["1:valor"]), [
    p("2026-10-25", 200),
    p("2026-11-25", 450),
  ]);
});

test("data ajustada a mao sobrevive, e o valor dela segue a base", () => {
  const atuais = [p("2026-10-20", 300), p("2026-11-28", 300)];
  const base = [p("2026-10-20", 75), p("2026-11-20", 75)];
  assert.deepEqual(recomporParcelas(base, atuais, ["1:data"]), [
    p("2026-10-20", 75),
    p("2026-11-28", 75),
  ]);
});

test("aumentar o total com o total a dividir nao deixa a divisao velha nas primeiras", () => {
  const atuais = [p("1", 150), p("2", 150)];
  const base = [p("1", 75), p("2", 75), p("3", 75), p("4", 75)];
  assert.deepEqual(recomporParcelas(base, atuais, []), base);
});

test("editada alem do novo tamanho simplesmente sai", () => {
  const atuais = [p("1", 1), p("2", 1), p("3", 999)];
  const base = [p("1", 5), p("2", 5)];
  assert.deepEqual(recomporParcelas(base, atuais, ["2:valor"]), base);
});

/* ------------------- vencimento = data da 1a parcela ------------------- */

import { editarGrade } from "../src/lib/ajusteDeParcelas.ts";

test("o pedido dele: mudar a data da 1a parcela muda o vencimento", () => {
  const antes = [p("2026-10-26", 100), p("2026-11-26", 100)];
  const depois = [p("2026-11-05", 100), p("2026-11-26", 100)];
  const g = editarGrade(antes, depois, [], "2026-10-26");
  assert.equal(g.vencimento, "2026-11-05");
});

test("a data da 1a parcela nunca vira ajuste a mao: o vencimento sempre a leva", () => {
  const antes = [p("2026-10-26", 100), p("2026-11-26", 100)];
  const depois = [p("2026-11-05", 100), p("2026-11-26", 100)];
  const g = editarGrade(antes, depois, ["0:data"], "2026-10-26");
  assert.deepEqual(g.editadas, []);
  /* e com isso a recomposicao pela base nova poe a 1a no vencimento */
  const base = [p("2026-12-01", 100), p("2027-01-01", 100)];
  assert.equal(recomporParcelas(base, g.parcelas, g.editadas)[0].due_date, "2026-12-01");
});

test("mexer em outra parcela nao mexe no vencimento", () => {
  const antes = [p("2026-10-26", 100), p("2026-11-26", 100)];
  const depois = [p("2026-10-26", 100), p("2026-11-30", 150)];
  const g = editarGrade(antes, depois, [], "2026-10-26");
  assert.equal(g.vencimento, "2026-10-26");
  assert.deepEqual(g.editadas, ["1:data", "1:valor"]);
});
