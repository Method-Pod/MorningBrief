import type { SupabaseClient } from "@supabase/supabase-js";
import { brl, todayISO } from "../format";
import { diaDeManutencao } from "../viradaDoDia";
import { paraEditor, textoDaNota } from "../notas";
import { COR_PADRAO, ehAbatida, PRIORITY_LABEL, restanteDe, STATUS_LABEL, type Priority, type TaskStatus } from "../types";
import { pedeChecklistCompleto } from "../regraDoChecklist";
import { acharModelo, demandaDoModelo, somarDias, type ModeloDeDemanda } from "../modelosDeDemanda";
import { gravarEnergia } from "../registroDoDia";
import { lerDadosDaSemana, montarRevisao, semanaDe } from "../revisaoDaSemana";
import { lerPadroes } from "../padroes";

/*
 * O que o Claude pode fazer no app, pela rota /api/mcp.
 *
 * Escolha dele: ler, criar e editar -- NUNCA apagar. Não há ferramenta de
 * exclusão aqui, e nenhuma faz delete.
 *
 * Tudo roda com a chave de serviço, que passa por cima do RLS. Por isso cada
 * consulta leva `user_id` explícito (o `uid` da chave conferida na rota), e
 * cada edição filtra por `id` E `user_id`: um id de outra pessoa simplesmente
 * não acha nada. O teste `mcp.test.mjs` confere isso com duas pessoas no
 * banco de mentira.
 *
 * Cada função devolve texto em português, curto, com os ids que o Claude
 * precisa para a próxima chamada. Erro de uso (cliente que não existe,
 * checklist incompleto) volta como texto explicando o que fazer -- é o
 * Claude que vai ler e perguntar à pessoa.
 */

export type Ctx = { sb: SupabaseClient; uid: string };

export class ErroDeUso extends Error {}

/* ------------------------------ apoio ------------------------------ */

const chave = (s: string) =>
  s.normalize("NFD").replace(/[̀-ͯ]/g, "").trim().toLowerCase();

/** Acha pelo nome: igual primeiro, depois "começa com", depois "contém". */
export function acharPorNome<T extends { nome: string }>(lista: T[], nome: string): T | null {
  const alvo = chave(nome);
  if (!alvo) return null;
  const iguais = lista.filter((x) => chave(x.nome) === alvo);
  if (iguais.length === 1) return iguais[0];
  const comeca = lista.filter((x) => chave(x.nome).startsWith(alvo));
  if (comeca.length === 1) return comeca[0];
  const contem = lista.filter((x) => chave(x.nome).includes(alvo));
  return contem.length === 1 ? contem[0] : null;
}

const DATA = /^\d{4}-\d{2}-\d{2}$/;
const HORA = /^([01]\d|2[0-3]):[0-5]\d$/;

function conferirData(v: string | undefined, campo: string) {
  if (v != null && !DATA.test(v)) throw new ErroDeUso(`${campo} precisa estar no formato AAAA-MM-DD.`);
}

const dataBR = (iso: string | null | undefined) => {
  if (!iso) return "sem prazo";
  const [a, m, d] = iso.slice(0, 10).split("-");
  return `${d}/${m}/${a}`;
};

async function clientesEProjetos({ sb, uid }: Ctx) {
  const [c, p] = await Promise.all([
    sb.from("clientes").select("id, nome").eq("user_id", uid).order("nome"),
    sb.from("projetos").select("id, nome, cliente_id").eq("user_id", uid).order("nome"),
  ]);
  return {
    clientes: (c.data ?? []) as { id: string; nome: string }[],
    projetos: (p.data ?? []) as { id: string; nome: string; cliente_id: string }[],
  };
}

