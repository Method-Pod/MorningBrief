import type { Bill } from "./types";

/*
 * O fechamento do mês, como números.
 *
 * Função pura, sem banco: quem busca as contas é o Início, que mostra o
 * cartão de fechamento na primeira semana do mês. Aqui só se calcula — e é
 * isso que os testes cobrem.
 */

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
