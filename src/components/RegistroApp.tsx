"use client";

import { useEffect } from "react";

/**
 * Registra o sw.js. Não desenha nada.
 *
 * Duas decisões que valem explicação:
 *
 * **Só em produção.** Em desenvolvimento os arquivos de /_next/static trocam a
 * cada salvamento sem trocar de nome, e um cache por nome de arquivo passaria
 * a servir o módulo velho — que é exatamente o sintoma de "mudei o código e o
 * navegador não viu", só que passando a ser permanente e invisível.
 *
 * **Depois do `load`.** Registrar durante o carregamento coloca o download do
 * sw.js e a instalação dele para disputar rede e CPU com a primeira pintura da
 * página. O ganho dele é a partir da segunda visita, então não há motivo para
 * atrasar a primeira.
 */
export function RegistroApp() {
  useEffect(() => {
    if (process.env.NODE_ENV !== "production") return;
    if (!("serviceWorker" in navigator)) return;

    const registrar = () => {
      navigator.serviceWorker.register("/sw.js").catch(() => {
        /* Silencioso de propósito: sem ele o app perde a tela de sem-sinal e
           o convite de instalar, e nada mais. Não é erro para mostrar. */
      });
    };

    if (document.readyState === "complete") {
      registrar();
      return;
    }
    window.addEventListener("load", registrar);
    return () => window.removeEventListener("load", registrar);
  }, []);

  return null;
}
