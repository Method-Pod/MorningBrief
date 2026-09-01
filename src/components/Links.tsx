"use client";

import * as React from "react";
import { Link2, Plus, Trash2 } from "lucide-react";
import { normalizarLink, rotuloDeLink } from "@/lib/format";
import { Button, Input, cx } from "./ui";

/**
 * Os endereços de uma demanda, prontos para gravar.
 *
 * Tira o vazio e o espaço, e completa o esquema — quem cola "drive.google.com"
 * não digita o https, e sem ele o href vira caminho relativo e o clique navega
 * para dentro do próprio app.
 */
export const limparLinks = (v: string[]) =>
  v.map((l) => normalizarLink(l)).filter(Boolean);

/* ------------------------------ editor ------------------------------ */

/**
 * Lista de endereços no formulário.
 *
 * Uma linha por link, com uma vazia sempre no fim: o caso real é ter roteiro,
 * bruto e referência na mesma demanda, e um botão "adicionar" antes de poder
 * digitar o primeiro seria um clique a mais em todas as vezes.
 */
export function EditorLinks({
  links,
  onChange,
}: {
  links: string[];
  onChange: (v: string[]) => void;
}) {
  /* A linha em branco do fim é da tela, não do dado: quem grava é o pai, e
     `limparLinks` a descarta. */
  const linhas = links.length ? links : [""];

  const mudar = (i: number, v: string) =>
    onChange(linhas.map((l, j) => (j === i ? v : l)));

  return (
    <div className="flex flex-col gap-2">
      {linhas.map((l, i) => (
        <div key={i} className="flex items-center gap-2">
          <Link2 size={14} className="shrink-0 text-fg-mute" />
          <Input
            type="url"
            inputMode="url"
            value={l}
            onChange={(e) => mudar(i, e.target.value)}
            onKeyDown={(e) => {
              /* Enter abre a próxima linha em vez de enviar o formulário:
                 colar três endereços seguidos é o fluxo normal aqui. */
              if (e.key === "Enter") {
                e.preventDefault();
                if (l.trim()) onChange([...linhas, ""]);
              }
            }}
            placeholder="drive.google.com/..."
            className="h-9 flex-1 text-[12.5px]"
          />
          <button
            type="button"
            onClick={() =>
              onChange(
                linhas.length === 1 ? [] : linhas.filter((_, j) => j !== i)
              )
            }
            disabled={!l.trim() && linhas.length === 1}
            aria-label={`Remover link ${i + 1}`}
            className="grid h-8 w-8 shrink-0 place-items-center rounded-lg text-fg-mute transition-colors hover:bg-neg/15 hover:text-neg disabled:pointer-events-none disabled:opacity-30"
          >
            <Trash2 size={14} />
          </button>
        </div>
      ))}

      <div>
        <Button
          type="button"
          size="sm"
          onClick={() => onChange([...linhas, ""])}
          disabled={linhas.some((l) => !l.trim())}
        >
          <Plus size={14} />
          Outro link
        </Button>
      </div>
    </div>
  );
}

/* ------------------------------ exibição ------------------------------ */

/**
 * Os links como chips, no cartão e nas listas.
 *
 * Mostra só o domínio: uma URL de Drive ocuparia três linhas na largura de uma
 * coluna do quadro e não diria mais do que "drive.google.com". O endereço
 * inteiro fica no `title`, para quem passa o mouse.
 */
export function ChipsDeLink({
  links,
  max = 3,
  tamanho = "sm",
}: {
  links: string[] | null | undefined;
  max?: number;
  tamanho?: "sm" | "md";
}) {
  const lista = links?.filter(Boolean) ?? [];
  if (!lista.length) return null;

  const visiveis = lista.slice(0, max);
  const sobra = lista.length - visiveis.length;

  return (
    <>
      {visiveis.map((l, i) => (
        /*
          Âncora de verdade, não um onClick: abrir em aba nova pelo botão do
          meio e copiar o endereço precisam funcionar. `draggable={false}`
          porque no quadro o cartão inteiro arrasta, e sem isso o arrasto do
          link disputava com o de mover a demanda.
        */
        <a
          key={i}
          href={normalizarLink(l)}
          target="_blank"
          rel="noopener noreferrer"
          draggable={false}
          onClick={(e) => e.stopPropagation()}
          title={l}
          className={cx(
            "inline-flex max-w-full items-center gap-1 rounded-md px-1 py-0.5 text-brand-400 transition-colors hover:bg-ink-750 hover:underline",
            tamanho === "sm" ? "text-[10px]" : "text-[10.5px]"
          )}
        >
          <Link2 size={tamanho === "sm" ? 9 : 10} className="shrink-0" />
          <span className="truncate">{rotuloDeLink(l)}</span>
        </a>
      ))}
      {sobra > 0 && (
        <span
          title={lista.slice(max).join("\n")}
          className={cx(
            "text-fg-mute tnum",
            tamanho === "sm" ? "text-[10px]" : "text-[10.5px]"
          )}
        >
          +{sobra}
        </span>
      )}
    </>
  );
}
