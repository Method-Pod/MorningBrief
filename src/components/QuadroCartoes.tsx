"use client";

import * as React from "react";
import { Check, X } from "lucide-react";
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
  onCriar,
}: {
  cartoes: Cartao[];
  /** Só as contas do mês que está na tela: o recorte é de quem chama. */
  contas: Bill[];
  onLancar: (conta: Bill, valor: number) => Promise<void>;
  /** Abre a criação da conta de fatura já preenchida para este cartão. */
  onCriar: (cartao: Cartao) => void;
}) {
  const linhas = cartoes.map((c) => ({
    cartao: c,
    /*
     * A fatura do mês. Mais de uma por cartão no mesmo mês não deveria
     * existir; se existir, a primeira por vencimento é a que interessa.
     *
     * Era `find`, que devolve a primeira na ordem em que a lista chegou —
     * e essa ordem é a do `order("due_date")` da consulta hoje, mas nada
     * aqui obrigava a ser. Uma lista reordenada na tela trocaria a fatura
     * mostrada sem ninguém mexer em nada.
     */
    conta:
      contas
        .filter((b) => b.cartao_id === c.id)
        .sort((a, b) => a.due_date.localeCompare(b.due_date))[0] ?? null,
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
          <Estado
            cartao={cartao}
            conta={conta}
            onLancar={onLancar}
            onCriar={onCriar}
          />
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

/** O lado direito da linha: o valor, o campo, ou o caminho para criar a conta. */
function Estado({
  cartao,
  conta,
  onLancar,
  onCriar,
}: {
  cartao: Cartao;
  conta: Bill | null;
  onLancar: (conta: Bill, valor: number) => Promise<void>;
  onCriar: (cartao: Cartao) => void;
}) {
  const [texto, setTexto] = React.useState("");
  const [gravando, setGravando] = React.useState(false);
  /*
   * Corrigir um valor já lançado, sem sair da tela.
   *
   * Lançar e um gesto de digitar depressa, e digitar depressa erra. Sem isto,
   * consertar um dígito custava ir a Contas a pagar, achar a fatura no meio da
   * lista e abrir o editor — três telas para trocar um número que está ali na
   * frente. Agora o valor é clicável e vira o mesmo campo de novo.
   */
  const [corrigindo, setCorrigindo] = React.useState(false);

  /*
   * Sem conta ligada ao cartão, um botão — e não o aviso "sem fatura".
   *
   * Cadastrar o cartão não cria a fatura: a fatura é uma conta, e é ela que
   * vence, é paga e entra no total. Só que quem acabou de cadastrar não tem
   * como saber disso, e o aviso mandava a pessoa procurar sozinha onde ligar
   * uma coisa na outra. Um beco sem saída num quadro que existe para ser
   * operado.
   *
   * O botão abre o formulário já preenchido: descrição, cartão, dia do
   * fechamento, vencimento do mês e a marca de valor variável. Resta conferir
   * e salvar.
   */
  if (!conta)
    return (
      <button
        type="button"
        onClick={() => onCriar(cartao)}
        className="shrink-0 rounded-lg border border-line px-2.5 py-1.5 text-[11.5px] font-semibold text-fg-mute transition-colors hover:border-brand-500/40 hover:bg-brand-500/10 hover:text-brand-400"
      >
        criar fatura
      </button>
    );

  const faltaValor = semValorAinda(conta);

  if (!faltaValor && !corrigindo) {
    const paga = conta.status === "paid";
    return (
      <span className="flex shrink-0 items-center gap-2">
        {paga && (
          <span className="inline-flex items-center gap-1 text-[11px] font-semibold text-pos">
            <Check size={11} />
            paga
          </span>
        )}
        {/* O valor é o botão. Nada de lápis ao lado: uma linha de quatro
            cartões já tem cor, nome, datas e valor, e mais um ícone por linha
            é ruído para uma ação que quase nunca acontece. O sublinhado
            pontilhado no passar do ponteiro é o que diz que dá para clicar. */}
        <button
          type="button"
          title="Clique para corrigir o valor"
          onClick={() => {
            /* Vem preenchido com o que está lá, no formato daqui: corrigir um
               dígito não deveria obrigar a redigitar o número inteiro. */
            setTexto(Number(conta.amount).toFixed(2).replace(".", ","));
            setCorrigindo(true);
          }}
          className={cx(
            "rounded text-[13.5px] font-bold tracking-[-0.02em] tnum transition-colors",
            "decoration-dotted underline-offset-4 hover:underline",
            paga ? "text-fg-mute" : "text-fg"
          )}
        >
          {brl(Number(conta.amount))}
        </button>
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
    setCorrigindo(false);
  };

  const desistir = () => {
    setCorrigindo(false);
    setTexto("");
  };

  return (
    <span className="flex shrink-0 items-center gap-1.5">
      <input
        value={texto}
        onChange={(e) => setTexto(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Enter") lancar();
          /* Esc só faz sentido na correção: no campo vazio não há o que
             desfazer, e fechá-lo esconderia a fatura que falta informar. */
          if (e.key === "Escape" && corrigindo) desistir();
        }}
        autoFocus={corrigindo}
        /* Ao abrir para corrigir, o valor vem selecionado: quem clica num
           número para trocá-lo quer digitar o novo, não apagar o velho
           dígito a dígito antes. No campo vazio não há nada a selecionar. */
        onFocus={(e) => corrigindo && e.currentTarget.select()}
        inputMode="decimal"
        placeholder="0,00"
        aria-label={`Valor da fatura de ${conta.description}`}
        className="h-8 w-[92px] rounded-lg border border-warn/35 bg-ink-900 px-2 text-right text-[12.5px] font-bold text-fg outline-none transition-colors tnum focus:border-warn"
      />
      <button
        type="button"
        onClick={lancar}
        disabled={!vale || gravando}
        className="h-8 rounded-lg bg-warn px-2.5 text-[11.5px] font-bold text-white transition-opacity disabled:opacity-40"
      >
        {gravando ? "..." : corrigindo ? "Salvar" : "Lançar"}
      </button>
      {/* O "×" só existe na correção. Quem está informando um valor que falta
          não tem o que cancelar — fechar o campo ali esconderia justamente a
          fatura que o quadro existe para cobrar. */}
      {corrigindo && (
        <button
          type="button"
          onClick={desistir}
          title="Cancelar (Esc)"
          aria-label="Cancelar a correção"
          className="grid h-8 w-6 place-items-center rounded-lg text-fg-mute transition-colors hover:bg-line-soft hover:text-fg"
        >
          <X size={13} />
        </button>
      )}
    </span>
  );
}
