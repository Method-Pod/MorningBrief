import { test } from "node:test";
import assert from "node:assert/strict";
import { WebStandardStreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/webStandardStreamableHttp.js";
import { fakeSupabase } from "./apoio/fakeSupabase.mjs";

import { montarServidor } from "../src/lib/mcp/servidor.ts";

/*
 * O servidor do Claude, de ponta a ponta pelo protocolo MCP, com duas
 * pessoas no banco de mentira. A chave de servico do app passa por cima do
 * RLS: o que impede uma pessoa de ver ou mexer nas coisas da outra e so o
 * filtro de user_id em cada consulta. E isso que estes testes cobram.
 */

function banco() {
  return fakeSupabase({
    tasks: [
      { id: "t1", user_id: "u1", title: "Thumb EP 12", client: "Papo de Elite", cliente_id: null, priority: "high", status: "todo", due_date: "2026-11-05", due_time: null, completed_at: null },
      { id: "t2", user_id: "u2", title: "Segredo de outra pessoa", client: "", cliente_id: null, priority: "low", status: "todo", due_date: null, due_time: null, completed_at: null },
    ],
    task_items: [
      { id: "i1", user_id: "u1", task_id: "t1", title: "Capa", done: true, position: 0 },
      { id: "i2", user_id: "u1", task_id: "t1", title: "Revisar texto", done: false, position: 1 },
    ],
    bills: [{ id: "b2", user_id: "u2", description: "Luz da outra pessoa", amount: 100, paid_amount: null, status: "pending", due_date: "2026-11-10" }],
    clientes: [{ id: "c1", user_id: "u1", nome: "Papo de Elite" }],
    projetos: [],
    modelos_de_demanda: [
      { id: "m1", user_id: "u1", nome: "Carrossel", titulo: "Carrossel semanal", descricao: "", cliente_id: "c1", projeto_id: null, priority: "medium", checklist: ["Roteiro", "Design"], links: [], prazo_dias: 2, created_at: "" },
    ],
  });
}

async function chamar(sb, metodo, params = {}) {
  const servidor = montarServidor({ sb, uid: "u1" });
  const transporte = new WebStandardStreamableHTTPServerTransport({ sessionIdGenerator: undefined, enableJsonResponse: true });
  await servidor.connect(transporte);
  const resp = await transporte.handleRequest(
    new Request("http://localhost/api/mcp", {
      method: "POST",
      headers: { "content-type": "application/json", accept: "application/json, text/event-stream" },
      body: JSON.stringify({ jsonrpc: "2.0", id: 1, method: metodo, params }),
    })
  );
  const j = await resp.json();
  if (j.error) throw new Error(JSON.stringify(j.error));
  return j.result;
}

const usar = async (sb, nome, args = {}) => {
  const r = await chamar(sb, "tools/call", { name: nome, arguments: args });
  return { texto: r.content.map((c) => c.text).join("\n"), erro: !!r.isError };
};

test("apresenta-se, e nenhuma ferramenta apaga", async () => {
  const sb = banco();
  const ini = await chamar(sb, "initialize", {
    protocolVersion: "2025-06-18",
    capabilities: {},
    clientInfo: { name: "teste", version: "1" },
  });
  assert.equal(ini.serverInfo.name, "morning-brief");
  const { tools } = await chamar(sb, "tools/list");
  const nomes = tools.map((t) => t.name);
  assert.ok(nomes.includes("criar_demanda") && nomes.includes("revisao_da_semana") && nomes.includes("padroes"));
  assert.deepEqual(nomes.filter((n) => /apag|exclu|delet|remov/.test(n)), []);
  for (const t of tools) assert.equal(t.annotations?.destructiveHint, false, t.name);
});

test("so enxerga as demandas da propria pessoa", async () => {
  const { texto } = await usar(banco(), "listar_demandas");
  assert.match(texto, /Thumb EP 12/);
  assert.doesNotMatch(texto, /Segredo de outra pessoa/);
});

test("nao edita nem paga o que e de outra pessoa", async () => {
  const sb = banco();
  const r1 = await usar(sb, "atualizar_demanda", { id: "t2", titulo: "invadido" });
  assert.match(r1.texto, /não encontrada/);
  assert.equal(sb.banco.tabelas.tasks.find((t) => t.id === "t2").title, "Segredo de outra pessoa");
  const r2 = await usar(sb, "marcar_conta_paga", { id: "b2" });
  assert.match(r2.texto, /não encontrada/);
  assert.equal(sb.banco.tabelas.bills[0].status, "pending");
});

test("concluir com checklist em aberto pede confirmacao, e so entao conclui", async () => {
  const sb = banco();
  const r1 = await usar(sb, "atualizar_demanda", { id: "t1", status: "done" });
  assert.match(r1.texto, /Não mudei.*Revisar texto/s);
  assert.equal(sb.banco.tabelas.tasks[0].status, "todo");
  const r2 = await usar(sb, "atualizar_demanda", { id: "t1", status: "done", confirmar_checklist: true });
  assert.match(r2.texto, /Concluída/);
  assert.equal(sb.banco.tabelas.tasks[0].status, "done");
  assert.ok(sb.banco.tabelas.tasks[0].completed_at);
  assert.ok(sb.banco.tabelas.task_items.every((i) => i.done));
});

test("cria demanda a partir de modelo, com cliente e checklist, para a propria pessoa", async () => {
  const sb = banco();
  const r = await usar(sb, "criar_demanda", { modelo: "carrossel", titulo: "Carrossel Dia do Bullying" });
  assert.equal(r.erro, false, r.texto);
  const nova = sb.banco.tabelas.tasks.find((t) => t.title === "Carrossel Dia do Bullying");
  assert.equal(nova.user_id, "u1");
  assert.equal(nova.cliente_id, "c1");
  assert.equal(nova.client, "Papo de Elite");
  assert.ok(nova.due_date, "prazo veio do modelo");
  const itens = sb.banco.tabelas.task_items.filter((i) => i.task_id === nova.id);
  assert.deepEqual(itens.map((i) => i.title), ["Roteiro", "Design"]);
  assert.ok(itens.every((i) => i.user_id === "u1"));
});

test("cliente que nao existe volta como pergunta, e nada e criado", async () => {
  const sb = banco();
  const antes = sb.banco.tabelas.tasks.length;
  const r = await usar(sb, "criar_demanda", { titulo: "X", cliente: "Cliente Fantasma" });
  assert.equal(r.erro, false, "erro de uso nao e falha: o Claude le e pergunta");
  assert.match(r.texto, /não encontrado.*Papo de Elite/s);
  assert.equal(sb.banco.tabelas.tasks.length, antes);
});

test("todas as outras ferramentas rodam sem quebrar", async () => {
  const sb = banco();
  Object.assign(sb.banco.tabelas, {
    events: [], notes: [], referencias: [], habits: [{ id: "h1", user_id: "u1", name: "Treino", active: true, created_at: "2026-01-01" }],
    habit_logs: [], reading_sessions: [], lessons: [], registro_do_dia: [],
  });
  const chamadas = [
    ["resumo_de_hoje", {}],
    ["listar_contas", {}],
    ["criar_conta", { descricao: "Internet", valor: 120, vencimento: "2026-11-20" }],
    ["listar_eventos", {}],
    ["criar_evento", { titulo: "Gravação Papo de Elite", inicio: "2026-11-06T14:00" }],
    ["listar_anotacoes", { busca: "x" }],
    ["criar_anotacao", { titulo: "Ideias", texto: ["linha 1", "linha 2"].join(String.fromCharCode(10)) }],
    ["criar_referencia", { titulo: "Site bonito", url: "https://exemplo.com" }],
    ["listar_clientes", {}],
    ["listar_modelos", {}],
    ["marcar_habito", { habito: "treino" }],
    ["registrar_energia", { nivel: 4 }],
    ["revisao_da_semana", {}],
    ["padroes", {}],
  ];
  for (const [nome, args] of chamadas) {
    const r = await usar(sb, nome, args);
    assert.equal(r.erro, false, `${nome}: ${r.texto}`);
  }
  assert.equal(sb.banco.tabelas.bills.find((b) => b.description === "Internet").user_id, "u1");
  assert.equal(sb.banco.tabelas.notes[0].content, "<p>linha 1</p><p>linha 2</p>");
  assert.equal(sb.banco.tabelas.events[0].start_at, "2026-11-06T17:00:00.000Z", "14h de Brasília");
  assert.equal(sb.banco.tabelas.habit_logs[0].user_id, "u1");
  assert.equal(sb.banco.tabelas.registro_do_dia[0].energia, 4);
  assert.equal(sb.banco.tabelas.registro_do_dia[0].user_id, "u1");
});
