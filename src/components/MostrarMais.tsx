"use client";

import * as React from "react";
import { Loader2 } from "lucide-react";

import { Button } from "./ui";

/**
 * O rodapé que aparece quando a tela não está mostrando tudo.
 *
 * Só nasce quando o teto de `lib/teto` é alcançado — num acervo normal ele
 * nunca aparece. A frase importa tanto quanto o botão: nestas telas a busca
 * procura dentro do que está carregado, então quem não vê este aviso pode
 * concluir que o item não existe. O aviso é o que separa "não achei" de
 * "ainda não carreguei".
 */
export function MostrarMais({
  visiveis,
  carregando,
  onMais,
}: {
  visiveis: number;
  carregando: boolean;
  onMais: () => void;
}) {
  return (
    <div className="mt-5 flex flex-col items-center gap-2">
      <p className="text-center text-xs text-fg-mute">
        Mostrando os {visiveis} mais recentes. A busca procura dentro deles.
      </p>
      <Button size="sm" onClick={onMais} disabled={carregando}>
        {carregando ? (
          <>
            <Loader2 size={14} className="animate-spin" /> Carregando
          </>
        ) : (
          "Carregar mais"
        )}
      </Button>
    </div>
  );
}
