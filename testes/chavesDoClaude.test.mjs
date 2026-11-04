import { test } from "node:test";
import assert from "node:assert/strict";

import { chaveDoCabecalho, gerarChave, hashDaChave } from "../src/lib/chavesDoClaude.ts";

test("a chave nova tem prefixo, e o hash bate com ela e so com ela", async () => {
  const a = await gerarChave();
  const b = await gerarChave();
  assert.match(a.chave, /^mb_[A-Za-z0-9_-]{43}$/);
  assert.notEqual(a.chave, b.chave);
  assert.equal(a.prefixo, a.chave.slice(0, 10));
  assert.equal(a.hash, await hashDaChave(a.chave));
  assert.notEqual(a.hash, await hashDaChave(b.chave));
  assert.match(a.hash, /^[0-9a-f]{64}$/);
});

test("so aceita o cabecalho Bearer com chave do app", () => {
  assert.equal(chaveDoCabecalho("Bearer mb_abcdefghijklmnopqrstuvwxyz012"), "mb_abcdefghijklmnopqrstuvwxyz012");
  assert.equal(chaveDoCabecalho("Bearer outra_coisa_123456789012345678"), null);
  assert.equal(chaveDoCabecalho("mb_abcdefghijklmnopqrstuvwxyz012"), null);
  assert.equal(chaveDoCabecalho(null), null);
});
