import { test } from "node:test";
import assert from "node:assert/strict";

import { montarRevisao, semanaDe, semanaEmRevisao } from "../src/lib/revisaoDaSemana.ts";

/* Horas em Sao Paulo (UTC-3), escritas em UTC. 2026-11-08 e domingo. */
const sp = (dia, hora) => new Date(`${dia}T${String(hora + 3).padStart(2, "0")}:00:00Z`);

test("a revisao aparece de domingo 18h ate segunda a noite, e so", () => {
  assert.equal(semanaEmRevisao(sp("2026-11-08", 17)), null, "domingo antes das 18h");
  assert.deepEqual(semanaEmRevisao(sp("2026-11-08", 18)), { de: "2026-11-02", ate: "2026-11-08" });
  assert.deepEqual(semanaEmRevisao(sp("2026-11-09", 9)), { de: "2026-11-02", ate: "2026-11-08" });
  assert.deepEqual(
    semanaEmRevisao(new Date("2026-11-10T02:30:00Z")),
    { de: "2026-11-02", ate: "2026-11-08" },
    "segunda 23h30 em SP"
  );
  assert.equal(semanaEmRevisao(sp("2026-11-10", 9)), null, "terca");
});

test("semanaDe: de segunda a domingo", () => {
  assert.deepEqual(semanaDe("2026-11-05"), { de: "2026-11-02", ate: "2026-11-08" });
  assert.deepEqual(semanaDe("2026-11-08"), { de: "2026-11-02", ate: "2026-11-08" });
  assert.deepEqual(semanaDe("2026-11-09"), { de: "2026-11-09", ate: "2026-11-15" });
});

const conc = (id, dia, cliente_id = "c1") => ({
  id,
  titulo: "T" + id,
  cliente: "",
  cliente_id,
  concluida_em: `${dia}T15:00:00Z`,
});

test("concluidas: registro e vivas juntos sem contar duas vezes, por cliente", () => {
  const r = montarRevisao(
    {
      registro: [
        { dia: "2026-11-03", concluidas: [conc("1", "2026-11-03"), conc("2", "2026-11-03", "c2")], aulas: [], energia: 4 },
        { dia: "2026-11-05", concluidas: [], aulas: [{ id: "a1", titulo: "Aula", concluida_em: "" }], energia: 2 },
        { dia: "2026-10-30", concluidas: [conc("9", "2026-10-30")], aulas: [], energia: 5 },
      ],
      concluidasVivas: [
        { ...conc("2", "2026-11-03", "c2"), dia: "2026-11-03" },
        { ...conc("3", "2026-11-08"), dia: "2026-11-08" },
      ],
      atrasadas: [{ id: "x", title: "Velha", due_date: "2026-10-01" }],
      proximasDemandas: [{ id: "p", title: "P", due_date: "2026-11-10" }],
      habitos: [{ id: "h1", name: "Treino", target_per_week: 3 }],
      marcas: [
        { habit_id: "h1", day: "2026-11-02" },
        { habit_id: "h1", day: "2026-11-04" },
        { habit_id: "h1", day: "2026-11-09" },
      ],
      leituras: [
        { day: "2026-11-03", pages: 20 },
        { day: "2026-11-12", pages: 99 },
      ],
      aulasVivas: [{ id: "a1", title: "Aula", dia: "2026-11-05" }],
      pagas: [
        { amount: 100, paid_amount: null },
        { amount: 50, paid_amount: 50 },
      ],
      contasDaProxima: [{ amount: 80, paid_amount: 30 }],
      eventosDaProxima: 2,
      clientes: new Map([
        ["c1", "Bia"],
        ["c2", "Cadar"],
      ]),
    },
    { de: "2026-11-02", ate: "2026-11-08" }
  );
  assert.equal(r.concluidas.length, 3, "1, 2 e 3; a 2 estava nos dois lugares; a 9 e de outra semana");
  assert.deepEqual(r.porCliente, [
    { cliente: "Bia", n: 2 },
    { cliente: "Cadar", n: 1 },
  ]);
  assert.equal(r.aulas, 1);
  assert.deepEqual(r.habitos, [{ nome: "Treino", feitos: 2, meta: 3 }]);
  assert.equal(r.paginas, 20);
  assert.equal(r.pago, 150);
  assert.equal(r.energia.media, 3);
  assert.deepEqual(r.proxima, { demandas: 1, contas: 1, totalContas: 50, eventos: 2 });
  assert.equal(r.atrasadas.n, 1);
});