/** Resolve "Bia" e "Bio link" para os ids do cadastro, ou explica o que existe. */
async function resolverCliente(ctx: Ctx, cliente?: string, projeto?: string) {
  if (!cliente) return { cliente_id: null, projeto_id: null, texto: "" };
  const { clientes, projetos } = await clientesEProjetos(ctx);
  const c = acharPorNome(clientes, cliente);
  if (!c)
    throw new ErroDeUso(
      `Cliente "${cliente}" não encontrado. Clientes cadastrados: ${
        clientes.map((x) => x.nome).join(", ") || "nenhum"
      }. Pergunte à pessoa qual é.`
    );
  if (!projeto) return { cliente_id: c.id, projeto_id: null, texto: c.nome };
  const doCliente = projetos.filter((p) => p.cliente_id === c.id);
  const p = acharPorNome(doCliente, projeto);
  if (!p)
    throw new ErroDeUso(
      `Projeto "${projeto}" não encontrado em ${c.nome}. Projetos: ${
        doCliente.map((x) => x.nome).join(", ") || "nenhum"
      }.`
    );
  return { cliente_id: c.id, projeto_id: p.id, texto: `${c.nome} - ${p.nome}` };
}

type LinhaDemanda = {
  id: string;
  title: string;
  client: string | null;
  priority: Priority;
  status: TaskStatus;
  due_date: string | null;
  due_time: string | null;
};

const linhaDaDemanda = (t: LinhaDemanda) =>
  `- [${t.id}] ${t.title}${t.client ? ` — ${t.client}` : ""} · ${dataBR(t.due_date)}${
    t.due_time ? ` ${t.due_time.slice(0, 5)}` : ""
  } · ${STATUS_LABEL[t.status] ?? t.status} · ${PRIORITY_LABEL[t.priority] ?? t.priority}`;

/* ------------------------------ resumo ------------------------------ */

export async function resumoDeHoje(ctx: Ctx): Promise<string> {
  const { sb, uid } = ctx;
  const hoje = todayISO();
  const em7 = somarDias(hoje, 7);
  const [dem, contas, eventos, reg] = await Promise.all([
    sb
      .from("tasks")
      .select("id, title, client, priority, status, due_date, due_time, arquivada_em")
      .eq("user_id", uid)
      .neq("status", "done")
      .lte("due_date", hoje)
      .order("due_date"),
    sb
      .from("bills")
      .select("id, description, amount, paid_amount, due_date")
      .eq("user_id", uid)
      .eq("status", "pending")
      .lte("due_date", em7)
      .order("due_date"),
    sb
      .from("events")
      .select("title, start_at, all_day, location, cancelado")
      .eq("user_id", uid)
      .gte("start_at", `${hoje}T00:00:00-03:00`)
      .lte("start_at", `${hoje}T23:59:59-03:00`)
      .order("start_at"),
    sb.from("registro_do_dia").select("energia").eq("user_id", uid).eq("dia", diaDeManutencao()),
  ]);
  const demandas = ((dem.data ?? []) as (LinhaDemanda & { arquivada_em?: string | null })[]).filter(
    (t) => !t.arquivada_em
  );
  const atrasadas = demandas.filter((t) => (t.due_date ?? "") < hoje);
  const deHoje = demandas.filter((t) => t.due_date === hoje);
  const listaContas = (contas.data ?? []) as {
    id: string;
    description: string;
    amount: number;
    paid_amount: number | null;
    due_date: string;
  }[];
  const evs = ((eventos.data ?? []) as { title: string; start_at: string; all_day: boolean; location: string; cancelado?: boolean }[]).filter(
    (e) => !e.cancelado
  );
  const energia = (reg.data as { energia: number | null }[] | null)?.[0]?.energia ?? null;

  const hora = (iso: string) =>
    new Intl.DateTimeFormat("pt-BR", { timeZone: "America/Sao_Paulo", hour: "2-digit", minute: "2-digit" }).format(new Date(iso));

  return [
    `Hoje é ${dataBR(hoje)}.${energia ? ` Energia marcada: ${energia}/5.` : ""}`,
    "",
    `Demandas de hoje (${deHoje.length}):`,
    ...(deHoje.length ? deHoje.map(linhaDaDemanda) : ["- nenhuma"]),
    "",
    `Demandas atrasadas (${atrasadas.length}):`,
    ...(atrasadas.length ? atrasadas.map(linhaDaDemanda) : ["- nenhuma"]),
    "",
    `Contas em aberto até ${dataBR(em7)} (${listaContas.length}):`,
    ...(listaContas.length
      ? listaContas.map(
          (b) =>
            `- [${b.id}] ${b.description} · ${brl(restanteDe(b))} · vence ${dataBR(b.due_date)}${
              b.due_date < hoje ? " (VENCIDA)" : b.due_date === hoje ? " (hoje)" : ""
            }`
        )
      : ["- nenhuma"]),
    "",
    `Agenda de hoje (${evs.length}):`,
    ...(evs.length
      ? evs.map((e) => `- ${e.all_day ? "dia todo" : hora(e.start_at)} ${e.title}${e.location ? ` (${e.location})` : ""}`)
      : ["- nada"]),
  ].join("\n");
}

