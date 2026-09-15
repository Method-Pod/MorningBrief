"use client";

import * as React from "react";

import { useDesign } from "./design";

/*
 * Esmaecido no alto e embaixo de uma lista que rola.
 *
 * Uma lista com altura travada corta o conteúdo numa linha reta, e linha reta
 * não diz nada: metade de um item aparecendo embaixo pode ser o fim da lista
 * ou pode ser mais vinte. O esmaecido diz que continua — e some sozinho na
 * ponta onde não há mais nada, então também diz quando acabou.
 *
 * É o mesmo mecanismo que o `Carrossel` já usa no sentido horizontal, medindo
 * a rolagem em JavaScript. Tentei antes resolver isto só em CSS, com máscara
 * fixa, e estava errado: máscara fixa desbota o primeiro item mesmo quando a
 * lista está no topo e não há nada escondido ali. Quem sabe se há conteúdo
 * escondido é a posição da rolagem, e isso precisa ser medido.
 *
 * Máscara e não gradiente sobreposto: sobreposição precisa saber a cor do
 * fundo, e aqui o fundo muda com o accent escolhido — algumas destas listas
 * ficam sobre branco, outras sobre `--a-sink`.
 */

/** Altura do esmaecido. Curto: é uma dica, não uma cortina. */
const FOLGA = "14px";

const mascara = ({ topo, base }: { topo: boolean; base: boolean }) => {
  if (!topo && !base) return undefined;
  const paradas = [
    topo ? `transparent 0` : `black 0`,
    topo ? `black ${FOLGA}` : null,
    base ? `black calc(100% - ${FOLGA})` : null,
    base ? `transparent 100%` : `black 100%`,
  ].filter(Boolean);
  return `linear-gradient(to bottom, ${paradas.join(", ")})`;
};

/**
 * Devolve o que pendurar no elemento que rola: `ref`, `onScroll` e `style`.
 *
 * Espalhe os três no mesmo elemento que tem `overflow-y-auto`. O `style`
 * carrega só a máscara, então pode ser combinado com outros estilos em linha.
 */
export function useBordasRolagem<T extends HTMLElement>() {
  /*
   * Ref de callback, e não `useRef`.
   *
   * Metade destas listas vive dentro de um modal, que só existe no DOM quando
   * aberto. Com `useRef`, o efeito de medir roda na montagem do componente —
   * quando o modal ainda está fechado e `ref.current` é nulo — sai pela porta
   * dos fundos e nunca mais é chamado, porque abrir o modal não muda nenhuma
   * dependência. O esmaecido simplesmente não apareceria.
   *
   * Ref de callback vira estado: o nó entra, o efeito acorda, os observadores
   * se ligam nele; o modal fecha, o nó sai, e eles se soltam.
   */
  const [no, setNo] = React.useState<T | null>(null);
  const { modo } = useDesign();
  const [bordas, setBordas] = React.useState({ topo: false, base: false });

  const medir = React.useCallback(() => {
    if (!no) return;
    const sobra = no.scrollHeight - no.clientHeight;
    setBordas({
      topo: no.scrollTop > 1,
      /* Um pixel de folga: com zoom do navegador `scrollTop` chega a valores
         fracionários, e a comparação exata deixaria o esmaecido de baixo aceso
         para sempre no fim da lista. Mesma folga do Carrossel. */
      base: no.scrollTop < sobra - 1,
    });
  }, [no]);

  React.useEffect(() => {
    if (!no) return;
    medir();

    /* A caixa muda de tamanho: a altura é em `vh`, então girar o telefone ou
       redimensionar a janela muda o quanto cabe. */
    const aoRedimensionar = new ResizeObserver(medir);
    aoRedimensionar.observe(no);

    /*
     * E o conteúdo muda sem a caixa mudar.
     *
     * Marcar um item, apagar uma parcela, filtrar — o `scrollHeight` muda e o
     * `clientHeight` não, então o ResizeObserver sozinho não acorda. Sem isto
     * o esmaecido de baixo ficaria aceso numa lista que encolheu e já cabe
     * inteira.
     */
    const aoMudarConteudo = new MutationObserver(medir);
    aoMudarConteudo.observe(no, { childList: true, subtree: true });

    return () => {
      aoRedimensionar.disconnect();
      aoMudarConteudo.disconnect();
    };
  }, [no, medir]);

  const ligado = modo !== "padrao";

  return {
    ref: setNo,
    onScroll: medir,
    style: {
      maskImage: ligado ? mascara(bordas) : undefined,
      WebkitMaskImage: ligado ? mascara(bordas) : undefined,
    } as React.CSSProperties,
  };
}
