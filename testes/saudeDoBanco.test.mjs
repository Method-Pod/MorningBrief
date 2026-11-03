import { test } from "node:test";
import assert from "node:assert/strict";
import { readdirSync } from "node:fs";

import { ARQUIVOS_SQL, conferirArquivo, naoExiste } from "../src/lib/saudeDoBanco.ts";

test("todo arquivo de supabase/ tem verificacao, e toda verificacao tem arquivo", () => {
  const naPasta = readdirSync("supabase").filter((n) => n.endsWith(".sql")).sort();
  const naLista = ARQUIVOS_SQL.map((a) => a.arquivo).sort();
  assert.deepEqual(naLista, naPasta);
});

test("o que nao da para conferir diz por que", () => {
  for (const a of ARQUIVOS_SQL)
    if (!a.sondas) assert.ok(a.porque && a.porque.length > 5, a.arquivo);
});

test("so 'nao existe' conta como SQL faltando; outro erro nao", () => {
  assert.equal(naoExiste({ code: "42703", message: 'column tasks.arquivada_em does not exist' }), true);
  assert.equal(naoExiste({ code: "PGRST205", message: "Could not find the table 'public.app_erros'" }), true);
  assert.equal(naoExiste({ message: "Bucket not found" }), true);
  assert.equal(naoExiste({ message: "Failed to fetch" }), false);
  assert.equal(naoExiste({ code: "PGRST301", message: "JWT expired" }), false);
  assert.equal(naoExiste(null), false);
});

/* Um cliente que responde por tabela/coluna, como o PostgREST. */
function banco({ colunas, baldes = [] }) {
  return {
    from(tabela) {
      return {
        select(cols) {
          return {
            limit: async () => {
              if (!(tabela in colunas))
                return { data: null, error: { code: "PGRST205", message: `Could not find the table 'public.${tabela}'` } };
              const falta = cols === "*" ? null : cols.split(",").find((c) => !colunas[tabela].includes(c));
              if (falta)
                return { data: null, error: { code: "42703", message: `column ${tabela}.${falta} does not exist` } };
              return { data: [], error: null };
            },
          };
        },
      };
    },
    storage: {
      from: (b) => ({
        list: async () => (baldes.includes(b) ? { data: [], error: null } : { data: null, error: { message: "Bucket not found" } }),
      }),
    },
  };
}

const arq = (nome) => ARQUIVOS_SQL.find((a) => a.arquivo === nome);

test("coluna que falta deixa o arquivo pendente, dizendo qual", async () => {
  const sb = banco({ colunas: { tasks: ["id", "title"] } });
  const r = await conferirArquivo(sb, arq("DEMANDAS-ARQUIVADAS.sql"));
  assert.equal(r.estado, "pendente");
  assert.match(r.falta, /arquivada_em em tasks/);
});

test("tudo presente = rodado; balde conta", async () => {
  const sb = banco({
    colunas: { colecoes: [], referencias: [], referencia_colecao: [] },
    baldes: ["referencias"],
  });
  assert.deepEqual(await conferirArquivo(sb, arq("REFERENCIAS.sql")), { estado: "ok" });
  const semBalde = banco({ colunas: { colecoes: [], referencias: [], referencia_colecao: [] } });
  assert.equal((await conferirArquivo(semBalde, arq("REFERENCIAS.sql"))).estado, "pendente");
});
