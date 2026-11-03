import { test } from "node:test";
import assert from "node:assert/strict";
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";

import { TABELAS_DO_APP, TABELAS_FORA_DA_COPIA } from "../src/lib/tabelasDoApp.ts";

function arquivos(dir) {
  return readdirSync(dir).flatMap((n) => {
    const p = join(dir, n);
    return statSync(p).isDirectory() ? arquivos(p) : /\.(ts|tsx)$/.test(n) ? [p] : [];
  });
}

test("toda tabela que o codigo consulta esta na copia, ou esta fora de proposito", () => {
  const conhecidas = new Set([...TABELAS_DO_APP, ...TABELAS_FORA_DA_COPIA]);
  const usadas = new Set();
  for (const f of arquivos("src"))
    for (const m of readFileSync(f, "utf8").matchAll(/\.from\("([a-z_]+)"\)/g)) usadas.add(m[1]);
  const esquecidas = [...usadas].filter((t) => !conhecidas.has(t));
  assert.deepEqual(esquecidas, [], "tabela nova sem entrar na copia: " + esquecidas.join(", "));
});

test("a lista nao repete tabela", () => {
  assert.equal(new Set(TABELAS_DO_APP).size, TABELAS_DO_APP.length);
});
