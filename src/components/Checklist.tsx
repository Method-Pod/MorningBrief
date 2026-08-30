"use client";

import * as React from "react";
import { Check, ListChecks, Plus, Trash2, Wand2 } from "lucide-react";
import { itensNumerados, type TaskItem } from "@/lib/types";
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
 * Edita a lista de títulos. Serve tanto para a demanda quanto para o modelo da
 * regra recorrente, porque nos dois casos o que se edita é só uma lista de
 * textos — o que muda é onde ela é gravada.
 */
export function EditorChecklist({
  itens,
  onChange,
  salvos = [],
  onAlternar,
  rotuloVazio = "Nenhum item. Use o gerador abaixo ou adicione um a um.",
}: {
  itens: string[];
  onChange: (itens: string[]) => void;
  /*
   * Os itens já gravados, na mesma ordem. Só eles podem ser marcados: um item
   * recém-digitado ainda não existe no banco, e marcar algo que não foi salvo
   * daria a impressão de progresso que se perde ao cancelar.
   */
  salvos?: TaskItem[];
  onAlternar?: (item: TaskItem) => void;
  rotuloVazio?: string;
}) {
  const [novo, setNovo] = React.useState("");
  const [rotulo, setRotulo] = React.useState("Thumb");
  const [quantos, setQuantos] = React.useState(5);

  const adicionar = () => {
    const t = novo.trim();
    if (!t) return;
    onChange([...itens, t]);
    setNovo("");
  };

  const feitos = salvos.filter((i) => i.done).length;

  return (
    <div className="flex flex-col gap-2.5">
      {salvos.length > 0 && (
        <ProgressoChecklist feitos={feitos} total={salvos.length} />
      )}

      {/*
        Gerador numerado antes da lista: é o caminho comum.

        O caso real é lote de trabalho igual — cinco cortes para o mesmo canal.
        Digitar "Thumb 1", "Thumb 2"... até cinco é a repetição que o app
        deveria tirar do caminho.
      */}
      <div className="flex flex-wrap items-end gap-2 rounded-[14px] bg-ink-800 p-2.5">
        <label className="min-w-0 flex-1">
          <span className="mb-1 block text-[10px] font-medium uppercase tracking-wider text-fg-mute">
            Gerar numerados
          </span>
          <Input
            value={rotulo}
            onChange={(e) => setRotulo(e.target.value)}
            placeholder="Thumb"
            className="h-9"
          />
        </label>
        <label className="w-[72px] shrink-0">
          <span className="mb-1 block text-[10px] font-medium uppercase tracking-wider text-fg-mute">
            Quantos
          </span>
          <Input
            type="number"
            min={1}
            max={50}
            value={quantos}
            onChange={(e) => setQuantos(Number(e.target.value))}
            className="h-9"
          />
        </label>
        <Button
          type="button"
          size="sm"
          onClick={() => onChange([...itens, ...itensNumerados(rotulo, quantos)])}
        >
          <Wand2 size={14} />
          Gerar
        </Button>
      </div>

      {itens.length > 0 ? (
        <ul className="flex max-h-[34vh] flex-col overflow-y-auto">
          {itens.map((t, i) => (
            <li
              key={i}
              className="flex items-center gap-2 border-b border-line-soft py-1.5 last:border-0"
            >
              {/*
                A caixinha marca aqui também.
                
                Ela existia só no cartão do quadro, e a mesma lista aparecia
                sem ela no formulário — quem abria para editar não tinha como
                riscar um item. Duas caras para a mesma coisa.
              */}
              {salvos[i] && onAlternar ? (
                <button
                  type="button"
                  onClick={() => onAlternar(salvos[i])}
                  aria-label={`${salvos[i].done ? "Desmarcar" : "Marcar"} ${
                    salvos[i].title
                  }`}
                  aria-pressed={salvos[i].done}
                  className={cx(
                    "grid h-[18px] w-[18px] shrink-0 place-items-center rounded-[6px] border transition-[background-color,border-color]",
                    salvos[i].done
                      ? "border-pos bg-pos text-white"
                      : "border-line bg-white hover:border-brand-400"
                  )}
                >
                  <Check
                    size={11}
                    strokeWidth={3.5}
                    className={cx(
                      "transition-[transform,opacity] ease-[cubic-bezier(0.34,1.4,0.64,1)]",
                      salvos[i].done ? "scale-100 opacity-100" : "scale-50 opacity-0"
                    )}
                  />
                </button>
              ) : (
                <span className="w-[18px] shrink-0 text-center text-[11px] font-bold text-fg-mute tnum">
                  {i + 1}
                </span>
              )}
              <Input
                value={t}
                onChange={(e) =>
                  onChange(itens.map((x, j) => (j === i ? e.target.value : x)))
                }
                className={cx(
                  "h-9 flex-1 text-[12.5px]",
                  salvos[i]?.done && "text-fg-mute line-through"
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
