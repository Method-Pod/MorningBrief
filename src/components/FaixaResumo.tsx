import * as React from "react";

import { cx } from "./ui";

/**
 * A faixa de números do topo de uma tela.
 *
 * É o mesmo desenho do "Resumo do mês" do Início — células separadas por um
 * fio de 1px, que é o fundo aparecendo por um `gap-px` sobre `bg-line` — e
 * existe para que as telas de Crescimento falem a mesma língua dele. Antes
 * os números dessas telas eram uma frase cinza corrida embaixo do título
 * ("3 lendo · 1 na fila · 4 lidos · 2 na lista de desejos"): quatro números
 * sem peso nenhum, que só se leem palavra por palavra.
 *
 * O NÚMERO vai em tinta de texto. Cor só quando ela diz alguma coisa — meta
 * batida em verde —, e nunca para enfeitar.
 */

export type ItemResumo = {
  rotulo: string;
  valor: React.ReactNode;
  /** Uma linha pequena embaixo do número: "de 5 ativos", "mudar a meta". */
  detalhe?: React.ReactNode;
  tom?: "pos";
};

export function FaixaResumo({
  itens,
  className,
}: {
  itens: ItemResumo[];
  className?: string;
}) {
  return (
    <div
      className={cx(
        "grid grid-cols-2 gap-px overflow-hidden rounded-[18px] border border-line bg-line",
        itens.length >= 4 ? "sm:grid-cols-4" : "sm:grid-cols-3",
        className
      )}
    >
      {itens.map((it) => (
        <div key={it.rotulo} className="bg-ink-900 px-4 py-3.5">
          <span className="block text-[11.5px] text-fg-mute">{it.rotulo}</span>
          <span
            className={cx(
              "mt-0.5 block text-[19px] font-bold tracking-[-0.04em] tnum",
              it.tom === "pos" ? "text-pos" : "text-fg"
            )}
          >
            {it.valor}
          </span>
          {it.detalhe && (
            <span className="mt-0.5 block text-[11px] text-fg-mute">
              {it.detalhe}
            </span>
          )}
        </div>
      ))}
    </div>
  );
}
