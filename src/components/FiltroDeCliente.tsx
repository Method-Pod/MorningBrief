"use client";

import * as React from "react";
import { createPortal } from "react-dom";
import { Check, ChevronDown, Users } from "lucide-react";
import { cx } from "./ui";

/*
 * O filtro de cliente de Demandas.
 *
 * Era o seletor comum, com "Cliente - Projeto" numa linha só ("Ana Beatriz
 * Barbosa - Ca…", "Ana Beatriz Barbosa - Pe…"), a contagem entre parênteses
 * e dois títulos de grupo em caixa alta. Pedido dele: estava feio e
 * confuso. Agora é uma linha por cliente, com a cor dele e uma pílula com o
 * que está em aberto (vermelha se há atrasada); os projetos aparecem
 * recuados embaixo do cliente, só quando dividem o trabalho dele; e quem não
 * tem nada em aberto fica no fim, apagado, sem título de grupo.
 *
 * Próprio, e não o `Select`, porque o seletor só desenha texto: cor e
 * pílula não cabem nele.
 */

export type ItemDoFiltro = {
  valor: string;
  nome: string;
  cor?: string;
  abertas: number;
  atrasadas: number;
  /** 1 = projeto, recuado embaixo do cliente. */
  nivel: 0 | 1;
};

function Pilula({ abertas, atrasadas }: { abertas: number; atrasadas: number }) {
  if (!abertas) return null;
  return (
    <span
      title={atrasadas ? `${abertas} em aberto, ${atrasadas} atrasada${atrasadas === 1 ? "" : "s"}` : `${abertas} em aberto`}
      className={cx(
        "shrink-0 rounded-full px-2 py-0.5 text-[11.5px] font-semibold tnum",
        atrasadas ? "bg-neg/15 text-neg" : "bg-fg/[0.08] text-fg-dim"
      )}
    >
      {abertas}
    </span>
  );
}

