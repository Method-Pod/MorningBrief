import { test } from "node:test";
import assert from "node:assert/strict";
import { semValorAinda, dataDoFechamento, jaFechou } from "../src/lib/types.ts";

const conta = (x) => ({
  valor_variavel: false, amount: 0, fecha_dia: null, due_date: "2026-10-10",
  status: "pending", ...x,
});

test("semValorAinda separa 'ainda nao sei' de 'e zero mesmo'", () => {
  assert.equal(semValorAinda(conta({ valor_variavel: true, amount: 0 })), true);
  /* Conta comum de R$ 0,00 nao esta esperando nada. */
  assert.equal(semValorAinda(conta({ valor_variavel: false, amount: 0 })), false);
  /* Ja informada: continua variavel para o mes que vem, mas nao esta faltando. */
  assert.equal(semValorAinda(conta({ valor_variavel: true, amount: 812.4 })), false);
  /* O banco devolve numeric como string. */
  assert.equal(semValorAinda(conta({ valor_variavel: true, amount: "0" })), true);
  assert.equal(semValorAinda(conta({ valor_variavel: true, amount: "0.00" })), true);
  assert.equal(semValorAinda(conta({ valor_variavel: true, amount: "812.40" })), false);
});

test("dataDoFechamento: fechamento antes do vencimento fica no mesmo mes", () => {
  /* Nubank: fecha 1, vence 10. A fatura que vence 10/10 fechou em 01/10. */
  assert.equal(dataDoFechamento({ fecha_dia: 1, due_date: "2026-10-10" }), "2026-10-01");
  /* Inter: fecha 8, vence 15. */
  assert.equal(dataDoFechamento({ fecha_dia: 8, due_date: "2026-10-15" }), "2026-10-08");
  /* Fechamento no mesmo dia do vencimento: conta como o mesmo mes. */
  assert.equal(dataDoFechamento({ fecha_dia: 10, due_date: "2026-10-10" }), "2026-10-10");
});

test("dataDoFechamento: fechamento depois do vencimento cai no mes anterior", () => {
  /* Fecha 28, vence 7: a fatura de 07/11 fechou em 28/10. */
  assert.equal(dataDoFechamento({ fecha_dia: 28, due_date: "2026-11-07" }), "2026-10-28");
  /* Virada de ano. */
  assert.equal(dataDoFechamento({ fecha_dia: 28, due_date: "2026-01-05" }), "2025-12-28");
});

test("dataDoFechamento encolhe o dia quando o mes e curto", () => {
  /* "fecha 31" com vencimento em 05/03 -> fechou em 28/02 (2026 nao e bissexto). */
  assert.equal(dataDoFechamento({ fecha_dia: 31, due_date: "2026-03-05" }), "2026-02-28");
  /* 2024 e bissexto. */
  assert.equal(dataDoFechamento({ fecha_dia: 31, due_date: "2024-03-05" }), "2024-02-29");
  /* "fecha 31" em abril, que tem 30. */
  assert.equal(dataDoFechamento({ fecha_dia: 31, due_date: "2026-05-05" }), "2026-04-30");
});

test("dataDoFechamento devolve nulo quando nao ha fechamento", () => {
  assert.equal(dataDoFechamento({ fecha_dia: null, due_date: "2026-10-10" }), null);
  assert.equal(dataDoFechamento({ fecha_dia: 0, due_date: "2026-10-10" }), null);
  assert.equal(dataDoFechamento({ fecha_dia: 5, due_date: "" }), null);
});

test("jaFechou: sem fecha_dia, pergunta desde ja", () => {
  assert.equal(jaFechou({ fecha_dia: null, due_date: "2026-10-10" }, "2026-09-14"), true);
});

test("jaFechou: o aviso so aparece do dia do fechamento em diante", () => {
  const nubank = { fecha_dia: 1, due_date: "2026-10-10" };
  assert.equal(jaFechou(nubank, "2026-09-30"), false, "vespera: ainda nao");
  assert.equal(jaFechou(nubank, "2026-10-01"), true, "no dia: sim");
  assert.equal(jaFechou(nubank, "2026-10-05"), true, "depois: sim");
});

test("jaFechou aguenta hoje vindo com hora junto", () => {
  assert.equal(jaFechou({ fecha_dia: 1, due_date: "2026-10-10" }, "2026-10-01T09:00:00"), true);
});
