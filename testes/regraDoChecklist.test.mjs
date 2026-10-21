import { test } from "node:test";
import assert from "node:assert/strict";

import {
  avisoDoChecklist,
  confirmacaoDoChecklist,
  pedeChecklistCompleto,
} from "../src/lib/regraDoChecklist.ts";

test("o pedido dele: revisao pede o checklist completo, como concluida", () => {
  assert.equal(pedeChecklistCompleto("review"), true);
  assert.equal(pedeChecklistCompleto("done"), true);
});

test("voltar para a fazer ou em andamento nao pede nada", () => {
  assert.equal(pedeChecklistCompleto("todo"), false);
  assert.equal(pedeChecklistCompleto("doing"), false);
});

test("a confirmacao diz para onde a demanda vai", () => {
  const r = confirmacaoDoChecklist("Reels", 2, "review");
  assert.equal(
    r.texto,
    '"Reels" tem 2 itens do checklist em aberto. Concluir eles e enviar a demanda para revisão?'
  );
  assert.equal(r.titulo, "Enviar para revisão");
  assert.equal(r.rotulo, "Concluir itens e enviar");
});

test("a confirmacao de concluir continua a mesma de antes", () => {
  const r = confirmacaoDoChecklist("Reels", 1, "done");
  assert.equal(
    r.texto,
    '"Reels" tem 1 item do checklist em aberto. Concluir ele e a demanda?'
  );
  assert.equal(r.titulo, "Concluir a demanda");
  assert.equal(r.rotulo, "Concluir tudo");
});

test("o aviso do formulario segue o status escolhido", () => {
  assert.equal(
    avisoDoChecklist(3, "review"),
    "Faltam 3 itens do checklist. Marque tudo antes de enviar a demanda para revisão."
  );
  assert.equal(
    avisoDoChecklist(1, "done"),
    "Falta 1 item do checklist. Marque tudo antes de concluir a demanda."
  );
});
