import type { SupabaseClient } from "@supabase/supabase-js";
import { FUSO } from "./viradaDoDia";
import { diaDoInstante, juntarPorId, lerRegistro, type Concluida, type RegistroDoDia } from "./registroDoDia";
import { somarDias } from "./modelosDeDemanda";
import { restanteDe } from "./types";

/*
 * A revisão da semana: o cartão que fecha a semana no Início, de domingo às
 * 18h até segunda à noite (escolha dele). Concluído, atrasado, hábitos,
 * leitura, aulas, pagamentos e energia da semana, mais o que vem na próxima.
 *
 * As contas são puras (`montarRevisao`) e a leitura é separada
 * (`lerDadosDaSemana`), para o mesmo cálculo servir ao Início -- com a
 * sessão, pelo RLS -- e ao Claude, com a chave de serviço e o `userId`.
 */

/** Hora e dia da semana em São Paulo. 0 = domingo. */
function agoraEmSP(agora: Date) {
  const p = new Intl.DateTimeFormat("en-CA", {
    timeZone: FUSO,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    hourCycle: "h23",
    weekday: "short",
  }).formatToParts(agora);
  const v = (t: string) => p.find((x) => x.type === t)?.value ?? "";
  const semana = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"].indexOf(v("weekday"));
  return { dia: `${v("year")}-${v("month")}-${v("day")}`, hora: Number(v("hour")), semana };
}

/**
 * A semana em revisão agora, ou nulo fora da janela.
 *
 * Domingo a partir das 18h: a semana que está acabando (segunda a domingo).
 * Segunda o dia todo: a que acabou ontem. No resto da semana, nada.
 */
export function semanaEmRevisao(agora: Date = new Date()): { de: string; ate: string } | null {
  const { dia, hora, semana } = agoraEmSP(agora);
  if (semana === 0 && hora >= 18) return { de: somarDias(dia, -6), ate: dia };
  if (semana === 1) return { de: somarDias(dia, -7), ate: somarDias(dia, -1) };
  return null;
}

/** A semana (segunda a domingo) que contém o dia; para consultar a qualquer hora. */
export function semanaDe(dia: string): { de: string; ate: string } {
  const [a, m, d] = dia.split("-").map(Number);
  const dow = new Date(Date.UTC(a, m - 1, d)).getUTCDay();
  const de = somarDias(dia, -((dow + 6) % 7));
  return { de, ate: somarDias(de, 6) };
}

export type DadosDaSemana = {
  registro: RegistroDoDia[];
  /** Concluídas que ainda não passaram pela limpeza. */
  concluidasVivas: (Concluida & { dia: string })[];
  atrasadas: { id: string; title: string; due_date: string }[];
  proximasDemandas: { id: string; title: string; due_date: string }[];
  habitos: { id: string; name: string; target_per_week: number }[];
  marcas: { habit_id: string; day: string }[];
  leituras: { day: string; pages: number }[];
  aulasVivas: { id: string; title: string; dia: string }[];
  pagas: { amount: number; paid_amount: number | null }[];
  contasDaProxima: { amount: number; paid_amount: number | null }[];
  eventosDaProxima: number;
  clientes: Map<string, string>;
};

export type Revisao = {
  de: string;
  ate: string;
  concluidas: { titulo: string; cliente: string }[];
  porCliente: { cliente: string; n: number }[];
  atrasadas: { n: number; titulos: string[] };
  habitos: { nome: string; feitos: number; meta: number }[];
  paginas: number;
  aulas: number;
  pago: number;
  energia: { media: number | null; dias: number };
  proxima: { demandas: number; contas: number; totalContas: number; eventos: number };
};

/** O dia (YYYY-MM-DD) dentro do intervalo, inclusive nas pontas? */
const dentro = (d: string, de: string, ate: string) => d >= de && d <= ate;

export function montarRevisao(dados: DadosDaSemana, { de, ate }: { de: string; ate: string }): Revisao {
  /* Concluídas: o que a limpeza já guardou mais o que ainda está vivo, sem repetir. */
  let concluidas: Concluida[] = [];
  for (const r of dados.registro) if (dentro(r.dia, de, ate)) concluidas = juntarPorId(concluidas, r.concluidas);
  concluidas = juntarPorId(
    concluidas,
    dados.concluidasVivas.filter((c) => dentro(c.dia, de, ate))
  );
  const nomeDe = (c: Concluida) =>
    (c.cliente_id && dados.clientes.get(c.cliente_id)) || c.cliente?.trim() || "Sem cliente";
  const contagem = new Map<string, number>();
  for (const c of concluidas) contagem.set(nomeDe(c), (contagem.get(nomeDe(c)) ?? 0) + 1);

  let aulas: { id: string }[] = [];
  for (const r of dados.registro) if (dentro(r.dia, de, ate)) aulas = juntarPorId(aulas, r.aulas);
  aulas = juntarPorId(aulas, dados.aulasVivas.filter((a) => dentro(a.dia, de, ate)));

  const energias = dados.registro
    .filter((r) => dentro(r.dia, de, ate) && r.energia != null)
    .map((r) => r.energia as number);

  return {
    de,
    ate,
    concluidas: concluidas.map((c) => ({ titulo: c.titulo, cliente: nomeDe(c) })),
    porCliente: [...contagem.entries()]
      .map(([cliente, n]) => ({ cliente, n }))
      .sort((a, b) => b.n - a.n || a.cliente.localeCompare(b.cliente)),
    atrasadas: {
      n: dados.atrasadas.length,
      titulos: [...dados.atrasadas]
        .sort((a, b) => a.due_date.localeCompare(b.due_date))
        .slice(0, 3)
        .map((t) => t.title),
    },
    habitos: dados.habitos.map((h) => ({
      nome: h.name,
      feitos: new Set(
        dados.marcas.filter((m) => m.habit_id === h.id && dentro(m.day.slice(0, 10), de, ate)).map((m) => m.day.slice(0, 10))
      ).size,
      meta: h.target_per_week,
    })),
    paginas: dados.leituras.filter((l) => dentro(l.day.slice(0, 10), de, ate)).reduce((s, l) => s + (l.pages || 0), 0),
    aulas: aulas.length,
    pago: dados.pagas.reduce((s, b) => s + Number(b.paid_amount ?? b.amount ?? 0), 0),
    energia: {
      media: energias.length ? energias.reduce((s, e) => s + e, 0) / energias.length : null,
      dias: energias.length,
    },
    proxima: {
      demandas: dados.proximasDemandas.length,
      contas: dados.contasDaProxima.length,
      totalContas: dados.contasDaProxima.reduce((s, b) => s + restanteDe(b), 0),
      eventos: dados.eventosDaProxima,
    },
  };
}

