import type { Bill, CalendarEvent, Task } from "./types";
import { brl } from "./format";

/*
 * O brief da manhã e o fechamento do mês, como texto.
 *
 * Funções puras, sem banco: quem busca os dados é o cron (no servidor, para a
 * notificação das 6h) e o Início (no navegador, para o cartão de
 * fechamento). Aqui só se decide o que dizer — e é isso que os testes cobrem.
 *
 * Tudo em São Paulo, e não no fuso da máquina: o cron roda num servidor em
 * UTC, e às 06:00 daqui ele já está às 09:00. Um evento das 22h de ontem,
 * gravado em UTC, cairia "hoje" se a conta usasse o relógio do servidor.
 */

const FUSO = "America/Sao_Paulo";

const FMT_DIA = new Intl.DateTimeFormat("en-CA", {
  timeZone: FUSO,
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
});
const FMT_HORA = new Intl.DateTimeFormat("pt-BR", {
  timeZone: FUSO,
  hour: "2-digit",
  minute: "2-digit",
});

/** O dia (AAAA-MM-DD) de um instante, em São Paulo. */
export const diaEmSaoPaulo = (iso: string) => FMT_DIA.format(new Date(iso));

const DIA = 86_400_000;
const diasEntre = (de: string, ate: string) =>
  Math.round(
    (new Date(ate.slice(0, 10) + "T00:00:00Z").getTime() -
      new Date(de.slice(0, 10) + "T00:00:00Z").getTime()) /
      DIA
  );

const MESES = [
  "janeiro", "fevereiro", "março", "abril", "maio", "junho",
  "julho", "agosto", "setembro", "outubro", "novembro", "dezembro",
];
export const nomeDoMes = (ym: string) => MESES[Number(ym.slice(5, 7)) - 1] ?? ym;

export const mesAnterior = (ym: string) => {
  const [y, m] = ym.split("-").map(Number);
  return m === 1 ? `${y - 1}-12` : `${y}-${String(m - 1).padStart(2, "0")}`;
};

/* ------------------------------ fechamento ------------------------------ */

export type Fechamento = {
  mes: string;
  pago: number;
  qtdPagas: number;
  /** O que venceu no mês e continua em aberto. */
  aberto: number;
  qtdAbertas: number;
  total: number;
  /** As três categorias que mais pesaram, do maior para o menor. */
  categorias: { categoria: string; valor: number }[];
  /**
   * Total do mês anterior, para comparar; null quando não há base.
   *
   * Com menos de três lançamentos no mês anterior a comparação mente: o app
   * começou no fim de agosto, e setembro aparecia como "+322% em relação a
   * agosto" — que tinha uma conta só.
   */
  totalAnterior: number | null;
};

/**
 * Como o mês fechou — só o lado das contas.
 *
 * Por pedido dele, o app não registra o que entra: fechamento aqui é quanto
 * saiu, o que ficou para trás e para onde foi. O recorte é a data de
 * VENCIMENTO, o mesmo do resumo em Contas a pagar, para os dois lugares
 * nunca discordarem.
 */
export function fechamentoDoMes(contas: Bill[], mes: string): Fechamento {
  const doMes = contas.filter((b) => b.due_date.startsWith(mes));
  const pagas = doMes.filter((b) => b.status === "paid");
  const abertas = doMes.filter((b) => b.status !== "paid");
  const soma = (l: Bill[]) => l.reduce((s, b) => s + Number(b.amount), 0);

  const porCategoria = new Map<string, number>();
  doMes.forEach((b) =>
    porCategoria.set(b.category, (porCategoria.get(b.category) ?? 0) + Number(b.amount))
  );

  const anterior = contas.filter((b) => b.due_date.startsWith(mesAnterior(mes)));

  return {
    mes,
    pago: soma(pagas),
    qtdPagas: pagas.length,
    aberto: soma(abertas),
    qtdAbertas: abertas.length,
    total: soma(doMes),
    categorias: [...porCategoria.entries()]
      .map(([categoria, valor]) => ({ categoria, valor }))
      .sort((a, b) => b.valor - a.valor)
      .slice(0, 3),
    totalAnterior: anterior.length >= 3 ? soma(anterior) : null,
  };
}

