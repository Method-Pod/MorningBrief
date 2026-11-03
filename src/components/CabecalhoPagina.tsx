import * as React from "react";

import { cx } from "./ui";

/**
 * Um número do cabeçalho: ícone num círculo de vidro, valor e rótulo.
 *
 * É o desenho da referência ao lado do título ("$48,517 / Won this month"):
 * o número grande, a explicação pequena embaixo e, quando há, um selo de
 * alerta ao lado do valor.
 */
export function Kpi({
  icone,
  valor,
  rotulo,
  selo,
  tom,
}: {
  icone: React.ReactNode;
  valor: React.ReactNode;
  rotulo: string;
  selo?: React.ReactNode;
  /** "neg" pinta o valor de vermelho: atrasada, vencida. */
  tom?: "neg";
}) {
  return (
    <div className="flex min-w-0 items-center gap-3">
      <span
        className={cx(
          "vidro-flutuante grid h-11 w-11 shrink-0 place-items-center rounded-full",
          tom === "neg" ? "text-neg" : "text-fg-dim"
        )}
      >
        {icone}
      </span>
      <span className="min-w-0">
        <span className="flex flex-wrap items-center gap-2">
          <b
            className={cx(
              "text-[22px] font-semibold leading-none tracking-[-0.03em] tnum",
              tom === "neg" && "text-neg"
            )}
          >
            {valor}
          </b>
          {selo}
        </span>
        <span className="mt-1 block truncate text-[12px] font-medium text-fg-mute">
          {rotulo}
        </span>
      </span>
    </div>
  );
}

/**
 * O título da tela e os números dela, lado a lado.
 *
 * No telefone o título ocupa a linha inteira e os números descem para uma
 * grade de duas colunas; do `sm` em diante eles seguem o título na mesma
 * linha, como na referência.
 */
export function TituloComNumeros({
  titulo,
  children,
  className,
}: {
  titulo: React.ReactNode;
  /** Os `<Kpi>`. */
  children?: React.ReactNode;
  className?: string;
}) {
  return (
    <div className={cx("flex min-w-0 flex-wrap items-center gap-x-8 gap-y-4", className)}>
      <h1 className="titulo-pagina w-full min-w-0 sm:w-auto">{titulo}</h1>
      {children && (
        <div className="grid w-full grid-cols-2 gap-4 sm:flex sm:w-auto sm:flex-wrap sm:items-center sm:gap-x-7">
          {children}
        </div>
      )}
    </div>
  );
}
