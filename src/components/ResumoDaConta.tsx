import * as React from "react";

import { brl, dataCurta, daysUntil } from "@/lib/format";

/**
 * O resumo da conta no topo do painel de edição, como o cartão colorido da
 * referência: vencimento e situação em cima, o nome grande, o valor grande
 * embaixo. Acompanha o que se digita, então mostra a conta como vai ficar.
 *
 * A cor diz a situação de relance: verde paga, vermelho vencida, e o roxo do
 * app para o que está em aberto no prazo.
 */
export function ResumoDaConta({
  descricao,
  valor,
  vencimento,
  pago,
  tipo,
  categoria,
  parcela,
}: {
  descricao: string;
  /** Nulo ou NaN enquanto o campo está vazio ou não é número. */
  valor: number | null;
  vencimento: string;
  pago: boolean;
  tipo: string;
  categoria?: string;
  /** "3/6", na parcelada. */
  parcela?: string | null;
}) {
  const temData = /^\d{4}-\d{2}-\d{2}$/.test(vencimento);
  const vencida = !pago && temData && daysUntil(vencimento) < 0;
  const tom = pago ? "var(--cor-pos)" : vencida ? "var(--cor-neg)" : "var(--a)";
  const situacao = pago ? "Paga" : vencida ? "Vencida" : "Em aberto";

  return (
    <div
      style={{ "--tom": tom } as React.CSSProperties}
      className="rounded-[22px] border border-[color-mix(in_srgb,var(--tom)_40%,var(--vidro-borda))] bg-[color-mix(in_srgb,var(--tom)_22%,var(--vidro))] p-4 shadow-[inset_0_1px_0_var(--vidro-brilho)]"
    >
      <div className="flex items-center justify-between gap-2">
        <span className="text-[12px] font-medium text-fg-dim">
          {temData ? `Vence em ${dataCurta(vencimento)}` : "Sem vencimento"}
        </span>
        <span className="inline-flex items-center gap-1.5 rounded-full bg-ink-800 px-2.5 py-1 text-[11.5px] font-semibold">
          <span className="h-2 w-2 rounded-full" style={{ background: "var(--tom)" }} />
          {situacao}
        </span>
      </div>
      <p className="mt-2 line-clamp-2 text-[22px] font-semibold leading-tight tracking-[-0.02em]">
        {descricao.trim() || "Nova conta"}
      </p>
      <p className="mt-1 truncate text-[13px] text-fg-mute">
        {[tipo, parcela, categoria].filter(Boolean).join(" · ")}
      </p>
      <p className="mt-3 text-[30px] font-semibold leading-none tracking-[-0.03em] tnum">
        {valor != null && Number.isFinite(valor) ? brl(valor) : "R$ —"}
      </p>
    </div>
  );
}
