"use client";

import * as React from "react";

/**
 * Arrastar para ordenar uma lista curta.
 *
 * Nada a ver com `arrastarCartao`, que tira o cartão da coluna e o leva para
 * outra: aqui o item não sai da lista, ele só troca de lugar dentro dela. Por
 * isso não há cópia clonada no `body`, nem inclinação, nem mola de volta — o
 * que a lista precisa é abrir a vaga onde o item vai cair, e isso é uma
 * translação nos vizinhos.
 *
 * Feito para listas de poucos itens, que é onde ordem manual faz sentido. As
 * alturas de todas as linhas são medidas UMA vez, quando o arrasto começa, e
 * não a cada movimento: medir dentro do `pointermove` obrigaria o navegador a
 * recalcular o desenho a cada pixel.
 *
 * O punho é um `<button>` de verdade, e não uma `<div>` com ícone: assim ele
 * recebe foco pelo teclado, e as setas movem o item sem ponteiro nenhum.
 */

type Vivo<T> = {
  de: number;
  para: number;
  topos: number[];
  alturas: number[];
  y0: number;
  /* A lista congelada no começo do arrasto. Se a tela recarregar no meio, o
     que vai para o banco é o que estava na mão de quem arrastou. */
  itens: T[];
};

type Estado = { de: number; para: number; dy: number; altura: number };

export function useListaOrdenavel<T extends { id: string }>(
  itens: T[],
  aoOrdenar: (ordenados: T[]) => void
) {
  const lista = React.useRef<HTMLUListElement | null>(null);
  const vivo = React.useRef<Vivo<T> | null>(null);
  const [estado, setEstado] = React.useState<Estado | null>(null);

  const mover = React.useCallback(
    (de: number, para: number) => {
      if (para < 0 || para >= itens.length || para === de) return;
      const novo = itens.slice();
      const [x] = novo.splice(de, 1);
      novo.splice(para, 0, x);
      aoOrdenar(novo);
    },
    [itens, aoOrdenar]
  );

  const aoPegar = (i: number) => (e: React.PointerEvent<HTMLElement>) => {
    /* Botão direito e botão do meio não arrastam. */
    if (e.pointerType === "mouse" && e.button !== 0) return;
    const ul = lista.current;
    if (!ul) return;
    const linhas = Array.from(
      ul.querySelectorAll<HTMLElement>("[data-ordenavel]")
    );
    if (linhas.length < 2) return;

    vivo.current = {
      de: i,
      para: i,
      topos: linhas.map((l) => l.offsetTop),
      alturas: linhas.map((l) => l.offsetHeight),
      y0: e.clientY,
      itens,
    };
    /* A captura manda todo `pointermove` para o punho, mesmo quando o
       ponteiro sai de cima dele — e sair de cima dele é o que acontece
       assim que o arrasto começa.

       No `try` porque `setPointerCapture` lança quando o ponteiro já não
       está ativo — o botão sumir entre o toque e este ponto basta. Sem ele,
       a exceção subiria e derrubaria a tela inteira por causa de um arrasto
       que nem começou. */
    try {
      e.currentTarget.setPointerCapture(e.pointerId);
    } catch {
      vivo.current = null;
      return;
    }
    setEstado({ de: i, para: i, dy: 0, altura: linhas[i].offsetHeight });
  };

  const aoMover = (e: React.PointerEvent<HTMLElement>) => {
    const v = vivo.current;
    if (!v) return;
    const dy = e.clientY - v.y0;

    /*
     * O item troca de vaga quando o CENTRO dele passa do centro do vizinho,
     * e não quando a borda encosta. Pelo centro, a vaga abre no momento em
     * que o item já está mais lá do que aqui — é onde o olho espera.
     */
    const centro = v.topos[v.de] + dy + v.alturas[v.de] / 2;
    let para = v.de;
    while (para > 0 && centro < v.topos[para - 1] + v.alturas[para - 1] / 2)
      para--;
    while (
      para < v.topos.length - 1 &&
      centro > v.topos[para + 1] + v.alturas[para + 1] / 2
    )
      para++;

    v.para = para;
    setEstado({ de: v.de, para, dy, altura: v.alturas[v.de] });
  };

  const aoSoltar = () => {
    const v = vivo.current;
    vivo.current = null;
    setEstado(null);
    if (v && v.para !== v.de) {
      const novo = v.itens.slice();
      const [x] = novo.splice(v.de, 1);
      novo.splice(v.para, 0, x);
      aoOrdenar(novo);
    }
  };

  /**
   * O deslocamento de cada linha durante o arrasto.
   *
   * A transição entra AQUI, e só enquanto há arrasto. Solto, o objeto volta
   * vazio — sem `transform` e sem `transition` —, então a linha assume a vaga
   * nova de uma vez. Se a transição sobrevivesse à soltura, cada linha
   * animaria de volta ao zero ao mesmo tempo em que muda de posição na
   * lista, e o que se veria era tudo andando duas vezes.
   */
  const estilo = (i: number): React.CSSProperties => {
    if (!estado) return {};
    const { de, para, dy, altura } = estado;
    if (i === de)
      return {
        transform: `translateY(${dy}px)`,
        position: "relative",
        zIndex: 2,
      };
    const sobe = de < para && i > de && i <= para;
    const desce = de > para && i >= para && i < de;
    return {
      transform: sobe
        ? `translateY(${-altura}px)`
        : desce
          ? `translateY(${altura}px)`
          : undefined,
      transition: "transform 140ms cubic-bezier(0.2, 0, 0, 1)",
    };
  };

  /** Tudo que o punho de uma linha precisa. Espalhe no `<button>`. */
  const punho = (i: number) => ({
    onPointerDown: aoPegar(i),
    onPointerMove: aoMover,
    onPointerUp: aoSoltar,
    onPointerCancel: aoSoltar,
    onKeyDown: (e: React.KeyboardEvent) => {
      if (e.key !== "ArrowUp" && e.key !== "ArrowDown") return;
      e.preventDefault();
      mover(i, i + (e.key === "ArrowDown" ? 1 : -1));
    },
    /* Sem isto, no toque o dedo rola a página em vez de arrastar a linha. */
    style: { touchAction: "none" as const },
  });

  return {
    refLista: lista,
    arrastando: estado?.de ?? null,
    estilo,
    punho,
  };
}
