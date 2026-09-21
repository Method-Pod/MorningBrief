import { test } from "node:test";
import assert from "node:assert/strict";

import { matizDeTexto, inicialDaCapa } from "../src/lib/capa.ts";

/* ------------------------------ o matiz ------------------------------ */

test("o mesmo dominio devolve sempre o mesmo matiz", () => {
  assert.equal(matizDeTexto("salo.uk"), matizDeTexto("salo.uk"));
  assert.equal(matizDeTexto("imflorea.dev"), matizDeTexto("imflorea.dev"));
});

test("o matiz cabe na roda de cores", () => {
  for (const d of ["", "a", "salo.uk", "rpacomunicacion.com", "x".repeat(200)]) {
    const h = matizDeTexto(d);
    assert.ok(Number.isInteger(h), `${d} devolveu ${h}`);
    assert.ok(h >= 0 && h < 360, `${d} devolveu ${h}`);
  }
});

const distancia = (a, b) => {
  const d = Math.abs(matizDeTexto(a) - matizDeTexto(b));
  return Math.min(d, 360 - d);
};

test("dominios parecidos nao caem sistematicamente na mesma cor", () => {
  /*
   * O que este teste mede, e o que ele NAO mede.
   *
   * Nao da para exigir que DOIS dominios quaisquer caiam longe: sao 360
   * casas, entao encontro e questao de sorte — "bia.com" e "bia.com.br"
   * caem na mesma, e tudo bem, e um enfeite e nao um identificador.
   *
   * O que se mede e o AGRUPAMENTO: se o hash empurrasse nomes parecidos
   * para perto, a media das distancias cairia bem abaixo de 90, que e o
   * valor de duas casas sorteadas ao acaso. Medido: FNV cru da 82,7 e com
   * o embaralhamento final da 89,4. O piso de 85 e o que separa os dois.
   */
  const pares = [];
  for (let i = 0; i < 200; i++)
    pares.push([`cliente${i}.com`, `cliente${i}.com.br`]);

  const media =
    pares.reduce((t, [a, b]) => t + distancia(a, b), 0) / pares.length;
  assert.ok(media > 85, `media de ${media.toFixed(1)} graus`);

  /* E o encontro tem que ser raro, nao a regra. */
  const juntos = pares.filter(([a, b]) => distancia(a, b) < 10).length;
  assert.ok(juntos < pares.length * 0.12, `${juntos} de ${pares.length} juntos`);
});

test("dominios diferentes espalham pela roda", () => {
  /* Nao e um teste de aleatoriedade: e a garantia de que uma tela com uma
     duzia de referencias nao vira um degrade de um tom so. */
  const dominios = [
    "salo.uk", "imflorea.dev", "rpacomunicacion.com", "dribbble.com",
    "behance.net", "awwwards.com", "mobbin.com", "land-book.com",
    "stripe.com", "linear.app", "vercel.com", "tailwindcss.com",
  ];
  const matizes = dominios.map(matizDeTexto);
  assert.equal(new Set(matizes).size, dominios.length);

  /* Pelo menos metade dos quadrantes ocupados. */
  const quadrantes = new Set(matizes.map((h) => Math.floor(h / 90)));
  assert.ok(quadrantes.size >= 2, `so ${quadrantes.size} quadrante(s)`);
});

/* ------------------------------ a inicial ------------------------------ */

test("a inicial sai do dominio, em maiuscula", () => {
  assert.equal(inicialDaCapa("salo.uk", "Outsourced Design"), "S");
  assert.equal(inicialDaCapa("imflorea.dev", "Alexandru Florea"), "I");
});

test("prefixo generico nao vira a inicial", () => {
  assert.equal(inicialDaCapa("www.behance.net", "Behance"), "B");
  /* O caso que apareceu na tela: lp.gaiaone.com.br dava "L". */
  assert.equal(inicialDaCapa("lp.gaiaone.com.br", "Gaia ONE"), "G");
  assert.equal(inicialDaCapa("app.clickup.com", "ClickUp"), "C");
  assert.equal(inicialDaCapa("loja.marca.com.br", "Marca"), "M");
});

test("nome curto de verdade nao e confundido com prefixo", () => {
  /* A lista e fechada justamente por isto: cortar todo rotulo curto faria
     "bia.com.br" virar "C", de "com". */
  assert.equal(inicialDaCapa("bia.com.br", "Bia"), "B");
  assert.equal(inicialDaCapa("ig.com.br", ""), "I");
  assert.equal(inicialDaCapa("uol.com.br", ""), "U");
});

test("sem dominio, a inicial vem do nome", () => {
  /* Referencia que e so imagem nao tem dominio nenhum. */
  assert.equal(inicialDaCapa("", "Print do layout"), "P");
});

test("acento e numero valem como inicial, pontuacao nao", () => {
  assert.equal(inicialDaCapa("", "Ótimo exemplo"), "Ó");
  assert.equal(inicialDaCapa("4chan.org", ""), "4");
  assert.equal(inicialDaCapa("-.com", ""), "C");
});

test("sem nada, a capa nao quebra", () => {
  assert.equal(inicialDaCapa("", ""), "?");
});