/* ------------------------------ brief ------------------------------ */

export type Brief = { titulo: string; corpo: string };

/**
 * O texto da notificação das 6h.
 *
 * Quatro linhas no máximo, que é o que a tela de bloqueio do iPhone mostra
 * sem abrir: demandas do dia, o que vence, a agenda e — só quando há — um
 * aviso. Linha sem conteúdo não entra; "nada vence hoje" não precisa ser
 * dito numa notificação que ele vai ler meio dormindo.
 */
export function montarBrief({
  hoje,
  contas,
  tarefas,
  eventos,
  falhou = false,
}: {
  hoje: string;
  contas: Bill[];
  tarefas: Task[];
  eventos: CalendarEvent[];
  falhou?: boolean;
}): Brief {
  const linhas: string[] = [];

  /* Demandas: as de hoje e as atrasadas, que são as que o "Hoje" do Início mostra. */
  const abertas = tarefas.filter((t) => t.status !== "done" && t.due_date);
  const deHoje = abertas.filter((t) => t.due_date!.slice(0, 10) === hoje);
  const atrasadas = abertas.filter((t) => t.due_date!.slice(0, 10) < hoje);
  if (deHoje.length || atrasadas.length) {
    const partes = [
      deHoje.length ? `${deHoje.length} ${deHoje.length === 1 ? "demanda" : "demandas"} hoje` : "",
      atrasadas.length
        ? `${atrasadas.length} ${atrasadas.length === 1 ? "atrasada" : "atrasadas"}`
        : "",
    ].filter(Boolean);
    linhas.push(`📋 ${partes.join(" · ")}`);
  }

  /* Contas: vencidas e as dos próximos três dias, mais urgente primeiro. */
  const urgentes = contas
    .filter((b) => b.status !== "paid" && diasEntre(hoje, b.due_date) <= 3)
    .sort((a, b) => a.due_date.localeCompare(b.due_date));
  if (urgentes.length) {
    const quando = (b: Bill) => {
      const d = diasEntre(hoje, b.due_date);
      return d < 0 ? "atrasada" : d === 0 ? "hoje" : d === 1 ? "amanhã" : `em ${d}d`;
    };
    const primeiras = urgentes
      .slice(0, 2)
      .map((b) =>
        Number(b.amount) > 0
          ? `${b.description} ${brl(Number(b.amount))} ${quando(b)}`
          : `${b.description} ${quando(b)}`
      );
    const resto = urgentes.length - primeiras.length;
    linhas.push(`💳 ${primeiras.join(" · ")}${resto > 0 ? ` +${resto}` : ""}`);
  }

  /* Agenda de hoje: até dois compromissos com hora. */
  const doDia = eventos
    .filter((e) => !e.cancelado && diaEmSaoPaulo(e.start_at) === hoje)
    .sort((a, b) => a.start_at.localeCompare(b.start_at));
  if (doDia.length) {
    const itens = doDia
      .slice(0, 2)
      .map((e) => (e.all_day ? e.title : `${FMT_HORA.format(new Date(e.start_at))} ${e.title}`));
    const resto = doDia.length - itens.length;
    linhas.push(`📅 ${itens.join(" · ")}${resto > 0 ? ` +${resto}` : ""}`);
  }

  if (falhou) linhas.push("⚠️ A manutenção das 6h falhou — abra o app para conferir.");

  return {
    titulo: "Bom dia ☀️",
    corpo: linhas.length ? linhas.join("\n") : "Dia livre: nada vence e nenhuma demanda para hoje.",
  };
}

/**
 * A linha do fechamento, para o brief do dia 1º.
 */
export function linhaDoFechamento(f: Fechamento): string {
  const partes = [`${nomeDoMes(f.mes)} fechou: ${brl(f.pago)} pagos`];
  if (f.qtdAbertas) partes.push(`${brl(f.aberto)} ficaram em aberto`);
  return `📊 ${partes.join(" · ")}`;
}
