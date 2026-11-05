import { test } from "node:test";
import assert from "node:assert/strict";
import { fakeSupabase } from "./apoio/fakeSupabase.mjs";

import { gravarEnergia } from "../src/lib/registroDoDia.ts";

/* Quinta, 05/11/2026, 10h em Sao Paulo. */
const agora = new Date("2026-11-05T13:00:00Z");

test("marca a energia de um dia que ja passou, sem mexer no resto do dia", async () => {
  const sb = fakeSupabase({
    registro_do_dia: [{ user_id: "u1", dia: "2026-11-04", concluidas: [{ id: "t" }], aulas: [], energia: null }],
  });
  const { error } = await gravarEnergia(sb, 3, { agora, dia: "2026-11-04", userId: "u1" });
  assert.equal(error, null);
  const linha = sb.banco.tabelas.registro_do_dia.find((r) => r.dia === "2026-11-04");
  assert.equal(linha.energia, 3);
  assert.equal(linha.concluidas.length, 1, "as concluidas guardadas do dia ficam");
});

test("sem dia, e o dia em curso", async () => {
  const sb = fakeSupabase({ registro_do_dia: [] });
  await gravarEnergia(sb, 5, { agora, userId: "u1" });
  assert.equal(sb.banco.tabelas.registro_do_dia[0].dia, "2026-11-05");
});

test("dia que ainda nao chegou e recusado, e nada e gravado", async () => {
  const sb = fakeSupabase({ registro_do_dia: [] });
  const { error } = await gravarEnergia(sb, 4, { agora, dia: "2026-11-06", userId: "u1" });
  assert.ok(error);
  assert.equal(sb.banco.tabelas.registro_do_dia.length, 0);
});
