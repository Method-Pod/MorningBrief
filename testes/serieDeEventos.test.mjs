import { test } from "node:test";
import assert from "node:assert/strict";

import { horarioDaOcorrencia } from "../src/lib/serieDeEventos.ts";

/* O fuso do processo é o de São Paulo, como nos outros testes de data. */
process.env.TZ = "America/Sao_Paulo";

const dia = (iso) => new Date(iso).toISOString().slice(0, 10);

test("a data e da ocorrencia, a hora e a nova", () => {
  /* Ocorrencia de 13/10 as 15h, movida para as 9h: continua em 13/10. */
  const r = horarioDaOcorrencia("2026-10-13T18:00:00.000Z", "09:00", null);
  assert.equal(new Date(r.start_at).getHours(), 9);
  assert.equal(dia(new Date(`2026-10-13T09:00:00`).toISOString()), dia(r.start_at));
});

test("a duracao e preservada no fim", () => {
  const umaHora = 60 * 60 * 1000;
  const r = horarioDaOcorrencia("2026-10-13T18:00:00.000Z", "09:00", umaHora);
  assert.ok(r.end_at);
  assert.equal(new Date(r.end_at).getTime() - new Date(r.start_at).getTime(), umaHora);
});

test("sem hora de fim, o fim continua nulo", () => {
  /* Virar igual ao inicio desenharia um evento de duracao zero no calendario. */
  const r = horarioDaOcorrencia("2026-10-13T18:00:00.000Z", "09:00", null);
  assert.equal(r.end_at, null);
});

test("ocorrencia da noite de domingo nao pula para segunda", () => {
  /*
   * O caso que `slice(0, 10)` erra: 21h30 de domingo em Sao Paulo esta
   * gravado como 00h30 de segunda em UTC. Cortando a string, a ocorrencia
   * mudaria de dia a cada edicao e a serie andaria sozinha.
   */
  const domingoTarde = "2026-10-19T00:30:00.000Z"; // = 18/10 21h30 em SP
  const r = horarioDaOcorrencia(domingoTarde, "21:30", null);
  const d = new Date(r.start_at);
  assert.equal(d.getDate(), 18);
  assert.equal(d.getDay(), 0); // domingo
});

test("meia-noite e um horario valido, nao um vazio", () => {
  const r = horarioDaOcorrencia("2026-10-13T18:00:00.000Z", "00:00", null);
  assert.equal(new Date(r.start_at).getHours(), 0);
});

test("hora vazia cai em meia-noite, e nao em data invalida", () => {
  /* O formulario pode chegar sem hora quando o evento e de dia inteiro. */
  const r = horarioDaOcorrencia("2026-10-13T18:00:00.000Z", "", null);
  assert.ok(!Number.isNaN(new Date(r.start_at).getTime()));
  assert.equal(new Date(r.start_at).getHours(), 0);
});
