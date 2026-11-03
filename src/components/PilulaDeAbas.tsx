"use client";

import * as React from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";

import { cx } from "./ui";

export type Aba = {
  href: string;
  label: string;
  ativa: boolean;
  /** Adiantar a rota no instante antes do clique (passar o mouse, tocar). */
  adiantar?: () => void;
};

/**
 * Abas numa pílula de vidro, com o destaque roxo que desliza até a ativa.
 *
 * O desenho das abas do topo da referência, num lugar só: as seções do app e
 * as três abas de Crescimento usam esta mesma peça, para os dois menus serem
 * iguais de verdade e não dois parecidos.
 *
 * O destaque é uma peça só, posicionada por medida, em vez de cada aba acender
 * o próprio fundo: trocar de aba faz ele correr de uma à outra, que é o que diz
 * "você saiu dali e chegou aqui". Remede ao mudar de tela, ao mudar o tamanho
 * da janela e quando a fonte termina de carregar (a largura das abas muda com
 * ela). Até a primeira medida, a aba ativa pinta o próprio fundo, para nunca
 * haver um quadro sem destaque.
 */
export function PilulaDeAbas({
  abas,
  rotulo,
  className,
}: {
  abas: Aba[];
  /** O nome do menu para o leitor de tela. */
  rotulo: string;
  className?: string;
}) {
  const path = usePathname();
  const faixa = React.useRef<HTMLElement>(null);
  const [pilula, setPilula] = React.useState<{ x: number; w: number } | null>(null);

  React.useLayoutEffect(() => {
    const medir = () => {
      const ativa = faixa.current?.querySelector<HTMLElement>('[aria-current="page"]');
      setPilula(ativa ? { x: ativa.offsetLeft, w: ativa.offsetWidth } : null);
    };
    medir();
    /* A aba ativa rola para a vista quando a faixa rola de lado (telefone). */
    const ativa = faixa.current?.querySelector<HTMLElement>('[aria-current="page"]');
    const f = faixa.current;
    if (ativa && f && f.scrollWidth > f.clientWidth)
      f.scrollTo({ left: ativa.offsetLeft - (f.clientWidth - ativa.offsetWidth) / 2 });
    window.addEventListener("resize", medir);
    document.fonts?.ready.then(medir);
    return () => window.removeEventListener("resize", medir);
  }, [path]);

  return (
    <nav
      ref={faixa}
      aria-label={rotulo}
      className={cx(
        "vidro-flutuante sem-barra relative flex max-w-full gap-1 overflow-x-auto rounded-full p-1.5",
        className
      )}
    >
      {pilula && (
        <span
          aria-hidden
          className="absolute bottom-1.5 left-0 top-1.5 rounded-full bg-brand-500 bg-[image:var(--a-degrade)] shadow-[inset_0_1px_0_rgb(255_255_255/0.25)] transition-[transform,width] duration-500 ease-[cubic-bezier(0.16,1,0.3,1)]"
          style={{ transform: `translateX(${pilula.x}px)`, width: pilula.w }}
        />
      )}
      {abas.map(({ href, label, ativa, adiantar }) => (
        <Link
          key={href}
          href={href}
          prefetch={false}
          onMouseEnter={adiantar}
          onTouchStart={adiantar}
          aria-current={ativa ? "page" : undefined}
          className={cx(
            "relative shrink-0 whitespace-nowrap rounded-full px-4 py-2 text-[13.5px] font-semibold transition-colors duration-300",
            ativa
              ? cx("text-on-brand", !pilula && "bg-brand-500")
              : "text-fg-dim hover:bg-fg/[0.07] hover:text-fg"
          )}
        >
          {label}
        </Link>
      ))}
    </nav>
  );
}