/* O dia de uma conclusão é o de manutenção (6h às 6h), o mesmo que o
   registro usa: assim a demanda concluída à 1h cai no mesmo dia antes e
   depois de passar pela limpeza. */
const diaEmSP = diaDoInstante;

/**
 * Lê tudo o que a revisão precisa. Com a chave de serviço, passe `userId`:
 * ela não tem RLS, e cada consulta precisa do filtro.
 */
export async function lerDadosDaSemana(
  supabase: SupabaseClient,
  { de, ate, hoje, userId }: { de: string; ate: string; hoje: string; userId?: string }
): Promise<DadosDaSemana> {
  const da = <T,>(q: T) => (userId ? (q as unknown as { eq: (c: string, v: string) => T }).eq("user_id", userId) : q);
  const inicio = new Date(`${somarDias(de, -1)}T00:00:00Z`).toISOString();
  const fim = new Date(`${somarDias(ate, 2)}T00:00:00Z`).toISOString();
  const proxDe = somarDias(ate, 1);
  const proxAte = somarDias(ate, 7);

  const [registro, vivas, atrasadas, proximas, habitos, marcas, leituras, aulas, pagas, contas, eventos, clientes] =
    await Promise.all([
      lerRegistro(supabase, { de, ate, userId }),
      da(supabase.from("tasks").select("id, title, client, cliente_id, completed_at").eq("status", "done").gte("completed_at", inicio).lt("completed_at", fim)),
      da(supabase.from("tasks").select("id, title, due_date, arquivada_em").neq("status", "done").lt("due_date", hoje)),
      da(supabase.from("tasks").select("id, title, due_date, arquivada_em").neq("status", "done").gte("due_date", proxDe).lte("due_date", proxAte)),
      da(supabase.from("habits").select("id, name, target_per_week").eq("active", true).order("created_at")),
      da(supabase.from("habit_logs").select("habit_id, day").gte("day", de).lte("day", ate)),
      da(supabase.from("reading_sessions").select("day, pages").gte("day", de).lte("day", ate)),
      da(supabase.from("lessons").select("id, title, feita_em").eq("feita", true).gte("feita_em", inicio).lt("feita_em", fim)),
      da(supabase.from("bills").select("amount, paid_amount, paid_at").eq("status", "paid").gte("paid_at", inicio).lt("paid_at", fim)),
      da(supabase.from("bills").select("amount, paid_amount").eq("status", "pending").gte("due_date", proxDe).lte("due_date", proxAte)),
      da(
        supabase
          .from("events")
          .select("id", { count: "exact", head: true })
          .gte("start_at", `${proxDe}T00:00:00-03:00`)
          .lte("start_at", `${proxAte}T23:59:59-03:00`)
          .not("cancelado", "is", true)
      ),
      da(supabase.from("clientes").select("id, nome")),
    ]);

  type Linha = Record<string, unknown>;
  const linhas = (r: { data: unknown }) => ((r.data as Linha[] | null) ?? []);
  const naoArquivada = (t: Linha) => !t.arquivada_em;

  return {
    registro: registro.dias,
    concluidasVivas: linhas(vivas).map((t) => ({
      id: String(t.id),
      titulo: String(t.title ?? ""),
      cliente: String(t.client ?? ""),
      cliente_id: (t.cliente_id as string | null) ?? null,
      concluida_em: String(t.completed_at),
      dia: diaEmSP(String(t.completed_at)),
    })),
    atrasadas: linhas(atrasadas).filter(naoArquivada).map((t) => ({ id: String(t.id), title: String(t.title), due_date: String(t.due_date) })),
    proximasDemandas: linhas(proximas).filter(naoArquivada).map((t) => ({ id: String(t.id), title: String(t.title), due_date: String(t.due_date) })),
    habitos: linhas(habitos) as DadosDaSemana["habitos"],
    marcas: linhas(marcas) as DadosDaSemana["marcas"],
    leituras: linhas(leituras) as DadosDaSemana["leituras"],
    aulasVivas: linhas(aulas).map((a) => ({ id: String(a.id), title: String(a.title ?? ""), dia: diaEmSP(String(a.feita_em)) })),
    pagas: linhas(pagas) as DadosDaSemana["pagas"],
    contasDaProxima: linhas(contas) as DadosDaSemana["contasDaProxima"],
    eventosDaProxima: (eventos as { count: number | null }).count ?? 0,
    clientes: new Map(linhas(clientes).map((c) => [String(c.id), String(c.nome)])),
  };
}