export function FiltroDeCliente({
  valor,
  itens,
  totalAbertas,
  onChange,
  className,
}: {
  valor: string;
  itens: ItemDoFiltro[];
  totalAbertas: number;
  onChange: (v: string) => void;
  className?: string;
}) {
  const [aberto, setAberto] = React.useState(false);
  const [lugar, setLugar] = React.useState<React.CSSProperties>({});
  const [montado, setMontado] = React.useState(false);
  const botao = React.useRef<HTMLButtonElement>(null);
  const caixa = React.useRef<HTMLDivElement>(null);
  const idLista = React.useId();

  React.useEffect(() => setMontado(true), []);

  const todos = [{ valor: "all", nome: "Todos os clientes", abertas: totalAbertas, atrasadas: 0, nivel: 0 as const }, ...itens];
  const atual = todos.find((i) => i.valor === valor);
  /* Valor que veio de outro lugar (o nome clicado num cartão) e não está na
     lista: mostra o texto dele, em vez de um "Todos" que mentiria. */
  const rotulo = atual?.nome ?? valor;
  const pai = atual?.nivel === 1 ? itens.slice(0, itens.indexOf(atual as ItemDoFiltro)).reverse().find((i) => i.nivel === 0) : null;

  const abrir = () => {
    const b = botao.current?.getBoundingClientRect();
    if (!b) return;
    const largura = Math.min(320, window.innerWidth - 32);
    const left = Math.max(16, Math.min(b.left, window.innerWidth - largura - 16));
    const espacoAbaixo = window.innerHeight - b.bottom - 16;
    setLugar({ left, top: b.bottom + 6, width: largura, maxHeight: Math.max(220, Math.min(420, espacoAbaixo)) });
    setAberto(true);
  };

  React.useEffect(() => {
    if (!aberto) return;
    const fora = (e: PointerEvent) => {
      const t = e.target as Node;
      if (!caixa.current?.contains(t) && !botao.current?.contains(t)) setAberto(false);
    };
    const fechar = () => setAberto(false);
    const tecla = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        setAberto(false);
        botao.current?.focus();
      }
      if (e.key === "ArrowDown" || e.key === "ArrowUp") {
        e.preventDefault();
        const opcoes = [...(caixa.current?.querySelectorAll<HTMLButtonElement>("[role=option]") ?? [])];
        const i = opcoes.indexOf(document.activeElement as HTMLButtonElement);
        const j = e.key === "ArrowDown" ? Math.min(i + 1, opcoes.length - 1) : Math.max(i - 1, 0);
        opcoes[j]?.focus();
      }
    };
    document.addEventListener("pointerdown", fora);
    document.addEventListener("keydown", tecla);
    window.addEventListener("resize", fechar);
    window.addEventListener("scroll", fechar, true);
    /* Abre com o foco no escolhido, para o teclado começar dali. */
    requestAnimationFrame(() => caixa.current?.querySelector<HTMLButtonElement>("[aria-selected=true]")?.focus());
    return () => {
      document.removeEventListener("pointerdown", fora);
      document.removeEventListener("keydown", tecla);
      window.removeEventListener("resize", fechar);
      window.removeEventListener("scroll", fechar, true);
    };
  }, [aberto]);

  const escolher = (v: string) => {
    setAberto(false);
    botao.current?.focus();
    if (v !== valor) onChange(v);
  };

  /* Onde começam os que não têm nada em aberto: um fio antes deles. */
  const primeiroParado = itens.findIndex((i) => i.nivel === 0 && i.abertas === 0);

  return (
    <>
      <button
        ref={botao}
        type="button"
        aria-haspopup="listbox"
        aria-expanded={aberto}
        aria-controls={aberto ? idLista : undefined}
        aria-label="Filtrar por cliente"
        onClick={() => (aberto ? setAberto(false) : abrir())}
        className={cx(
          "flex h-10 w-full items-center gap-2 rounded-full border border-[var(--a-line)] bg-ink-800 pl-3.5 pr-3 text-left text-sm text-fg transition-colors hover:bg-fg/[0.06] focus:border-brand-500 focus:outline-none",
          aberto && "border-brand-500 bg-ink-900",
          className
        )}
      >
        {atual && atual.valor !== "all" && atual.cor ? (
          <span className="h-2.5 w-2.5 shrink-0 rounded-full" style={{ background: atual.cor }} />
        ) : (
          <Users size={14} className="shrink-0 text-fg-mute" />
        )}
        <span className="min-w-0 flex-1 truncate">
          {pai && <span className="text-fg-mute">{pai.nome} › </span>}
          {rotulo}
        </span>
        <ChevronDown size={15} className={cx("shrink-0 text-fg-mute transition-transform", aberto && "rotate-180")} />
      </button>

      {aberto &&
        montado &&
        createPortal(
          <div
            ref={caixa}
            id={idLista}
            role="listbox"
            aria-label="Clientes"
            style={lugar}
            className="brota vidro-flutuante fixed z-[70] overflow-y-auto overscroll-contain rounded-[20px] p-1.5"
          >
            {todos.map((it, i) => {
              const escolhido = it.valor === valor;
              const parado = it.abertas === 0 && it.valor !== "all";
              return (
                <React.Fragment key={it.valor}>
                  {i - 1 === primeiroParado && primeiroParado > 0 && (
                    <div role="presentation" className="mx-2.5 my-1.5 h-px bg-line" />
                  )}
                  <button
                    type="button"
                    role="option"
                    aria-selected={escolhido}
                    onClick={() => escolher(it.valor)}
                    className={cx(
                      "flex w-full items-center gap-2.5 rounded-[14px] py-2.5 pr-2.5 text-left transition-colors hover:bg-fg/[0.06] focus:bg-fg/[0.08] focus:outline-none sm:py-2",
                      it.nivel === 1 ? "pl-9 text-[12.5px]" : "pl-3 text-[13.5px]",
                      escolhido ? "bg-brand-500/12 font-semibold text-fg" : parado ? "text-fg-mute" : "text-fg-dim",
                      i === 0 && "mb-1"
                    )}
                  >
                    {it.nivel === 0 &&
                      (it.valor === "all" ? (
                        <Users size={14} className="shrink-0 text-fg-mute" />
                      ) : (
                        <span
                          className={cx("h-2.5 w-2.5 shrink-0 rounded-full", parado && "opacity-50")}
                          style={{ background: it.cor ?? "var(--color-fg-mute)" }}
                        />
                      ))}
                    <span className="min-w-0 flex-1 truncate">{it.nome}</span>
                    <Pilula abertas={it.abertas} atrasadas={it.atrasadas} />
                    {escolhido && <Check size={14} className="shrink-0 text-brand-400" />}
                  </button>
                </React.Fragment>
              );
            })}
          </div>,
          document.body
        )}
    </>
  );
}
