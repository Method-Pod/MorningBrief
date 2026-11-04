import { test } from "node:test";
import assert from "node:assert/strict";

import { imagemOriginal, imagemReduzida } from "../src/lib/imagem.ts";

const DO_STORAGE =
  "https://abc.supabase.co/storage/v1/object/public/referencias/u1/r1.png";

test("imagem do Storage vira o endereco de reducao, no dobro da medida", () => {
  const r = imagemReduzida(DO_STORAGE, 200);
  const u = new URL(r);
  assert.equal(u.pathname, "/storage/v1/render/image/public/referencias/u1/r1.png");
  assert.equal(u.searchParams.get("width"), "400");
  assert.equal(u.searchParams.get("quality"), "70");
  assert.equal(u.searchParams.get("height"), null);
  /* Regressao: so com a largura, o Supabase mantinha a altura original e
     cortava uma faixa do meio (capa 1721x2560 voltava 440x2560). */
  assert.equal(u.searchParams.get("resize"), "contain");
});

test("com altura, corta para preencher (a foto de perfil)", () => {
  const u = new URL(imagemReduzida(DO_STORAGE, 48, { altura: 48 }));
  assert.equal(u.searchParams.get("height"), "96");
  assert.equal(u.searchParams.get("resize"), "cover");
});

test("mantem o parametro que ja existia (a versao da foto)", () => {
  const u = new URL(imagemReduzida(DO_STORAGE + "?v=123", 48));
  assert.equal(u.searchParams.get("v"), "123");
});

test("imagem de fora volta igual", () => {
  for (const url of [
    "https://i.ytimg.com/vi/abc/mqdefault.jpg",
    "https://books.google.com/capa.jpg",
    "https://site.com/storage/v1/object/public/falso.png",
  ])
    assert.equal(imagemReduzida(url, 200), url);
});

test("vazio volta vazio", () => {
  assert.equal(imagemReduzida(null, 200), null);
  assert.equal(imagemReduzida("", 200), "");
});

test("o original e recuperado a partir do reduzido", () => {
  const r = imagemReduzida(DO_STORAGE + "?v=9", 100, { altura: 100 });
  assert.equal(imagemOriginal(r), DO_STORAGE + "?v=9");
});
