"use client";

import * as React from "react";
import Link from "next/link";
import {
  Building2,
  CalendarClock,
  Pencil,
  Play,
  Plus,
  Power,
  Repeat2,
  Trash2,
  Zap,
} from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import {
  FREQUENCY_LABEL,
  PRIORITY_LABEL,
  WEEKDAYS,
  type Frequency,
  type Priority,
  type RecurringTask,
} from "@/lib/types";
import { dateBR, todayISO } from "@/lib/format";
import { frequencyDescription, isDueOn, nextOccurrence } from "@/lib/recurring";
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
  cx,
} from "@/components/ui";

const FREQS: Frequency[] = [
  "daily",
  "weekly",
  "biweekly",
  "monthly",
  "quarterly",
  "yearly",
];
const PRIORITIES: Priority[] = ["low", "medium", "high", "urgent"];

const blank = () => ({
  title: "",
  description: "",
  client: "",
  priority: "medium" as Priority,
  frequency: "weekly" as Frequency,
  weekday: 1,
  day_of_month: 1,
  active: true,
});

export default function RecorrentesPage() {
  const supabase = React.useMemo(() => createClient(), []);
  const [rows, setRows] = React.useState<RecurringTask[]>([]);
  const [loading, setLoading] = React.useState(true);
  const [filter, setFilter] = React.useState<"all" | "active" | "paused">("all");
  const [open, setOpen] = React.useState(false);
  const [editing, setEditing] = React.useState<RecurringTask | null>(null);
  const [form, setForm] = React.useState(blank());
  const [busy, setBusy] = React.useState(false);
  const [err, setErr] = React.useState("");
  const [toast, setToast] = React.useState("");
  const confirm = useConfirm();

  const today = todayISO();

  const load = React.useCallback(async () => {
    const { data } = await supabase
      .from("recurring_tasks")
      .select("*")
      .order("created_at");
    setRows((data as RecurringTask[]) ?? []);
    setLoading(false);
  }, [supabase]);

  React.useEffect(() => {
    load();
  }, [load]);

  React.useEffect(() => {
    if (!toast) return;
    const id = setTimeout(() => setToast(""), 3500);
    return () => clearTimeout(id);
  }, [toast]);

  const startNew = () => {
    setEditing(null);
    setForm(blank());
    setErr("");
    setOpen(true);
  };

  const startEdit = (r: RecurringTask) => {
    setEditing(r);
    setForm({
      title: r.title,
      description: r.description,
      client: r.client,
      priority: r.priority,
      frequency: r.frequency,
      weekday: r.weekday ?? 1,
      day_of_month: r.day_of_month ?? 1,
      active: r.active,
    });
    setErr("");
    setOpen(true);
  };

  const save = async (e: React.FormEvent) => {
    e.preventDefault();
    setErr("");
    if (!form.title.trim()) return setErr("Informe o título.");
    setBusy(true);

    const needsWeekday =
      form.frequency === "weekly" || form.frequency === "biweekly";
    const needsDom = ["monthly", "quarterly", "yearly"].includes(form.frequency);

    const payload = {
      title: form.title.trim(),
      description: form.description.trim(),
      client: form.client.trim(),
      priority: form.priority,
      frequency: form.frequency,
      weekday: needsWeekday ? Number(form.weekday) : null,
      day_of_month: needsDom ? Number(form.day_of_month) : null,
      active: form.active,
    };

    let error;
    if (editing) {
      ({ error } = await supabase
        .from("recurring_tasks")
        .update(payload)
        .eq("id", editing.id));
    } else {
      const { data: u } = await supabase.auth.getUser();
      ({ error } = await supabase
        .from("recurring_tasks")
        .insert({ ...payload, user_id: u.user!.id }));
    }
    setBusy(false);
    if (error) return setErr(error.message);
    setOpen(false);
    load();
  };

  const toggleActive = async (r: RecurringTask) => {
    setRows((v) =>
      v.map((x) => (x.id === r.id ? { ...x, active: !x.active } : x))
    );
    await supabase
      .from("recurring_tasks")
      .update({ active: !r.active })
      .eq("id", r.id);
    load();
  };

  /** Gera a demanda agora, sem esperar a data. */
  const runNow = async (r: RecurringTask) => {
    const { data: u } = await supabase.auth.getUser();
    const { error } = await supabase.from("tasks").insert({
      user_id: u.user!.id,
      title: r.title,
      description: r.description,
      client: r.client,
      priority: r.priority,
      status: "todo",
      due_date: today,
      origin_id: r.id,
    });
    if (error) return setToast(`Erro: ${error.message}`);
    await supabase
      .from("recurring_tasks")
      .update({ last_run_on: today })
      .eq("id", r.id);
    setToast(`"${r.title}" foi criada em Demandas.`);
    load();
  };

  const remove = (r: RecurringTask) =>
    confirm.ask(
      `Excluir a recorrência "${r.title}"? As demandas já geradas continuam em Demandas.`,
      async () => {
        await supabase.from("recurring_tasks").delete().eq("id", r.id);
        load();
      }
    );

  const view = rows.filter((r) =>
    filter === "active" ? r.active : filter === "paused" ? !r.active : true
  );
  const activeCount = rows.filter((r) => r.active).length;
  const dueToday = rows.filter((r) => isDueOn(r, today)).length;

  const needsWeekday =
    form.frequency === "weekly" || form.frequency === "biweekly";
  const needsDom = ["monthly", "quarterly", "yearly"].includes(form.frequency);

  return (
    <div className="space-y-5 rise">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">
            Demandas recorrentes
          </h1>
          <p className="mt-1 text-sm text-fg-mute">
            {activeCount} ativa{activeCount === 1 ? "" : "s"} · geram demandas
            automaticamente quando você abre o dashboard
          </p>
        </div>
        <Button variant="primary" onClick={startNew}>
          <Plus size={15} />
          Nova recorrência
        </Button>
      </div>

      {dueToday > 0 && (
        <div className="flex items-center gap-2.5 rounded-xl border border-warn/25 bg-warn/8 px-4 py-3 text-xs text-warn">
          <Zap size={15} className="shrink-0" />
          {dueToday} recorrência{dueToday > 1 ? "s" : ""} pendente
          {dueToday > 1 ? "s" : ""} para hoje.
          <Link href="/" className="ml-auto font-medium underline">
            Abrir dashboard para gerar
          </Link>
        </div>
      )}

      <Segmented
        value={filter}
        onChange={setFilter}
        options={[
          { value: "all", label: "Todas", count: rows.length },
          { value: "active", label: "Ativas", count: activeCount },
          { value: "paused", label: "Pausadas", count: rows.length - activeCount },
        ]}
      />

      {loading ? (
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {Array.from({ length: 3 }).map((_, i) => (
            <Skeleton key={i} className="h-40" />
          ))}
        </div>
      ) : view.length === 0 ? (
        <Card>
          <Empty
            icon={<Repeat2 size={18} />}
            title={rows.length ? "Nada neste filtro" : "Nenhuma recorrência"}
            sub={
              rows.length
                ? "Troque o filtro para ver as outras."
                : "Cadastre o que se repete — relatório semanal, fechamento mensal, follow-up de cliente — e o app cria a demanda na data certa."
            }
            action={
              !rows.length ? (
                <Button variant="primary" size="sm" onClick={startNew}>
                  <Plus size={14} />
                  Nova recorrência
                </Button>
              ) : undefined
            }
          />
        </Card>
      ) : (
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {view.map((r) => {
            const next = nextOccurrence(r);
            const due = isDueOn(r, today);
            return (
              <Card
                key={r.id}
                className={cx(
                  "group flex flex-col p-4 transition-colors",
                  r.active ? "hover:border-ink-600" : "opacity-60"
                )}
              >
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <p className="truncate text-[14px] font-medium">{r.title}</p>
                    <p className="mt-0.5 flex items-center gap-1.5 text-[11px] text-brand-400">
                      <Repeat2 size={11} />
                      {frequencyDescription(r)}
                    </p>
                  </div>
                  <div className="flex shrink-0 items-center gap-0.5 opacity-0 transition-opacity group-hover:opacity-100 focus-within:opacity-100">
                    <button
                      onClick={() => startEdit(r)}
                      aria-label="Editar"
                      className="rounded-md p-1.5 text-fg-mute hover:bg-ink-750 hover:text-fg"
                    >
                      <Pencil size={13} />
                    </button>
                    <button
                      onClick={() => remove(r)}
                      aria-label="Excluir"
                      className="rounded-md p-1.5 text-fg-mute hover:bg-neg/15 hover:text-neg"
                    >
                      <Trash2 size={13} />
                    </button>
                  </div>
                </div>

                {r.description && (
                  <p className="mt-2 line-clamp-2 text-[11px] leading-relaxed text-fg-mute">
                    {r.description}
                  </p>
                )}

                <div className="mt-3 flex flex-wrap items-center gap-1.5">
                  <Badge
                    tone={
                      r.priority === "urgent"
                        ? "neg"
                        : r.priority === "high"
                          ? "warn"
                          : r.priority === "medium"
                            ? "brand"
                            : "neutral"
                    }
                  >
                    {PRIORITY_LABEL[r.priority]}
                  </Badge>
                  {r.client && (
                    <span className="inline-flex items-center gap-1 text-[10px] text-fg-mute">
                      <Building2 size={9} />
                      {r.client}
                    </span>
                  )}
                  {due && r.active && (
                    <Badge tone="warn">
                      <Zap size={10} />
                      hoje
                    </Badge>
                  )}
                </div>

                <div className="mt-4 space-y-1.5 border-t border-line-soft pt-3 text-[11px]">
                  <div className="flex items-center justify-between">
                    <span className="flex items-center gap-1.5 text-fg-mute">
                      <CalendarClock size={11} />
                      Próxima
                    </span>
                    <span className="text-fg-dim tnum">
                      {next === today ? "hoje" : next ? dateBR(next) : "—"}
                    </span>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-fg-mute">Última geração</span>
                    <span className="text-fg-dim tnum">
                      {r.last_run_on ? dateBR(r.last_run_on) : "nunca"}
                    </span>
                  </div>
                </div>

                <div className="mt-3 flex items-center gap-2">
                  <Button
                    size="sm"
                    variant="subtle"
                    onClick={() => runNow(r)}
                    className="flex-1"
                  >
                    <Play size={12} />
                    Gerar agora
                  </Button>
                  <Button
                    size="sm"
                    variant={r.active ? "outline" : "primary"}
                    onClick={() => toggleActive(r)}
                    aria-label={r.active ? "Pausar" : "Ativar"}
                  >
                    <Power size={12} />
                    {r.active ? "Pausar" : "Ativar"}
                  </Button>
                </div>
              </Card>
            );
          })}
        </div>
      )}

      {toast && (
        <div className="fixed bottom-5 left-1/2 z-50 -translate-x-1/2 rounded-xl border border-line bg-ink-850 px-4 py-3 text-xs text-fg-dim shadow-[0_20px_50px_-20px_rgba(0,0,0,1)] pop">
          {toast}
        </div>
      )}

      {/* ------------------------------ modal ------------------------------ */}
      <Modal
        open={open}
        onClose={() => setOpen(false)}
        title={editing ? "Editar recorrência" : "Nova recorrência"}
        sub="Define o que se repete e com que frequência."
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
          <Field label="Título">
            <Input
              autoFocus
              value={form.title}
              onChange={(e) => setForm({ ...form, title: e.target.value })}
              placeholder="Relatório semanal de performance"
            />
          </Field>

          <Field label="Descrição">
            <Textarea
              rows={2}
              value={form.description}
              onChange={(e) => setForm({ ...form, description: e.target.value })}
              placeholder="O que precisa ser feito nessa recorrência"
            />
          </Field>

          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Cliente / projeto">
              <Input
                value={form.client}
                onChange={(e) => setForm({ ...form, client: e.target.value })}
                placeholder="Opcional"
              />
            </Field>
            <Field label="Prioridade">
              <Select
                value={form.priority}
                onChange={(e) =>
                  setForm({ ...form, priority: e.target.value as Priority })
                }
              >
                {PRIORITIES.map((p) => (
                  <option key={p} value={p}>
                    {PRIORITY_LABEL[p]}
                  </option>
                ))}
              </Select>
            </Field>
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Frequência">
              <Select
                value={form.frequency}
                onChange={(e) =>
                  setForm({ ...form, frequency: e.target.value as Frequency })
                }
              >
                {FREQS.map((f) => (
                  <option key={f} value={f}>
                    {FREQUENCY_LABEL[f]}
                  </option>
                ))}
              </Select>
            </Field>

            {needsWeekday && (
              <Field label="Dia da semana">
                <Select
                  value={String(form.weekday)}
                  onChange={(e) =>
                    setForm({ ...form, weekday: Number(e.target.value) })
                  }
                >
                  {WEEKDAYS.map((w, i) => (
                    <option key={w} value={i}>
                      {w}
                    </option>
                  ))}
                </Select>
              </Field>
            )}

            {needsDom && (
              <Field
                label="Dia do mês"
                hint="Em meses curtos, cai no último dia."
              >
                <Input
                  type="number"
                  min={1}
                  max={31}
                  value={form.day_of_month}
                  onChange={(e) =>
                    setForm({ ...form, day_of_month: Number(e.target.value) })
                  }
                />
              </Field>
            )}
          </div>

          <label className="flex cursor-pointer items-center gap-2.5 rounded-xl border border-line-soft bg-ink-900/50 px-3.5 py-3">
            <input
              type="checkbox"
              checked={form.active}
              onChange={(e) => setForm({ ...form, active: e.target.checked })}
              className="h-4 w-4 accent-[#2f7bff]"
            />
            <span className="text-sm text-fg-dim">
              Ativa
              <span className="ml-1 text-[11px] text-fg-mute">
                (pausada não gera demandas)
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
