"use client";

import * as React from "react";

import { ACCENTS, ehAccent, type AccentKey } from "@/lib/accents";

/*
 * A lista em si mora em `lib/accents`, que não é módulo de cliente: o layout
 * raiz precisa das mesmas chaves para montar o script que roda antes da
 * primeira pintura. Reexportada aqui para os pontos de uso não mudarem de
 * endereço.
 */
export { ACCENTS, type AccentKey } from "@/lib/accents";

const KEY = "mb.accent";
const isAccent = ehAccent;

/*
 * Store minúscula fora do React.
 *
 * O seletor existe em dois lugares — barra lateral e página de Conta. Com um
 * useState por componente, trocar num não atualizaria o outro: os dois ficariam
 * mostrando qual está ativo de forma divergente. Aqui o valor é único e todos
 * os assinantes são avisados.
 */
let current: AccentKey = "blue";
const listeners = new Set<() => void>();

function read(): AccentKey {
  const attr = document.documentElement.dataset.accent;
  if (isAccent(attr)) return attr;
  try {
    const saved = localStorage.getItem(KEY);
    if (isAccent(saved)) return saved;
  } catch {
    // navegação privada: fica no padrão
  }
  return "blue";
}

export function useAccent() {
  const [accent, set] = React.useState<AccentKey>(current);

  React.useEffect(() => {
    current = read();
    set(current);
    const notify = () => set(current);
    listeners.add(notify);
    return () => {
      listeners.delete(notify);
    };
  }, []);

  const setAccent = React.useCallback((key: AccentKey) => {
    current = key;
    document.documentElement.dataset.accent = key;
    try {
      localStorage.setItem(KEY, key);
    } catch {
      // sem persistência: a escolha vale só nesta aba
    }
    listeners.forEach((fn) => fn());
  }, []);

  return { accent, setAccent };
}
