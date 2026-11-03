import { rotuloMes } from "./format";

export type PontoDeGasto = { rotulo: string; valor: number; mesAtual?: boolean };

/**
 * O total de contas de cada mês, de `atras` meses antes do atual até
 * `aFrente` meses depois — os pontos do gráfico "Evolução dos gastos".
 *
 * Um cálculo só para o Financeiro e o Início: os dois gráficos têm de dizer o
 * mesmo número para o mesmo mês. O mês de uma conta é o do vencimento, e todas
 * entram, pagas ou não, como no resumo do mês.
 */
export function evolucaoDosGastos(
  contas: { due_date: string; amount: number | string }[],
  hojeISO: string,
  atras: number,
  aFrente: number
): PontoDeGasto[] {
  const [ano, mes] = hojeISO.slice(0, 7).split("-").map(Number);
  const pontos: PontoDeGasto[] = [];
  for (let i = atras; i >= -aFrente; i--) {
    const d = new Date(ano, mes - 1 - i, 1);
    const ym = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
    pontos.push({
      rotulo: rotuloMes(ym),
      valor: contas
        .filter((b) => b.due_date.startsWith(ym))
        .reduce((s, b) => s + Number(b.amount), 0),
      mesAtual: i === 0,
    });
  }
  return pontos;
}
