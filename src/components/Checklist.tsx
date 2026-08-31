"use client";

import * as React from "react";
import { Check, ListChecks, Plus, Trash2 } from "lucide-react";
import { type TaskItem } from "@/lib/types";
import { Button, Input, cx } from "./ui";

/* ------------------------------ progresso ------------------------------ */

/**
 * "3/5" com barra, para o cartão do quadro.
 *
 * O número diz algo de verdade porque o trabalho é contável — cinco cortes são
 * cinco unidades iguais. Um "em andamento" genérico não diria.
 */
export function ProgressoChecklist({
  feitos,
  total,
  className,
}: {
  feitos: number;
  total: number;
  className?: string;
}) {
  if (!total) return null;
  const pct = Math.round((feitos / total) * 100);
  const completo = feitos === total;

  return (
    <div className={cx("flex items-center gap-2", className)}>
      <span
        className={cx(
          "text-[10.5px] font-bold tnum",
          completo ? "text-pos" : "text-fg-mute"
        )}
      >
        {feitos}/{total}
      </span>
      {/*
        A barra cresce por transform, não por width.
        
        Animar largura força o navegador a recalcular layout a cada quadro.
        scaleX roda no compositor, então desliza liso mesmo com vários cartões
        na tela — e é justamente onde havia mais barras ao mesmo tempo.
      */}
      <div className="h-1 min-w-[36px] flex-1 overflow-hidden rounded-full bg-ink-800">
        <div
          className={cx(
            "h-full w-full origin-left rounded-full transition-transform duration-[280ms] ease-[cubic-bezier(0.22,0.61,0.36,1)]",
            completo ? "bg-pos" : "bg-brand-500"
          )}
          style={{ transform: `scaleX(${pct / 100})` }}
        />
      </div>
    </div>
  );
}

/* --------------------------- lista no cartão --------------------------- */

/**
 * Os itens com caixinha, direto no cartão.
 *
 * Marcar precisa ser um clique. O ciclo diário é abrir o app, fazer um corte e
 * marcar — se isso exigisse abrir o modal de edição e salvar, o checklist
 * viraria trabalho em vez de atalho.
 */
export function ListaDeItens({
  itens,
  onAlternar,
  ocupado,
}: {
  itens: TaskItem[];
  onAlternar: (item: TaskItem) => void;
  ocupado?: string | null;
}) {
  if (!itens.length) return null;

  return (
    <ul className="mt-2 flex flex-col">
      {itens.map((i) => (
        <li key={i.id}>
          <button
            type="button"
            onClick={() => onAlternar(i)}
            disabled={ocupado === i.id}
            className="group/i flex w-full items-center gap-2 py-1 text-left disabled:opacity-50"
          >
            {/* O sinal entra com escala curta: dá resposta ao clique sem
                atrasar nada, porque transform e opacity não custam layout. */}
            <span
              aria-hidden
              className={cx(
                "grid h-[15px] w-[15px] shrink-0 place-items-center rounded-[5px] border transition-[background-color,border-color] duration-[180ms]",
                i.done
                  ? "border-pos bg-pos text-white"
                  : "border-line bg-white group-hover/i:border-brand-400"
              )}
            >
              <Check
                size={10}
                strokeWidth={3.5}
                className={cx(
                  "transition-[transform,opacity] duration-[180ms] ease-[cubic-bezier(0.34,1.4,0.64,1)]",
                  i.done ? "scale-100 opacity-100" : "scale-50 opacity-0"
                )}
              />
            </span>
            <span
              className={cx(
                "min-w-0 flex-1 truncate text-[11.5px]",
                i.done ? "text-fg-mute line-through" : "text-fg-dim"
              )}
            >
              {i.title}
            </span>
          </button>
        </li>
      ))}
    </ul>
  );
}

/* --------------------------- editor no formulário --------------------------- */

/**
 * Item enquanto está sendo editado no formulário.
 *
 * `id` só existe em item já gravado — é o que permite preservar o `done` ao
 * salvar em vez de recriar tudo.
 */
