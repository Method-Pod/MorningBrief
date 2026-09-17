"use client";

import * as React from "react";
import { createPortal } from "react-dom";
import { ChevronDown, MoreVertical } from "lucide-react";
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
  rotuloVisivel,
  className,
}: {
  itens: ItemMenuSuspenso[];
  rotulo?: string;
  /*
   * Quando vem, o gatilho deixa de ser três pontos e vira botão com texto.
   *
   * Nas linhas de lista os três pontos bastam: a linha inteira é o contexto e
   * o ícone só precisa dizer "há mais aqui". No cabeçalho de uma página não
   * há contexto nenhum em volta — três pontos soltos ali não dizem se guardam
   * ações do item, da página ou da conta. Com o texto, o botão se explica.
   */
  rotuloVisivel?: string;
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
    const esquerda = Math.max(
      FOLGA,
      Math.min(r.right - LARGURA, window.innerWidth - LARGURA - FOLGA)
    );
    /*
     * De onde a caixa cresce.
     *
     * Sem isto o menu escalava a partir do proprio centro, que e um ponto sem
     * significado nenhum: a caixa brotava do nada perto do botao. Ancorando a
     * origem no botao, o gesto fica legivel -- o menu SAI dali, e ao fechar
     * volta para la. E a mesma regra de ida e volta pelo mesmo caminho que a
     * gaveta e o modal ja seguem.
     *
     * O x e o centro do botao medido dentro da caixa, nao o canto: o `left`
     * acima e grampeado na borda da tela, entao num botao perto do canto a
     * caixa escorrega e o canto dela deixa de coincidir com ele. Travado no
     * intervalo da largura para a origem nunca cair fora da propria caixa.
     */
    const origemX = Math.max(
      0,
      Math.min(r.left + r.width / 2 - esquerda, LARGURA)
    );
    setLugar({
      left: esquerda,
      transformOrigin: `${origemX}px ${cabeAbaixo ? "0" : "100%"}`,
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
          rotuloVisivel
            ? /* Mesma silhueta do Button variante outline, para o cabeçalho
                 não misturar dois formatos de botão lado a lado. */
              "inline-flex h-10 items-center justify-center gap-2 rounded-xl bg-ink-900 px-4 text-sm font-medium text-fg-dim shadow-[var(--elev-1)] transition-colors hover:text-fg"
            : "grid h-8 w-8 shrink-0 place-items-center rounded-lg transition-colors",
          !rotuloVisivel &&
            (aberto
              ? "bg-ink-800 text-fg"
              : "text-fg-mute hover:bg-ink-800 hover:text-fg"),
          className
        )}
      >
        {rotuloVisivel ? (
          <>
            {rotuloVisivel}
            <ChevronDown
              size={14}
              className={cx("transition-transform", aberto && "rotate-180")}
            />
          </>
        ) : (
          <MoreVertical size={15} />
        )}
      </button>

      {aberto &&
        montado &&
        createPortal(
          <div
            ref={caixa}
            role="menu"
            className="brota fixed z-[70] overflow-hidden rounded-[14px] border border-line bg-ink-900 p-1.5 shadow-[var(--elev-3)]"
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