/* ------------------------------ demandas ------------------------------ */

export async function listarDemandas(
  ctx: Ctx,
  a: { status?: "abertas" | TaskStatus; cliente?: string; ate?: string; busca?: string; limite?: number }
): Promise<string> {
  conferirData(a.ate, "ate");
  let q = ctx.sb
    .from("tasks")
    .select("id, title, client, cliente_id, priority, status, due_date, due_time, arquivada_em")
    .eq("user_id", ctx.uid);
  if (!a.status || a.status === "abertas") q = q.neq("status", "done");
  else q = q.eq("status", a.status);
  if (a.ate) q = q.lte("due_date", a.ate);
  if (a.busca) q = q.ilike("title", `%${a.busca.replace(/[%_]/g, "")}%`);
  if (a.cliente) {
    const r = await resolverCliente(ctx, a.cliente);
    q = q.eq("cliente_id", r.cliente_id as string);
  }
  const { data, error } = await q.order("due_date", { ascending: true, nullsFirst: false }).limit(Math.min(a.limite ?? 40, 100));
  if (error) throw new Error(error.message);
  const linhas = ((data ?? []) as (LinhaDemanda & { arquivada_em?: string | null })[]).filter((t) => !t.arquivada_em);
  return linhas.length ? [`${linhas.length} demanda(s):`, ...linhas.map(linhaDaDemanda)].join("\n") : "Nenhuma demanda encontrada.";
}

