"use client";

import * as React from "react";

/**
 * Um número que sobe até o valor, em vez de aparecer pronto.
 *
 * É o gesto dos números grandes da referência: o painel abre e os valores
 * correm do zero até o lugar, desacelerando no fim. Quando o valor muda depois
 * (uma tarefa concluída, uma conta paga), ele corre do valor antigo ao novo,
 * e não do zero de novo.
 *
 * Quem pediu menos movimento no sistema vê o número pronto.
 */
export function Contador({
  valor,
  formatar = (n) => String(Math.round(n)),
  duracao = 1100,
}: {
  valor: number;
  formatar?: (n: number) => string;
  duracao?: number;
}) {
  const [mostrado, setMostrado] = React.useState(0);
  const anterior = React.useRef(0);

  React.useEffect(() => {
    const de = anterior.current;
    anterior.current = valor;
    const quieto = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    if (quieto || de === valor) {
      setMostrado(valor);
      return;
    }
    let id = 0;
    const inicio = performance.now();
    const passo = (agora: number) => {
      const p = Math.min(1, (agora - inicio) / duracao);
      /* Saída exponencial: quase tudo acontece no começo e o fim chega devagar. */
      const curva = p === 1 ? 1 : 1 - Math.pow(2, -10 * p);
      setMostrado(de + (valor - de) * curva);
      if (p < 1) id = requestAnimationFrame(passo);
    };
    id = requestAnimationFrame(passo);
    return () => cancelAnimationFrame(id);
  }, [valor, duracao]);

  return <span className="tnum">{formatar(mostrado)}</span>;
}
