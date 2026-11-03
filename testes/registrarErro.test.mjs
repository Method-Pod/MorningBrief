import { test } from "node:test";
import assert from "node:assert/strict";

import {
  criarTrava,
  prepararErro,
  LIMITES,
  MAXIMO_POR_VISITA,
  JANELA_DE_REPETICAO_MS,
} from "../src/lib/registrarErro.ts";

const amb = { pagina: "/habitos", aparelho: "iPhone", versao: "abc123" };

test("erro do Supabase (objeto, nao Error) vira mensagem com o contexto na frente", () => {
  const r = prepararErro(
    { message: "permission denied for table habit_logs", code: "42501", details: null, hint: null },
    { ...amb, onde: "marcar o hábito" }
  );
  assert.equal(r.mensagem, "marcar o hábito: permission denied for table habit_logs");
  assert.equal(r.detalhe, "42501");
  assert.equal(r.pagina, "/habitos");
});

test("Error leva a pilha no detalhe", () => {
  const e = new Error("x is undefined");
  const r = prepararErro(e, amb);
  assert.equal(r.mensagem, "x is undefined");
  assert.match(r.detalhe, /x is undefined/);
});

test("ruido do navegador nao e gravado", () => {
  for (const m of [
    "ResizeObserver loop completed with undelivered notifications.",
    "Script error.",
    "AbortError: The user aborted a request.",
    "ChunkLoadError: Loading chunk 123 failed.",
    "",
  ])
    assert.equal(prepararErro(m, amb), null, m);
});

test("texto comprido e cortado no teto da tabela", () => {
  const r = prepararErro({ message: "a".repeat(2000) }, { ...amb, pagina: "/".repeat(900) });
  assert.equal(r.mensagem.length, LIMITES.mensagem);
  assert.equal(r.pagina.length, LIMITES.pagina);
});

test("o mesmo erro nao repete dentro da janela, e a visita tem teto", () => {
  let agora = 0;
  const trava = criarTrava(() => agora);
  assert.equal(trava("a"), true);
  assert.equal(trava("a"), false, "repetido logo em seguida");
  agora += JANELA_DE_REPETICAO_MS;
  assert.equal(trava("a"), true, "passada a janela, grava de novo");
  let gravados = 2;
  for (let i = 0; i < 100; i++) if (trava("b" + i)) gravados++;
  assert.equal(gravados, MAXIMO_POR_VISITA);
});
