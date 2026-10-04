import { test } from "node:test";
import assert from "node:assert/strict";

import { PAGINA, pedir, cortar } from "../src/lib/teto.ts";

const linhas = (n) => Array.from({ length: n }, (_, i) => i);

test("pede uma linha a mais que o teto, para saber se ha mais", () => {
  assert.equal(pedir(1), PAGINA + 1);
  assert.equal(pedir(3), PAGINA * 3 + 1);
});

test("acervo menor que o teto cabe inteiro e nao oferece mais", () => {
  const r = cortar(linhas(39), 1);
  assert.equal(r.lista.length, 39);
  assert.equal(r.temMais, false);
});

test("acervo exatamente do tamanho do teto nao oferece mais", () => {
  /* O limite e o teto, nao o teto + 1: sem isto a tela ofereceria carregar
     uma pagina que nao existe. */
  const r = cortar(linhas(PAGINA), 1);
  assert.equal(r.lista.length, PAGINA);
  assert.equal(r.temMais, false);
});

test("a linha extra e descartada e vira o aviso", () => {
  const r = cortar(linhas(PAGINA + 1), 1);
  assert.equal(r.lista.length, PAGINA);
  assert.equal(r.temMais, true);
});

test("a segunda pagina dobra o teto", () => {
  const r = cortar(linhas(PAGINA * 2), 2);
  assert.equal(r.lista.length, PAGINA * 2);
  assert.equal(r.temMais, false);
});

test("lista ausente nao quebra a tela", () => {
  /* `data` volta null quando a consulta falha; a tela ainda renderiza. */
  assert.deepEqual(cortar(null, 1), { lista: [], temMais: false });
  assert.deepEqual(cortar(undefined, 1), { lista: [], temMais: false });
});
