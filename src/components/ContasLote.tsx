"use client";

import * as React from "react";
import { CalendarDays, Check, Tag, Trash2, X } from "lucide-react";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Bill } from "@/lib/types";
import { brl, todayISO } from "@/lib/format";
import { Button, Input, Modal, Select, cx } from "./ui";

/**
 * Barra de ações em lote.
 *
 * Aparece quando há conta selecionada. Só ações que fazem sentido em massa:
 * marcar pagas, reabrir, trocar categoria, trocar vencimento e excluir. Editar
 * valor ou descrição em lote não existe de propósito — não há caso em que
 * várias contas devam receber a mesma descrição.
 */
export function BarraLote({
  selecionadas,
  categorias,
  onLimpar,
  onAcao,
  ocupado,
}: {
  selecionadas: Bill[];
  categorias: string[];
  onLimpar: () => void;
  onAcao: (
    acao: "pagar" | "reabrir" | "categoria" | "vencimento" | "excluir",
    valor?: string
  ) => void;
  ocupado: boolean;
}) {
  const [pedindo, setPedindo] = React.useState<null | "categoria" | "vencimento">(
    null
  );
  const [categoria, setCategoria] = React.useState(categorias[0] ?? "Outros");
  const [data, setData] = React.useState(todayISO());

  const n = selecionadas.length;
  if (!n) return null;

  const total = selecionadas.reduce((s, b) => s + Number(b.amount), 0);

  return (
    <>
      {/* fixa no rodapé: a lista é longa e a seleção acontece rolando */}
      <div className="fixed inset-x-0 bottom-0 z-40 border-t border-line bg-white/95 px-4 py-3 backdrop-blur lg:left-[224px]">
        <div className="mx-auto flex max-w-[1100px] flex-wrap items-center gap-2">
          <span className="text-[13px] font-bold">
            {n} selecionada{n > 1 ? "s" : ""}
          </span>
          <span className="text-[12px] text-fg-mute tnum">{brl(total)}</span>

          <div className="ml-auto flex flex-wrap gap-2">
            <Button size="sm" onClick={() => onAcao("pagar")} disabled={ocupado}>
              <Check size={14} />
              Marcar pagas
            </Button>
            <Button size="sm" onClick={() => onAcao("reabrir")} disabled={ocupado}>
              Reabrir
            </Button>
            <Button size="sm" onClick={() => setPedindo("categoria")} disabled={ocupado}>
              <Tag size={14} />
              Categoria
            </Button>
            <Button size="sm" onClick={() => setPedindo("vencimento")} disabled={ocupado}>
              <CalendarDays size={14} />
              Vencimento
            </Button>
            <Button size="sm" variant="danger" onClick={() => onAcao("excluir")} disabled={ocupado}>
              <Trash2 size={14} />
              Excluir
            </Button>
            <Button size="sm" onClick={onLimpar}>
              <X size={14} />
              Limpar
            </Button>
          </div>
        </div>
      </div>

      <Modal
        open={pedindo === "categoria"}
        onClose={() => setPedindo(null)}
        title="Trocar categoria"
        sub={`${n} conta${n > 1 ? "s" : ""} selecionada${n > 1 ? "s" : ""}.`}
        footer={
          <>
            <Button onClick={() => setPedindo(null)}>Cancelar</Button>
            <Button
              variant="primary"
              onClick={() => {
                onAcao("categoria", categoria);
                setPedindo(null);
              }}
            >
              Aplicar
            </Button>
          </>
        }
      >
        <Select value={categoria} onChange={(e) => setCategoria(e.target.value)}>
          {categorias.map((c) => (
            <option key={c}>{c}</option>
          ))}
        </Select>
      </Modal>

      <Modal
        open={pedindo === "vencimento"}
        onClose={() => setPedindo(null)}
        title="Trocar vencimento"
        sub={`${n} conta${n > 1 ? "s" : ""} selecionada${n > 1 ? "s" : ""}.`}
        footer={
          <>
            <Button onClick={() => setPedindo(null)}>Cancelar</Button>
            <Button
              variant="primary"
              onClick={() => {
                if (data) onAcao("vencimento", data);
                setPedindo(null);
              }}
            >
              Aplicar
            </Button>
          </>
        }
      >
        <Input type="date" value={data} onChange={(e) => setData(e.target.value)} />
      </Modal>
    </>
  );
}

/**
 * Abate um valor de uma conta paga aos poucos.
 *
 * Recebe o quanto foi pago agora, não o total acumulado: quem paga R$ 50 quer
 * digitar 50, e somar de cabeça o que já havia pago é justamente o trabalho
 * que a tela deve evitar.
 */
