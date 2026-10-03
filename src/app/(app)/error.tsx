"use client";

import * as React from "react";
import Link from "next/link";
import { AlertTriangle, RotateCcw } from "lucide-react";

/*
 * Quando uma tela quebra ao desenhar.
 *
 * Não existia: uma exceção em qualquer página — um dado inesperado vindo do
 * banco, por exemplo — derrubava o app inteiro na tela padrão do Next, em
 * branco e sem caminho de volta. Aqui o erro fica preso à tela que falhou: a
 * barra lateral continua de pé, dá para tentar de novo ou ir para outra área,
 * e nada do que está gravado se perde.
 */
export default function ErroDaTela({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  React.useEffect(() => {
    console.error("[tela] erro ao desenhar", error);
  }, [error]);

  return (
    <div className="rise mx-auto mt-10 max-w-[460px] rounded-[22px] bg-ink-900 p-7 text-center shadow-[var(--elev-2)]">
      <div className="mx-auto grid h-12 w-12 place-items-center rounded-[14px] bg-neg/12 text-neg">
        <AlertTriangle size={22} />
      </div>
      <h1 className="mt-4 text-[19px] font-bold tracking-[-0.02em]">
        Esta tela não abriu
      </h1>
      <p className="mt-1.5 text-[13.5px] leading-relaxed text-fg-mute">
        Algo deu errado ao montar a página. Seus dados continuam salvos — é só a
        tela que falhou.
      </p>
      {error.digest && (
        <p className="mt-2 text-[11px] text-fg-mute tnum">código {error.digest}</p>
      )}
      <div className="mt-6 flex flex-wrap justify-center gap-2.5">
        <button
          onClick={reset}
          className="inline-flex h-10 items-center gap-2 rounded-[12px] bg-brand-500 px-4 text-[13.5px] font-semibold text-on-brand transition-[filter] hover:brightness-95"
        >
          <RotateCcw size={15} /> Tentar de novo
        </button>
        <Link
          href="/"
          className="inline-flex h-10 items-center rounded-[12px] bg-ink-800 px-4 text-[13.5px] font-semibold text-fg-dim transition-colors hover:text-fg"
        >
          Ir para o Início
        </Link>
      </div>
    </div>
  );
}
