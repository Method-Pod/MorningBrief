import { test } from "node:test";
import assert from "node:assert/strict";
import { fakeSupabase } from "./apoio/fakeSupabase.mjs";
import {
  lancarProximoMesDasFixas,
  reporRecorrentesPerdidas,
  datasPendentes,
  ocorrenciasDeEvento,
  fimDaJanelaDeEventos,
  estenderEventosRecorrentes,
} from "../src/lib/manutencao.ts";

const conta = (x) => ({
  id: "b" + Math.random(),
  user_id: "u1",
  description: "Aluguel",
  amount: 2000,
  due_date: "2026-09-10",
  category: "moradia",
  status: "pending",
  paid_at: null,
  recurring: true,
  notes: "",
  installment_no: null,
  installment_total: null,
  paid_amount: null,
  cartao_id: null,
  valor_variavel: false,
  fecha_dia: null,
  ...x,
});

/* --------------------------- contas fixas --------------------------- */

test("lanca o mes seguinte de cada conta fixa, uma vez", async () => {
  const sb = fakeSupabase({ bills: [conta({})] });
  assert.equal(
    await lancarProximoMesDasFixas(sb, { userId: "u1", hoje: "2026-09-14" }),
    1
  );

  const nova = sb.banco.tabelas.bills.find((b) => b.due_date === "2026-10-10");
  assert.ok(nova, "criou outubro");
  assert.equal(Number(nova.amount), 2000, "copia o valor da fixa comum");
  assert.equal(nova.status, "pending");

  /* Rodar de novo nao duplica. */
  assert.equal(
    await lancarProximoMesDasFixas(sb, { userId: "u1", hoje: "2026-09-14" }),
    0
  );
  assert.equal(sb.banco.tabelas.bills.length, 2);
});

test("fatura de cartao nasce zerada, e nao com o valor do mes passado", async () => {
  const sb = fakeSupabase({
    bills: [
      conta({
        description: "Fatura Nubank",
        amount: 1837.42,
        valor_variavel: true,
        fecha_dia: 1,
        cartao_id: "c1",
        due_date: "2026-09-10",
      }),
    ],
  });
  await lancarProximoMesDasFixas(sb, { userId: "u1", hoje: "2026-09-14" });

  const nova = sb.banco.tabelas.bills.find((b) => b.due_date === "2026-10-10");
  assert.equal(Number(nova.amount), 0, "o valor de setembro nao vai para outubro");
  assert.equal(nova.valor_variavel, true, "segue marcada como a informar");
  assert.equal(nova.fecha_dia, 1, "o dia de fechamento segue a serie");
  assert.equal(nova.cartao_id, "c1", "continua ligada ao cartao");
});

test("a serie encolhe o dia quando o mes seguinte e curto", async () => {
  const sb = fakeSupabase({ bills: [conta({ due_date: "2026-01-31" })] });
  await lancarProximoMesDasFixas(sb, { userId: "u1", hoje: "2026-01-15" });
  assert.ok(sb.banco.tabelas.bills.some((b) => b.due_date === "2026-02-28"));
});

test("nao mexe em conta de outro usuario", async () => {
  const sb = fakeSupabase({
    bills: [
      conta({ user_id: "u1" }),
      conta({ user_id: "u2", description: "Internet" }),
    ],
  });
  await lancarProximoMesDasFixas(sb, { userId: "u1", hoje: "2026-09-14" });
  assert.equal(sb.banco.tabelas.bills.filter((b) => b.user_id === "u2").length, 1);
});

test("duas pessoas com conta de mesmo nome nao se atrapalham", async () => {
  /* A serie e identificada pela descricao. Numa passada sem filtro de
     usuario, o "Aluguel" de um suprimiria o do outro. */
  const sb = fakeSupabase({
    bills: [
      conta({ user_id: "u1", description: "Aluguel", due_date: "2026-09-10" }),
      conta({ user_id: "u2", description: "Aluguel", due_date: "2026-09-05" }),
    ],
  });
  await lancarProximoMesDasFixas(sb, { userId: "u1", hoje: "2026-09-14" });
  await lancarProximoMesDasFixas(sb, { userId: "u2", hoje: "2026-09-14" });

  assert.ok(
    sb.banco.tabelas.bills.some(
      (b) => b.user_id === "u1" && b.due_date === "2026-10-10"
    )
  );
  assert.ok(
    sb.banco.tabelas.bills.some(
      (b) => b.user_id === "u2" && b.due_date === "2026-10-05"
    )
  );
});

