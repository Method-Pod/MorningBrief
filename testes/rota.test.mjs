import { test } from "node:test";
import assert from "node:assert/strict";

import { naRota } from "../src/lib/rota.ts";

/* O defeito que originou o arquivo: /contas acendendo /conta. */
test("rota parecida nao acende a vizinha", () => {
  assert.equal(naRota("/contas", "/conta"), false);
  assert.equal(naRota("/contas/gerenciar", "/conta"), false);
  assert.equal(naRota("/contas/cartoes", "/conta"), false);
  /* E o contrario tambem: a conta nao acende Contas a pagar. */
  assert.equal(naRota("/conta", "/contas"), false);
});

test("a propria rota acende", () => {
  assert.equal(naRota("/conta", "/conta"), true);
  assert.equal(naRota("/contas", "/contas"), true);
  assert.equal(naRota("/demandas", "/demandas"), true);
});

test("tela filha acende a rota do menu", () => {
  assert.equal(naRota("/contas/gerenciar", "/contas"), true);
  assert.equal(naRota("/demandas/clientes", "/demandas"), true);
  assert.equal(naRota("/anotacoes/abc-123", "/anotacoes"), true);
});

test("a raiz so acende nela mesma", () => {
  /* Toda rota do app comeca com "/", entao a regra do filho acenderia o
     Inicio em todas as telas. */
  assert.equal(naRota("/", "/"), true);
  assert.equal(naRota("/demandas", "/"), false);
  assert.equal(naRota("/contas/gerenciar", "/"), false);
});

test("nenhum par do menu de verdade se acende por engano", () => {
  const MENU = [
    "/", "/demandas", "/habitos", "/leitura", "/aulas",
    "/contas", "/referencias", "/anotacoes", "/calendario", "/conta",
  ];
  /* Estando numa rota do menu, so ELA pode estar acesa. Era exatamente
     isto que falhava: em /contas acendiam duas. */
  for (const atual of MENU) {
    const acesas = MENU.filter((r) => naRota(atual, r));
    assert.deepEqual(acesas, [atual], `em ${atual} acenderam ${acesas}`);
  }
});

test("telas filhas acendem uma so do menu", () => {
  const MENU = [
    "/", "/demandas", "/habitos", "/leitura", "/aulas",
    "/contas", "/referencias", "/anotacoes", "/calendario", "/conta",
  ];
  const filhas = {
    "/contas/gerenciar": "/contas",
    "/contas/cartoes": "/contas",
    "/demandas/clientes": "/demandas",
    "/anotacoes/xyz": "/anotacoes",
  };
  for (const [caminho, esperada] of Object.entries(filhas)) {
    const acesas = MENU.filter((r) => naRota(caminho, r));
    assert.deepEqual(acesas, [esperada], `em ${caminho} acenderam ${acesas}`);
  }
});
