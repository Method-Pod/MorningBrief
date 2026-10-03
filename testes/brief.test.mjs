import { test } from "node:test";
import assert from "node:assert/strict";
import {
  montarBrief,
  fechamentoDoMes,
  linhaDoFechamento,
  diaEmSaoPaulo,
  mesAnterior,
} from "../src/lib/brief.ts";

const conta = (x) => ({
  id: "b" + Math.random(),
  user_id: "u1",
  description: "Internet",
  amount: 100,
  due_date: "2026-10-03",
  category: "Internet",
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

const tarefa = (x) => ({
  id: "t" + Math.random(),
  title: "Corte",
  status: "todo",
  due_date: "2026-10-03",
  priority: "medium",
  ...x,
});

const evento = (x) => ({
  id: "e" + Math.random(),
  title: "Mentoria",
  start_at: "2026-10-03T18:00:00.000Z",
  all_day: false,
  cancelado: false,
  ...x,
});

test("brief junta demandas, contas e agenda em linhas curtas", () => {
  const b = montarBrief({
    hoje: "2026-10-03",
    tarefas: [tarefa({}), tarefa({ due_date: "2026-10-01" }), tarefa({ status: "done" })],
    contas: [
      conta({ description: "Youtube", amount: 14, due_date: "2026-10-04" }),
      conta({ description: "Paga", status: "paid" }),
      conta({ description: "Longe", due_date: "2026-10-20" }),
    ],
    eventos: [evento({})],
  });
  const linhas = b.corpo.split("\n");
  assert.equal(linhas.length, 3);
  assert.match(linhas[0], /1 demanda hoje · 1 atrasada/);
  assert.match(linhas[1], /Youtube R\$\s?14,00 amanhã/);
  assert.doesNotMatch(b.corpo, /Paga|Longe/);
  /* 18:00 UTC = 15:00 em São Paulo. */
  assert.match(linhas[2], /15:00 Mentoria/);
});

test("evento cancelado e de outro dia ficam fora do brief", () => {
  const b = montarBrief({
    hoje: "2026-10-03",
    tarefas: [],
    contas: [],
    eventos: [
      evento({ cancelado: true }),
      /* 02:00 UTC do dia 3 = 23:00 do dia 2 em São Paulo: é ontem. */
      evento({ start_at: "2026-10-03T02:00:00.000Z" }),
    ],
  });
  assert.match(b.corpo, /Dia livre/);
});

test("conta variavel sem valor aparece sem R$ 0,00", () => {
  const b = montarBrief({
    hoje: "2026-10-03",
    tarefas: [],
    contas: [conta({ description: "Fatura", amount: 0, valor_variavel: true })],
    eventos: [],
  });
  assert.match(b.corpo, /Fatura hoje/);
  assert.doesNotMatch(b.corpo, /0,00/);
});

test("falha da manutencao vira aviso no brief", () => {
  const b = montarBrief({ hoje: "2026-10-03", tarefas: [], contas: [], eventos: [], falhou: true });
  assert.match(b.corpo, /manutenção das 6h falhou/);
});

test("fechamento soma pago, em aberto e as categorias que mais pesaram", () => {
  const f = fechamentoDoMes(
    [
      conta({ due_date: "2026-09-10", status: "paid", amount: 100, category: "Internet" }),
      conta({ due_date: "2026-09-15", status: "paid", amount: 300, category: "Moradia" }),
      conta({ due_date: "2026-09-20", amount: 50, category: "Saúde" }),
      conta({ due_date: "2026-08-10", status: "paid", amount: 200 }),
      conta({ due_date: "2026-10-10", amount: 999 }),
    ],
    "2026-09"
  );
  assert.equal(f.pago, 400);
  assert.equal(f.qtdPagas, 2);
  assert.equal(f.aberto, 50);
  assert.equal(f.total, 450);
  assert.equal(f.totalAnterior, 200);
  assert.deepEqual(f.categorias.map((c) => c.categoria), ["Moradia", "Internet", "Saúde"]);
  assert.match(linhaDoFechamento(f), /setembro fechou: R\$\s?400,00 pagos · R\$\s?50,00 ficaram em aberto/);
});

test("datas em Sao Paulo e mes anterior na virada do ano", () => {
  assert.equal(diaEmSaoPaulo("2026-10-03T02:59:00.000Z"), "2026-10-02");
  assert.equal(diaEmSaoPaulo("2026-10-03T03:00:00.000Z"), "2026-10-03");
  assert.equal(mesAnterior("2026-01"), "2025-12");
});
