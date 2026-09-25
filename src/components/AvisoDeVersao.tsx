"use client";

import * as React from "react";
import { RefreshCw } from "lucide-react";

/**
 * Avisa quando subiu versão nova, em vez de deixar a aba velha rodando.
 *
 * O problema é do fluxo, não do código: publicada uma correção, a aba que já
 * estava aberta continua com o JavaScript e o CSS antigos até alguém
 * recarregar na mão. Aconteceu duas vezes no mesmo dia — a resposta foi "não
 * mudou nada" para uma correção que estava no ar.
 *
 * Como sabe: compara `NEXT_PUBLIC_VERSAO`, congelado no pacote que este
 * navegador baixou, com o que `/api/versao` responde agora — que vem sempre
 * da implantação mais nova. Ver `src/app/api/versao/route.ts`.
 *
 * O que ele NÃO faz: recarregar sozinho. Recarga automática no meio de um
 * formulário perde o que a pessoa digitou, e este app é cheio de formulário
 * grande. Quem decide a hora é ela.
 */

/* Fora da Vercel não há deploy, então o aviso não tem o que detectar. */
const MINHA = process.env.NEXT_PUBLIC_VERSAO ?? "dev";

/*
 * De quinze em quinze minutos, e sempre que a aba volta ao foco.
 *
 * O foco é o gatilho que importa: o caso real é o telefone ou a aba que
 * ficaram abertos horas e voltaram depois de eu publicar. O intervalo é a
 * rede embaixo, para a aba que fica aberta o dia todo sem perder o foco.
 */
const INTERVALO_MS = 15 * 60 * 1000;

export function AvisoDeVersao() {
  const [temNova, setTemNova] = React.useState(false);

  React.useEffect(() => {
    if (MINHA === "dev" || temNova) return;
    let vivo = true;

    const conferir = async () => {
      if (!vivo || document.visibilityState !== "visible") return;
      try {
        const r = await fetch("/api/versao", { cache: "no-store" });
        if (!r.ok) return;
        const d = (await r.json()) as { versao?: string };
        /* Só marca quando a resposta é um valor de verdade E diferente.
           Sem a primeira metade, uma resposta estranha viraria aviso. */
        if (vivo && d.versao && d.versao !== "dev" && d.versao !== MINHA)
          setTemNova(true);
      } catch {
        /* Sem rede, sem aviso. Não é assunto de quem está trabalhando. */
      }
    };

    conferir();
    const t = setInterval(conferir, INTERVALO_MS);
    document.addEventListener("visibilitychange", conferir);
    return () => {
      vivo = false;
      clearInterval(t);
      document.removeEventListener("visibilitychange", conferir);
    };
  }, [temNova]);

  if (!temNova) return null;

  return (
    <div className="fixed inset-x-0 bottom-0 z-[90] flex justify-center p-3 pb-[max(0.75rem,env(safe-area-inset-bottom))]">
      <button
        type="button"
        onClick={() => window.location.reload()}
        className="brota flex items-center gap-2 rounded-full bg-brand-500 px-4 py-2.5 text-[13px] font-semibold text-on-brand shadow-[var(--elev-3)]"
      >
        <RefreshCw size={14} />
        Tem versão nova — tocar para atualizar
      </button>
    </div>
  );
}
