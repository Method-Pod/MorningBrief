"use client";

import * as React from "react";
import { Check } from "lucide-react";
import { brl, valorDigitado } from "@/lib/format";
import {
  CORES_HEX,
  semValorAinda,
  type Bill,
  type Cartao,
} from "@/lib/types";
import { cx } from "./ui";

/**
 * O estado da fatura de cada cartão no mês que está na tela.
 *
 * Ele responde uma pergunta que não tinha resposta em lugar nenhum: **qual
 * fatura eu já sei e qual ainda não**. Espalhada na lista geral, a fatura sem
 * valor some entre as outras contas; aqui as três ou quatro ficam lado a lado
 * e a que falta salta.
 *
 * **Não é um caderno à parte.** Cada linha é a mesma conta que está em Contas
 * a pagar — digitar aqui preenche o campo daquela conta, e é por isso que o
 * valor aparece na lista, no total do mês e no calendário no mesmo instante.
 * Não há cópia nem sincronização porque não há duas coisas.
 */
export function QuadroCartoes({
  cartoes,
  contas,
  onLancar,
}: {
  cartoes: Cartao[];
  /** Só as contas do mês que está na tela: o recorte é de quem chama. */
  contas: Bill[];
  onLancar: (conta: Bill, valor: number) => Promise<void>;
}) {
  const linhas = cartoes.map((c) => ({
    cartao: c,
    /* A fatura do mês. Mais de uma por cartão no mesmo mês não deveria
       existir; se existir, a primeira por vencimento é a que interessa. */
    conta: contas.find((b) => b.cartao_id === c.id) ?? null,
  }));

  const somadas = linhas
    .map((l) => l.conta)
    .filter((b): b is Bill => !!b && !semValorAinda(b));
  const total = somadas.reduce((s, b) => s + Number(b.amount), 0);
  const faltam = linhas.filter((l) => l.conta && semValorAinda(l.conta)).length;

  return (
    /*
     * Coluna que ocupa a altura toda do cartão.
     *
     * O quadro tem uma linha por cartão e o vizinho tem sete contas fixas, o
     * que deixava um vão de meia tela embaixo dele. Esticar a moldura sem
     * mais nada só mudaria o vazio de lugar; o que resolve é a lista em cima
     * e o total **no pé** — o vão passa a ser respiro entre as duas coisas,
     * que é o que ele é numa grade de blocos.
     */
    <div className="flex flex-1 flex-col px-[18px] pb-[18px] pt-1">
      {linhas.map(({ cartao, conta }) => (
        <div
          key={cartao.id}
          className="flex items-center gap-2.5 border-b border-line-soft py-2.5 last:border-0"
        >
          <span
            className="h-2 w-2 shrink-0 rounded-full"
            style={{ background: CORES_HEX[cartao.cor] ?? CORES_HEX.blue }}
          />
          <span className="min-w-0 flex-1">
            <span className="block truncate text-[13px] font-semibold">
              {cartao.nome}
            </span>
            {/* "fecha 8 · vence 15" e não "fecha dia 8 · vence dia 15": a
                palavra "dia" aparecia duas vezes e custava os 40px que
                faltavam para a linha caber quando o campo de valor está
                aberto — medido, era ela que cortava o "vence". */}
            <span className="block truncate text-[11px] text-fg-mute">
              fecha {cartao.fecha_dia} · vence {cartao.vence_dia}
            </span>
          </span>
          <Estado conta={conta} onLancar={onLancar} />
        </div>
      ))}

      {/*
        O total segue a mesma regra do resto da tela: soma o que sabe e diz o
        que falta, em vez de parecer fechado. Ver `semValorAinda`.
      */}
      {/* `mt-auto` empurra o total para o fim da coluna. Com um cartão só ele
          fica lá embaixo; com cinco, logo abaixo da lista. */}
      <div className="mt-auto flex items-baseline justify-between border-t border-line pt-3">
        <span className="text-[12px] text-fg-mute">
          Total dos cartões
          {faltam > 0 && (
            <span className="ml-1.5 font-semibold text-warn">
              +{faltam} sem valor
            </span>
          )}
        </span>
        <span className="text-[15px] font-bold tracking-[-0.02em] tnum">
          {brl(total)}
        </span>
      </div>
    </div>
  );
}

/** O lado direito da linha: o valor, o campo, ou o aviso de que não há conta. */
function Estado({
  conta,
  onLancar,
}: {
  conta: Bill | null;
  onLancar: (conta: Bill, valor: number) => Promise<void>;
}) {
  const [texto, setTexto] = React.useState("");
  const [gravando, setGravando] = React.useState(false);

  if (!conta)
    return (
      <span className="shrink-0 text-[11.5px] text-fg-mute">sem fatura</span>
    );

  if (!semValorAinda(conta)) {
    const paga = conta.status === "paid";
    return (
      <span className="flex shrink-0 items-center gap-2">
        {paga && (
          <span className="inline-flex items-center gap-1 text-[11px] font-semibold text-pos">
            <Check size={11} />
            paga
          </span>
        )}
        <span
          className={cx(
            "text-[13.5px] font-bold tracking-[-0.02em] tnum",
            paga && "text-fg-mute"
          )}
        >
          {brl(Number(conta.amount))}
        </span>
      </span>
    );
  }

  /* Aceita "1.234,56" e "1234.56", como o formulário de contas: quem digita
     não deveria ter de saber qual dos dois o campo espera. */
  const valor = valorDigitado(texto);
  const vale = Number.isFinite(valor) && valor >= 0;

  const lancar = async () => {
    if (!vale || gravando) return;
    setGravando(true);
    await onLancar(conta, valor);
    setGravando(false);
  };

  return (
    <span className="flex shrink-0 items-center gap-1.5">
      <input
        value={texto}
        onChange={(e) => setTexto(e.target.value)}
        onKeyDown={(e) => e.key === "Enter" && lancar()}
        inputMode="decimal"
        placeholder="0,00"
        aria-label={`Valor da fatura de ${conta.description}`}
        className="h-8 w-[92px] rounded-lg border border-warn/35 bg-white px-2 text-right text-[12.5px] font-bold text-fg outline-none transition-colors tnum focus:border-warn"
      />
      <button
        type="button"
        onClick={lancar}
        disabled={!vale || gravando}
        className="h-8 rounded-lg bg-warn px-2.5 text-[11.5px] font-bold text-white transition-opacity disabled:opacity-40"
      >
        {gravando ? "..." : "Lançar"}
      </button>
    </span>
  );
}
