import { test } from "node:test";
import assert from "node:assert/strict";

import { repartirSerie } from "../src/lib/serieDeContas.ts";

const HOJE = "2026-10-08";

const conta = (p) => ({
  id: p.id,
  user_id: "u",
  description: "Assinatura",
  amount: 50,
  paid_amount: p.paid_amount ?? null,
  due_date: p.due_date,
  category: "",
  status: p.status ?? "pending",
  notes: "",
  recurring: p.recurring ?? true,
  paid_at: null,
  installment_no: null,
  installment_total: null,
});

const ids = (lista) => lista.map((b) => b.id);

test("o que ainda vai vencer sai", () => {
  const r = repartirSerie([conta({ id: "nov", due_date: "2026-11-05" })], HOJE);
  assert.deepEqual(ids(r.excluir), ["nov"]);
  assert.deepEqual(ids(r.ficam), []);
});

test("o que ja foi pago fica, mesmo vencendo la na frente", () => {
  /* Adiantar o pagamento nao torna o pagamento menos real. */
  const r = repartirSerie(
    [conta({ id: "dez", due_date: "2026-12-05", status: "paid" })],
    HOJE
  );
  assert.deepEqual(ids(r.ficam), ["dez"]);
  assert.deepEqual(ids(r.excluir), []);
});

test("conta abatida fica, mesmo sem estar quitada", () => {
  /* paid_amount preenchido e dinheiro que saiu da conta. */
  const r = repartirSerie(
    [conta({ id: "nov", due_date: "2026-11-05", paid_amount: 20 })],
    HOJE
  );
  assert.deepEqual(ids(r.ficam), ["nov"]);
});

test("mes passado em aberto fica: e historico, nao agenda", () => {
  const r = repartirSerie([conta({ id: "set", due_date: "2026-09-05" })], HOJE);
  assert.deepEqual(ids(r.ficam), ["set"]);
  assert.deepEqual(ids(r.excluir), []);
});

test("o que vence hoje fica", () => {
  /* O mes corrente ja esta sendo vivido; encolher o total dele seria mentir
     sobre um mes que a pessoa esta olhando. */
  const r = repartirSerie([conta({ id: "hoje", due_date: HOJE })], HOJE);
  assert.deepEqual(ids(r.ficam), ["hoje"]);
});

test("as que ficam marcadas como fixas entram em pararRepeticao", () => {
  /*
   * Sem isto a conta volta sozinha: lancarProximoMesDasFixas olha o
   * lancamento mais recente da serie e, se ele for fixo, cria o mes novo.
   */
  const r = repartirSerie(
    [
      conta({ id: "ago", due_date: "2026-08-05", status: "paid" }),
      conta({ id: "set", due_date: "2026-09-05", status: "paid" }),
      conta({ id: "nov", due_date: "2026-11-05" }),
    ],
    HOJE
  );
  assert.deepEqual(ids(r.excluir), ["nov"]);
  assert.deepEqual(ids(r.pararRepeticao), ["ago", "set"]);
});

test("o que ja nao e fixo nao entra em pararRepeticao", () => {
  const r = repartirSerie(
    [conta({ id: "ago", due_date: "2026-08-05", status: "paid", recurring: false })],
    HOJE
  );
  assert.deepEqual(ids(r.pararRepeticao), []);
});

test("serie so de futuro sai inteira", () => {
  const r = repartirSerie(
    [
      conta({ id: "nov", due_date: "2026-11-05" }),
      conta({ id: "dez", due_date: "2026-12-05" }),
    ],
    HOJE
  );
  assert.deepEqual(ids(r.excluir), ["nov", "dez"]);
  assert.deepEqual(ids(r.ficam), []);
});

test("due_date com hora nao engana a comparacao", () => {
  /* A coluna e date, mas se um dia vier com hora o slice garante a regra. */
  const r = repartirSerie(
    [conta({ id: "hoje", due_date: HOJE + "T23:00:00" })],
    HOJE
  );
  assert.deepEqual(ids(r.ficam), ["hoje"]);
});

/* ---------------------------- o aviso ---------------------------- */

import { avisoDeExclusao } from "../src/lib/serieDeContas.ts";

const aviso = (contas) =>
  avisoDeExclusao("Assinatura", repartirSerie(contas, HOJE));

test("o aviso nomeia o mes quando e um lancamento so", () => {
  const a = aviso([conta({ id: "nov", due_date: "2026-11-05" })]);
  assert.equal(a.acao, "excluir");
  assert.match(a.texto, /o lançamento de nov\/26/);
});

test("o aviso diz quantas ficam, e que deixa de repetir", () => {
  const a = aviso([
    conta({ id: "ago", due_date: "2026-08-05", status: "paid" }),
    conta({ id: "set", due_date: "2026-09-05", status: "paid" }),
    conta({ id: "nov", due_date: "2026-11-05" }),
    conta({ id: "dez", due_date: "2026-12-05" }),
  ]);
  assert.equal(a.acao, "excluir");
  assert.match(a.texto, /os 2 lançamentos futuros/);
  assert.match(a.texto, /Os 2 já pagos ou vencidos ficam no histórico\./);
  assert.match(a.texto, /A conta deixa de se repetir\./);
});

test("o aviso NUNCA promete apagar o historico", () => {
  /* Era o defeito antigo: o aviso dizia "o histórico vai junto". */
  const a = aviso([
    conta({ id: "ago", due_date: "2026-08-05", status: "paid" }),
    conta({ id: "nov", due_date: "2026-11-05" }),
  ]);
  assert.doesNotMatch(a.texto, /histórico vai junto/);
});

test("sem futuro, o aviso vira a pergunta de parar a repeticao", () => {
  const a = aviso([conta({ id: "set", due_date: "2026-09-05", status: "paid" })]);
  assert.equal(a.acao, "parar");
  assert.match(a.texto, /Parar a repetição/);
});

test("sem futuro e sem repeticao, nao ha o que fazer", () => {
  const a = aviso([
    conta({ id: "set", due_date: "2026-09-05", status: "paid", recurring: false }),
  ]);
  assert.equal(a.acao, "nada");
  assert.match(a.texto, /Nada a excluir/);
});

test("serie so de futuro nao fala em historico", () => {
  const a = aviso([
    conta({ id: "nov", due_date: "2026-11-05" }),
    conta({ id: "dez", due_date: "2026-12-05" }),
  ]);
  assert.equal(a.acao, "excluir");
  assert.doesNotMatch(a.texto, /histórico/);
});
