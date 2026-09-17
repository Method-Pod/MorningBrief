"use client";

import * as React from "react";

import { TEMA_PADRAO, TEMA_STORAGE, ehTema, type TemaKey } from "@/lib/tema";

/*
 * Espelha a mecânica de `accent.tsx` de propósito — mesma store fora do React,
 * mesma persistência, mesmo atributo no <html> — para haver um jeito só de
 * fazer isto no projeto, e não dois parecidos.
 *
 * A store fora do React não é enfeite: o seletor pode aparecer em mais de um
 * lugar, e com um `useState` por componente trocar num não atualizaria o
 * outro. Aqui o valor é único e todos os assinantes são avisados.
 */

export { TEMAS, type TemaKey } from "@/lib/tema";

let atual: TemaKey = TEMA_PADRAO;
const ouvintes = new Set<() => void>();

function ler(): TemaKey {
  const attr = document.documentElement.dataset.tema;
  if (attr === "claro" || attr === "escuro") return attr;
  try {
    const salvo = localStorage.getItem(TEMA_STORAGE);
    if (ehTema(salvo)) return salvo;
  } catch {
    // navegação privada: fica no automático
  }
  return TEMA_PADRAO;
}

/**
 * O tema que está de fato na tela agora.
 *
 * Diferente de `tema`, que pode ser "auto": isto responde "claro ou escuro?",
 * que é o que um ícone ou uma prévia precisa saber. Reage à troca no sistema
 * operacional enquanto a aba está aberta, porque o automático tem de reagir —
 * senão ele só valeria até o próximo recarregamento.
 */
export function useTemaEfetivo(): "claro" | "escuro" {
  const [escuro, setEscuro] = React.useState(false);

  React.useEffect(() => {
    const consulta = window.matchMedia("(prefers-color-scheme: dark)");
    const medir = () => {
      const escolhido = document.documentElement.dataset.tema;
      if (escolhido === "claro") return setEscuro(false);
      if (escolhido === "escuro") return setEscuro(true);
      setEscuro(consulta.matches);
    };
    medir();
    const avisar = () => medir();
    ouvintes.add(avisar);
    consulta.addEventListener("change", avisar);
    return () => {
      ouvintes.delete(avisar);
      consulta.removeEventListener("change", avisar);
    };
  }, []);

  return escuro ? "escuro" : "claro";
}

export function useTema() {
  const [tema, set] = React.useState<TemaKey>(atual);

  React.useEffect(() => {
    atual = ler();
    set(atual);
    const avisar = () => set(atual);
    ouvintes.add(avisar);
    return () => {
      ouvintes.delete(avisar);
    };
  }, []);

  const setTema = React.useCallback((t: TemaKey) => {
    atual = t;
    /*
     * No automático o atributo é REMOVIDO, e não escrito como "auto".
     *
     * O CSS decide pela ausência: o bloco da consulta de mídia casa em
     * `:not([data-tema="claro"])`, então sem atributo o sistema manda. Gravar
     * um valor que nenhuma regra usa deixaria no HTML um atributo que promete
     * configurar algo e não configura — e, pior, ele venceria a consulta de
     * mídia se algum dia alguém escrevesse uma regra para ele.
     */
    if (t === "auto") delete document.documentElement.dataset.tema;
    else document.documentElement.dataset.tema = t;
    try {
      localStorage.setItem(TEMA_STORAGE, t);
    } catch {
      // sem persistência: a escolha vale só nesta aba
    }
    ouvintes.forEach((fn) => fn());
  }, []);

  return { tema, setTema };
}

/** As mesmas cores do `themeColor` do layout, para o ajuste em tempo real. */
const COR_DA_BARRA = { claro: "#f1f4f7", escuro: "#0f1418" } as const;

/**
 * Mantém a cor da barra do navegador de acordo com a ESCOLHA, não com o
 * sistema.
 *
 * As etiquetas `theme-color` do layout são decididas por consulta de mídia, e
 * consulta de mídia só sabe do sistema operacional. Quem pede escuro num
 * aparelho claro ficava com o app escuro e uma faixa clara grudada no alto —
 * de novo o detalhe que denuncia tema escuro colado por fora.
 *
 * Não desenha nada. Existe para tocar no `<head>`, que é o único lugar onde
 * isto pode ser corrigido.
 */
export function CorDaBarra() {
  const efetivo = useTemaEfetivo();

  React.useEffect(() => {
    const cor = COR_DA_BARRA[efetivo];
    /*
     * As duas etiquetas do layout continuam lá, com as consultas de mídia, e
     * são a resposta certa antes de o JavaScript rodar. Esta terceira, sem
     * media, vem depois no <head> e vence as duas — então o automático segue
     * igual e só a escolha explícita muda alguma coisa.
     */
    let tag = document.querySelector<HTMLMetaElement>(
      'meta[name="theme-color"][data-mb]'
    );
    if (!tag) {
      tag = document.createElement("meta");
      tag.name = "theme-color";
      tag.dataset.mb = "";
      document.head.appendChild(tag);
    }
    tag.content = cor;
  }, [efetivo]);

  return null;
}
