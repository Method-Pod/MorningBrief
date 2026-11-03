"use client";

import * as React from "react";
import { registrarErro } from "@/lib/registrarErro";

/**
 * Os erros que escapam de tudo: exceção num clique, promessa que falhou sem
 * ninguém esperando. Não aparecem na tela -- por isso precisam ser
 * guardados. Ver lib/registrarErro.
 */
export function VigiaDeErros() {
  React.useEffect(() => {
    const aoErro = (e: ErrorEvent) => registrarErro(e.error ?? e.message);
    const aoRecusar = (e: PromiseRejectionEvent) => registrarErro(e.reason, "promessa sem tratamento");
    window.addEventListener("error", aoErro);
    window.addEventListener("unhandledrejection", aoRecusar);
    return () => {
      window.removeEventListener("error", aoErro);
      window.removeEventListener("unhandledrejection", aoRecusar);
    };
  }, []);
  return null;
}
