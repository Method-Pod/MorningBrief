"use client";

import * as React from "react";

/**
 * Estado que sobrevive à troca de aba.
 *
 * Cada página começava com `loading: true` e consultava o banco do zero a cada
 * visita — voltar para uma aba que você deixou três segundos atrás dava tela
 * vazia e duas consultas novas. Era o que parecia travamento na troca de aba:
 * não era a navegação sendo lenta, era a página recomeçando da estaca zero.
 *
 * Agora a última leitura fica em memória do módulo, que sobrevive à navegação
 * do lado do cliente. A aba abre com o que já se sabia e a consulta acontece
 * atrás — a tela nunca fica vazia numa segunda visita.
 *
 * Não é cache de rede nem persistência: recarregar a página zera tudo, de
 * propósito. O que se ganha é a troca de aba, não a abertura do app.
 */

const memoria = new Map<string, unknown>();

export const lido = <T,>(chave: string): T | undefined =>
  memoria.get(chave) as T | undefined;

/** Havia algo guardado? Decide se a aba já pode abrir com conteúdo. */
export const temCache = (...chaves: string[]) =>
  chaves.every((c) => memoria.has(c));

/**
 * Esquece tudo.
 *
 * Chamado ao sair da conta: a memória é por aba do navegador, e sem isto os
 * dados de quem saiu apareceriam por um instante para quem entrasse depois na
 * mesma aba.
 */
export const limparCache = () => memoria.clear();

/**
 * `useState` que guarda cada valor novo na memória do módulo.
 *
 * A assinatura é a do `useState`, inclusive a forma com função, porque as
 * páginas atualizam listas com `setRows((r) => ...)` em vários lugares e
 * trocar isso espalharia a mudança por dezenas de linhas.
 */
export function useEstadoCacheado<T>(chave: string, inicial: T) {
  const [valor, setValor] = React.useState<T>(() => lido<T>(chave) ?? inicial);

  const set = React.useCallback(
    (novo: T | ((anterior: T) => T)) => {
      setValor((anterior) => {
        const proximo =
          typeof novo === "function"
            ? (novo as (a: T) => T)(anterior)
            : novo;
        memoria.set(chave, proximo);
        return proximo;
      });
    },
    [chave]
  );

  return [valor, set] as const;
}
