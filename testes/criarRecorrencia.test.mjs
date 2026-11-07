import { test } from "node:test";
import assert from "node:assert/strict";
import { fakeSupabase } from "./apoio/fakeSupabase.mjs";

import { camposDaRegra, criarRecorrencia, recadoDoErro } from "../src/lib/criarRecorrencia.ts";

/* 2026-11-06 e sexta (5). */
const HOJE = "2026-11-06";
const dados = {
  title: "Thumb ao vivo",
  description: "",
  client: "Papo de Elite",
  priority: "high",
  cliente_id: "c1",
  projeto_id: null,
  links: [],
};

test("cai hoje: cria a regra, a demanda de hoje e o checklist dela", async () => {
  const sb = fakeSupabase({ recurring_tasks: [], tasks: [], task_items: [] });
  const r = await criarRecorrencia(sb, {
    uid: "u1",
    hoje: HOJE,
    dados,
    regra: { frequency: "weekly", weekday: 5, weekdays: [5], day_of_month: 1 },
    checklist: [{ title: "Capa" }, { title: "Revisar" }],
    comCadastro: true,
  });
  assert.equal(r.geradaHoje, true);
  const regra = sb.banco.tabelas.recurring_tasks[0];
  assert.equal(regra.last_run_on, HOJE, "marca que rodou hoje, para a manutencao nao gerar de novo");
  assert.deepEqual(regra.checklist, ["Capa", "Revisar"]);
  assert.equal(regra.cliente_id, "c1");
  const t = sb.banco.tabelas.tasks[0];
  assert.equal(t.origin_id, regra.id);
  assert.equal(t.due_date, HOJE);
  assert.equal(t.user_id, "u1");
  assert.deepEqual(sb.banco.tabelas.task_items.map((i) => [i.title, i.done]), [["Capa", false], ["Revisar", false]]);
});

test("nao cai hoje: so a regra, e diz quando sai a primeira", async () => {
  const sb = fakeSupabase({ recurring_tasks: [], tasks: [], task_items: [] });
  const r = await criarRecorrencia(sb, {
    uid: "u1",
    hoje: HOJE,
    dados,
    regra: { frequency: "weekly", weekday: 1, weekdays: [1], day_of_month: 1 },
    checklist: [],
    comCadastro: true,
  });
  assert.equal(r.geradaHoje, false);
  assert.equal(r.primeira, "2026-11-09", "a proxima segunda");
  assert.equal(sb.banco.tabelas.tasks.length, 0);
  assert.equal(sb.banco.tabelas.recurring_tasks[0].last_run_on, null);
});

test("sem cadastro, as colunas de cliente nao vao; varios dias so com mais de um", async () => {
  const sb = fakeSupabase({ recurring_tasks: [], tasks: [] });
  await criarRecorrencia(sb, {
    uid: "u1",
    hoje: HOJE,
    dados,
    regra: { frequency: "weekly", weekday: 1, weekdays: [1, 3], day_of_month: 1 },
    checklist: [],
    comCadastro: false,
  });
  const regra = sb.banco.tabelas.recurring_tasks[0];
  assert.equal("cliente_id" in regra, false);
  assert.deepEqual(regra.weekdays, [1, 3]);
  assert.equal(regra.weekday, 1, "o primeiro dia marcado");
});

test("campos da regra e recados de coluna faltando", () => {
  assert.deepEqual(camposDaRegra({ frequency: "monthly", weekday: 2, weekdays: [2], day_of_month: 40 }), {
    frequency: "monthly",
    weekday: null,
    day_of_month: 31,
  });
  assert.equal(camposDaRegra({ frequency: "biweekly", weekday: 4, weekdays: [1], day_of_month: 1 }).weekday, 4);
  assert.match(recadoDoErro('column "checklist" does not exist'), /SUBTAREFAS/);
  assert.equal(recadoDoErro("outra coisa"), "outra coisa");
});
