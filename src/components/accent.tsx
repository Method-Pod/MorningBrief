"use client";

import * as React from "react";

/*
 * A ordem segue a roda de cores, não a de criação: com oito opções, agrupar por
 * matiz faz a fileira de bolinhas ser lida de uma vez.
 */
export const ACCENTS = [
  { key: "red", hex: "#e72828", name: "Vermelho" },
  { key: "orange", hex: "#e78e28", name: "Laranja" },
  { key: "yellow", hex: "#e7e128", name: "Amarelo" },
  { key: "green", hex: "#28e75e", name: "Verde" },
  { key: "cyan", hex: "#28e7e1", name: "Ciano" },
  { key: "blue", hex: "#287ee7", name: "Azul" },
  { key: "violet", hex: "#7e28e7", name: "Violeta" },
  { key: "pink", hex: "#e7288e", name: "Rosa" },
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
