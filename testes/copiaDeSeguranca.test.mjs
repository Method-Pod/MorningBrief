import { test } from "node:test";
import assert from "node:assert/strict";
import { fakeSupabase } from "./apoio/fakeSupabase.mjs";

import { copiasVencidas, fazerCopia, BALDE_DAS_COPIAS } from "../src/lib/copiaDeSeguranca.ts";
import { TABELAS_DO_APP } from "../src/lib/tabelasDoApp.ts";

test("ficam os ultimos 14 dias e o dia 1o dos ultimos 6 meses", () => {
  const nomes = [
    "2026-11-03.json", // hoje
    "2026-10-21.json", // 13 dias: fica
    "2026-10-20.json", // 14 dias: sai
    "2026-10-01.json", // dia 1o, 33 dias: fica
    "2026-06-01.json", // dia 1o, 155 dias: fica
    "2026-04-01.json", // dia 1o, 216 dias: sai
    "2026-09-15.json", // velho e nao e dia 1o: sai
    "anotacao.txt", // fora do padrao: nunca apaga
  ];
  assert.deepEqual(copiasVencidas(nomes, "2026-11-03").sort(), [
    "2026-04-01.json",
    "2026-09-15.json",
    "2026-10-20.json",
  ]);
});

/* Storage de mentira: guarda os arquivos num Map. */
function storageFalso({ falhaEnvio = false, comBalde = true } = {}) {
  const arquivos = new Map();
  const baldes = new Set(comBalde ? [BALDE_DAS_COPIAS] : []);
  return {
    arquivos,
    baldes,
    api: {
      getBucket: async (b) => (baldes.has(b) ? { data: {}, error: null } : { data: null, error: { message: "Bucket not found" } }),
      createBucket: async (b, op) => {
        assert.equal(op.public, false, "o balde das copias nunca e publico");
        baldes.add(b);
        return { data: {}, error: null };
      },
      from: () => ({
        upload: async (caminho, blob) => {
          if (falhaEnvio) return { error: { message: "falhou" } };
          arquivos.set(caminho, await blob.text());
          return { error: null };
        },
        list: async (pasta) => ({
          data: [...arquivos.keys()].filter((k) => k.startsWith(pasta + "/")).map((k) => ({ name: k.slice(pasta.length + 1) })),
          error: null,
        }),
        remove: async (caminhos) => {
          caminhos.forEach((c) => arquivos.delete(c));
          return { error: null };
        },
      }),
    },
  };
}

function cenario(opcoes) {
  const sb = fakeSupabase({
    tasks: [
      { id: "t1", user_id: "u1", title: "minha" },
      { id: "t2", user_id: "u2", title: "de outra pessoa" },
    ],
    bills: [{ id: "b1", user_id: "u1", amount: 10 }],
  });
  const st = storageFalso(opcoes);
  sb.storage = st.api;
  return { sb, st };
}

test("a copia leva so as linhas da pessoa, e cria o balde privado se faltar", async () => {
  const { sb, st } = cenario({ comBalde: false });
  const r = await fazerCopia(sb, { userId: "u1", hoje: "2026-11-03" });
  assert.equal(r.arquivo, "u1/2026-11-03.json");
  assert.equal(r.linhas, 2);
  assert.ok(st.baldes.has(BALDE_DAS_COPIAS));
  const corpo = JSON.parse(st.arquivos.get("u1/2026-11-03.json"));
  assert.deepEqual(corpo.tabelas.tasks.map((t) => t.id), ["t1"], "nunca leva linha de outra pessoa");
  assert.equal(Object.keys(corpo.tabelas).length, TABELAS_DO_APP.length);
});

test("apaga as vencidas so depois de gravar a nova", async () => {
  const { sb, st } = cenario();
  st.arquivos.set("u1/2026-09-15.json", "{}");
  st.arquivos.set("u2/2026-09-15.json", "{}");
  const r = await fazerCopia(sb, { userId: "u1", hoje: "2026-11-03" });
  assert.equal(r.apagadas, 1);
  assert.equal(st.arquivos.has("u1/2026-09-15.json"), false);
  assert.equal(st.arquivos.has("u2/2026-09-15.json"), true, "a pasta de outra pessoa nao e tocada");
});

test("se o envio falha, nada e apagado e o resultado e null", async () => {
  const { sb, st } = cenario({ falhaEnvio: true });
  st.arquivos.set("u1/2026-09-15.json", "{}");
  assert.equal(await fazerCopia(sb, { userId: "u1", hoje: "2026-11-03" }), null);
  assert.equal(st.arquivos.has("u1/2026-09-15.json"), true);
});

test("se nenhuma tabela foi lida, nao grava copia vazia", async () => {
  const { sb, st } = cenario();
  for (const t of TABELAS_DO_APP) sb.banco.errosPorTabela["select:" + t] = { message: "fora do ar" };
  assert.equal(await fazerCopia(sb, { userId: "u1", hoje: "2026-11-03" }), null);
  assert.equal(st.arquivos.size, 0);
});
