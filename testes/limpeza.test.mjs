import { test } from "node:test";
import assert from "node:assert/strict";
import { fakeSupabase } from "./apoio/fakeSupabase.mjs";
import {
  limparConcluidas,
  limparPagasDeMesesAnteriores,
  limparEventosPassados,
  limparAulasAssistidas,
  MESES_RETENCAO_PAGAS,
  DIAS_RETENCAO_AULAS,
} from "../src/lib/limpeza.ts";

const horasAtras = (h) => new Date(Date.now() - h * 3_600_000).toISOString();
const diasAtras = (d) => new Date(Date.now() - d * 86_400_000).toISOString();

/* ------------------------- demandas concluidas ------------------------- */

test("so apaga demanda concluida, e so de antes da virada das 6h", async () => {
  /* Relogio fixo: 12h UTC = 9h em Sao Paulo, entao o corte e as 9h UTC. */
  const agora = new Date("2026-03-10T12:00:00Z");
  const sb = fakeSupabase({
    tasks: [
      /* concluida ontem a noite: dia de manutencao encerrado, sai */
      { id: "1", user_id: "u1", status: "done", completed_at: "2026-03-09T20:00:00Z" },
      /* concluida hoje as 7h da manha, depois da virada: fica */
      { id: "2", user_id: "u1", status: "done", completed_at: "2026-03-10T10:00:00Z" },
      { id: "3", user_id: "u1", status: "todo", completed_at: null },
      { id: "4", user_id: "u1", status: "doing", completed_at: "2026-01-01T00:00:00Z" },
    ],
  });
  assert.equal(await limparConcluidas(sb, { userId: "u1", agora }), 1);
  assert.deepEqual(sb.banco.tabelas.tasks.map((t) => t.id), ["2", "3", "4"]);
});

test("concluida cinco minutos antes da virada sai; cinco depois, fica", async () => {
  const agora = new Date("2026-03-10T12:00:00Z");
  const sb = fakeSupabase({
    tasks: [
      { id: "antes", user_id: "u1", status: "done", completed_at: "2026-03-10T08:55:00Z" },
      { id: "depois", user_id: "u1", status: "done", completed_at: "2026-03-10T09:05:00Z" },
    ],
  });
  assert.equal(await limparConcluidas(sb, { userId: "u1", agora }), 1);
  assert.deepEqual(sb.banco.tabelas.tasks.map((t) => t.id), ["depois"]);
});

test("demanda concluida sem completed_at nunca e apagada", async () => {
  /* Salvaguarda: linha anterior a esta rotina nao tem a data, e apagar pela
     data de criacao seria destruir dado com base em suposicao. */
  const sb = fakeSupabase({
    tasks: [{ id: "1", user_id: "u1", status: "done", completed_at: null }],
  });
  assert.equal(await limparConcluidas(sb, { userId: "u1" }), 0);
  assert.equal(sb.banco.tabelas.tasks.length, 1);
});

test("nao apaga demanda de outro usuario", async () => {
  const sb = fakeSupabase({
    tasks: [
      { id: "1", user_id: "u1", status: "done", completed_at: horasAtras(48) },
      { id: "2", user_id: "u2", status: "done", completed_at: horasAtras(48) },
    ],
  });
  await limparConcluidas(sb, { userId: "u1" });
  assert.deepEqual(sb.banco.tabelas.tasks.map((t) => t.id), ["2"]);
});

/* --------------------------- contas pagas --------------------------- */

test("guarda doze meses de contas pagas, e nem um a menos", async () => {
  /* Em 14/09/2026 com retencao de 12, o corte e 01/10/2025. */
  const sb = fakeSupabase({
    bills: [
      { id: "antiga", user_id: "u1", status: "paid", due_date: "2025-09-30" },
      { id: "limite", user_id: "u1", status: "paid", due_date: "2025-10-01" },
      { id: "recente", user_id: "u1", status: "paid", due_date: "2026-08-10" },
    ],
  });
  assert.equal(
    await limparPagasDeMesesAnteriores(sb, { userId: "u1", hoje: "2026-09-14" }),
    1
  );
  assert.deepEqual(sb.banco.tabelas.bills.map((b) => b.id), ["limite", "recente"]);
  assert.equal(MESES_RETENCAO_PAGAS, 12, "a janela do grafico e derivada disto");
});

test("conta em aberto nunca e apagada, por mais velha que seja", async () => {
  const sb = fakeSupabase({
    bills: [{ id: "1", user_id: "u1", status: "pending", due_date: "2019-01-01" }],
  });
  assert.equal(
    await limparPagasDeMesesAnteriores(sb, { userId: "u1", hoje: "2026-09-14" }),
    0
  );
  assert.equal(sb.banco.tabelas.bills.length, 1, "divida velha continua a vista");
});

