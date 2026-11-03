import { test } from "node:test";
import assert from "node:assert/strict";

import { criarFilaPorChave } from "../src/lib/filaPorChave.ts";

/*
 * Um "banco" cujos pedidos demoram e podem terminar fora de ordem -- o que
 * acontecia no clique duplo em Habitos. Cada pedido fica pendurado ate o
 * teste soltar.
 */
function bancoLento(inicial = false) {
  const estado = { marcado: inicial, pedidos: [], emVoo: 0, maxEmVoo: 0 };
  const gravar = (marcar) =>
    new Promise((ok) => {
      estado.emVoo++;
      estado.maxEmVoo = Math.max(estado.maxEmVoo, estado.emVoo);
      estado.pedidos.push(() => {
        estado.marcado = marcar;
        estado.emVoo--;
        ok(true);
      });
    });
  const soltarTodos = async () => {
    while (estado.pedidos.length) {
      estado.pedidos.shift()();
      await new Promise((r) => setTimeout(r, 0));
    }
  };
  return { estado, gravar, soltarTodos };
}

test("dois toques rapidos: nunca dois pedidos juntos, e o banco termina como a tela", async () => {
  const fila = criarFilaPorChave();
  const b = bancoLento(false);
  /* toque 1: marcar; toque 2, antes do banco responder: desmarcar */
  const r1 = fila.pedir("h1|2026-11-03", true, b.gravar);
  const r2 = fila.pedir("h1|2026-11-03", false, b.gravar);
  await b.soltarTodos();
  assert.equal(await r1, true);
  assert.equal(await r2, true);
  assert.equal(b.estado.maxEmVoo, 1, "a mesma bolinha nunca tem dois pedidos em voo");
  assert.equal(b.estado.marcado, false, "a tela mostra desmarcado, o banco tem de estar desmarcado");
});

test("tres toques rapidos: vale o ultimo", async () => {
  const fila = criarFilaPorChave();
  const b = bancoLento(false);
  fila.pedir("k", true, b.gravar);
  fila.pedir("k", false, b.gravar);
  const ultimo = fila.pedir("k", true, b.gravar);
  await b.soltarTodos();
  await ultimo;
  assert.equal(b.estado.marcado, true);
  assert.equal(fila.emCurso("k"), false, "a fila esvazia ao terminar");
});

test("bolinhas diferentes andam em paralelo", async () => {
  const fila = criarFilaPorChave();
  const b = bancoLento(false);
  fila.pedir("a", true, b.gravar);
  fila.pedir("b", true, b.gravar);
  assert.equal(b.estado.emVoo, 2);
  await b.soltarTodos();
});

test("falha no banco: a promessa diz false e a fila libera a chave", async () => {
  const fila = criarFilaPorChave();
  const ok = await fila.pedir("k", true, async () => false);
  assert.equal(ok, false);
  assert.equal(fila.emCurso("k"), false);
});
