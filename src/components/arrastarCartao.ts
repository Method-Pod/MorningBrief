"use client";

import * as React from "react";

/**
 * Arrasto de cartão entre colunas, com o cartão seguindo o ponteiro.
 *
 * Substitui o arrasto nativo do HTML por eventos de ponteiro, porque a imagem
 * que o nativo arrasta é gerada pelo navegador e não aceita transform: não há
 * como inclinar nem controlar como ela segue o cursor.
 *
 * Vale só para ponteiro fino — ver a nota sobre toque em `iniciar`.
 *
 * Nada aqui passa por estado do React. A cópia que segue o ponteiro é um nó
 * clonado no `body`, movido por `transform` dentro de um `requestAnimationFrame`
 * — um elemento, uma escrita por quadro, zero re-render do quadro inteiro.
 */

/** Graus por pixel de deslocamento horizontal, e o teto da inclinação. */
const GRAU_POR_PX = 0.55;
const GRAU_MAX = 9;
/** Suavização da inclinação: 0 travaria, 1 seguiria cru e tremeria. */
const SUAVIDADE = 0.18;
/** Distância antes de virar arrasto, para não roubar clique nem rolagem. */
const LIMIAR_PX = 6;

const trava = (v: number, min: number, max: number) =>
  Math.min(max, Math.max(min, v));

type Opcoes<T> = {
  /** Onde o cartão foi solto, ou nada se caiu fora de uma coluna. */
  onSoltar: (item: T, coluna: string) => void;
};

