import { test } from "node:test";
import assert from "node:assert/strict";

import { acharPadroes, comparar, MINIMO_POR_LADO } from "../src/lib/padroes.ts";

const dia = (i) => `2026-09-${String(i + 1).padStart(2, "0")}`;

test("comparar: poucos dias de um lado nao vira padrao", () => {
  assert.equal(comparar([5, 5, 5], [1, 1, 1, 1, 1, 1, 1, 1], 1), null);
});

test("comparar: diferenca pequena ou dentro do ruido nao vira padrao", () => {
  const ruido = [1, 5, 2, 6, 1, 5, 3, 4];
  assert.equal(comparar(ruido, [2, 4, 3, 5, 2, 4, 3, 3], 1), null);
  assert.equal(comparar([3, 3, 3, 3, 3, 3, 3, 3], [2.8, 2.8, 2.8, 2.8, 2.8, 2.8, 2.8, 2.8], 1), null, "abaixo do piso");
});

test("acha o padrao do treino quando a diferenca e clara", () => {
  const dias = [];
  for (let i = 0; i < 20; i++) {
    const treino = i % 2 === 0;
    dias.push({
      dia: dia(i),
      habitos: new Set(treino ? ["h1"] : []),
      medidas: { concluidas: treino ? 4 + (i % 3) : 1 + (i % 2) },
    });
  }
  const p = acharPadroes(dias, [{ id: "h1", nome: "Treino", desde: "2026-01-01" }]);
  assert.equal(p.length, 1);
  assert.equal(p[0].medida, "concluidas");
  assert.match(p[0].texto, /Nos dias em que você faz Treino/);
  assert.equal(p[0].comDias, 10);
});

test("dia antes do habito existir nao conta como dia sem o habito", () => {
  const dias = [];
  for (let i = 0; i < 20; i++)
    dias.push({ dia: dia(i), habitos: new Set(i >= 10 ? ["h1"] : []), medidas: { paginas: i >= 10 ? 30 : 0 } });
  /* O habito so existe a partir do dia 11: os 10 primeiros saem, e sobra so
     o lado "com" -- nao ha comparacao. */
  assert.deepEqual(acharPadroes(dias, [{ id: "h1", nome: "Ler", desde: dia(10) }]), []);
  assert.ok(MINIMO_POR_LADO >= 7);
});

test("energia alta contra baixa", () => {
  const dias = [];
  for (let i = 0; i < 16; i++) {
    const alta = i < 8;
    dias.push({
      dia: dia(i),
      habitos: new Set(),
      medidas: { energia: alta ? 5 : 1, concluidas: alta ? 5 + (i % 2) : 1 + (i % 2) },
    });
  }
  const p = acharPadroes(dias, []);
  assert.ok(p.some((x) => x.causa === "energia alta" && x.medida === "concluidas"));
});
