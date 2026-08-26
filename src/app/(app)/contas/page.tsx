"use client";

import * as React from "react";
import {
  AlertCircle,
  CheckCircle2,
  Clock,
  Pencil,
  Plus,
  RotateCcw,
  Search,
  Trash2,
  Wallet,
} from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { BILL_CATEGORIES, type Bill, type BillStatus } from "@/lib/types";
import { brl, dateBR, daysUntil, todayISO } from "@/lib/format";
import {
  Badge,
  Button,
  Card,
  Empty,
  Field,
  Input,
  Modal,
  Segmented,
  Select,
  Skeleton,
  Textarea,
  useConfirm,
} from "@/components/ui";

type Filter = "all" | "pending" | "overdue" | "paid";

const blank = () => ({
  description: "",
  amount: "",
  due_date: todayISO(),
  category: "Outros",
  status: "pending" as BillStatus,
  recurring: false,
  notes: "",
});

export default function ContasPage() {
  const supabase = React.useMemo(() => createClient(), []);
  const [rows, setRows] = React.useState<Bill[]>([]);
  const [loading, setLoading] = React.useState(true);
  const [filter, setFilter] = React.useState<Filter>("all");
  const [q, setQ] = React.useState("");
  const [open, setOpen] = React.useState(false);
  const [editing, setEditing] = React.useState<Bill | null>(null);
  const [form, setForm] = React.useState(blank());
  const [busy, setBusy] = React.useState(false);
  const [err, setErr] = React.useState("");
  const confirm = useConfirm();

  const load = React.useCallback(async () => {
    const { data } = await supabase.from("bills").select("*").order("due_date");
    setRows((data as Bill[]) ?? []);
    setLoading(false);
  }, [supabase]);

  React.useEffect(() => {
    load();
  }, [load]);

  const startNew = () => {
    setEditing(null);
    setForm(blank());
    setErr("");
    setOpen(true);
  };

  const startEdit = (b: Bill) => {
    setEditing(b);
    setForm({
      description: b.description,
      amount: String(b.amount),
      due_date: b.due_date.slice(0, 10),
      category: b.category,
      status: b.status,
      recurring: b.recurring,
      notes: b.notes,
    });
    setErr("");
    setOpen(true);
  };

  const save = async (e: React.FormEvent) => {
    e.preventDefault();
    setErr("");
    const amount = Number(String(form.amount).replace(",", "."));
    if (!form.description.trim()) return setErr("Informe a descrição.");
    if (!Number.isFinite(amount) || amount <= 0)
      return setErr("Informe um valor maior que zero.");

    setBusy(true);
    const payload = {
      description: form.description.trim(),
      amount,
      due_date: form.due_date,
      category: form.category,
      status: form.status,
      recurring: form.recurring,
      notes: form.notes.trim(),
      paid_at: form.status === "paid" ? new Date().toISOString() : null,
    };

    let error;
    if (editing) {
      ({ error } = await supabase
        .from("bills")
        .update(payload)
        .eq("id", editing.id));
    } else {
      const { data: u } = await supabase.auth.getUser();
      ({ error } = await supabase
        .from("bills")
        .insert({ ...payload, user_id: u.user!.id }));
    }
    setBusy(false);
    if (error) return setErr(error.message);
    setOpen(false);
    load();
  };

  const toggle = async (b: Bill) => {
    const next: BillStatus = b.status === "paid" ? "pending" : "paid";
    setRows((r) =>
      r.map((x) => (x.id === b.id ? { ...x, status: next } : x))
    );
    await supabase
      .from("bills")
      .update({
        status: next,
        paid_at: next === "paid" ? new Date().toISOString() : null,
      })
      .eq("id", b.id);
    load();
  };

  const remove = (b: Bill) =>
    confirm.ask(`Excluir "${b.description}"? Isso não pode ser desfeito.`, async () => {
      await supabase.from("bills").delete().eq("id", b.id);
      load();
    });

  /* ------------------------------ derivados ------------------------------ */

  const counts = React.useMemo(() => {
    const pending = rows.filter((r) => r.status === "pending");
    return {
      all: rows.length,
      pending: pending.length,
      overdue: pending.filter((r) => daysUntil(r.due_date) < 0).length,
      paid: rows.filter((r) => r.status === "paid").length,
    };
  }, [rows]);

  const view = React.useMemo(() => {
    const term = q.trim().toLowerCase();
    return rows
      .filter((r) => {
        if (filter === "pending") return r.status === "pending";
        if (filter === "paid") return r.status === "paid";
        if (filter === "overdue")
          return r.status === "pending" && daysUntil(r.due_date) < 0;
        return true;
      })
      .filter(
        (r) =>
          !term ||
          r.description.toLowerCase().includes(term) ||
          r.category.toLowerCase().includes(term) ||
          r.notes.toLowerCase().includes(term)
      )
      .sort((a, b) => {
        if (a.status !== b.status) return a.status === "pending" ? -1 : 1;
        return a.due_date.localeCompare(b.due_date);
      });
  }, [rows, filter, q]);

  const totals = React.useMemo(() => {
    const sum = (list: Bill[]) =>
      list.reduce((s, b) => s + Number(b.amount), 0);
    const pending = rows.filter((r) => r.status === "pending");
    return {
      view: sum(view),
      pending: sum(pending),
      overdue: sum(pending.filter((r) => daysUntil(r.due_date) < 0)),
      paid: sum(rows.filter((r) => r.status === "paid")),
    };
  }, [rows, view]);

  return (
    <div className="space-y-5 rise">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Contas a pagar</h1>
          <p className="mt-1 text-sm text-fg-mute">
            {counts.pending} em aberto · {brl(totals.pending)}
            {totals.overdue > 0 && (
              <span className="text-neg"> · {brl(totals.overdue)} em atraso</span>
            )}
          </p>
        </div>
        <Button variant="primary" onClick={startNew}>
          <Plus size={15} />
          Nova conta
        </Button>
      </div>

      {/* resumo */}
      <div className="grid gap-4 sm:grid-cols-3">
        <Stat label="Em aberto" value={brl(totals.pending)} sub={`${counts.pending} contas`} tone="warn" />
        <Stat label="Em atraso" value={brl(totals.overdue)} sub={`${counts.overdue} contas`} tone="neg" />
        <Stat label="Pago" value={brl(totals.paid)} sub={`${counts.paid} contas`} tone="pos" />
      </div>

      <Card className="overflow-hidden">
        <div className="flex flex-wrap items-center gap-3 px-4 py-4">
          <Segmented
            value={filter}
            onChange={setFilter}
            options={[
              { value: "all", label: "Todas", count: counts.all },
              { value: "pending", label: "Em aberto", count: counts.pending },
              { value: "overdue", label: "Atrasadas", count: counts.overdue },
              { value: "paid", label: "Pagas", count: counts.paid },
            ]}
          />
          <div className="relative ml-auto w-full sm:w-64">
            <Search
              size={14}
              className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-fg-mute"
            />
            <Input
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder="Buscar conta..."
              className="pl-9"
            />
          </div>
        </div>

        {loading ? (
          <div className="space-y-2 p-4">
            {Array.from({ length: 5 }).map((_, i) => (
              <Skeleton key={i} className="h-14" />
            ))}
          </div>
        ) : view.length === 0 ? (
          <Empty
            icon={<Wallet size={18} />}
            title={q || filter !== "all" ? "Nada encontrado" : "Nenhuma conta cadastrada"}
            sub={
              q || filter !== "all"
                ? "Ajuste a busca ou o filtro."
                : "Lance suas contas para acompanhar vencimentos e totais."
            }
            action={
              !q && filter === "all" ? (
                <Button variant="primary" size="sm" onClick={startNew}>
                  <Plus size={14} />
                  Nova conta
                </Button>
              ) : undefined
            }
          />
        ) : (
          <div className="overflow-x-auto border-t border-line-soft">
            <table className="w-full min-w-[720px] text-sm">
              <thead>
                <tr className="border-b border-line-soft text-left text-[11px] uppercase tracking-wider text-fg-mute">
                  <th className="w-10 px-4 py-2.5" />
                  <th className="px-2 py-2.5 font-medium">Descrição</th>
                  <th className="px-3 py-2.5 font-medium">Categoria</th>
                  <th className="px-3 py-2.5 font-medium">Vencimento</th>
                  <th className="px-3 py-2.5 text-right font-medium">Valor</th>
                  <th className="w-24 px-4 py-2.5" />
                </tr>
              </thead>
              <tbody>
                {view.map((b) => {
                  const late = b.status === "pending" && daysUntil(b.due_date) < 0;
                  const d = daysUntil(b.due_date);
                  return (
                    <tr
                      key={b.id}
                      className="group border-b border-line-soft/60 last:border-0 transition-colors hover:bg-ink-800/40"
                    >
                      <td className="px-4 py-3">
                        <button
                          onClick={() => toggle(b)}
                          aria-label={b.status === "paid" ? "Marcar em aberto" : "Marcar como paga"}
                          className={`grid h-5 w-5 place-items-center rounded-md border transition-all ${
                            b.status === "paid"
                              ? "border-pos bg-pos text-ink-950"
                              : "border-ink-600 hover:border-brand-500"
                          }`}
                        >
                          {b.status === "paid" && <CheckCircle2 size={12} />}
                        </button>
                      </td>
                      <td className="px-2 py-3">
                        <p
                          className={`max-w-[260px] truncate font-medium ${b.status === "paid" ? "text-fg-mute line-through" : ""}`}
                        >
                          {b.description}
                        </p>
                        {b.notes && (
                          <p className="max-w-[260px] truncate text-[11px] text-fg-mute">
                            {b.notes}
                          </p>
                        )}
                      </td>
                      <td className="px-3 py-3">
                        <Badge>{b.category}</Badge>
                        {b.recurring && (
                          <Badge tone="violet" className="ml-1">
                            <RotateCcw size={10} />
                            fixa
                          </Badge>
                        )}
                      </td>
                      <td className="px-3 py-3">
                        <div className="flex items-center gap-2">
                          <span className="text-xs text-fg-dim tnum">
                            {dateBR(b.due_date)}
                          </span>
                          {b.status === "pending" &&
                            (late ? (
                              <Badge tone="neg">
                                <AlertCircle size={10} />
                                {Math.abs(d)}d
                              </Badge>
                            ) : d === 0 ? (
                              <Badge tone="warn">
                                <Clock size={10} />
                                hoje
                              </Badge>
                            ) : d <= 7 ? (
                              <Badge tone="warn">{d}d</Badge>
                            ) : null)}
                          {b.status === "paid" && (
                            <Badge tone="pos">
                              <CheckCircle2 size={10} />
                              paga
                            </Badge>
                          )}
                        </div>
                      </td>
                      <td
                        className={`px-3 py-3 text-right font-medium tnum ${late ? "text-neg" : ""}`}
                      >
                        {brl(Number(b.amount))}
                      </td>
                      <td className="px-4 py-3">
                        <div className="flex items-center justify-end gap-1 opacity-0 transition-opacity group-hover:opacity-100 focus-within:opacity-100">
                          <button
                            onClick={() => startEdit(b)}
                            aria-label="Editar"
                            className="rounded-lg p-1.5 text-fg-mute hover:bg-ink-750 hover:text-fg"
                          >
                            <Pencil size={14} />
                          </button>
                          <button
                            onClick={() => remove(b)}
                            aria-label="Excluir"
                            className="rounded-lg p-1.5 text-fg-mute hover:bg-neg/15 hover:text-neg"
                          >
                            <Trash2 size={14} />
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
              <tfoot>
                <tr className="border-t border-line bg-ink-900/60">
                  <td colSpan={4} className="px-5 py-3 text-xs text-fg-mute">
                    {view.length} conta{view.length === 1 ? "" : "s"} no filtro
                  </td>
                  <td className="px-3 py-3 text-right text-sm font-semibold tnum">
                    {brl(totals.view)}
                  </td>
                  <td />
                </tr>
              </tfoot>
            </table>
          </div>
        )}
      </Card>

      {/* ------------------------------ modal ------------------------------ */}
      <Modal
        open={open}
        onClose={() => setOpen(false)}
        title={editing ? "Editar conta" : "Nova conta"}
        sub="Vencimento, valor e categoria."
        footer={
          <>
            <Button onClick={() => setOpen(false)}>Cancelar</Button>
            <Button variant="primary" onClick={save} disabled={busy}>
              {busy ? "Salvando..." : "Salvar"}
            </Button>
          </>
        }
      >
        <form onSubmit={save} className="space-y-4">
          <Field label="Descrição">
            <Input
              autoFocus
              value={form.description}
              onChange={(e) => setForm({ ...form, description: e.target.value })}
              placeholder="Aluguel do escritório"
            />
          </Field>

          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Valor (R$)">
              <Input
                inputMode="decimal"
                value={form.amount}
                onChange={(e) => setForm({ ...form, amount: e.target.value })}
                placeholder="1500,00"
              />
            </Field>
            <Field label="Vencimento">
              <Input
                type="date"
                value={form.due_date}
                onChange={(e) => setForm({ ...form, due_date: e.target.value })}
              />
            </Field>
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Categoria">
              <Select
                value={form.category}
                onChange={(e) => setForm({ ...form, category: e.target.value })}
              >
                {BILL_CATEGORIES.map((c) => (
                  <option key={c} value={c}>
                    {c}
                  </option>
                ))}
              </Select>
            </Field>
            <Field label="Status">
              <Select
                value={form.status}
                onChange={(e) =>
                  setForm({ ...form, status: e.target.value as BillStatus })
                }
              >
                <option value="pending">Em aberto</option>
                <option value="paid">Paga</option>
              </Select>
            </Field>
          </div>

          <Field label="Observações">
            <Textarea
              rows={2}
              value={form.notes}
              onChange={(e) => setForm({ ...form, notes: e.target.value })}
              placeholder="Boleto no e-mail, pagar via PIX..."
            />
          </Field>

          <label className="flex cursor-pointer items-center gap-2.5 rounded-xl border border-line-soft bg-ink-900/50 px-3.5 py-3">
            <input
              type="checkbox"
              checked={form.recurring}
              onChange={(e) => setForm({ ...form, recurring: e.target.checked })}
              className="h-4 w-4 accent-[#2f7bff]"
            />
            <span className="text-sm text-fg-dim">
              Conta fixa
              <span className="ml-1 text-[11px] text-fg-mute">
                (só marca como recorrente; não duplica automaticamente)
              </span>
            </span>
          </label>

          {err && (
            <p className="rounded-xl border border-neg/30 bg-neg/10 p-3 text-xs text-neg">
              {err}
            </p>
          )}
        </form>
      </Modal>

      {confirm.node}
    </div>
  );
}

function Stat({
  label,
  value,
  sub,
  tone,
}: {
  label: string;
  value: string;
  sub: string;
  tone: "warn" | "neg" | "pos";
}) {
  const c = { warn: "text-warn", neg: "text-neg", pos: "text-pos" }[tone];
  return (
    <Card className="p-4">
      <p className={`text-[11px] font-medium uppercase tracking-wider ${c}`}>
        {label}
      </p>
      <p className="mt-2.5 text-xl font-semibold tracking-tight tnum">{value}</p>
      <p className="mt-1 text-[11px] text-fg-mute">{sub}</p>
    </Card>
  );
}