export async function criarDemanda(
  ctx: Ctx,
  a: {
    titulo?: string;
    cliente?: string;
    projeto?: string;
    prazo?: string;
    hora?: string;
    prioridade?: Priority;
    descricao?: string;
    links?: string[];
    checklist?: string[];
    modelo?: string;
  }
): Promise<string> {
  const { sb, uid } = ctx;
  conferirData(a.prazo, "prazo");
  if (a.hora && !HORA.test(a.hora)) throw new ErroDeUso("hora precisa estar no formato HH:MM.");

  /* O modelo é a base; o que vier na chamada passa por cima dele. */
  let base: ReturnType<typeof demandaDoModelo> | null = null;
  if (a.modelo) {
    const { data } = await sb.from("modelos_de_demanda").select("*").eq("user_id", uid);
    const lista = (data ?? []) as ModeloDeDemanda[];
    const m = acharModelo(lista, a.modelo) ?? acharPorNome(lista, a.modelo);
    if (!m)
      throw new ErroDeUso(
        `Modelo "${a.modelo}" não encontrado. Modelos: ${lista.map((x) => x.nome).join(", ") || "nenhum"}.`
      );
    base = demandaDoModelo(m, todayISO());
  }

  const titulo = (a.titulo ?? base?.title ?? "").trim();
  if (!titulo) throw new ErroDeUso("Falta o título da demanda.");

  let cliente = { cliente_id: base?.cliente_id ?? null, projeto_id: base?.projeto_id ?? null, texto: "" };
  if (a.cliente) cliente = await resolverCliente(ctx, a.cliente, a.projeto);
  else if (cliente.cliente_id) {
    const { clientes, projetos } = await clientesEProjetos(ctx);
    const c = clientes.find((x) => x.id === cliente.cliente_id);
    const p = projetos.find((x) => x.id === cliente.projeto_id);
    cliente = { cliente_id: c?.id ?? null, projeto_id: c && p ? p.id : null, texto: c ? (p ? `${c.nome} - ${p.nome}` : c.nome) : "" };
  }

  const links = (a.links ?? base?.links ?? []).map((l) => l.trim()).filter(Boolean);
  const linha = {
    user_id: uid,
    title: titulo,
    description: (a.descricao ?? base?.description ?? "").trim(),
    client: cliente.texto,
    cliente_id: cliente.cliente_id,
    projeto_id: cliente.projeto_id,
    priority: a.prioridade ?? base?.priority ?? "medium",
    status: "todo" as TaskStatus,
    due_date: a.prazo ?? base?.due_date ?? null,
    due_time: a.hora ?? null,
    ...(links.length ? { links } : {}),
  };
  const { data, error } = await sb.from("tasks").insert(linha).select("id");
  if (error) throw new Error(error.message);
  const id = (data as { id: string }[])[0].id;

  const itens = (a.checklist ?? base?.checklist ?? []).map((t) => t.trim()).filter(Boolean);
  if (itens.length) {
    const { error: e2 } = await sb
      .from("task_items")
      .insert(itens.map((title, position) => ({ user_id: uid, task_id: id, title, done: false, position })));
    if (e2) return `Demanda criada [${id}], mas o checklist não gravou: ${e2.message}`;
  }
  return `Demanda criada [${id}]: ${titulo}${cliente.texto ? ` — ${cliente.texto}` : ""} · ${dataBR(linha.due_date)}${
    itens.length ? ` · checklist com ${itens.length} itens` : ""
  }.`;
}

export async function atualizarDemanda(
  ctx: Ctx,
  a: {
    id: string;
    titulo?: string;
    prazo?: string | null;
    hora?: string | null;
    prioridade?: Priority;
    descricao?: string;
    status?: TaskStatus;
    confirmar_checklist?: boolean;
  }
): Promise<string> {
  const { sb, uid } = ctx;
  if (a.prazo) conferirData(a.prazo, "prazo");
  if (a.hora && !HORA.test(a.hora)) throw new ErroDeUso("hora precisa estar no formato HH:MM.");

  const { data: achadas } = await sb
    .from("tasks")
    .select("id, title, status, completed_at")
    .eq("user_id", uid)
    .eq("id", a.id);
  const t = (achadas as { id: string; title: string; status: TaskStatus; completed_at: string | null }[] | null)?.[0];
  if (!t) throw new ErroDeUso(`Demanda ${a.id} não encontrada. Use listar_demandas para ver os ids.`);

  const mudanca: Record<string, unknown> = {};
  if (a.titulo !== undefined) mudanca.title = a.titulo.trim();
  if (a.prazo !== undefined) mudanca.due_date = a.prazo;
  if (a.hora !== undefined) mudanca.due_time = a.hora;
  if (a.prioridade) mudanca.priority = a.prioridade;
  if (a.descricao !== undefined) mudanca.description = a.descricao.trim();

  if (a.status && a.status !== t.status) {
    /* A mesma regra da tela: Revisão e Concluída pedem o checklist inteiro. */
    if (pedeChecklistCompleto(a.status)) {
      const { data: itens } = await sb
        .from("task_items")
        .select("id, title, done")
        .eq("user_id", uid)
        .eq("task_id", t.id);
      const abertos = ((itens ?? []) as { id: string; title: string; done: boolean }[]).filter((i) => !i.done);
      if (abertos.length && !a.confirmar_checklist)
        return `Não mudei: "${t.title}" tem ${abertos.length} item(ns) do checklist em aberto (${abertos
          .map((i) => i.title)
          .join("; ")}). Pergunte à pessoa se pode concluir esses itens; se sim, chame de novo com confirmar_checklist: true.`;
      if (abertos.length) {
        const { error } = await sb
          .from("task_items")
          .update({ done: true })
          .eq("user_id", uid)
          .in("id", abertos.map((i) => i.id));
        if (error) throw new Error(error.message);
      }
    }
    mudanca.status = a.status;
    mudanca.completed_at = a.status === "done" ? (t.completed_at ?? new Date().toISOString()) : null;
  }

  if (!Object.keys(mudanca).length) return "Nada para mudar.";
  const { data, error } = await sb.from("tasks").update(mudanca).eq("user_id", uid).eq("id", t.id).select("id");
  if (error) throw new Error(error.message);
  if (!(data as unknown[] | null)?.length) throw new Error("Nada foi gravado.");
  return `Demanda atualizada [${t.id}]: ${String(mudanca.title ?? t.title)}${
    mudanca.status ? ` · agora em ${STATUS_LABEL[mudanca.status as TaskStatus]}` : ""
  }.`;
}