export function AbaterModal({
  conta,
  onFechar,
  onAbater,
  ocupado,
}: {
  conta: Bill | null;
  onFechar: () => void;
  onAbater: (novoTotalPago: number) => void;
  ocupado: boolean;
}) {
  const [valor, setValor] = React.useState("");
  const [erro, setErro] = React.useState("");

  React.useEffect(() => {
    setValor("");
    setErro("");
  }, [conta?.id]);

  if (!conta) return null;

  const jaPago = Number(conta.paid_amount ?? 0);
  const total = Number(conta.amount);
  const falta = Math.max(0, total - jaPago);

  const aplicar = () => {
    const v = parseFloat(String(valor).replace(/\./g, "").replace(",", "."));
    setErro("");
    if (!Number.isFinite(v) || v <= 0) return setErro("Informe um valor maior que zero.");
    if (v > falta + 0.001)
      return setErro(`Falta só ${brl(falta)}. Informe esse valor ou menos.`);
    onAbater(Math.min(total, jaPago + v));
  };

  return (
    <Modal
      open={!!conta}
      onClose={onFechar}
      title="Abater pagamento"
      sub={conta.description}
      footer={
        <>
          <Button onClick={onFechar}>Cancelar</Button>
          <Button variant="primary" onClick={aplicar} disabled={ocupado}>
            {ocupado ? "Salvando..." : "Abater"}
          </Button>
        </>
      }
    >
      <div className="flex flex-col gap-3.5">
        <dl className="flex flex-col rounded-[14px] bg-ink-800 px-3.5 py-3 text-[13px]">
          <div className="flex justify-between py-0.5">
            <dt className="text-fg-mute">Valor total</dt>
            <dd className="font-semibold tnum">{brl(total)}</dd>
          </div>
          <div className="flex justify-between py-0.5">
            <dt className="text-fg-mute">Já abatido</dt>
            <dd className="font-semibold text-pos tnum">{brl(jaPago)}</dd>
          </div>
          <div className="flex justify-between border-t border-line-soft py-0.5 pt-1.5">
            <dt className="text-fg-mute">Falta</dt>
            <dd className="font-bold text-warn tnum">{brl(falta)}</dd>
          </div>
        </dl>

        <label className="block">
          <span className="mb-1.5 block text-[11px] font-medium uppercase tracking-wider text-fg-mute">
            Quanto está pagando agora
          </span>
          <Input
            autoFocus
            inputMode="decimal"
            value={valor}
            onChange={(e) => {
              setValor(e.target.value);
              setErro("");
            }}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                e.preventDefault();
                aplicar();
              }
            }}
            placeholder="50,00"
          />
        </label>

        <div className="flex flex-wrap gap-2">
          {[25, 50, 100].map((p) => {
            const v = Math.round(falta * (p / 100) * 100) / 100;
            return (
              <button
                key={p}
                type="button"
                onClick={() => setValor(String(v).replace(".", ","))}
                className="rounded-[10px] bg-ink-800 px-2.5 py-1.5 text-[11.5px] font-semibold text-fg-dim transition-colors hover:text-fg"
              >
                {p === 100 ? "Quitar" : `${p}% do que falta`}
              </button>
            );
          })}
        </div>

        {erro && (
          <p className="rounded-[14px] bg-neg/12 px-3.5 py-3 text-xs font-medium text-neg">
            {erro}
          </p>
        )}
      </div>
    </Modal>
  );
}

/** Barra de progresso do abatimento, para a linha da lista. */
export function ProgressoAbatida({ conta }: { conta: Bill }) {
  const total = Number(conta.amount);
  const pago = Number(conta.paid_amount ?? 0);
  const pct = total > 0 ? Math.min(100, (pago / total) * 100) : 0;
  const falta = Math.max(0, total - pago);

  return (
    <div className="mt-1.5 w-full max-w-[280px]">
      <div className="h-1.5 overflow-hidden rounded-full bg-ink-800">
        <div
          className={cx("h-full rounded-full", falta === 0 ? "bg-pos" : "bg-warn")}
          style={{ width: `${pct}%` }}
        />
      </div>
      <p className="mt-1 text-[10.5px] text-fg-mute tnum">
        {brl(pago)} de {brl(total)}
        {falta > 0 ? (
          <>
            {" · falta "}
            <span className="font-bold text-warn">{brl(falta)}</span>
          </>
        ) : (
          <span className="font-bold text-pos"> · quitada</span>
        )}
      </p>
    </div>
  );
}