test("o corte atravessa a virada de ano sem errar o mes", async () => {
  /* Em 15/01/2026, o corte cai em 01/02/2025. */
  const sb = fakeSupabase({
    bills: [
      { id: "fora", user_id: "u1", status: "paid", due_date: "2025-01-31" },
      { id: "dentro", user_id: "u1", status: "paid", due_date: "2025-02-01" },
    ],
  });
  await limparPagasDeMesesAnteriores(sb, { userId: "u1", hoje: "2026-01-15" });
  assert.deepEqual(sb.banco.tabelas.bills.map((b) => b.id), ["dentro"]);
});

/* ------------------------- eventos do passado ------------------------- */

test("apaga evento de mes fechado e mantem o mes corrente inteiro", async () => {
  const sb = fakeSupabase({
    events: [
      { id: "velho", user_id: "u1", series_id: null, start_at: "2026-08-30T12:00:00.000Z" },
      { id: "dia1", user_id: "u1", series_id: null, start_at: "2026-09-01T12:00:00.000Z" },
      { id: "passado-do-mes", user_id: "u1", series_id: null, start_at: "2026-09-02T12:00:00.000Z" },
    ],
  });
  await limparEventosPassados(sb, { userId: "u1", hoje: "2026-09-14" });
  const ficaram = sb.banco.tabelas.events.map((e) => e.id).sort();
  assert.deepEqual(ficaram, ["dia1", "passado-do-mes"]);
});

test("a ultima ocorrencia de uma serie sem futuro e preservada", async () => {
  /* Sem ela a repeticao encerraria em silencio: `estender` parte dessa
     ocorrencia para preencher a janela adiante. */
  const sb = fakeSupabase({
    events: [
      { id: "a", user_id: "u1", series_id: "s1", start_at: "2026-07-01T12:00:00.000Z" },
      { id: "b", user_id: "u1", series_id: "s1", start_at: "2026-08-01T12:00:00.000Z" },
    ],
  });
  await limparEventosPassados(sb, { userId: "u1", hoje: "2026-09-14" });
  assert.deepEqual(sb.banco.tabelas.events.map((e) => e.id), ["b"], "a ancora fica");
});

test("serie com ocorrencia adiante nao precisa de ancora no passado", async () => {
  const sb = fakeSupabase({
    events: [
      { id: "a", user_id: "u1", series_id: "s1", start_at: "2026-08-01T12:00:00.000Z" },
      { id: "futura", user_id: "u1", series_id: "s1", start_at: "2026-10-01T12:00:00.000Z" },
    ],
  });
  await limparEventosPassados(sb, { userId: "u1", hoje: "2026-09-14" });
  assert.deepEqual(sb.banco.tabelas.events.map((e) => e.id), ["futura"]);
});

test("nao apaga evento de outro usuario", async () => {
  const sb = fakeSupabase({
    events: [
      { id: "meu", user_id: "u1", series_id: null, start_at: "2026-01-01T12:00:00.000Z" },
      { id: "dele", user_id: "u2", series_id: null, start_at: "2026-01-01T12:00:00.000Z" },
    ],
  });
  await limparEventosPassados(sb, { userId: "u1", hoje: "2026-09-14" });
  assert.deepEqual(sb.banco.tabelas.events.map((e) => e.id), ["dele"]);
});

/* --------------------------- aulas assistidas --------------------------- */

test("aula assistida sai depois de sete dias; a da fila nunca sai", async () => {
  const sb = fakeSupabase({
    lessons: [
      { id: "velha", user_id: "u1", feita: true, feita_em: diasAtras(DIAS_RETENCAO_AULAS + 1) },
      { id: "ontem", user_id: "u1", feita: true, feita_em: diasAtras(1) },
      { id: "na-fila", user_id: "u1", feita: false, feita_em: null },
      { id: "sem-data", user_id: "u1", feita: true, feita_em: null },
    ],
  });
  assert.equal(await limparAulasAssistidas(sb, { userId: "u1" }), 1);
  assert.deepEqual(
    sb.banco.tabelas.lessons.map((l) => l.id).sort(),
    ["na-fila", "ontem", "sem-data"]
  );
});

/* ------------------------------ falhas ------------------------------ */

test("falha do banco devolve null, e nao um numero que mente", async () => {
  const sb = fakeSupabase({ tasks: [], bills: [], events: [], lessons: [] });
  sb.banco.errosPorTabela["delete:tasks"] = { code: "42501", message: "rls" };
  sb.banco.errosPorTabela["delete:bills"] = { code: "42501", message: "rls" };
  sb.banco.errosPorTabela["select:events"] = { code: "42501", message: "rls" };
  sb.banco.errosPorTabela["delete:lessons"] = { code: "42501", message: "rls" };

  assert.equal(await limparConcluidas(sb, { userId: "u1" }), null);
  assert.equal(
    await limparPagasDeMesesAnteriores(sb, { userId: "u1", hoje: "2026-09-14" }),
    null
  );
  assert.equal(
    await limparEventosPassados(sb, { userId: "u1", hoje: "2026-09-14" }),
    null
  );
  assert.equal(await limparAulasAssistidas(sb, { userId: "u1" }), null);
});
