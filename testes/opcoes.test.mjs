import { test } from "node:test";
import assert from "node:assert/strict";
import React from "react";

import { lerOpcoes, textoDe } from "../src/lib/opcoes.ts";

const op = (props, ...filhos) => React.createElement("option", props, ...filhos);

/* ------------------------- o defeito que apareceu ------------------------- */

test("option sem value usa o proprio texto, como no HTML", () => {
  /* Era este o bug: tres telas escrevem `<option key={c}>{c}</option>`, que
     e HTML valido, e o seletor dava valor vazio para todas. Resultado: certo
     em todas as linhas e clique que nao escolhia nada. */
  const lidas = lerOpcoes([
    op({ key: "a" }, "Cartão"),
    op({ key: "b" }, "Internet"),
    op({ key: "c" }, "Outros"),
  ]);
  assert.deepEqual(
    lidas.map((o) => o.valor),
    ["Cartão", "Internet", "Outros"]
  );
});

test("sem value, cada opcao tem valor DIFERENTE", () => {
  /* A consequencia direta do defeito: valores repetidos. Com todos vazios,
     `o.valor === atual` era verdade em todas as linhas. */
  const lidas = lerOpcoes(
    ["Cartão", "Saúde", "Streaming"].map((c) => op({ key: c }, c))
  );
  assert.equal(new Set(lidas.map((o) => o.valor)).size, 3);
});

/* --------------------------- o que ja funcionava --------------------------- */

test("value explicito vence o texto", () => {
  const lidas = lerOpcoes([
    op({ key: "a", value: "todas" }, "Todas as categorias"),
    op({ key: "b", value: "paid" }, "Paga"),
  ]);
  assert.deepEqual(
    lidas.map((o) => [o.valor, o.rotulo]),
    [
      ["todas", "Todas as categorias"],
      ["paid", "Paga"],
    ]
  );
});

test("value numerico continua valendo, inclusive zero", () => {
  const lidas = lerOpcoes([op({ key: "a", value: 0 }, "Domingo")]);
  assert.equal(lidas[0].valor, "0");
});

test("value vazio de proposito continua vazio", () => {
  /* "Selecione" costuma ser value="" — e escrito, entao vale. */
  const lidas = lerOpcoes([op({ key: "a", value: "" }, "Selecione")]);
  assert.equal(lidas[0].valor, "");
});

test("optgroup entrega o grupo de cada opcao", () => {
  const lidas = lerOpcoes([
    React.createElement(
      "optgroup",
      { key: "g", label: "Com demandas abertas" },
      op({ key: "a", value: "1" }, "Bia"),
      op({ key: "b", value: "2" }, "Alef")
    ),
    op({ key: "c", value: "3" }, "Sem cliente"),
  ]);
  assert.deepEqual(
    lidas.map((o) => o.grupo),
    ["Com demandas abertas", "Com demandas abertas", undefined]
  );
});

test("fragmento no meio nao esconde as opcoes", () => {
  const lidas = lerOpcoes([
    React.createElement(
      React.Fragment,
      { key: "f" },
      op({ key: "a", value: "1" }, "Um"),
      op({ key: "b", value: "2" }, "Dois")
    ),
  ]);
  assert.equal(lidas.length, 2);
});

test("rotulo montado em pedacos vira um texto so", () => {
  const lidas = lerOpcoes([op({ key: "a", value: "x" }, "Bia", " (3)")]);
  assert.equal(lidas[0].rotulo, "Bia (3)");
  /* E o valor segue o value, nao o texto montado. */
  assert.equal(lidas[0].valor, "x");
});

test("sem value e com rotulo em pedacos, o valor e o texto inteiro", () => {
  const lidas = lerOpcoes([op({ key: "a" }, "Cuidados", " Pessoais")]);
  assert.equal(lidas[0].valor, "Cuidados Pessoais");
});

test("textoDe ignora o que nao e texto", () => {
  assert.equal(textoDe(null), "");
  assert.equal(textoDe(undefined), "");
  assert.equal(textoDe(false), "");
  assert.equal(textoDe(12), "12");
});
