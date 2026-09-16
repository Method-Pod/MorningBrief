import { test } from "node:test";
import assert from "node:assert/strict";

import {
  ultimaVirada,
  diaDeManutencao,
  HORA_DA_VIRADA,
} from "../src/lib/viradaDoDia.ts";

/* São Paulo é UTC-3, então 6h daqui é 9h UTC. Os instantes abaixo são escritos
   em UTC de propósito: é assim que o `completed_at` chega do banco. */
const utc = (s) => new Date(s);

test("a virada e as 6h da manha, nao a meia-noite", () => {
  assert.equal(HORA_DA_VIRADA, 6);
});

test("depois das 6h, o corte e as 6h de hoje", () => {
  /* 12h UTC = 9h em SP, ja passou da virada. */
  const corte = ultimaVirada(utc("2026-03-10T12:00:00Z"));
  assert.equal(corte.toISOString(), "2026-03-10T09:00:00.000Z");
});

test("antes das 6h, o corte ainda e as 6h de ontem", () => {
  /* 6h UTC = 3h em SP, antes da virada. */
  const corte = ultimaVirada(utc("2026-03-10T06:00:00Z"));
  assert.equal(corte.toISOString(), "2026-03-09T09:00:00.000Z");
});

test("as 6h em ponto ja conta como o dia novo", () => {
  /* 9h UTC = 6h00 em SP, exatamente na virada. */
  const corte = ultimaVirada(utc("2026-03-10T09:00:00Z"));
  assert.equal(corte.toISOString(), "2026-03-10T09:00:00.000Z");
});

test("um minuto antes das 6h ainda pertence ao dia anterior", () => {
  const corte = ultimaVirada(utc("2026-03-10T08:59:00Z"));
  assert.equal(corte.toISOString(), "2026-03-09T09:00:00.000Z");
});

test("a meia-noite local nao vira o dia de manutencao", () => {
  /* 03h UTC = meia-noite em SP: o calendario virou, a manutencao nao. */
  assert.equal(diaDeManutencao(utc("2026-03-10T03:00:00Z")), "2026-03-09");
  /* E as 6h ela vira. */
  assert.equal(diaDeManutencao(utc("2026-03-10T09:00:00Z")), "2026-03-10");
});

test("a virada atravessa a troca de mes sem cair no dia zero", () => {
  /* 2h UTC do dia 1 = 23h do dia 28 em SP (fevereiro de 2026 tem 28 dias). */
  assert.equal(diaDeManutencao(utc("2026-03-01T02:00:00Z")), "2026-02-28");
  const corte = ultimaVirada(utc("2026-03-01T02:00:00Z"));
  assert.equal(corte.toISOString(), "2026-02-28T09:00:00.000Z");
});

test("a virada atravessa a troca de ano", () => {
  assert.equal(diaDeManutencao(utc("2026-01-01T02:00:00Z")), "2025-12-31");
});

test("o corte nunca esta no futuro, em nenhuma hora do dia", () => {
  for (let h = 0; h < 24; h++) {
    const agora = utc(`2026-07-15T${String(h).padStart(2, "0")}:30:00Z`);
    const corte = ultimaVirada(agora);
    assert.ok(
      corte.getTime() <= agora.getTime(),
      `corte no futuro as ${h}h UTC: ${corte.toISOString()} > ${agora.toISOString()}`
    );
    /* E nunca mais de 24h atras: senao um dia inteiro passaria sem limpeza. */
    assert.ok(
      agora.getTime() - corte.getTime() < 24 * 3600_000,
      `corte velho demais as ${h}h UTC`
    );
  }
});

test("o que foi concluido depois do corte sobrevive a varredura", () => {
  /* Varredura das 6h de 10/03. Uma demanda concluida as 7h do dia 9 ja passou
     por uma virada e deve sair; uma concluida as 7h do dia 10 ainda nao. */
  const corte = ultimaVirada(utc("2026-03-10T09:00:00Z"));
  const concluidaOntemDeManha = utc("2026-03-09T10:00:00Z"); // 7h de SP, dia 9
  const concluidaHojeDeManha = utc("2026-03-10T10:00:00Z"); // 7h de SP, dia 10
  assert.ok(concluidaOntemDeManha < corte, "a de ontem devia sair");
  assert.ok(concluidaHojeDeManha > corte, "a de hoje devia ficar");
});
