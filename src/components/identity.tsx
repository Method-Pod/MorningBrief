"use client";

import * as React from "react";

export type Identidade = { email: string; nome: string };

const Ctx = React.createContext<Identidade>({ email: "", nome: "" });

/**
 * Identidade vinda do servidor, compartilhada com as páginas.
 *
 * A alternativa seria cada página chamar getClaims() no mount, mas aí a
 * saudação renderizaria "Bom dia" e só depois viraria "Bom dia, Cauã" —
 * piscando no primeiro frame. O layout já tem esse dado; o contexto só o
 * repassa, então o nome chega junto com o resto da tela.
 */
export function IdentityProvider({
  value,
  children,
}: {
  value: Identidade;
  children: React.ReactNode;
}) {
  const memo = React.useMemo(() => value, [value.email, value.nome]);
  return <Ctx.Provider value={memo}>{children}</Ctx.Provider>;
}

export const useIdentity = () => React.useContext(Ctx);
