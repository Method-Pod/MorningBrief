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
    <div className="flex min-w-0 items-center gap-2 sm:gap-3">
      {/* No telefone tudo encolhe -- círculo, ícone, número e rótulo --, para
          os três caberem numa linha. Pedido dele: diminuir, sem tirar o
          ícone. */}
      <span
        className={cx(
          "vidro-flutuante grid h-8 w-8 shrink-0 place-items-center rounded-full [&>svg]:h-3.5 [&>svg]:w-3.5 sm:h-11 sm:w-11 sm:[&>svg]:h-[17px] sm:[&>svg]:w-[17px]",
          tom === "neg" ? "text-neg" : "text-fg-dim"
        )}
      >
        {icone}
      </span>
      <span className="min-w-0">
        <span className="flex flex-wrap items-center gap-2">
          <b
            className={cx(
              "text-[18px] font-semibold leading-none tracking-[-0.03em] tnum sm:text-[22px]",
              tom === "neg" && "text-neg"
            )}
          >
            {valor}
          </b>
          {selo}
        </span>
        <span className="mt-1 block truncate text-[11px] font-medium text-fg-mute sm:text-[12px]">
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
 * linha só, compacta; do `sm` em diante eles seguem o título na mesma linha,
 * como na referência.
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
    <div className={cx("flex min-w-0 flex-wrap items-center gap-x-8 gap-y-3 sm:gap-y-4", className)}>
      <h1 className="titulo-pagina w-full min-w-0 sm:w-auto">{titulo}</h1>
      {children && (
        <div className="flex w-full flex-wrap items-center gap-x-4 gap-y-3 sm:w-auto sm:gap-x-7">
          {children}
        </div>
      )}
    </div>
  );
}