test("erro de leitura devolve null, e nao 0", async () => {
  const sb = fakeSupabase({ bills: [conta({})] });
  sb.banco.errosPorTabela["select:bills"] = { code: "42P01", message: "no table" };
  assert.equal(
    await lancarProximoMesDasFixas(sb, { userId: "u1", hoje: "2026-09-14" }),
    null
  );
});

/* ------------------------ demandas recorrentes ------------------------ */

const regra = (x) => ({
  id: "r1",
  user_id: "u1",
  title: "Postar",
  description: "",
  client: "",
  priority: "medium",
  frequency: "daily",
  weekday: 1,
  weekdays: null,
  day_of_month: 1,
  active: true,
  last_run_on: null,
  checklist: null,
  links: null,
  ...x,
});

test("datasPendentes cobre a janela de sete dias", () => {
  const d = datasPendentes(regra({ last_run_on: null }), "2026-09-14");
  assert.deepEqual(d, [
    "2026-09-07",
    "2026-09-08",
    "2026-09-09",
    "2026-09-10",
    "2026-09-11",
    "2026-09-12",
    "2026-09-13",
    "2026-09-14",
  ]);
});

test("datasPendentes retoma do ultimo disparo, sem repetir", () => {
  const d = datasPendentes(regra({ last_run_on: "2026-09-12" }), "2026-09-14");
  assert.deepEqual(d, ["2026-09-13", "2026-09-14"]);
});

test("datasPendentes nao volta mais que a janela mesmo apos meses parado", () => {
  const d = datasPendentes(regra({ last_run_on: "2026-01-01" }), "2026-09-14");
  assert.equal(d.length, 8, "oito dias, nao oito meses");
});

test("quinzenal nao dispara duas vezes dentro da propria janela", () => {
  const d = datasPendentes(
    regra({ frequency: "biweekly", weekday: 1, last_run_on: null }),
    "2026-09-21"
  );
  assert.equal(d.length, 1);
});

test("repor cria as demandas e marca a regra", async () => {
  const sb = fakeSupabase({
    recurring_tasks: [regra({ last_run_on: "2026-09-12" })],
    tasks: [],
  });
  const n = await reporRecorrentesPerdidas(sb, {
    userId: "u1",
    hoje: "2026-09-14",
  });
  assert.equal(n, 2);
  assert.equal(sb.banco.tabelas.tasks.length, 2);
  assert.equal(sb.banco.tabelas.recurring_tasks[0].last_run_on, "2026-09-14");

  /* Segunda passada nao cria nada. */
  assert.equal(
    await reporRecorrentesPerdidas(sb, { userId: "u1", hoje: "2026-09-14" }),
    0
  );
  assert.equal(sb.banco.tabelas.tasks.length, 2);
});

test("o checklist do modelo vai junto em cada ocorrencia", async () => {
  const sb = fakeSupabase({
    recurring_tasks: [
      regra({ last_run_on: "2026-09-13", checklist: ["corte 1", "corte 2"] }),
    ],
    tasks: [],
    task_items: [],
  });
  await reporRecorrentesPerdidas(sb, { userId: "u1", hoje: "2026-09-14" });
  assert.equal(sb.banco.tabelas.task_items.length, 2);
  assert.deepEqual(
    sb.banco.tabelas.task_items.map((i) => i.title),
    ["corte 1", "corte 2"]
  );
});

