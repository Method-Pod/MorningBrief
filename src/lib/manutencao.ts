import type { SupabaseClient } from "@supabase/supabase-js";
import type { Bill, RecurringTask } from "./types";
import { isDueOn } from "./recurring";
import { todayISO } from "./format";

const DIA = 86_400_000;
const pad = (n: number) => String(n).padStart(2, "0");

const paraData = (iso: string) => new Date(iso.slice(0, 10) + "T00:00:00");
const paraISO = (d: Date) =>
  `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;

/**
 * A mesma data, `n` meses adiante, encolhida quando o mês de destino é curto.
 *
 * Duplica `mesesAdiante` de components/ContasExtras de propósito: este módulo
 * roda também no servidor, na rota do cron, e importar de um componente
 * "use client" arrastaria React para lá.
 */
const mesesAdiante = (iso: string, n: number) => {
  const [y, m, d] = iso.slice(0, 10).split("-").map(Number);
  const alvo = m - 1 + n;
  const ano = y + Math.floor(alvo / 12);
  const mes = (alvo % 12) + 1;
  const ultimo = new Date(ano, mes, 0).getDate();
  return `${ano}-${pad(mes)}-${pad(Math.min(d, ultimo))}`;
};

const mesDe = (iso: string) => iso.slice(0, 7);

const mesSeguinte = (mes: string) => {
  const [y, m] = mes.split("-").map(Number);
  return m === 12 ? `${y + 1}-01` : `${y}-${pad(m + 1)}`;
};

const distanciaEmMeses = (de: string, para: string) => {
  const [ay, am] = de.split("-").map(Number);
  const [by, bm] = para.split("-").map(Number);
  return (by - ay) * 12 + (bm - am);
};

/** Janela da reposição de recorrências perdidas, em dias. */
export const JANELA_REPOSICAO = 7;

/* ------------------------------ contas fixas ------------------------------ */

/**
 * Garante que cada conta fixa tenha o lançamento do mês que vem.
 *
 * Só o mês que vem, e não vários de uma vez: lançar seis meses à frente enche
 * o banco de linhas que ninguém vai olhar hoje e deixa a lista pesada. Como
 * isto roda todo dia, na virada de cada mês o seguinte aparece sozinho — o
 * resultado prático é uma fila sempre de um mês, sem acumular.
 *
 * A série é identificada pela descrição, que é o que liga os lançamentos neste
 * modelo. O novo lançamento copia valor, categoria e observações do mais
 * recente da série, e nasce em aberto.
 *
 * Devolve quantos lançamentos foram criados, ou null se falhou.
 */
export async function lancarProximoMesDasFixas(
  supabase: SupabaseClient,
  opcoes: { userId?: string; hoje?: string } = {}
): Promise<number | null> {
  const hoje = opcoes.hoje ?? todayISO();
  const alvo = mesSeguinte(mesDe(hoje));

  let consulta = supabase.from("bills").select("*").eq("recurring", true);
  if (opcoes.userId) consulta = consulta.eq("user_id", opcoes.userId);
  const { data, error } = await consulta;
  if (error) return null;

  const contas = (data as Bill[]) ?? [];
  if (!contas.length) return 0;

  /* Última ocorrência de cada série, e se o mês alvo já existe. */
  const ultima = new Map<string, Bill>();
  const jaTem = new Set<string>();
  contas.forEach((b) => {
    if (mesDe(b.due_date) === alvo) jaTem.add(b.description);
    const atual = ultima.get(b.description);
    if (!atual || b.due_date > atual.due_date) ultima.set(b.description, b);
  });

  const novas = [...ultima.values()]
    .filter((b) => !jaTem.has(b.description))
    .map((b) => {
      const n = distanciaEmMeses(mesDe(b.due_date), alvo);
      /*
       * n <= 0 significa que a série já passou do mês alvo — acontece quando
       * alguém lançou meses à frente na mão. Nada a fazer.
       */
      if (n <= 0) return null;
      return {
        user_id: b.user_id,
        description: b.description,
        amount: Number(b.amount),
        due_date: mesesAdiante(b.due_date, n),
        category: b.category,
        status: "pending",
        notes: b.notes,
        recurring: true,
        paid_at: null,
      };
    })
    .filter((x): x is NonNullable<typeof x> => x !== null);

  if (!novas.length) return 0;

  const { data: criadas, error: erroInsert } = await supabase
    .from("bills")
    .insert(novas)
    .select("id");

  /* 23505: o índice único pegou uma corrida entre duas abas. Já existe, tudo
     bem — não é falha. */
  if (erroInsert) return erroInsert.code === "23505" ? 0 : null;
  return criadas?.length ?? 0;
}

/* --------------------------- demandas recorrentes --------------------------- */

/**
 * Cria as demandas recorrentes dos dias em que o app ficou fechado.
 *
 * Antes só o dia de hoje era materializado: um fim de semana sem abrir o app
 * apagava, em silêncio, as demandas que a regra teria gerado. Agora a janela
 * volta até sete dias.
 *
 * A janela é limitada de propósito. Sem limite, voltar de duas semanas de
 * férias despejaria dezenas de demandas atrasadas de uma vez, e uma lista que
 * ninguém consegue encarar é tão inútil quanto a demanda perdida.
 *
 * As datas são avaliadas em ordem, atualizando `last_run_on` a cada acerto, para
 * que quinzenal, trimestral e anual respeitem o intervalo mínimo dentro da
 * própria janela.
 *
 * A reivindicação é um compare-and-swap: o update só encontra a linha se
 * `last_run_on` ainda for o valor que lemos. Duas abas abertas disputam e só
 * uma leva, como já acontecia com a materialização de hoje.
 *
 * Devolve quantas demandas foram criadas, ou null se falhou.
 */
export async function reporRecorrentesPerdidas(
  supabase: SupabaseClient,
  opcoes: { userId?: string; hoje?: string } = {}
): Promise<number | null> {
  const hoje = opcoes.hoje ?? todayISO();

  let consulta = supabase
    .from("recurring_tasks")
    .select("*")
    .eq("active", true);
  if (opcoes.userId) consulta = consulta.eq("user_id", opcoes.userId);
  const { data, error } = await consulta;
  if (error) return null;

  const regras = (data as RecurringTask[]) ?? [];
  if (!regras.length) return 0;

  let criadas = 0;

  for (const r of regras) {
    const datas = datasPendentes(r, hoje);
    if (!datas.length) continue;

    /* Compare-and-swap na regra antes de inserir. */
    const alvo = datas[datas.length - 1];
    let claim = supabase
      .from("recurring_tasks")
      .update({ last_run_on: alvo })
      .eq("id", r.id);
    claim =
      r.last_run_on === null
        ? claim.is("last_run_on", null)
        : claim.eq("last_run_on", r.last_run_on);

    const { data: ganhou } = await claim.select("id");
    if (!ganhou || !ganhou.length) continue;

    const { error: erroInsert } = await supabase.from("tasks").insert(
      datas.map((d) => ({
        user_id: r.user_id,
        title: r.title,
        description: r.description,
        client: r.client,
        priority: r.priority,
        status: "todo",
        due_date: d,
        origin_id: r.id,
      }))
    );

    if (erroInsert) {
      /* 23505 = tasks_origin_day_uniq: a demanda daquele dia já existe. */
      if (erroInsert.code === "23505") continue;
      /* Devolve a reivindicação para a próxima passada tentar de novo. */
      await supabase
        .from("recurring_tasks")
        .update({ last_run_on: r.last_run_on })
        .eq("id", r.id);
      continue;
    }
    criadas += datas.length;
  }

  return criadas;
}

/**
 * As datas, dentro da janela, em que a regra deveria ter gerado demanda.
 *
 * Exportada para poder ser testada sem banco.
 */
export function datasPendentes(
  r: RecurringTask,
  hoje: string,
  janela = JANELA_REPOSICAO
): string[] {
  const fim = paraData(hoje);
  const limite = new Date(fim.getTime() - janela * DIA);
  const desdeUltimo = r.last_run_on
    ? new Date(paraData(r.last_run_on).getTime() + DIA)
    : limite;
  const inicio = desdeUltimo > limite ? desdeUltimo : limite;

  const datas: string[] = [];
  let ultimo = r.last_run_on;

  for (let t = inicio.getTime(); t <= fim.getTime(); t += DIA) {
    const iso = paraISO(new Date(t));
    if (isDueOn({ ...r, last_run_on: ultimo }, iso)) {
      datas.push(iso);
      ultimo = iso;
    }
  }
  return datas;
}
