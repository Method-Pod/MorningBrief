"use client";

import * as React from "react";
import { cx } from "./ui";

/**
 * Faixa que rola para o lado, arrastando com o mouse.
 *
 * No celular e no trackpad o gesto já existe: `overflow-x` dá o deslize com o
 * dedo e o rolar de dois dedos. No mouse não existe nada — arrastar uma área
 * que rola não é comportamento de navegador —, e é justamente onde a faixa
 * fica: no desktop. Daí o arraste feito à mão.
 *
 * Só o mouse é tratado aqui. Toque e caneta ficam com o gesto nativo, que é
 * melhor do que qualquer imitação: tem inércia, resistência no fim e obedece
 * às configurações do aparelho.
 */

/**
 * Quanto o ponteiro precisa andar para virar arraste.
 *
 * Sem essa folga, um clique com um tremor de dois pixels seria lido como
 * arraste e o link do canal não abriria. Seis pixels é o mesmo limiar do
 * arraste dos cartões de demanda, para o dedo aprender um número só.
 */
const LIMIAR_PX = 6;

export function Carrossel({
  children,
  className,
}: {
  children: React.ReactNode;
  className?: string;
}) {
  const trilho = React.useRef<HTMLDivElement>(null);
  const gesto = React.useRef({ ativo: false, x0: 0, esq0: 0, andou: false });
  const [arrastando, setArrastando] = React.useState(false);

  /* Se há conteúdo escondido de cada lado, para o esmaecido dizer que tem
     mais — numa faixa sem barra de rolagem, é o único aviso. */
  const [bordas, setBordas] = React.useState({ esq: false, dir: false });

  const medir = React.useCallback(() => {
    const el = trilho.current;
    if (!el) return;
    const sobra = el.scrollWidth - el.clientWidth;
    setBordas({
      esq: el.scrollLeft > 1,
      /* Um pixel de folga: com zoom do navegador, `scrollLeft` chega a valores
         fracionários e a comparação exata deixaria o esmaecido aceso no fim. */
      dir: el.scrollLeft < sobra - 1,
    });
  }, []);

  React.useEffect(() => {
    const el = trilho.current;
    if (!el) return;
    medir();
    /* `ResizeObserver` e não só `resize` da janela: a faixa também muda de
       largura quando a barra lateral recolhe ou um canal entra na lista. */
    const observador = new ResizeObserver(medir);
    observador.observe(el);
    return () => observador.disconnect();
  }, [medir, children]);

  const temSobra = bordas.esq || bordas.dir;

  const aoDescer = (e: React.PointerEvent) => {
    if (e.pointerType !== "mouse" || e.button !== 0) return;
    const el = trilho.current;
    if (!el) return;
    gesto.current = {
      ativo: true,
      x0: e.clientX,
      esq0: el.scrollLeft,
      andou: false,
    };
  };

  const aoMover = (e: React.PointerEvent) => {
    const g = gesto.current;
    const el = trilho.current;
    if (!g.ativo || !el) return;

    const d = e.clientX - g.x0;
    if (!g.andou) {
      if (Math.abs(d) < LIMIAR_PX) return;
      g.andou = true;
      setArrastando(true);
      /*
       * Captura o ponteiro ao começar a andar de verdade.
       *
       * Sem isso, arrastar rápido e sair da faixa entrega o `pointerup` a
       * outro elemento: o gesto ficaria preso, e o próximo clique em qualquer
       * lugar seria engolido como fim de arraste.
       */
      el.setPointerCapture(e.pointerId);
    }
    el.scrollLeft = g.esq0 - d;
  };

  const aoSubir = () => {
    if (!gesto.current.ativo) return;
    gesto.current.ativo = false;
    setArrastando(false);
    /* `andou` sobrevive até o clique logo abaixo, que é quem o zera. */
  };

  /*
   * Engole o clique que fecha um arraste.
   *
   * Arrastar a faixa termina com o ponteiro sobre um cartão, e o navegador
   * dispara o clique — abrindo o canal em outra aba quando a intenção era só
   * rolar. Na fase de captura, antes de o link ver o evento.
   */
  const aoClicar = (e: React.MouseEvent) => {
    if (!gesto.current.andou) return;
    gesto.current.andou = false;
    e.preventDefault();
    e.stopPropagation();
  };

  return (
    <div
      ref={trilho}
      onPointerDown={aoDescer}
      onPointerMove={aoMover}
      onPointerUp={aoSubir}
      onPointerCancel={aoSubir}
      onClickCapture={aoClicar}
      /*
       * `overscroll-x-contain` para o arraste até o fim não virar o gesto de
       * "voltar" do navegador. `touch-pan-x` deixa o deslize horizontal para a
       * faixa e o vertical para a página, senão o dedo trava a rolagem do
       * telefone dentro dela.
       */
      className={cx(
        "flex gap-2.5 overflow-x-auto overscroll-x-contain pb-0.5 touch-pan-x sem-barra",
        /*
         * A mão só aparece quando há para onde arrastar.
         *
         * Se os itens cabem na tela, `cursor-grab` prometeria um gesto que não
         * leva a nada — e com poucos canais é o caso mais comum. Ter sobra é o
         * mesmo que ter alguma ponta escondida.
         */
        !temSobra
          ? ""
          : arrastando
            ? "cursor-grabbing select-none"
            : "cursor-grab",
        className
      )}
      style={{
        /* Esmaecido nas pontas onde há mais conteúdo. Em máscara e não em
           gradiente por cima, para funcionar sobre qualquer fundo. */
        maskImage: mascara(bordas),
        WebkitMaskImage: mascara(bordas),
      }}
      onScroll={medir}
    >
      {children}
    </div>
  );
}

/**
 * A máscara das pontas, com as paradas escritas uma a uma.
 *
 * Cada parada leva a sua posição de propósito: parada sem posição é
 * distribuída pelo navegador, e um "black" solto no fim da lista acabaria no
 * meio da faixa, apagando o conteúdo em vez das bordas.
 */
const LARGURA = "28px";

const mascara = ({ esq, dir }: { esq: boolean; dir: boolean }) => {
  if (!esq && !dir) return undefined;
  const paradas = [
    esq ? `transparent 0` : `black 0`,
    esq ? `black ${LARGURA}` : null,
    dir ? `black calc(100% - ${LARGURA})` : null,
    dir ? `transparent 100%` : `black 100%`,
  ].filter(Boolean);
  return `linear-gradient(to right, ${paradas.join(", ")})`;
};
