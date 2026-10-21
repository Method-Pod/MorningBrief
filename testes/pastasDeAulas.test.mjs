import { test } from "node:test";
import assert from "node:assert/strict";

import { montarListaDeAulas } from "../src/lib/pastasDeAulas.ts";

const SEM = "__sem__";
const aula = (id, o = {}) => ({
  id,
  feita: false,
  subject_id: null,
  playlist_id: null,
  posicao: null,
  ...o,
});
const pasta = (id, o = {}) => ({ id, subject_id: null, ...o });
const resumo = (itens) =>
  itens.map((it) =>
    it.tipo === "aula" ? it.aula.id : `[${it.pasta.id}: ${it.aulas.map((a) => a.id).join(",")}]`
  );

test("o pedido dele: a playlist vira UMA linha, nao vinte", () => {
  const aulas = [
    aula("v1", { playlist_id: "P", posicao: 0 }),
    aula("v2", { playlist_id: "P", posicao: 1 }),
    aula("v3", { playlist_id: "P", posicao: 2 }),
    aula("solta"),
  ];
  const r = montarListaDeAulas(aulas, [pasta("P")], "fila", "all", SEM);
  assert.deepEqual(resumo(r), ["[P: v1,v2,v3]", "solta"]);
});

test("dentro da pasta a ordem e a da playlist, nao a do banco", () => {
  const aulas = [
    aula("c", { playlist_id: "P", posicao: 2 }),
    aula("a", { playlist_id: "P", posicao: 0 }),
    aula("b", { playlist_id: "P", posicao: 1 }),
  ];
  const r = montarListaDeAulas(aulas, [pasta("P")], "todas", "all", SEM);
  assert.deepEqual(resumo(r), ["[P: a,b,c]"]);
});

test("a pasta conta as assistidas", () => {
  const aulas = [
    aula("a", { playlist_id: "P", posicao: 0, feita: true }),
    aula("b", { playlist_id: "P", posicao: 1 }),
  ];
  const [p] = montarListaDeAulas(aulas, [pasta("P")], "todas", "all", SEM);
  assert.equal(p.feitas, 1);
  assert.equal(p.aulas.length, 2);
});

test("pasta pela metade aparece em Para assistir E em Assistidas", () => {
  const aulas = [
    aula("a", { playlist_id: "P", posicao: 0, feita: true }),
    aula("b", { playlist_id: "P", posicao: 1 }),
  ];
  assert.equal(montarListaDeAulas(aulas, [pasta("P")], "fila", "all", SEM).length, 1);
  assert.equal(montarListaDeAulas(aulas, [pasta("P")], "feitas", "all", SEM).length, 1);
});

test("pasta toda assistida sai de Para assistir e fica em Assistidas", () => {
  const aulas = [
    aula("a", { playlist_id: "P", posicao: 0, feita: true }),
    aula("b", { playlist_id: "P", posicao: 1, feita: true }),
  ];
  assert.equal(montarListaDeAulas(aulas, [pasta("P")], "fila", "all", SEM).length, 0);
  assert.equal(montarListaDeAulas(aulas, [pasta("P")], "feitas", "all", SEM).length, 1);
});

test("dentro da pasta vao TODAS as aulas, inclusive em Para assistir", () => {
  /* Abrir a playlist e ver so metade esconderia onde voce esta. */
  const aulas = [
    aula("a", { playlist_id: "P", posicao: 0, feita: true }),
    aula("b", { playlist_id: "P", posicao: 1 }),
  ];
  const [p] = montarListaDeAulas(aulas, [pasta("P")], "fila", "all", SEM);
  assert.deepEqual(p.aulas.map((a) => a.id), ["a", "b"]);
});

test("filtro de assunto: casa pelo assunto da pasta", () => {
  const aulas = [aula("a", { playlist_id: "P", posicao: 0 })];
  const pastas = [pasta("P", { subject_id: "design" })];
  assert.equal(montarListaDeAulas(aulas, pastas, "fila", "design", SEM).length, 1);
  assert.equal(montarListaDeAulas(aulas, pastas, "fila", "ia", SEM).length, 0);
});

test("filtro de assunto: casa tambem por uma aula trocada de assunto", () => {
  const aulas = [
    aula("a", { playlist_id: "P", posicao: 0 }),
    aula("b", { playlist_id: "P", posicao: 1, subject_id: "ia" }),
  ];
  const r = montarListaDeAulas(aulas, [pasta("P")], "fila", "ia", SEM);
  assert.equal(r.length, 1);
});

test("aula de pasta que nao existe aparece solta, e nao some", () => {
  const aulas = [aula("orfa", { playlist_id: "APAGADA" })];
  const r = montarListaDeAulas(aulas, [], "fila", "all", SEM);
  assert.deepEqual(resumo(r), ["orfa"]);
});

test("pasta vazia nao vira linha vazia", () => {
  const r = montarListaDeAulas([aula("solta")], [pasta("P")], "todas", "all", SEM);
  assert.deepEqual(resumo(r), ["solta"]);
});

test("aulas soltas continuam obedecendo aba e assunto como antes", () => {
  const aulas = [
    aula("feita", { feita: true }),
    aula("fila"),
    aula("design", { subject_id: "design" }),
  ];
  assert.deepEqual(resumo(montarListaDeAulas(aulas, [], "fila", "all", SEM)), ["fila", "design"]);
  assert.deepEqual(resumo(montarListaDeAulas(aulas, [], "feitas", "all", SEM)), ["feita"]);
  assert.deepEqual(resumo(montarListaDeAulas(aulas, [], "fila", "design", SEM)), ["design"]);
  assert.deepEqual(resumo(montarListaDeAulas(aulas, [], "fila", SEM, SEM)), ["fila"]);
});
