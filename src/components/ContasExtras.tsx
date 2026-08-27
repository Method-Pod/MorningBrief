"use client";

import * as React from "react";
import { CalendarPlus, ChevronLeft, ChevronRight, Repeat2 } from "lucide-react";
import type { Bill } from "@/lib/types";
import { brl, dataCurta, daysUntil, todayISO } from "@/lib/format";
import { cx } from "./ui";

const DOW = ["D", "S", "T", "Q", "Q", "S", "S"];
const MESES = [
  "Janeiro", "Fevereiro", "Março", "Abril", "Maio", "Junho",
  "Julho", "Agosto", "Setembro", "Outubro", "Novembro", "Dezembro",
];
const pad = (n: number) => String(n).padStart(2, "0");

/* ==================== calendário de pagamentos ==================== */

export function CalendarioPagamentos({
  contas,
  dia,
  onDia,
}: {
  contas: Bill[];
  dia: string | null;
  onDia: (iso: string | null) => void;
}) {
  const hoje = todayISO();
  const [cursor, setCursor] = React.useState(() => {
    const d = new Date(hoje + "T00:00:00");
    return { y: d.getFullYear(), m: d.getMonth() };
  });

  /** Por dia: total, e se há alguma vencida ou pendente. */
  const porDia = React.useMemo(() => {
    const mapa = new Map<
      string,
      { total: number; vencida: boolean; pendente: boolean; paga: boolean }
    >();
    contas.forEach((b) => {
      const k = b.due_date.slice(0, 10);
      const atual =
        mapa.get(k) ?? { total: 0, vencida: false, pendente: false, paga: false };
      atual.total += b.amount;
      if (b.status === "paid") atual.paga = true;
      else if (daysUntil(b.due_date) < 0) atual.vencida = true;
      else atual.pendente = true;
      mapa.set(k, atual);
    });
    return mapa;
  }, [contas]);

  const celulas = React.useMemo(() => {
    const { y, m } = cursor;
    const lead = new Date(y, m, 1).getDay();
    const total = new Date(y, m + 1, 0).getDate();
    const anterior = new Date(y, m, 0).getDate();
    const out: { iso: string; d: number; fora: boolean }[] = [];
    for (let i = lead - 1; i >= 0; i--) {
      const d = anterior - i;
      const pm = m === 0 ? 11 : m - 1;
      const py = m === 0 ? y - 1 : y;
      out.push({ iso: `${py}-${pad(pm + 1)}-${pad(d)}`, d, fora: true });
    }
    for (let d = 1; d <= total; d++)
      out.push({ iso: `${y}-${pad(m + 1)}-${pad(d)}`, d, fora: false });
    while (out.length % 7) {
      const d = out.length - lead - total + 1;
      const nm = m === 11 ? 0 : m + 1;
      const ny = m === 11 ? y + 1 : y;
      out.push({ iso: `${ny}-${pad(nm + 1)}-${pad(d)}`, d, fora: true });
    }
    return out;
  }, [cursor]);

  const prefixo = `${cursor.y}-${pad(cursor.m + 1)}`;
  const totalMes = contas
    .filter((b) => b.due_date.startsWith(prefixo))
    .reduce((s, b) => s + b.amount, 0);

  const mover = (n: number) =>
    setCursor((c) => {
      const d = new Date(c.y, c.m + n, 1);
      return { y: d.getFullYear(), m: d.getMonth() };
    });

  return (
    <div>
      <div className="mb-3 flex items-center justify-between gap-2">
        <div className="flex items-center gap-1">
          <button
            onClick={() => mover(-1)}
            aria-label="Mês anterior"
            className="grid h-7 w-7 place-items-center rounded-lg text-fg-mute transition-colors hover:bg-ink-800 hover:text-fg"
          >
            <ChevronLeft size={15} />
          </button>
          <button
            onClick={() => mover(1)}
            aria-label="Próximo mês"
            className="grid h-7 w-7 place-items-center rounded-lg text-fg-mute transition-colors hover:bg-ink-800 hover:text-fg"
          >
            <ChevronRight size={15} />
          </button>
          <span className="ml-1 text-[13px] font-bold">
            {MESES[cursor.m]}{" "}
            <span className="font-medium text-fg-mute">{cursor.y}</span>
          </span>
        </div>
        <span className="text-[13px] font-bold tnum">{brl(totalMes)}</span>
      </div>

      <div className="grid grid-cols-7 gap-1">
        {DOW.map((d, i) => (
          <span
            key={i}
            className="pb-1 text-center text-[9.5px] font-bold uppercase text-fg-mute"
          >
            {d}
          </span>
        ))}
        {celulas.map((c) => {
          const info = porDia.get(c.iso);
          const ehHoje = c.iso === hoje;
          const escolhido = dia === c.iso;
          return (
            <button
              key={c.iso}
              onClick={() => onDia(escolhido ? null : c.iso)}
              disabled={!info}
              title={info ? `${dataCurta(c.iso)} · ${brl(info.total)}` : undefined}
              className={cx(
                "relative grid aspect-square place-items-center rounded-[10px] text-[12px] font-medium transition-colors tnum",
                c.fora && "opacity-35",
                escolhido
                  ? "bg-brand-500 text-on-brand"
                  : ehHoje
                    ? "bg-brand-500/12 font-bold text-brand-400"
                    : info
                      ? "text-fg hover:bg-ink-800"
                      : "text-fg-mute",
                !info && "cursor-default"
              )}
            >
              {c.d}
              {info && (
                <span className="absolute bottom-1 flex gap-0.5">
                  {info.vencida && (
                    <i
                      className={cx(
                        "h-1 w-1 rounded-full",
                        escolhido ? "bg-white" : "bg-neg"
                      )}
                    />
                  )}
                  {info.pendente && (
                    <i
                      className={cx(
                        "h-1 w-1 rounded-full",
                        escolhido ? "bg-white" : "bg-warn"
                      )}
                    />
                  )}
                  {info.paga && (
                    <i
                      className={cx(
                        "h-1 w-1 rounded-full",
                        escolhido ? "bg-white" : "bg-pos"
                      )}
                    />
                  )}
                </span>
              )}
            </button>
          );
        })}
      </div>

      <div className="mt-3 flex flex-wrap items-center gap-3 border-t border-line-soft pt-3 text-[10.5px] text-fg-mute">
        <span className="inline-flex items-center gap-1.5">
          <i className="h-1.5 w-1.5 rounded-full bg-neg" /> vencida
        </span>
        <span className="inline-flex items-center gap-1.5">
          <i className="h-1.5 w-1.5 rounded-full bg-warn" /> a vencer
        </span>
        <span className="inline-flex items-center gap-1.5">
          <i className="h-1.5 w-1.5 rounded-full bg-pos" /> paga
        </span>
        {dia && (
          <button
            onClick={() => onDia(null)}
            className="ml-auto font-bold text-brand-400 hover:underline"
          >
            limpar dia
          </button>
        )}
      </div>
    </div>
  );
}

