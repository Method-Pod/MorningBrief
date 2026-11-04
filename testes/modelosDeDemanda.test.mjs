import { test } from "node:test";
import assert from "node:assert/strict";

import {
  acharModelo,
  demandaDoModelo,
  diasAte,
  limparChecklist,
  modeloDaDemanda,
  somarDias,
} from "../src/lib/modelosDeDemanda.ts";

const modelo = {
  id: "m1",
  user_id: "u1",
  nome: "Carrossel",
  titulo: "",
  descricao: "Roteiro no Drive",
  cliente_id: "c1",
  projeto_id: null,
  priority: "high",
  checklist: ["Roteiro", "Design", " ", "design", "Aprovação"],
  links: ["https://drive.google.com/x"],
  prazo_dias: 3,
  created_at: "",
};

test("datas: somar dias atravessa mes e ano, e diasAte e o inverso", () => {
  assert.equal(somarDias("2026-12-30", 3), "2027-01-02");
  assert.equal(somarDias("2026-03-01", -1), "2026-02-28");
  assert.equal(diasAte("2026-11-03", "2026-11-06"), 3);
  assert.equal(diasAte("2026-11-03", "2026-11-01"), null, "data passada nao vira prazo");
  assert.equal(diasAte("2026-11-03", ""), null);
});

test("a demanda do modelo: prazo contado de hoje, titulo cai no nome, checklist limpo", () => {
  const d = demandaDoModelo(modelo, "2026-11-03");
  assert.equal(d.title, "Carrossel");
  assert.equal(d.due_date, "2026-11-06");
  assert.equal(d.priority, "high");
  assert.deepEqual(d.checklist, ["Roteiro", "Design", "Aprovação"]);
  assert.equal(demandaDoModelo({ ...modelo, prazo_dias: null }, "2026-11-03").due_date, null);
});

test("o modelo da demanda: limpa o que vem do formulario", () => {
  const m = modeloDaDemanda(
    {
      title: "  Thumb EP  ",
      description: "",
      cliente_id: "",
      projeto_id: "",
      priority: "medium",
      links: [" https://a.com ", ""],
      checklist: ["Capa", "", "capa"],
    },
    "  Thumb  ",
    999
  );
  assert.equal(m.nome, "Thumb");
  assert.equal(m.titulo, "Thumb EP");
  assert.equal(m.cliente_id, null);
  assert.deepEqual(m.links, ["https://a.com"]);
  assert.deepEqual(m.checklist, ["Capa"]);
  assert.equal(m.prazo_dias, 365, "prazo tem teto");
});

test("acha o modelo pelo nome sem ligar para acento e maiuscula", () => {
  assert.equal(acharModelo([{ nome: "Aprovação" }], "aprovacao ").nome, "Aprovação");
  assert.equal(acharModelo([{ nome: "Carrossel" }], "Reels"), undefined);
  assert.deepEqual(limparChecklist(["a", "A", " b "]), ["a", "b"]);
});