test("insert que falha devolve a reivindicacao da regra", async () => {
  const sb = fakeSupabase({
    recurring_tasks: [regra({ last_run_on: "2026-09-13" })],
    tasks: [],
  });
  sb.banco.errosPorTabela["insert:tasks"] = { code: "42703", message: "no column" };
  await reporRecorrentesPerdidas(sb, { userId: "u1", hoje: "2026-09-14" });
  assert.equal(
    sb.banco.tabelas.recurring_tasks[0].last_run_on,
    "2026-09-13",
    "last_run_on volta ao que era, para a proxima passada tentar de novo"
  );
});

/* ------------------------- eventos recorrentes ------------------------- */

test("ocorrenciasDeEvento preserva a duracao e nao repete a partida", () => {
  const o = ocorrenciasDeEvento({
    inicio: "2026-09-14T13:00:00.000Z",
    fim: "2026-09-14T14:00:00.000Z",
    recorrencia: "weekly",
    limite: new Date("2026-10-05T23:59:59Z"),
  });
  assert.equal(o.length, 3);
  assert.equal(o[0].start_at, "2026-09-21T13:00:00.000Z");
  o.forEach((x) => {
    assert.equal(new Date(x.end_at) - new Date(x.start_at), 3_600_000);
  });
});

test("evento sem fim continua sem fim nas repeticoes", () => {
  const o = ocorrenciasDeEvento({
    inicio: "2026-09-14T13:00:00.000Z",
    fim: null,
    recorrencia: "weekly",
    limite: new Date("2026-09-30T00:00:00Z"),
  });
  assert.ok(o.length > 0);
  assert.equal(o[0].end_at, null);
});

test("recorrencia none nao gera nada", () => {
  assert.deepEqual(
    ocorrenciasDeEvento({
      inicio: "2026-09-14T13:00:00.000Z",
      fim: null,
      recorrencia: "none",
      limite: new Date("2027-01-01"),
    }),
    []
  );
});

test("mensal soma sempre a partir da partida, nao encadeando", () => {
  /* Encadear perderia o dia 31 depois de passar por fevereiro. */
  const o = ocorrenciasDeEvento({
    inicio: "2026-01-31T12:00:00.000Z",
    fim: null,
    recorrencia: "monthly",
    limite: new Date("2026-04-30T23:59:59Z"),
  });
  const dias = o.map((x) => new Date(x.start_at).getDate());
  assert.deepEqual(dias.slice(0, 3), [28, 31, 30], "fev 28, mar 31, abr 30");
});

test("fimDaJanelaDeEventos fecha no ultimo dia do mes seguinte", () => {
  const f = fimDaJanelaDeEventos("2026-09-14");
  assert.equal(f.getMonth(), 9, "outubro");
  assert.equal(f.getDate(), 31);
  /* Virada de ano. */
  const g = fimDaJanelaDeEventos("2026-12-05");
  assert.equal(g.getFullYear(), 2027);
  assert.equal(g.getMonth(), 0);
  assert.equal(g.getDate(), 31);
});

test("estender parte da ultima ocorrencia da serie", async () => {
  const evento = (x) => ({
    id: "e" + Math.random(),
    user_id: "u1",
    title: "Reuniao",
    description: "",
    all_day: false,
    color: "blue",
    location: "",
    recurrence: "weekly",
    series_id: "s1",
    start_at: "2026-09-14T13:00:00.000Z",
    end_at: "2026-09-14T14:00:00.000Z",
    ...x,
  });
  const sb = fakeSupabase({
    events: [
      evento({}),
      evento({
        start_at: "2026-09-21T13:00:00.000Z",
        end_at: "2026-09-21T14:00:00.000Z",
      }),
    ],
  });

  const n = await estenderEventosRecorrentes(sb, {
    userId: "u1",
    hoje: "2026-09-14",
  });
  assert.ok(n > 0);
  /* Nada e criado antes da ultima ocorrencia que ja existia. */
  assert.ok(
    sb.banco.tabelas.events.every((e) => e.start_at >= "2026-09-14T13:00:00.000Z")
  );
  assert.ok(
    sb.banco.tabelas.events.some((e) => e.start_at > "2026-09-21T13:00:00.000Z")
  );
});