/* ------------------------------ contas ------------------------------ */

export async function listarContas(
  ctx: Ctx,
  a: { mes?: string; situacao?: "abertas" | "pagas" | "vencidas" | "todas" }
): Promise<string> {
  const mes = a.mes ?? todayISO().slice(0, 7);
  if (!/^\d{4}-\d{2}$/.test(mes)) throw new ErroDeUso("mes precisa estar no formato AAAA-MM.");
  const hoje = todayISO();
  const [ano, m] = mes.split("-").map(Number);
  const fim = new Date(Date.UTC(ano, m, 0)).toISOString().slice(0, 10);
  let q = ctx.sb
    .from("bills")
    .select("id, description, amount, paid_amount, due_date, status, category")
    .eq("user_id", ctx.uid)
    .gte("due_date", `${mes}-01`)
    .lte("due_date", fim);
  if (a.situacao === "abertas") q = q.eq("status", "pending");
  if (a.situacao === "pagas") q = q.eq("status", "paid");
  if (a.situacao === "vencidas") q = q.eq("status", "pending").lt("due_date", hoje);
  const { data, error } = await q.order("due_date");
  if (error) throw new Error(error.message);
  const contas = (data ?? []) as {
    id: string;
    description: string;
    amount: number;
    paid_amount: number | null;
    due_date: string;
    status: "pending" | "paid";
    category: string;
  }[];
  if (!contas.length) return `Nenhuma conta em ${mes}.`;
  const total = contas.reduce((s, b) => s + Number(b.amount), 0);
  return [
    `${contas.length} conta(s) em ${mes}, total ${brl(total)}:`,
    ...contas.map(
      (b) =>
        `- [${b.id}] ${b.description} · ${brl(Number(b.amount))} · vence ${dataBR(b.due_date)} · ${
          b.status === "paid" ? "paga" : b.due_date < hoje ? "VENCIDA" : "em aberto"
        }${b.status === "pending" && ehAbatida(b) ? ` (falta ${brl(restanteDe(b))})` : ""} · ${b.category}`
    ),
  ].join("\n");
}

export async function criarConta(
  ctx: Ctx,
  a: { descricao: string; valor: number; vencimento: string; categoria?: string; observacoes?: string }
): Promise<string> {
  conferirData(a.vencimento, "vencimento");
  if (!a.descricao.trim()) throw new ErroDeUso("Falta a descrição da conta.");
  if (!(a.valor >= 0)) throw new ErroDeUso("O valor precisa ser um número maior ou igual a zero.");
  const { data, error } = await ctx.sb
    .from("bills")
    .insert({
      user_id: ctx.uid,
      description: a.descricao.trim(),
      amount: Math.round(a.valor * 100) / 100,
      due_date: a.vencimento,
      category: a.categoria?.trim() || "Outros",
      notes: a.observacoes?.trim() ?? "",
      status: "pending",
    })
    .select("id");
  if (error) throw new Error(error.message);
  return `Conta criada [${(data as { id: string }[])[0].id}]: ${a.descricao.trim()} · ${brl(a.valor)} · vence ${dataBR(a.vencimento)}.`;
}