export type ItemEmEdicao = { id?: string; title: string; done: boolean };

/**
 * Edita a lista de títulos. Serve tanto para a demanda quanto para o modelo da
 * regra recorrente, porque nos dois casos o que se edita é só uma lista de
 * textos — o que muda é onde ela é gravada.
 */
export function EditorChecklist({
  itens,
  onChange,
  rotuloVazio = "Nenhum item. Adicione abaixo.",
}: {
  itens: ItemEmEdicao[];
  onChange: (itens: ItemEmEdicao[]) => void;
  rotuloVazio?: string;
}) {
  const [novo, setNovo] = React.useState("");

  const adicionar = () => {
    const t = novo.trim();
    if (!t) return;
    onChange([...itens, { title: t, done: false }]);
    setNovo("");
  };

  const feitos = itens.filter((i) => i.done).length;

  return (
    <div className="flex flex-col gap-2.5">
      {itens.length > 0 && (
        <ProgressoChecklist feitos={feitos} total={itens.length} />
      )}

      {itens.length > 0 ? (
        <ul className="flex max-h-[34vh] flex-col overflow-y-auto">
          {itens.map((item, i) => (
            <li
              key={i}
              className="flex items-center gap-2 border-b border-line-soft py-1.5 last:border-0"
            >
              {/*
                Toda linha tem caixinha, gravada ou não — precisar salvar antes
                de poder marcar é detalhe de implementação vazando para a tela.

                Marcar aqui vale ao Salvar, como todo o resto do formulário —
                Cancelar descarta, que é o que Cancelar quer dizer. Para marcar
                na hora existe a lista do cartão, no quadro.
              */}
              <button
                type="button"
                onClick={() =>
                  onChange(
                    itens.map((x, j) => (j === i ? { ...x, done: !x.done } : x))
                  )
                }
                aria-label={`${item.done ? "Desmarcar" : "Marcar"} ${item.title}`}
                aria-pressed={item.done}
                className={cx(
                  "grid h-[18px] w-[18px] shrink-0 place-items-center rounded-[6px] border transition-[background-color,border-color]",
                  item.done
                    ? "border-pos bg-pos text-white"
                    : "border-line bg-white hover:border-brand-400"
                )}
              >
                <Check
                  size={11}
                  strokeWidth={3.5}
                  className={cx(
                    "transition-[transform,opacity] ease-[cubic-bezier(0.34,1.4,0.64,1)]",
                    item.done ? "scale-100 opacity-100" : "scale-50 opacity-0"
                  )}
                />
              </button>

              <Input
                value={item.title}
                onChange={(e) =>
                  onChange(
                    itens.map((x, j) =>
                      j === i ? { ...x, title: e.target.value } : x
                    )
                  )
                }
                className={cx(
                  "h-9 flex-1 text-[12.5px]",
                  item.done && "text-fg-mute line-through"
                )}
              />
              <button
                type="button"
                onClick={() => onChange(itens.filter((_, j) => j !== i))}
                aria-label={`Remover item ${i + 1}`}
                className="grid h-8 w-8 shrink-0 place-items-center rounded-lg text-fg-mute transition-colors hover:bg-neg/15 hover:text-neg"
              >
                <Trash2 size={14} />
              </button>
            </li>
          ))}
        </ul>
      ) : (
        <p className="flex items-center gap-2 px-1 text-[11.5px] text-fg-mute">
          <ListChecks size={13} />
          {rotuloVazio}
        </p>
      )}

      <div className="flex gap-2">
        <Input
          value={novo}
          onChange={(e) => setNovo(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              e.preventDefault();
              adicionar();
            }
          }}
          placeholder="Adicionar um item"
          className="h-9 flex-1"
        />
        <Button type="button" size="sm" onClick={adicionar} disabled={!novo.trim()}>
          <Plus size={14} />
          Adicionar
        </Button>
      </div>
    </div>
  );
}
