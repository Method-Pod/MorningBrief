import { test } from "node:test";
import assert from "node:assert/strict";
import {
  isDueOn, nextOccurrence, frequencyDescription, diasDaSemanaDe,
} from "../src/lib/recurring.ts";

const regra = (x) => ({
  id: "r1", user_id: "u1", title: "t", description: "", client: "",
  priority: "medium", frequency: "daily", weekday: 1, weekdays: null,
  day_of_month: 1, active: true, last_run_on: null, checklist: null,
  links: null, ...x,
});

test("regra desligada nunca dispara", () => {
  assert.equal(isDueOn(regra({ active: false }), "2026-09-14"), false);
  assert.equal(nextOccurrence(regra({ active: false })), null);
});

test("nao dispara duas vezes no mesmo dia", () => {
  assert.equal(isDueOn(regra({ last_run_on: "2026-09-14" }), "2026-09-14"), false);
});

test("semanal usa weekdays quando existe, e cai no weekday antigo quando nao", () => {
  /* 2026-09-14 = segunda (1), 2026-09-16 = quarta (3). */
  const varios = regra({ frequency: "weekly", weekdays: [1, 3] });
  assert.equal(isDueOn(varios, "2026-09-14"), true);
  assert.equal(isDueOn(varios, "2026-09-16"), true);
  assert.equal(isDueOn(varios, "2026-09-15"), false);

  /* Regra criada antes da migracao: weekdays nulo. */
  const antiga = regra({ frequency: "weekly", weekdays: null, weekday: 5 });
  assert.equal(isDueOn(antiga, "2026-09-18"), true, "sexta");
  assert.equal(isDueOn(antiga, "2026-09-14"), false);

  /* Lista vazia nao pode deixar a regra muda. */
  assert.deepEqual(diasDaSemanaDe({ weekday: 2, weekdays: [] }), [2]);
});

test("quinzenal respeita o intervalo minimo de 14 dias", () => {
  const r = regra({ frequency: "biweekly", weekday: 1, last_run_on: "2026-09-07" });
  assert.equal(isDueOn(r, "2026-09-14"), false, "so 7 dias depois");
  assert.equal(isDueOn(r, "2026-09-21"), true, "14 dias depois");
});

test("mensal encolhe o dia 31 para o ultimo dia do mes curto", () => {
  const r = regra({ frequency: "monthly", day_of_month: 31 });
  assert.equal(isDueOn(r, "2026-02-28"), true, "fevereiro tem 28 em 2026");
  assert.equal(isDueOn(r, "2026-02-27"), false);
  assert.equal(isDueOn(r, "2026-01-31"), true);
  assert.equal(isDueOn(r, "2026-04-30"), true, "abril tem 30");
});

test("trimestral e anual pedem o dia certo e o intervalo minimo", () => {
  const tri = regra({ frequency: "quarterly", day_of_month: 10, last_run_on: "2026-09-10" });
  assert.equal(isDueOn(tri, "2026-10-10"), false, "30 dias e pouco");
  assert.equal(isDueOn(tri, "2026-12-10"), true, "91 dias");

  const ano = regra({ frequency: "yearly", day_of_month: 10, last_run_on: "2026-09-10" });
  assert.equal(isDueOn(ano, "2027-06-10"), false, "273 dias");
  assert.equal(isDueOn(ano, "2027-09-10"), true, "365 dias");
});

test("nextOccurrence olha adiante respeitando o intervalo minimo", () => {
  const r = regra({ frequency: "biweekly", weekday: 1, last_run_on: "2026-09-07" });
  /* A proxima segunda (14/09) nao vale: so 7 dias. A de 21/09 vale. */
  assert.equal(nextOccurrence(r, "2026-09-08"), "2026-09-21");
});

test("nextOccurrence devolve nulo quando nada dispara em 400 dias", () => {
  /* Frequencia desconhecida (linha antiga do banco) nao pode virar laco. */
  assert.equal(nextOccurrence(regra({ frequency: "nunca-existiu" }), "2026-09-14"), null);
});

test("frequencyDescription escreve em portugues correto", () => {
  assert.equal(frequencyDescription({ frequency: "daily" }), "Todos os dias");
  assert.equal(
    frequencyDescription({ frequency: "weekly", weekdays: [6] }),
    "Todo sábado",
    "sabado e masculino"
  );
  assert.equal(
    frequencyDescription({ frequency: "weekly", weekdays: [2] }),
    "Toda terça"
  );
  assert.equal(
    frequencyDescription({ frequency: "weekly", weekdays: [3, 1, 6] }),
    "Toda semana: segunda, quarta e sábado"
  );
  assert.equal(
    frequencyDescription({ frequency: "weekly", weekdays: [0, 1, 2, 3, 4, 5, 6] }),
    "Todos os dias da semana"
  );
  assert.equal(
    frequencyDescription({ frequency: "monthly", day_of_month: 5 }),
    "Dia 5 de cada mês"
  );
});