export async function marcarContaPaga(ctx: Ctx, a: { id: string }): Promise<string> {
  const { sb, uid } = ctx;
  const { data: achadas } = await sb
    .from("bills")
    .select("id, description, amount, paid_amount, status")
    .eq("user_id", uid)
    .eq("id", a.id);
  const b = (achadas as { id: string; description: string; amount: number; paid_amount: number | null; status: string }[] | null)?.[0];
  if (!b) throw new ErroDeUso(`Conta ${a.id} não encontrada. Use listar_contas para ver os ids.`);
  if (b.status === "paid") return `"${b.description}" já estava paga.`;
  /* Como o botão da tela: numa conta abatida, quitar leva o abatido ao total. */
  const { data, error } = await sb
    .from("bills")
    .update({
      status: "paid",
      paid_at: new Date().toISOString(),
      ...(ehAbatida(b) ? { paid_amount: Number(b.amount) } : {}),
    })
    .eq("user_id", uid)
    .eq("id", b.id)
    .select("id");
  if (error) throw new Error(error.message);
  if (!(data as unknown[] | null)?.length) throw new Error("Nada foi gravado.");
  return `Conta marcada como paga: ${b.description} (${brl(Number(b.amount))}).`;
}

/* ------------------------------ agenda ------------------------------ */

export async function listarEventos(ctx: Ctx, a: { de?: string; ate?: string }): Promise<string> {
  const de = a.de ?? todayISO();
  const ate = a.ate ?? somarDias(de, 7);
  conferirData(de, "de");
  conferirData(ate, "ate");
  const { data, error } = await ctx.sb
    .from("events")
    .select("title, start_at, end_at, all_day, location, cancelado")
    .eq("user_id", ctx.uid)
    .gte("start_at", `${de}T00:00:00-03:00`)
    .lte("start_at", `${ate}T23:59:59-03:00`)
    .order("start_at");
  if (error) throw new Error(error.message);
  const evs = ((data ?? []) as { title: string; start_at: string; all_day: boolean; location: string; cancelado?: boolean }[]).filter(
    (e) => !e.cancelado
  );
  const quando = (iso: string, diaTodo: boolean) =>
    new Intl.DateTimeFormat("pt-BR", {
      timeZone: "America/Sao_Paulo",
      weekday: "short",
      day: "2-digit",
      month: "2-digit",
      ...(diaTodo ? {} : { hour: "2-digit", minute: "2-digit" }),
    }).format(new Date(iso));
  return evs.length
    ? [`${evs.length} evento(s) de ${dataBR(de)} a ${dataBR(ate)}:`, ...evs.map((e) => `- ${quando(e.start_at, e.all_day)}${e.all_day ? " (dia todo)" : ""} ${e.title}${e.location ? ` — ${e.location}` : ""}`)].join("\n")
    : `Nada na agenda de ${dataBR(de)} a ${dataBR(ate)}.`;
}

export async function criarEvento(
  ctx: Ctx,
  a: { titulo: string; inicio: string; fim?: string; dia_inteiro?: boolean; local?: string; descricao?: string }
): Promise<string> {
  const LOCAL = /^\d{4}-\d{2}-\d{2}(T([01]\d|2[0-3]):[0-5]\d)?$/;
  if (!LOCAL.test(a.inicio)) throw new ErroDeUso("inicio precisa ser AAAA-MM-DD ou AAAA-MM-DDTHH:MM (horário de Brasília).");
  if (a.fim && !LOCAL.test(a.fim)) throw new ErroDeUso("fim precisa ser AAAA-MM-DDTHH:MM (horário de Brasília).");
  const diaTodo = a.dia_inteiro ?? !a.inicio.includes("T");
  const instante = (v: string) => new Date(`${v.includes("T") ? v : `${v}T00:00`}:00-03:00`).toISOString();
  const { error } = await ctx.sb.from("events").insert({
    user_id: ctx.uid,
    title: a.titulo.trim(),
    description: a.descricao?.trim() ?? "",
    start_at: instante(a.inicio),
    end_at: a.fim ? instante(a.fim) : null,
    all_day: diaTodo,
    location: a.local?.trim() ?? "",
    color: COR_PADRAO,
    recurrence: "none",
  });
  if (error) throw new Error(error.message);
  return `Evento criado: ${a.titulo.trim()} · ${dataBR(a.inicio.slice(0, 10))}${diaTodo ? " (dia todo)" : ` ${a.inicio.slice(11, 16)}`}.`;
}

