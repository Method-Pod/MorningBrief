"use client";

import * as React from "react";
import { createPortal } from "react-dom";
import { Info } from "lucide-react";

import { cx } from "./ui";

/**
 * "De onde sai este número?", respondido no lugar onde o número está.
 *
 * O painel mostra vários valores que ninguém digitou: a porcentagem do dia, a
 * soma do mês, o quanto já foi pago. Cada um tem um recorte — quais linhas
 * entram, quais ficam de fora — e esse recorte é invisível. Quando o número
 * não bate com a impressão de quem olha, não há como saber se o erro é da
 * conta ou da impressão, e o número deixa de ser usado.
 *
 * O que vai aqui dentro é a CONTA e a RESSALVA, nessa ordem. A ressalva é a
 * parte que importa: é ela que explica os casos em que o número engana —
 * "demanda sem data não entra" responde de uma vez o "por que 0 de 0 num dia
 * cheio de trabalho".
 *
 * Mesmas regras de dispensa do MenuSuspenso: clique fora, Escape e rolagem. A
 * rolagem fecha porque a caixa é `fixed` e ficaria parada no ar enquanto o
 * número vai embora.
 */

const LARGURA = 268;
const FOLGA = 6;

export function Explicacao({
  titulo = "Como calculamos",
  children,
  className,
}: {
  titulo?: string;
  children: React.ReactNode;
  className?: string;
}) {
  const [aberto, setAberto] = React.useState(false);
  const [lugar, setLugar] = React.useState<React.CSSProperties>({});
  const [montado, setMontado] = React.useState(false);
  const botao = React.useRef<HTMLButtonElement>(null);
  const caixa = React.useRef<HTMLDivElement>(null);

  React.useEffect(() => setMontado(true), []);

  const abrir = () => {
    const b = botao.current;
    if (!b) return;
    const r = b.getBoundingClientRect();
    /* Altura estimada só para decidir o lado. Errar para mais é melhor que
       errar para menos: na dúvida ele abre para cima, onde sempre há a tela
       inteira, em vez de nascer cortado embaixo. */
    const alturaChute = 170;
    const cabeAbaixo = window.innerHeight - r.bottom - FOLGA > alturaChute;
    /* Alinhado pela esquerda do botão, mas sem passar da borda da janela. */
    const esquerda = Math.min(
      Math.max(FOLGA, r.left),
      window.innerWidth - LARGURA - FOLGA
    );
    setLugar({
      left: esquerda,
      width: LARGURA,
      ...(cabeAbaixo
        ? { top: r.bottom + FOLGA }
        : { bottom: window.innerHeight - r.top + FOLGA }),
    });
    setAberto(true);
  };

  React.useEffect(() => {
    if (!aberto) return;
    const foraDaqui = (e: PointerEvent) => {
      const alvo = e.target as Node;
      if (caixa.current?.contains(alvo) || botao.current?.contains(alvo)) return;
      setAberto(false);
    };
    const naTecla = (e: KeyboardEvent) => {
      if (e.key === "Escape") setAberto(false);
    };
    const sair = () => setAberto(false);
    document.addEventListener("pointerdown", foraDaqui);
    document.addEventListener("keydown", naTecla);
    window.addEventListener("scroll", sair, true);
    window.addEventListener("resize", sair);
    return () => {
      document.removeEventListener("pointerdown", foraDaqui);
      document.removeEventListener("keydown", naTecla);
      window.removeEventListener("scroll", sair, true);
      window.removeEventListener("resize", sair);
    };
  }, [aberto]);

  return (
    <>
      <button
        ref={botao}
        type="button"
        onClick={() => (aberto ? setAberto(false) : abrir())}
        aria-label={titulo}
        aria-expanded={aberto}
        title={titulo}
        className={cx(
          "grid h-[18px] w-[18px] shrink-0 place-items-center rounded-full text-fg-mute transition-colors hover:bg-ink-800 hover:text-fg",
          aberto && "bg-ink-800 text-fg",
          className
        )}
      >
        <Info size={12} />
      </button>

      {aberto &&
        montado &&
        createPortal(
          <div
            ref={caixa}
            role="dialog"
            aria-label={titulo}
            style={lugar}
            className="brota fixed z-[85] rounded-[14px] border border-line bg-ink-900 p-3.5 shadow-[var(--elev-3)]"
          >
            <p className="text-[11px] font-bold uppercase tracking-[0.07em] text-fg-mute">
              {titulo}
            </p>
            <div className="mt-2 flex flex-col gap-2 text-[12px] leading-relaxed text-fg-dim">
              {children}
            </div>
          </div>,
          document.body
        )}
    </>
  );
}

/**
 * A linha da ressalva, com peso visual próprio.
 *
 * Separada porque ela não é mais um parágrafo: é o aviso de quando o número
 * engana. Lida de canto de olho, tem que se distinguir da conta.
 */
export function Ressalva({ children }: { children: React.ReactNode }) {
  return (
    <p className="border-l-2 border-line pl-2.5 text-fg-mute">{children}</p>
  );
}
