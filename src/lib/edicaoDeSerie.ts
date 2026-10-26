import type { Bill } from "./types";
import { mesAdianteNoDia } from "./calendario";
import type { Ajuste } from "./ajusteDeParcelas";

/*
 * A edição de uma conta inteira, em Gerenciar contas.
 *
 * Antes o lápis abria um formulário com "Vale para a conta toda" e "Só do mês
 * de nov": um valor e um dia que se copiavam para os meses em aberto. Não
 * havia como mudar a data ou o valor de UMA parcela, nem o tamanho do
 * parcelamento. Agora a conta abre como a Nova conta: valor e vencimento são
 * a base, e cada lançamento em aberto aparece numa grade com data e valor
 * próprios.
 */

/** Uma linha da grade. `id` nulo é parcela que ainda vai ser criada. */
export type LinhaDaGrade = {
  id: string | null;
  /** número da parcela; nulo em conta que não é parcelada */
  no: number | null;
  due_date: string;
  amount: number;
  paga: boolean;
};

const ISO = /^\d{4}-\d{2}-\d{2}$/;

/**
 * Separa o que se edita do que só se consulta.
 *
 * Editáveis: as em aberto. Pagas: só para ver -- valor de conta que já saiu
 * do bolso é histórico, e misturar uma paga na grade faria o valor de base
 * reescrevê-la. A exceção é a conta sem nada em aberto (a fixa do mês já
 * paga): aí o lançamento clicado entra sozinho, senão valor e vencimento não
 * teriam o que editar.
 *
 * Parcela sem número (lançada antes de existir a coluna) recebe a posição na
 * ordem das datas.
 */
export function montarGrade(contas: Bill[], contaId: string, parcelada: boolean) {
  const porData = [...contas].sort((a, b) => a.due_date.localeCompare(b.due_date));
  const linhas = porData.map((b, i) => ({
    conta: b,
    linha: {
      id: b.id,
      no: parcelada ? (b.installment_no ?? i + 1) : null,
      due_date: b.due_date.slice(0, 10),
      amount: Number(b.amount),
      paga: b.status === "paid",
    } as LinhaDaGrade,
  }));
  if (parcelada) linhas.sort((a, b) => (a.linha.no ?? 0) - (b.linha.no ?? 0));

  const nadaEmAberto = linhas.every(({ conta }) => conta.status === "paid");
  const editaveis: LinhaDaGrade[] = [];
  const pagas: LinhaDaGrade[] = [];
  linhas.forEach(({ conta, linha }) =>
    (conta.status !== "paid" || (nadaEmAberto && conta.id === contaId)
      ? editaveis
      : pagas
    ).push(linha)
  );
  return { editaveis, pagas };
}

const tocado = (editadas: Ajuste[], i: number, campo: "valor" | "data") =>
  editadas.includes(`${i}:${campo}` as Ajuste);

/**
 * O valor novo vai para toda linha cujo valor ninguém mexeu à mão.
 *
 * Só o valor: mudar o valor não mexe em data nenhuma. Uma conta antiga com um
 * mês pulado continua com o mês pulado.
 */
export const aplicarValor = (linhas: LinhaDaGrade[], valor: number, editadas: Ajuste[]) =>
  !Number.isFinite(valor) || valor < 0
    ? linhas
    : linhas.map((l, i) => (tocado(editadas, i, "valor") ? l : { ...l, amount: valor }));

/**
 * O vencimento é a data da 1ª linha, e as não mexidas seguem um mês por vez.
 *
 * A 1ª nunca fica para trás, mesmo marcada: ela É o vencimento (a regra da
 * Nova conta). As outras ajustadas à mão ficam como estão.
 */
export const aplicarVencimento = (
  linhas: LinhaDaGrade[],
  vencimento: string,
  editadas: Ajuste[]
) =>
  !ISO.test(vencimento)
    ? linhas
    : linhas.map((l, i) =>
        i > 0 && tocado(editadas, i, "data")
          ? l
          : { ...l, due_date: mesAdianteNoDia(vencimento, i) }
      );

/**
 * O parcelamento com um total novo.
 *
 * Aumentar cria parcelas no fim, a partir do vencimento e do valor de base.
 * Diminuir tira as últimas em aberto -- e recusa quando o corte alcançaria uma
 * parcela paga, porque apagar pagamento não é o que "mudar o total" quer dizer.
 */
export function ajustarTotal(
  linhas: LinhaDaGrade[],
  pagas: LinhaDaGrade[],
  total: number,
  base: { vencimento: string; valor: number }
): { erro: string } | { linhas: LinhaDaGrade[]; removidas: LinhaDaGrade[] } {
  if (!Number.isInteger(total) || total < 1)
    return { erro: "O total de parcelas precisa ser 1 ou mais." };

  const maiorPaga = [...pagas, ...linhas]
    .filter((l) => l.paga)
    .reduce((m, l) => Math.max(m, l.no ?? 0), 0);
  if (total < maiorPaga)
    return {
      erro: `A parcela ${maiorPaga} já está paga: o total não pode ser menor que ${maiorPaga}.`,
    };

  const ficam = linhas.filter((l) => (l.no ?? 0) <= total);
  const removidas = linhas.filter((l) => (l.no ?? 0) > total && l.id);
  const ultimo = Math.max(
    maiorPaga,
    ...pagas.map((p) => p.no ?? 0),
    ...ficam.map((l) => l.no ?? 0)
  );
  /* As novas seguem a última que fica, um mês por vez; sem nenhuma, o
     vencimento. Contar a partir do vencimento erraria numa conta cujas datas
     já não andam de mês em mês. */
  const ancora = ficam[ficam.length - 1]?.due_date;
  const novas: LinhaDaGrade[] = Array.from(
    { length: Math.max(0, total - ultimo) },
    (_, j) => ({
      id: null,
      no: ultimo + 1 + j,
      due_date:
        ancora && ISO.test(ancora)
          ? mesAdianteNoDia(ancora, j + 1)
          : ISO.test(base.vencimento)
            ? mesAdianteNoDia(base.vencimento, j)
            : "",
      amount: Number.isFinite(base.valor) ? base.valor : 0,
      paga: false,
    })
  );
  return { linhas: [...ficam, ...novas], removidas };
}

/** Marcas de ajuste que ainda apontam para uma linha existente. */
export const editadasDentro = (editadas: Ajuste[], n: number) =>
  editadas.filter((a) => Number(a.split(":")[0]) < n);