/* ------------------------------ anotações e referências ------------------------------ */

export async function listarAnotacoes(ctx: Ctx, a: { busca?: string }): Promise<string> {
  const { data, error } = await ctx.sb
    .from("notes")
    .select("id, title, content, updated_at")
    .eq("user_id", ctx.uid)
    .order("updated_at", { ascending: false })
    .limit(200);
  if (error) throw new Error(error.message);
  const alvo = a.busca ? chave(a.busca) : "";
  const notas = ((data ?? []) as { id: string; title: string; content: string }[])
    .map((n) => ({ ...n, texto: textoDaNota(n.content) }))
    .filter((n) => !alvo || chave(`${n.title} ${n.texto}`).includes(alvo))
    .slice(0, 20);
  return notas.length
    ? notas.map((n) => `- [${n.id}] ${n.title || "Sem título"}: ${n.texto.slice(0, 240)}${n.texto.length > 240 ? "…" : ""}`).join("\n")
    : "Nenhuma anotação encontrada.";
}

export async function criarAnotacao(ctx: Ctx, a: { titulo: string; texto: string }): Promise<string> {
  const { data, error } = await ctx.sb
    .from("notes")
    .insert({ user_id: ctx.uid, title: a.titulo.trim(), content: paraEditor(a.texto), color: COR_PADRAO })
    .select("id");
  if (error) throw new Error(error.message);
  return `Anotação criada [${(data as { id: string }[])[0].id}]: ${a.titulo.trim() || "Sem título"}.`;
}