export function useArrastarCartao<T>({ onSoltar }: Opcoes<T>) {
  /* Tudo em ref: nada disto deve provocar render. */
  const estado = React.useRef<{
    item: T;
    origem: HTMLElement;
    clone: HTMLElement | null;
    x0: number;
    y0: number;
    ultimoX: number;
    grau: number;
    grauAlvo: number;
    dx: number;
    dy: number;
    largura: number;
    esqueda: number;
    topo: number;
    alvo: HTMLElement | null;
    ativo: boolean;
    quadro: number | null;
  } | null>(null);

  const limpar = React.useCallback(() => {
    const e = estado.current;
    if (!e) return;
    if (e.quadro !== null) cancelAnimationFrame(e.quadro);
    e.clone?.remove();
    delete e.origem.dataset.arrastando;
    if (e.alvo) delete e.alvo.dataset.alvo;
    delete document.body.dataset.arrastandoCartao;
    document.body.style.removeProperty("cursor");
    estado.current = null;
  }, []);

  /** Desenha a posição e a inclinação atuais. Roda uma vez por quadro. */
  const desenhar = React.useCallback(() => {
    const e = estado.current;
    if (!e?.clone) return;
    /* A inclinação persegue o alvo em vez de saltar: seguir o deslocamento cru
       fazia o cartão tremer a cada movimento pequeno do ponteiro. */
    e.grau += (e.grauAlvo - e.grau) * SUAVIDADE;
    e.clone.style.transform = `translate3d(${e.dx}px, ${e.dy}px, 0) rotate(${e.grau.toFixed(2)}deg) scale(1.03)`;
    e.quadro = requestAnimationFrame(desenhar);
  }, []);

  const mover = React.useCallback(
    (ev: PointerEvent) => {
      const e = estado.current;
      if (!e) return;

      e.dx = ev.clientX - e.x0;
      e.dy = ev.clientY - e.y0;

      /* Só vira arrasto depois do limiar. Antes disso o gesto ainda pode ser um
         clique num botão do cartão, ou o começo de uma rolagem. */
      if (!e.ativo) {
        if (Math.hypot(e.dx, e.dy) < LIMIAR_PX) return;
        e.ativo = true;
        e.origem.dataset.arrastando = "1";
        document.body.dataset.arrastandoCartao = "1";
        document.body.style.cursor = "grabbing";
        /* Descarta o que já estivesse selecionado: `user-select:none` impede
           selecionar dali para frente, mas não apaga uma seleção anterior, e
           ela ficaria grifada durante todo o gesto. */
        window.getSelection()?.removeAllRanges();

        const clone = e.origem.cloneNode(true) as HTMLElement;
        delete clone.dataset.arrastando;
        clone.style.cssText = `position:fixed;left:${e.esqueda}px;top:${e.topo}px;width:${e.largura}px;margin:0;pointer-events:none;z-index:60;will-change:transform;box-shadow:0 18px 40px -12px rgb(20 24 26 / 0.28);`;
        /* A cópia não deve repetir a animação de entrada do original. */
        clone.classList.remove("entra", "levanta");
        document.body.appendChild(clone);
        e.clone = clone;
        e.quadro = requestAnimationFrame(desenhar);
      }

      e.grauAlvo = trava(
        (ev.clientX - e.ultimoX) * GRAU_POR_PX,
        -GRAU_MAX,
        GRAU_MAX
      );
      e.ultimoX = ev.clientX;

      /*
       * A coluna sob o ponteiro, não sob a cópia.
       *
       * `elementFromPoint` ignora a cópia porque ela tem `pointer-events:none`
       * — sem isso, a cópia estaria sempre no caminho e nenhuma coluna seria
       * encontrada.
       */
      const sob = document
        .elementFromPoint(ev.clientX, ev.clientY)
        ?.closest<HTMLElement>("[data-coluna]");
      if (sob !== e.alvo) {
        if (e.alvo) delete e.alvo.dataset.alvo;
        if (sob) sob.dataset.alvo = "1";
        e.alvo = sob ?? null;
      }
    },
    [desenhar]
  );

  const soltar = React.useCallback(
    (ev: PointerEvent) => {
      const e = estado.current;
      if (!e) return;
      const coluna = e.alvo?.dataset.coluna;
      const item = e.item;
      const arrastou = e.ativo;

      window.removeEventListener("pointermove", mover);
      window.removeEventListener("pointerup", soltar);
      window.removeEventListener("pointercancel", cancelar);
      limpar();

      /* Sem `ativo`, o ponteiro nem passou do limiar: foi um clique, e quem
         cuida dele são os próprios botões do cartão. */
      if (arrastou && coluna) onSoltar(item, coluna);
      ev.preventDefault?.();
    },
    [limpar, mover, onSoltar]
  );

  const cancelar = React.useCallback(() => {
    window.removeEventListener("pointermove", mover);
    window.removeEventListener("pointerup", soltar);
    window.removeEventListener("pointercancel", cancelar);
    limpar();
  }, [limpar, mover, soltar]);

  /** Chame no `onPointerDown` do cartão. */
  const iniciar = React.useCallback(
    (ev: React.PointerEvent<HTMLElement>, item: T) => {
      /*
       * Toque fica de fora, e é decisão, não esquecimento.
       *
       * No celular as colunas empilham — arrastar de "A fazer" para "Concluída"
       * exigiria rolar durante o gesto — e a coluna vazia nem aparece, então
       * metade dos destinos não existe. Além disso, capturar o toque aqui
       * brigaria com a rolagem da página. Quem move no telefone é o botão de
       * avançar no cartão, ou o campo Status na visão de lista.
       */
      if (ev.pointerType === "touch") return;

      /* Botão direito, ou o gesto começando num controle do cartão: não é
         arrasto. Sem esta checagem, apertar a lixeira já movia o cartão. */
      if (ev.button !== 0) return;
      if ((ev.target as HTMLElement).closest("button, a, input, select, textarea"))
        return;

      const origem = ev.currentTarget;
      const r = origem.getBoundingClientRect();

      estado.current = {
        item,
        origem,
        clone: null,
        x0: ev.clientX,
        y0: ev.clientY,
        ultimoX: ev.clientX,
        grau: 0,
        grauAlvo: 0,
        dx: 0,
        dy: 0,
        largura: r.width,
        esqueda: r.left,
        topo: r.top,
        alvo: null,
        ativo: false,
        quadro: null,
      };

      window.addEventListener("pointermove", mover);
      window.addEventListener("pointerup", soltar);
      window.addEventListener("pointercancel", cancelar);
    },
    [cancelar, mover, soltar]
  );

  /* Solta tudo se o componente sair no meio do gesto. */
  React.useEffect(() => cancelar, [cancelar]);

  return { iniciar };
}
