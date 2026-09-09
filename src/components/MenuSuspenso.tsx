"use client";

import * as React from "react";
import { createPortal } from "react-dom";
import { MoreVertical } from "lucide-react";
import { cx } from "./ui";

/**
 * Menu de três pontos: as ações de uma linha, escondidas até serem pedidas.
 *
 * Cada linha de lista tinha três ícones soltos — editar, fixar, excluir — e
 * três ícones cinzas de tamanho igual não dizem qual é qual até você passar o
 * mouse e ler o balãozinho. Num telefone, onde não há hover, eles ficavam
 * visíveis sempre e disputavam a largura com o nome.
 *
 * Aqui um ponto de entrada só, e dentro dele o nome de cada ação escrito.
 */

export type ItemMenuSuspenso = {
  rotulo: string;
  icone: React.ReactNode;
  aoEscolher: () => void;
  /** Ação destrutiva ganha cor de aviso, e vem separada por uma linha. */
  perigo?: boolean;
};

/** Onde o menu nasce: abaixo e alinhado à direita do botão, ou acima. */
const LARGURA = 184;
const FOLGA = 6;

export function MenuSuspenso({
  itens,
  rotulo = "Mais ações",
  className,
}: {
  itens: ItemMenuSuspenso[];
  rotulo?: string;
  className?: string;
}) {
  const [aberto, setAberto] = React.useState(false);
  const [lugar, setLugar] = React.useState<React.CSSProperties>({});
  const botao = React.useRef<HTMLButtonElement>(null);
  const caixa = React.useRef<HTMLDivElement>(null);
  const [montado, setMontado] = React.useState(false);

  React.useEffect(() => setMontado(true), []);

  /**
   * Calcula a posição na hora de abrir.
   *
   * `fixed` num portal no fim do `body`, e não `absolute` na linha, por dois
   * motivos: a linha vive dentro de um `Card`, e um menu absoluto seria
   * cortado pela borda dele; e a animação `rise` da página aplica um
   * `transform`, que captura `position: fixed` — o mesmo tropeço que o menu do
   * "/" já teve. Por isso o portal.
   */
  const abrir = () => {
    const b = botao.current;
    if (!b) return;
    const r = b.getBoundingClientRect();
    const altura = itens.length * 36 + 16;
    const cabeAbaixo = window.innerHeight - r.bottom - FOLGA > altura;
    setLugar({
      left: Math.max(FOLGA, Math.min(r.right - LARGURA, window.innerWidth - LARGURA - FOLGA)),
      ...(cabeAbaixo
        ? { top: r.bottom + FOLGA }
        : { bottom: window.innerHeight - r.top + FOLGA }),
    });
    setAberto(true);
  };

  /* Fecha ao clicar fora, ao rolar e no Escape. Rolar entra na lista porque o
     menu é `fixed`: sem isso ele ficaria parado enquanto a linha vai embora. */
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
    const aoRolar = () => setAberto(false);

    document.addEventListener("pointerdown", foraDaqui);
    document.addEventListener("keydown", naTecla);
    window.addEventListener("scroll", aoRolar, true);
    window.addEventListener("resize", aoRolar);
    return () => {
      document.removeEventListener("pointerdown", foraDaqui);
      document.removeEventListener("keydown", naTecla);
      window.removeEventListener("scroll", aoRolar, true);
      window.removeEventListener("resize", aoRolar);
    };
  }, [aberto]);

  return (
    <>
      <button
        ref={botao}
        type="button"
        onClick={() => (aberto ? setAberto(false) : abrir())}
        aria-label={rotulo}
        aria-haspopup="menu"
        aria-expanded={aberto}
        className={cx(
          "grid h-8 w-8 shrink-0 place-items-center rounded-lg transition-colors",
          aberto
            ? "bg-ink-800 text-fg"
            : "text-fg-mute hover:bg-ink-800 hover:text-fg",
          className
        )}
      >
        <MoreVertical size={15} />
      </button>

      {aberto &&
        montado &&
        createPortal(
          <div
            ref={caixa}
            role="menu"
            className="pop fixed z-[70] overflow-hidden rounded-[14px] border border-line bg-white p-1.5 shadow-[0_12px_32px_-8px_rgb(20_24_26/0.25)]"
            style={{ width: LARGURA, ...lugar }}
          >
            {itens.map((item, i) => (
              <React.Fragment key={item.rotulo}>
                {/* Uma linha antes da ação destrutiva: é o que separa "excluir"
                    de um clique de rotina logo acima dele. */}
                {item.perigo && i > 0 && (
                  <span className="my-1 block h-px bg-line-soft" />
                )}
                <button
                  type="button"
                  role="menuitem"
                  onClick={() => {
                    setAberto(false);
                    item.aoEscolher();
                  }}
                  className={cx(
                    "flex w-full items-center gap-2.5 rounded-[10px] px-2.5 py-2 text-left text-[12.5px] font-medium transition-colors",
                    item.perigo
                      ? "text-neg hover:bg-neg/12"
                      : "text-fg-dim hover:bg-ink-800 hover:text-fg"
                  )}
                >
                  <span className="shrink-0 text-fg-mute">{item.icone}</span>
                  {item.rotulo}
                </button>
              </React.Fragment>
            ))}
          </div>,
          document.body
        )}
    </>
  );
}
