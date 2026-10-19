import { test } from "node:test";
import assert from "node:assert/strict";

import {
  doMes,
  gradeDoMes,
  mesDe,
  mesVizinho,
  paraISO,
  somarDias,
} from "../src/lib/calendario.ts";

process.env.TZ = "America/Sao_Paulo";

test("a grade tem sempre 42 dias", () => {
  /* Altura fixa: sem isso o popover muda de tamanho ao trocar de mes e o
     botao que estava sob o cursor sai de lugar. */
  for (const ym of ["2026-02", "2026-10", "2027-01", "2024-02"])
    assert.equal(gradeDoMes(ym).length, 42, ym);
});

test("a grade comeca num domingo", () => {
  const g = gradeDoMes("2026-10");
  const [a, m, d] = [g[0].slice(0, 4), g[0].slice(5, 7), g[0].slice(8, 10)];
  assert.equal(new Date(Number(a), Number(m) - 1, Number(d)).getDay(), 0);
});

test("a grade cobre o mes inteiro", () => {
  const g = gradeDoMes("2026-10");
  const doMesCerto = g.filter((d) => doMes(d, "2026-10"));
  assert.equal(doMesCerto.length, 31);
  assert.equal(doMesCerto[0], "2026-10-01");
  assert.equal(doMesCerto[30], "2026-10-31");
});

test("fevereiro de ano bissexto tem 29", () => {
  assert.equal(gradeDoMes("2024-02").filter((d) => doMes(d, "2024-02")).length, 29);
  assert.equal(gradeDoMes("2026-02").filter((d) => doMes(d, "2026-02")).length, 28);
});

test("o mes vizinho atravessa o ano", () => {
  assert.equal(mesVizinho("2026-12", 1), "2027-01");
  assert.equal(mesVizinho("2026-01", -1), "2025-12");
  assert.equal(mesVizinho("2026-10", 0), "2026-10");
});

test("somarDias atravessa o mes e o ano", () => {
  assert.equal(somarDias("2026-10-31", 1), "2026-11-01");
  assert.equal(somarDias("2026-01-01", -1), "2025-12-31");
  assert.equal(somarDias("2026-10-19", 7), "2026-10-26");
});

test("a conta nao escorrega um dia por causa do fuso", () => {
  /*
   * `new Date("2026-10-19")` e lido como UTC e volta dia 18 em Sao Paulo.
   * Este teste existe para que ninguem troque a construcao por ano/mes/dia
   * por um parse de string sem o build quebrar.
   */
  assert.equal(somarDias("2026-10-19", 0), "2026-10-19");
  assert.equal(gradeDoMes("2026-10").includes("2026-10-19"), true);
});

test("o horario de verao nao come um dia", () => {
  /* Brasil nao tem mais, mas a base de um dia e 24h so na media; somar por
     construtor de data e imune, somar 864e5 ms nao e. */
  assert.equal(somarDias("2018-11-03", 1), "2018-11-04");
  assert.equal(somarDias("2019-02-16", 1), "2019-02-17");
});

test("paraISO e mesDe andam juntos", () => {
  assert.equal(paraISO(new Date(2026, 9, 5)), "2026-10-05");
  assert.equal(mesDe("2026-10-05"), "2026-10");
});

/* ------------------------- seta de mês ------------------------- */

import { mesAdianteNoDia } from "../src/lib/calendario.ts";

test("a seta de mes guarda o dia", () => {
  assert.equal(mesAdianteNoDia("2026-10-19", 1), "2026-11-19");
  assert.equal(mesAdianteNoDia("2026-10-19", -1), "2026-09-19");
});

test("o dia encolhe quando o mes de destino e curto", () => {
  /* `Date(2026, 1, 31)` sozinho vira 3 de marco: o calendario pularia
     fevereiro inteiro com um clique na seta. */
  assert.equal(mesAdianteNoDia("2026-01-31", 1), "2026-02-28");
  assert.equal(mesAdianteNoDia("2024-01-31", 1), "2024-02-29");
  assert.equal(mesAdianteNoDia("2026-03-31", -1), "2026-02-28");
});

test("a seta de mes atravessa o ano", () => {
  assert.equal(mesAdianteNoDia("2026-12-15", 1), "2027-01-15");
  assert.equal(mesAdianteNoDia("2026-01-15", -1), "2025-12-15");
});
