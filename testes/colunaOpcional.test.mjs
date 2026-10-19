import { test } from "node:test";
import assert from "node:assert/strict";

import {
  COLUNAS_OPCIONAIS,
  colunaQueFaltou,
  semColuna,
} from "../src/lib/colunaOpcional.ts";

test("reconhece o 42703 do Postgres", () => {
  const m = 'column "due_time" of relation "tasks" does not exist';
  assert.equal(colunaQueFaltou(m)?.coluna, "due_time");
  assert.match(colunaQueFaltou(m).arquivo, /HORARIO-NA-DEMANDA\.sql/);
});

test("reconhece o PGRST204 do PostgREST", () => {
  const m = "Could not find the 'links' column of 'tasks' in the schema cache";
  assert.equal(colunaQueFaltou(m)?.coluna, "links");
});

test("erro que nao e de coluna faltando nao tira coluna nenhuma", () => {
  /* Tirar uma coluna por causa de um erro de permissao gravaria menos do que
     a pessoa digitou, e sem avisar. */
  assert.equal(colunaQueFaltou("new row violates row-level security policy"), null);
  assert.equal(colunaQueFaltou("duplicate key value violates unique constraint"), null);
});

test("nome parecido nao casa", () => {
  /* `/links/` solto casaria com isto e tiraria uma coluna que existe. */
  const m = 'column "links_backup" of relation "tasks" does not exist';
  assert.equal(colunaQueFaltou(m), null);
});

test("mensagem vazia nao quebra", () => {
  assert.equal(colunaQueFaltou(null), null);
  assert.equal(colunaQueFaltou(undefined), null);
  assert.equal(colunaQueFaltou(""), null);
});

test("semColuna nao altera o original", () => {
  const campos = { title: "a", due_time: "14:30" };
  const sem = semColuna(campos, "due_time");
  assert.deepEqual(sem, { title: "a" });
  assert.deepEqual(campos, { title: "a", due_time: "14:30" });
});

test("as duas colunas opcionais estao declaradas com arquivo e rotulo", () => {
  for (const c of COLUNAS_OPCIONAIS) {
    assert.ok(c.coluna && c.arquivo && c.rotulo, `incompleta: ${c.coluna}`);
    assert.match(c.arquivo, /\.sql$/);
  }
});
