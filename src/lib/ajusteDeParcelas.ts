import { valorDigitado } from "./format";

/**
 * O que falta para abrir a grade de "ajustar cada uma", dito em uma frase.
 *
 * A grade parte do valor, do vencimento e de quantas parcelas são — sem eles
 * não há o que repartir. Antes, clicar sem o valor preenchido punha uma
 * mensagem genérica ("informe valor, vencimento e o total de parcelas") no pé
 * do formulário, abaixo de Observações e fora da vista: o botão parecia
 * simplesmente não funcionar. Agora a frase diz QUAL campo falta, e a tela a
 * mostra colada no botão.
 *
 * Devolve `null` quando está tudo certo para ajustar.
 */
export function oQueFaltaParaAjustar(
  f: {
    amount: string;
    due_date: string;
    installment_no: number | string;
    installment_total: number | string;
  },
  maxParcelas: number
): string | null {
  const valor = valorDigitado(f.amount);
  if (!Number.isFinite(valor) || valor <= 0)
    return "Preencha o valor primeiro: as parcelas partem dele.";
  if (!/^\d{4}-\d{2}-\d{2}$/.test(f.due_date))
    return "Escolha o vencimento primeiro: é a data da primeira parcela.";
  const de = Number(f.installment_no);
  const total = Number(f.installment_total);
  if (!Number.isFinite(total) || total < 1)
    return "Informe quantas parcelas são, no campo De.";
  if (!Number.isFinite(de) || de < 1 || de > total)
    return "A parcela atual precisa estar entre 1 e o total.";
  if (total > maxParcelas) return `O total de parcelas vai até ${maxParcelas}.`;
  return null;
}

type ParcelaAjustavel = { due_date: string; amount: number };

/**
 * Uma marca de ajuste à mão: a linha E o campo.
 *
 * Campo por campo, e não linha inteira: quem muda só o VALOR da parcela 2
 * continua querendo que a data dela acompanhe o primeiro vencimento. Marcando
 * a linha toda, mudar o vencimento para o dia 25 deixava justo a parcela 2 no
 * dia 20 -- foi assim que apareceu no teste.
 */
export type Ajuste = `${number}:valor` | `${number}:data`;

/**
 * Quais campos da grade a pessoa mexeu à mão, somados aos que já estavam.
 *
 * Compara a lista de antes com a de depois de cada edição. É o que permite
 * recalcular a grade quando a BASE muda -- o valor, o primeiro vencimento,
 * "de cada parcela" ou "o total a dividir" -- sem atropelar o que foi
 * digitado.
 */
export function marcarEditadas(
  antes: ParcelaAjustavel[],
  depois: ParcelaAjustavel[],
  editadas: Ajuste[]
): Ajuste[] {
  const conjunto = new Set<Ajuste>(editadas);
  depois.forEach((p, i) => {
    const a = antes[i];
    if (!a || a.due_date !== p.due_date) conjunto.add(`${i}:data`);
    if (!a || Number(a.amount) !== Number(p.amount)) conjunto.add(`${i}:valor`);
  });
  return [...conjunto].sort();
}

/**
 * A grade recalculada a partir de uma base nova, preservando o que foi
 * ajustado à mão.
 *
 * Antes a grade só mudava de TAMANHO: trocar para "o total a dividir" com
 * quatro parcelas de R$ 300 abertas deixava as quatro em R$ 300 e a soma em
 * R$ 1.200, quando os R$ 300 tinham passado a ser o total -- gravaria quatro
 * vezes o que a pessoa disse. Agora todo campo que ninguém tocou segue a
 * base; só os editados ficam como estão.
 */
export function recomporParcelas<T extends ParcelaAjustavel>(
  base: T[],
  atuais: T[],
  editadas: Ajuste[]
): T[] {
  const tocados = new Set(editadas);
  return base.map((b, i) => {
    const a = atuais[i];
    if (!a) return b;
    return {
      ...b,
      due_date: tocados.has(`${i}:data`) ? a.due_date : b.due_date,
      amount: tocados.has(`${i}:valor`) ? a.amount : b.amount,
    };
  });
}
