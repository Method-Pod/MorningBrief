import type { SupabaseClient } from "@supabase/supabase-js";
import type { Bill, CalendarEvent, EventRecurrence, RecurringTask } from "./types";
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

/* --------------------------- eventos recorrentes --------------------------- */

/** Último instante do mês seguinte ao de `hoje`: o fim da janela. */
export function fimDaJanelaDeEventos(hoje: string): Date {
  const [y, m] = hoje.split("-").map(Number);
  /* Dia 0 do mês +2 é o último dia do mês +1. */
  return new Date(y, m + 1, 0, 23, 59, 59, 999);
}

/**
 * As próximas ocorrências de um evento que repete, até o fim da janela.
 *
 * Não inclui a data de partida — devolve só o que vem depois dela, que é o que
 * falta criar.
 *
 * A duração é preservada: o fim de cada ocorrência fica à mesma distância do
 * início que no evento original, então uma reunião de uma hora continua de uma
 * hora em todas as repetições.
 *
 * No mensal o dia é preservado e encolhido quando o mês é curto — dia 31 vira
 * 28 em fevereiro. E soma sempre a partir da data de partida, não somando um
 * mês repetidamente: encadear perderia o dia depois de passar por fevereiro.
 */
export function ocorrenciasDeEvento({
  inicio,
  fim,
  recorrencia,
  limite,
}: {
  inicio: string;
  fim: string | null;
  recorrencia: EventRecurrence;
  limite: Date;
}): { start_at: string; end_at: string | null }[] {
  if (recorrencia === "none") return [];

  const base = new Date(inicio);
  const duracao = fim ? new Date(fim).getTime() - base.getTime() : null;
  const saida: { start_at: string; end_at: string | null }[] = [];

  /* Teto de segurança: a janela é de dois meses, então nenhuma regra passa de
     ~10 ocorrências. Sem ele, uma data de partida inválida daria laço infinito. */
  for (let n = 1; n <= 64; n++) {
    let proximo: Date;
    if (recorrencia === "monthly") {
      const alvo = new Date(base);
      alvo.setDate(1);
      alvo.setMonth(base.getMonth() + n);
      const ultimoDia = new Date(
        alvo.getFullYear(),
        alvo.getMonth() + 1,
        0
      ).getDate();
      alvo.setDate(Math.min(base.getDate(), ultimoDia));
      alvo.setHours(base.getHours(), base.getMinutes(), 0, 0);
      proximo = alvo;
    } else {
      const passo = recorrencia === "biweekly" ? 14 : 7;
      proximo = new Date(base.getTime() + n * passo * DIA);
    }

    if (proximo > limite) break;
    saida.push({
      start_at: proximo.toISOString(),
      end_at:
        duracao === null
          ? null
          : new Date(proximo.getTime() + duracao).toISOString(),
    });
  }

  return saida;
}

/**
 * Mantém as repetições do calendário preenchidas até o fim do mês que vem.
 *
 * A janela é de dois meses — o atual e o seguinte — e não de um ano: cada
 * ocorrência é uma linha no banco, e encher doze meses de uma repetição semanal
 * são mais de cinquenta linhas por evento que ninguém vai olhar hoje. Como isto
 * roda todo dia, a janela anda sozinha e o calendário nunca fica vazio à frente.
 *
 * Estende a partir da ÚLTIMA ocorrência de cada série, então apagar uma
 * ocorrência do meio não a faz voltar. Para encerrar uma repetição, exclua a
 * série — é o que o botão de excluir oferece quando o evento tem série.
 *
 * Devolve quantas ocorrências foram criadas, ou null se falhou.
 */
export async function estenderEventosRecorrentes(
  supabase: SupabaseClient,
  opcoes: { userId?: string; hoje?: string } = {}
): Promise<number | null> {
  const hoje = opcoes.hoje ?? todayISO();
  const limite = fimDaJanelaDeEventos(hoje);

  let consulta = supabase
    .from("events")
    .select("*")
    .not("series_id", "is", null)
    .neq("recurrence", "none");
  if (opcoes.userId) consulta = consulta.eq("user_id", opcoes.userId);

  const { data, error } = await consulta;
  /* PGRST204/42703: a migração EVENTOS-RECORRENTES.sql ainda não rodou. Sem
     recorrência não há nada a estender, e o calendário segue funcionando. */
  if (error) return null;

  const eventos = (data as CalendarEvent[]) ?? [];
  if (!eventos.length) return 0;

  /* Última ocorrência de cada série. */
  const ultima = new Map<string, CalendarEvent>();
  eventos.forEach((e) => {
    if (!e.series_id) return;
    const atual = ultima.get(e.series_id);
    if (!atual || e.start_at > atual.start_at) ultima.set(e.series_id, e);
  });

  const novas = [...ultima.values()].flatMap((e) =>
    ocorrenciasDeEvento({
      inicio: e.start_at,
      fim: e.end_at,
      recorrencia: e.recurrence,
      limite,
    }).map((o) => ({
      user_id: e.user_id,
      title: e.title,
      description: e.description,
      all_day: e.all_day,
      color: e.color,
      location: e.location,
      recurrence: e.recurrence,
      series_id: e.series_id,
      ...o,
    }))
  );

  if (!novas.length) return 0;

  const { data: criadas, error: erroInsert } = await supabase
    .from("events")
    .insert(novas)
    .select("id");

  /* 23505 = events_serie_inicio_uniq: outra passada chegou primeiro. */
  if (erroInsert) return erroInsert.code === "23505" ? 0 : null;
  return criadas?.length ?? 0;
}
