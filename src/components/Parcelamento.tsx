"use client";

import * as React from "react";
import { RotateCcw } from "lucide-react";
import { brl, dataCurta } from "@/lib/format";
import { mesesAdiante } from "./ContasExtras";
import { Input, cx } from "./ui";

export type Parcela = { due_date: string; amount: number };

/** Teto de parcelas: cada uma vira uma linha no banco. */
export const MAX_PARCELAS = 120;

/**
 * Divide um total em `n` parcelas de centavos fechados.
 *
 * A sobra da divisão vai para a primeira parcela, e não é espalhada: assim as
 * seguintes ficam todas com o mesmo valor, que é o que se confere na lista mês
 * a mês. R$ 1.000 em 3 vira 333,34 + 333,33 + 333,33.
 */
export const repartir = (total: number, n: number): number[] => {
  const centavos = Math.round(total * 100);
  const base = Math.floor(centavos / n);
  const sobra = centavos - base * n;
  return Array.from({ length: n }, (_, i) => (base + (i === 0 ? sobra : 0)) / 100);
};

/**
 * As parcelas de `de` até `total`, uma por mês a partir de `primeiroVencimento`.
 *
 * As datas saem de mesesAdiante a partir da primeira, e não de somar um mês
 * repetidamente: encadear perde o dia ao passar por um mês curto, e uma parcela
 * dia 31 ficaria presa no dia 28 depois de fevereiro.
 */
export function parcelasIguais({
  primeiroVencimento,
  valor,
  valorTotal,
  de,
  total,
}: {
  primeiroVencimento: string;
  valor: number;
  /** true: `valor` é o total a dividir. false: é o valor de cada parcela. */
  valorTotal: boolean;
  de: number;
  total: number;
}): Parcela[] {
  /*
   * A divisão usa o total de parcelas, não quantas serão criadas: "1000 em 10x"
   * é R$ 100 por mês mesmo se as duas primeiras foram pagas fora do app e só 8
   * entrarem aqui.
   */
  const fatias = valorTotal ? repartir(valor, total) : null;
  return Array.from({ length: total - de + 1 }, (_, i) => ({
    due_date: mesesAdiante(primeiroVencimento, i),
    amount: fatias ? fatias[de - 1 + i] : valor,
  }));
}

const paraCampo = (n: number) => n.toFixed(2).replace(".", ",");
const paraNumero = (s: string) =>
  parseFloat(String(s).replace(/\./g, "").replace(",", "."));

/**
 * Lista de parcelas com data e valor editáveis, uma linha por parcela.
 *
 * O modo "iguais" cobre o caso comum e este cobre o resto: entrada maior,
 * parcela que caiu num feriado, reajuste no meio do parcelamento. Vem
 * preenchida com o cálculo automático, então ajustar uma não obriga a digitar
 * as outras.
 */
export function EditorParcelas({
  parcelas,
  de,
  onChange,
  onRecalcular,
}: {
  parcelas: Parcela[];
  /** número da primeira parcela da lista, para rotular 3/10 corretamente */
  de: number;
  onChange: (p: Parcela[]) => void;
  onRecalcular: () => void;
}) {
  const total = de + parcelas.length - 1;
  const soma = parcelas.reduce((t, p) => t + (Number(p.amount) || 0), 0);

  /* Rascunho por linha: guardar só o número faria "1," virar "1" no meio da
     digitação, e o campo perderia a vírgula a cada tecla. */
  const [rascunhos, setRascunhos] = React.useState<Record<number, string>>({});
  React.useEffect(() => setRascunhos({}), [parcelas.length, de]);

  const mudar = (i: number, campo: keyof Parcela, valor: string) => {
    const copia = parcelas.map((p, j) =>
      j === i
        ? {
            ...p,
            [campo]: campo === "amount" ? (paraNumero(valor) || 0) : valor,
          }
        : p
    );
    if (campo === "amount") setRascunhos((r) => ({ ...r, [i]: valor }));
    onChange(copia);
  };

  return (
    <div className="mt-3.5 border-t border-line-soft pt-3.5">
      <div className="mb-2 flex items-center justify-between gap-2">
        <span className="text-[11px] font-medium uppercase tracking-wider text-fg-mute">
          {parcelas.length} {parcelas.length === 1 ? "parcela" : "parcelas"}
        </span>
        <button
          type="button"
          onClick={onRecalcular}
          className="inline-flex items-center gap-1 text-[11px] font-semibold text-brand-400 transition-opacity hover:opacity-70"
        >
          <RotateCcw size={11} />
          recalcular iguais
        </button>
      </div>

      <ul className="flex max-h-[38vh] flex-col overflow-y-auto pr-0.5">
        {parcelas.map((p, i) => (
          <li
            key={i}
            className="flex items-center gap-2 border-b border-line-soft py-1.5 last:border-0"
          >
            <span className="w-[42px] shrink-0 text-[11px] font-bold text-fg-mute tnum">
              {de + i}/{total}
            </span>
            <Input
              type="date"
              value={p.due_date}
              onChange={(e) => mudar(i, "due_date", e.target.value)}
              aria-label={`Vencimento da parcela ${de + i}`}
              className="h-9 min-w-0 flex-1 px-2 text-[12px]"
            />
            <Input
              inputMode="decimal"
              value={rascunhos[i] ?? paraCampo(Number(p.amount) || 0)}
              onChange={(e) => mudar(i, "amount", e.target.value)}
              aria-label={`Valor da parcela ${de + i}`}
              className="h-9 w-[92px] shrink-0 px-2 text-right text-[12px] tnum"
            />
          </li>
        ))}
      </ul>

      <p
        className={cx(
          "mt-2.5 rounded-[12px] px-3 py-2 text-[11.5px]",
          soma > 0 ? "bg-brand-500/10 text-fg-dim" : "bg-warn/12 text-warn"
        )}
      >
        Soma <span className="font-bold text-fg tnum">{brl(soma)}</span> · de{" "}
        <span className="font-semibold">{dataCurta(parcelas[0].due_date)}</span> a{" "}
        <span className="font-semibold">
          {dataCurta(parcelas[parcelas.length - 1].due_date)}
        </span>
      </p>
    </div>
  );
}
