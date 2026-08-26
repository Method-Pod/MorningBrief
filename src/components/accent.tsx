"use client";

import * as React from "react";

export const ACCENTS = [
  { key: "red", hex: "#e72828", name: "Vermelho" },
  { key: "blue", hex: "#287ee7", name: "Azul" },
  { key: "green", hex: "#28e75e", name: "Verde" },
  { key: "yellow", hex: "#e7e128", name: "Amarelo" },
] as const;

export type AccentKey = (typeof ACCENTS)[number]["key"];

const KEY = "mb.accent";
const isAccent = (v: unknown): v is AccentKey =>
  ACCENTS.some((a) => a.key === v);

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