export async function criarReferencia(ctx: Ctx, a: { titulo: string; url?: string; notas?: string }): Promise<string> {
  if (a.url && !/^https?:\/\//i.test(a.url)) throw new ErroDeUso("url precisa começar com http:// ou https://.");
  const { error } = await ctx.sb.from("referencias").insert({
    user_id: ctx.uid,
    name: a.titulo.trim(),
    url: a.url?.trim() || null,
    notes: a.notas?.trim() || null,
  });
  if (error) {
    if (error.code === "23505") return "Essa referência (mesmo link) já estava salva.";
    throw new Error(error.message);
  }
  return `Referência salva: ${a.titulo.trim()}. A prévia da imagem aparece quando ela for aberta no app.`;
}

/* ------------------------------ cadastro ------------------------------ */

export async function listarClientes(ctx: Ctx): Promise<string> {
  const { clientes, projetos } = await clientesEProjetos(ctx);
  if (!clientes.length) return "Nenhum cliente cadastrado.";
  return clientes
    .map((c) => {
      const ps = projetos.filter((p) => p.cliente_id === c.id).map((p) => p.nome);
      return `- ${c.nome}${ps.length ? `: ${ps.join(", ")}` : ""}`;
    })
    .join("\n");
}

export async function listarModelos(ctx: Ctx): Promise<string> {
  const { data, error } = await ctx.sb.from("modelos_de_demanda").select("*").eq("user_id", ctx.uid).order("nome");
  if (error) throw new Error(error.message);
  const lista = (data ?? []) as ModeloDeDemanda[];
  return lista.length
    ? lista
        .map(
          (m) =>
            `- ${m.nome}: "${m.titulo || m.nome}" · ${PRIORITY_LABEL[m.priority]} · ${
              m.prazo_dias == null ? "sem prazo" : `prazo em ${m.prazo_dias} dia(s)`
            }${m.checklist.length ? ` · checklist: ${m.checklist.join("; ")}` : ""}`
        )
        .join("\n")
    : "Nenhum modelo de demanda. Eles são criados no app, em Demandas, com 'Salvar como modelo'.";
}

/* ------------------------------ crescimento ------------------------------ */

export async function marcarHabito(ctx: Ctx, a: { habito: string; dia?: string }): Promise<string> {
  const dia = a.dia ?? todayISO();
  conferirData(dia, "dia");
  if (dia > todayISO()) throw new ErroDeUso("Não dá para marcar um hábito num dia que ainda não chegou.");
  const { data } = await ctx.sb.from("habits").select("id, name").eq("user_id", ctx.uid).eq("active", true);
  const lista = ((data ?? []) as { id: string; name: string }[]).map((h) => ({ ...h, nome: h.name }));
  const h = acharPorNome(lista, a.habito);
  if (!h) throw new ErroDeUso(`Hábito "${a.habito}" não encontrado. Hábitos ativos: ${lista.map((x) => x.nome).join(", ") || "nenhum"}.`);
  const { error } = await ctx.sb.from("habit_logs").insert({ user_id: ctx.uid, habit_id: h.id, day: dia });
  if (error && error.code !== "23505") throw new Error(error.message);
  return `${h.nome} marcado em ${dataBR(dia)}.`;
}

export async function registrarEnergia(ctx: Ctx, a: { nivel: number }): Promise<string> {
  if (!Number.isInteger(a.nivel) || a.nivel < 1 || a.nivel > 5) throw new ErroDeUso("nivel vai de 1 a 5.");
  const { error } = await gravarEnergia(ctx.sb, a.nivel, { userId: ctx.uid });
  if (error) throw new Error(error.message);
  return `Energia de hoje marcada: ${a.nivel}/5.`;
}

export async function revisaoDaSemana(ctx: Ctx, a: { data?: string }): Promise<string> {
  const ref = a.data ?? somarDias(todayISO(), -1);
  conferirData(ref, "data");
  const semana = semanaDe(ref);
  const r = montarRevisao(await lerDadosDaSemana(ctx.sb, { ...semana, hoje: todayISO(), userId: ctx.uid }), semana);
  return [
    `Semana de ${dataBR(r.de)} a ${dataBR(r.ate)}.`,
    `Concluídas: ${r.concluidas.length}${r.porCliente.length ? ` (${r.porCliente.map((c) => `${c.cliente}: ${c.n}`).join(", ")})` : ""}.`,
    `Atrasadas agora: ${r.atrasadas.n}${r.atrasadas.titulos.length ? ` (${r.atrasadas.titulos.join("; ")})` : ""}.`,
    `Hábitos: ${r.habitos.map((h) => `${h.nome} ${h.feitos}/${h.meta}`).join(", ") || "nenhum ativo"}.`,
    `Páginas lidas: ${r.paginas}. Aulas assistidas: ${r.aulas}. Pago na semana: ${brl(r.pago)}.`,
    `Energia média: ${r.energia.media == null ? "sem registro" : r.energia.media.toFixed(1).replace(".", ",")}.`,
    `Semana seguinte: ${r.proxima.demandas} demanda(s) com prazo, ${r.proxima.contas} conta(s) (${brl(r.proxima.totalContas)}), ${r.proxima.eventos} evento(s).`,
    "Obs.: o histórico de concluídas começa a ser guardado a partir da primeira limpeza depois do SQL do registro.",
  ].join("\n");
}

export async function padroes(ctx: Ctx): Promise<string> {
  const r = await lerPadroes(ctx.sb, { hoje: diaDeManutencao(), userId: ctx.uid });
  if (r.semTabela) return "O registro do dia ainda não existe no banco (falta rodar o SQL).";
  if (!r.padroes.length)
    return `Nenhum padrão forte ainda. Dias de registro: ${r.diasDeRegistro}; dias com energia marcada: ${r.diasComEnergia}.`;
  return [
    "Padrões (não são prova de causa):",
    ...r.padroes.map((p) => `- ${p.texto} (${p.comDias} dias com, ${p.semDias} sem)`),
  ].join("\n");
}
