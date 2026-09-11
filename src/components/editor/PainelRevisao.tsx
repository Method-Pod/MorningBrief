"use client";

import * as React from "react";
import { Check, SpellCheck2, X } from "lucide-react";
import { cx } from "../ui";
import type { Achado } from "./revisao";

/**
 * A lista do que o corretor achou, com o conserto ao lado de cada coisa.
 *
 * Nada é trocado sozinho. O pedido foi ver o que muda antes de mudar, e essa
 * é a diferença entre um corretor e um filtro: aqui cada linha mostra o
 * trecho como ele está, a proposta, e dois botões. "Aplicar todas" existe
 * para quando a lista é só acento faltando, e continua sendo uma decisão
 * sua — ela não roda sozinha ao abrir.
 */

export function PainelRevisao({
  achados,
  aviso,
  aoAplicar,
  aoIgnorar,
  aoAplicarTodas,
  aoFechar,
}: {
  achados: Achado[];
  aviso: string | null;
  aoAplicar: (achado: Achado, troca: string) => void;
  aoIgnorar: (id: string) => void;
  aoAplicarTodas: () => void;
  aoFechar: () => void;
}) {
  /* Só oferece "aplicar todas" quando há mais de uma: com uma só, o botão de
     cima e o de baixo fazem a mesma coisa, e um deles é ruído. */
  const vale = achados.filter((a) => a.trocas[0]);

  return (
    <div className="mb-4 overflow-hidden rounded-[16px] border border-line bg-white shadow-[0_8px_24px_-16px_rgb(20_24_26/0.25)]">
      <div className="flex items-center gap-2 border-b border-line-soft px-3.5 py-2.5">
        <SpellCheck2 size={14} className="shrink-0 text-fg-mute" />
        <p className="min-w-0 flex-1 truncate text-[12.5px] font-semibold text-fg">
          {achados.length === 0
            ? "Revisão"
            : `${achados.length} ${achados.length === 1 ? "ponto" : "pontos"} para revisar`}
        </p>

        {vale.length > 1 && (
          <button
            type="button"
            onClick={aoAplicarTodas}
            className="shrink-0 rounded-lg px-2 py-1 text-[11.5px] font-semibold text-brand-400 transition-colors hover:bg-brand-500/12"
          >
            Aplicar todas
          </button>
        )}
        <button
          type="button"
          onClick={aoFechar}
          aria-label="Fechar revisão"
          className="grid h-7 w-7 shrink-0 place-items-center rounded-lg text-fg-mute transition-colors hover:bg-ink-800 hover:text-fg"
        >
          <X size={14} />
        </button>
      </div>

      {aviso && (
        <p className="border-b border-line-soft bg-ink-800 px-3.5 py-2 text-[11.5px] text-fg-dim">
          {aviso}
        </p>
      )}

      {achados.length === 0 ? (
        <p className="flex items-center gap-2 px-3.5 py-3.5 text-[12.5px] text-fg-dim">
          <Check size={14} className="text-pos" />
          Nada a corrigir por aqui.
        </p>
      ) : (
        <ul className="max-h-[320px] divide-y divide-line-soft overflow-y-auto overscroll-contain">
          {achados.map((a) => (
            <li key={a.id} className="px-3.5 py-2.5">
              {/*
                O trecho em volta, e não só a palavra.

                "e" sozinho na lista não diz onde está; com meia linha de cada
                lado você reconhece a frase sem precisar procurar no texto.
              */}
              <p className="text-[12.5px] leading-relaxed text-fg-mute">
                {a.antes && <span>…{a.antes}</span>}
                <span className="mx-0.5 rounded bg-neg/12 px-1 font-semibold text-neg line-through decoration-neg/50">
                  {a.errado}
                </span>
                {a.depois && <span>{a.depois}…</span>}
              </p>

              <div className="mt-1.5 flex flex-wrap items-center gap-1.5">
                {a.trocas.map((t, i) => (
                  <button
                    key={t}
                    type="button"
                    onClick={() => aoAplicar(a, t)}
                    className={cx(
                      "rounded-lg px-2 py-1 text-[12px] font-semibold transition-colors",
                      /* A primeira proposta é a que o corretor considera mais
                         provável, e por isso é a que fica preenchida: as
                         outras existem para o caso de ele ter errado. */
                      i === 0
                        ? "bg-brand-500 text-on-brand hover:bg-brand-600"
                        : "border border-line text-fg-dim hover:bg-ink-800 hover:text-fg"
                    )}
                  >
                    {t}
                  </button>
                ))}

                <button
                  type="button"
                  onClick={() => aoIgnorar(a.id)}
                  className="rounded-lg px-2 py-1 text-[12px] font-medium text-fg-mute transition-colors hover:bg-ink-800 hover:text-fg"
                >
                  Ignorar
                </button>

                <span className="ml-auto min-w-0 truncate text-[11px] text-fg-mute">
                  {a.motivo}
                </span>
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
