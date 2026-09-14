import { test } from "node:test";
import assert from "node:assert/strict";

/**
 * A trava da rota de manutencao diaria.
 *
 * Ela e a unica rota fora do middleware — quem chama e o agendador da Vercel,
 * de maquina, sem sessao. Entao a conferencia do cabecalho e a unica coisa
 * entre a internet e uma rotina que apaga linhas. Vale testar cada recusa.
 */

const SEGREDO = "segredo-de-teste-1234567890";
process.env.CRON_SECRET = SEGREDO;

const { chamadaDoCron } = await import("../src/lib/segredoCron.ts");

const pedir = (autorizacao) =>
  chamadaDoCron({
    headers: { get: () => (autorizacao === undefined ? null : autorizacao) },
  });

test("sem cabecalho de autorizacao, recusa", () => {
  assert.equal(pedir(undefined), false);
  assert.equal(pedir(""), false);
});

test("com segredo errado, recusa", () => {
  assert.equal(pedir("Bearer errado"), false);
  assert.equal(pedir("Bearer " + SEGREDO + "x"), false);
  assert.equal(pedir("Bearer " + SEGREDO.slice(0, -1)), false);
  /* Mesmo tamanho, um caractere diferente: e o caso que a comparacao de
     tempo constante existe para tratar. */
  assert.equal(pedir("Bearer " + SEGREDO.slice(0, -1) + "X"), false);
  /* Prefixo certo e resto errado nao pode passar. */
  assert.equal(pedir("Bearer " + SEGREDO[0] + "x".repeat(SEGREDO.length - 1)), false);
});

test("sem a palavra Bearer, recusa", () => {
  assert.equal(pedir(SEGREDO), false);
  assert.equal(pedir("Basic " + SEGREDO), false);
  assert.equal(pedir("bearer " + SEGREDO), false);
});

test("com o segredo certo, passa", () => {
  assert.equal(pedir("Bearer " + SEGREDO), true);
});

test("sem CRON_SECRET no ambiente, recusa tudo", () => {
  /* Sem segredo configurado a rota nao pode ficar aberta: seria o pior dos
     mundos, uma rotina que apaga acessivel a quem descobrisse o endereco. */
  const guardado = process.env.CRON_SECRET;
  delete process.env.CRON_SECRET;
  try {
    assert.equal(pedir("Bearer " + SEGREDO), false);
    assert.equal(pedir("Bearer "), false);
    assert.equal(pedir(""), false);
  } finally {
    process.env.CRON_SECRET = guardado;
  }
});
