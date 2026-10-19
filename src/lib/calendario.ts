/**
 * A conta de um calendário de mês, sem Date como intermediário de texto.
 *
 * Tudo aqui entra e sai como "aaaa-mm-dd". A conversão para `Date` acontece
 * só por dentro, e sempre pelo construtor de ano/mês/dia — nunca por
 * `new Date("2026-10-19")`, que o JavaScript lê como UTC e devolve o dia 18
 * para quem está em São Paulo. Foi esse o erro que já tinha feito uma série
 * de eventos andar um dia a cada edição; ver `serieDeEventos`.
 */

const dois = (n: number) => String(n).padStart(2, "0");

/** "2026-10-19" → [2026, 10, 19] */
const partes = (iso: string) => [
  Number(iso.slice(0, 4)),
  Number(iso.slice(5, 7)),
  Number(iso.slice(8, 10)),
];

/** Data local → "aaaa-mm-dd". */
export const paraISO = (d: Date) =>
  `${d.getFullYear()}-${dois(d.getMonth() + 1)}-${dois(d.getDate())}`;

/** O mês de uma data: "2026-10-19" → "2026-10". */
export const mesDe = (iso: string) => iso.slice(0, 7);

/** O mesmo dia, `n` dias adiante (ou atrás, com n negativo). */
export function somarDias(iso: string, n: number) {
  const [a, m, d] = partes(iso);
  return paraISO(new Date(a, m - 1, d + n));
}

/**
 * O mês vizinho: "2026-10" + 1 → "2026-11".
 *
 * Em `Date(ano, mes, 1)` o mês 12 vira janeiro do ano seguinte sozinho, que é
 * justamente o que se quer na virada de dezembro.
 */
export function mesVizinho(ym: string, n: number) {
  const a = Number(ym.slice(0, 4));
  const m = Number(ym.slice(5, 7));
  const d = new Date(a, m - 1 + n, 1);
  return `${d.getFullYear()}-${dois(d.getMonth() + 1)}`;
}

/**
 * As seis semanas que o calendário desenha para um mês.
 *
 * Sempre 42 dias, e não "os dias do mês": uma grade que muda de altura faz o
 * popover pular de tamanho ao trocar de mês, e o botão que estava debaixo do
 * cursor sai de lugar. Os dias de fora do mês vêm junto e a tela os pinta
 * apagados.
 *
 * Começa no domingo porque é assim que o calendário do app já mostra a
 * semana (`WEEKDAYS_SIGLA` começa em D).
 */
export function gradeDoMes(ym: string): string[] {
  const a = Number(ym.slice(0, 4));
  const m = Number(ym.slice(5, 7));
  const primeiro = new Date(a, m - 1, 1);
  const inicio = new Date(a, m - 1, 1 - primeiro.getDay());
  return Array.from({ length: 42 }, (_, i) =>
    paraISO(new Date(inicio.getFullYear(), inicio.getMonth(), inicio.getDate() + i))
  );
}

/** O dia está dentro do mês que a grade representa? */
export const doMes = (iso: string, ym: string) => iso.startsWith(ym);

/**
 * O mesmo dia do mês, `n` meses adiante, encolhido quando o mês é curto.
 *
 * É o que a seta de mês do calendário faz: 31 de janeiro com a seta para a
 * frente vira 28 de fevereiro, e não 3 de março — que é o que `Date` faz
 * sozinho quando o dia não existe no mês de destino.
 */
export function mesAdianteNoDia(iso: string, n: number) {
  const [a, m, d] = partes(iso);
  const ultimo = new Date(a, m - 1 + n + 1, 0).getDate();
  return paraISO(new Date(a, m - 1 + n, Math.min(d, ultimo)));
}