/* ==================== gerenciar contas fixas ==================== */

/** Mesma data no mês seguinte, encolhida quando o mês é curto. */
export const proximoMes = (iso: string) => {
  const [y, m, d] = iso.slice(0, 10).split("-").map(Number);
  // m é 1-based; new Date(y, m+1, 0) dá o último dia do mês seguinte
  const ultimo = new Date(y, m + 1, 0).getDate();
  return `${m === 12 ? y + 1 : y}-${pad(m === 12 ? 1 : m + 1)}-${pad(
    Math.min(d, ultimo)
  )}`;
};

/**
 * A mesma data, `n` meses adiante, encolhida quando o mês de destino é curto.
 *
 * Conta sempre a partir da data original, e não chamando proximoMes n vezes: o
 * encadeamento perde o dia no caminho. Uma parcela dia 31 viraria 28 em
 * fevereiro e daí em diante ficaria no dia 28 para sempre, quando o certo é
 * voltar ao 31 em março.
 */
export const mesesAdiante = (iso: string, n: number) => {
  const [y, m, d] = iso.slice(0, 10).split("-").map(Number);
  const alvo = m - 1 + n; // 0-based para atravessar a virada de ano
  const ano = y + Math.floor(alvo / 12);
  const mes = (alvo % 12) + 1;
  const ultimo = new Date(ano, mes, 0).getDate();
  return `${ano}-${pad(mes)}-${pad(Math.min(d, ultimo))}`;
};

export function ContasFixas({
  contas,
  onLancar,
  ocupado,
}: {
  contas: Bill[];
  onLancar: (b: Bill) => void;
  ocupado: string | null;
}) {
  /* Uma linha por descrição: a mais recente representa a série.
     O memo fica antes de qualquer return: hook não pode ser condicional. */
  const series = React.useMemo(() => {
    const mapa = new Map<string, Bill>();
    contas
      .filter((b) => b.recurring)
      .forEach((b) => {
        const atual = mapa.get(b.description);
        if (!atual || b.due_date > atual.due_date) mapa.set(b.description, b);
      });
    return [...mapa.values()].sort((a, b) =>
      a.description.localeCompare(b.description, "pt-BR")
    );
  }, [contas]);

  if (!series.length)
    return (
      <p className="py-8 text-center text-[12.5px] text-fg-mute">
        Nenhuma conta marcada como fixa. Marque “Conta fixa” ao criar.
      </p>
    );

  return (
    <ul className="flex flex-col">
      {series.map((b) => {
        const proxima = proximoMes(b.due_date);
        const jaExiste = contas.some(
          (x) => x.description === b.description && x.due_date.slice(0, 10) === proxima
        );
        return (
          <li
            key={b.id}
            className="flex items-center gap-3 border-b border-line-soft py-2.5 last:border-0"
          >
            <Repeat2 size={14} className="shrink-0 text-brand-400" />
            <div className="min-w-0 flex-1">
              <p className="truncate text-[13px] font-semibold">{b.description}</p>
              <p className="text-[11px] text-fg-mute tnum">
                última: {dataCurta(b.due_date)} · {brl(b.amount)}
              </p>
            </div>
            {jaExiste ? (
              <span className="shrink-0 text-[11px] font-semibold text-pos">
                {dataCurta(proxima)} já lançada
              </span>
            ) : (
              <button
                onClick={() => onLancar(b)}
                disabled={ocupado === b.id}
                className="inline-flex shrink-0 items-center gap-1.5 rounded-[10px] bg-ink-800 px-2.5 py-1.5 text-[11.5px] font-semibold text-fg-dim transition-colors hover:bg-brand-500/12 hover:text-brand-400 disabled:opacity-50"
              >
                <CalendarPlus size={12} />
                {ocupado === b.id ? "Lançando..." : "Lançar próximo mês"}
              </button>
            )}
          </li>
        );
      })}
    </ul>
  );
}
