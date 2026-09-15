"use client";

import * as React from "react";

/*
 * O interruptor entre a interface atual e a de antes.
 *
 * Existe porque uma mudança de aparência não se avalia lendo a lista do que
 * mudou: se avalia usando o app por uns dias e conseguindo comparar. Sem um
 * caminho de volta, a única forma de comparar seria desfazer no git — o que
 * não é uma escolha que se oferece a quem usa o app, é uma que se pede a quem
 * escreve ele.
 *
 * "padrao" não é um tema alternativo. É o estado exato de antes: cada valor
 * que a camada nova introduziu volta ao que tinha. Ver o bloco
 * `:root[data-design="padrao"]` em globals.css.
 *
 * Espelha a mecânica de `accent.tsx` de propósito — mesma store fora do
 * React, mesma persistência em localStorage, mesmo atributo no <html> — para
 * haver um jeito só de fazer isto no projeto, e não dois parecidos.
 */

export type ModoDesign = "atual" | "padrao";

const KEY = "mb.design";
const ehModo = (v: unknown): v is ModoDesign => v === "atual" || v === "padrao";

let current: ModoDesign = "atual";
const listeners = new Set<() => void>();

function read(): ModoDesign {
  if (document.documentElement.dataset.design === "padrao") return "padrao";
  try {
    const saved = localStorage.getItem(KEY);
    if (ehModo(saved)) return saved;
  } catch {
    // navegação privada: fica no atual
  }
  return "atual";
}

/**
 * Lido pelo arrasto, que não é CSS e por isso não enxerga a variável.
 *
 * O voo de volta do cartão faz parte da mesma camada que este interruptor
 * desliga. Sem esta consulta, apertar "voltar ao padrão" devolveria a
 * aparência e deixaria o movimento novo rodando — meia volta, que é pior que
 * nenhuma, porque ninguém conseguiria dizer o que o botão faz.
 */
export function modoPadraoLigado() {
  if (typeof document === "undefined") return false;
  return document.documentElement.dataset.design === "padrao";
}

export function useDesign() {
  const [modo, set] = React.useState<ModoDesign>(current);

  React.useEffect(() => {
    current = read();
    set(current);
    const notify = () => set(current);
    listeners.add(notify);
    return () => {
      listeners.delete(notify);
    };
  }, []);

  const setModo = React.useCallback((m: ModoDesign) => {
    current = m;
    /*
     * O atributo é removido no modo atual, em vez de receber "atual".
     *
     * O CSS casa em `[data-design="padrao"]`, então ausência já significa
     * atual. Escrever um valor que nenhuma regra usa deixaria no HTML um
     * atributo que promete configurar algo e não configura.
     */
    if (m === "padrao") document.documentElement.dataset.design = "padrao";
    else delete document.documentElement.dataset.design;
    try {
      localStorage.setItem(KEY, m);
    } catch {
      // sem persistência: a escolha vale só nesta aba
    }
    listeners.forEach((fn) => fn());
  }, []);

  return { modo, setModo };
}
