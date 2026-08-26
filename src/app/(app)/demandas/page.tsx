"use client";

import * as React from "react";
import {
  AlertCircle,
  ArrowRight,
  Building2,
  CalendarDays,
  ListChecks,
  Pencil,
  Plus,
  Repeat2,
  Search,
  Trash2,
} from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import {
  PRIORITY_LABEL,
  STATUS_LABEL,
  type Priority,
  type Task,
  type TaskStatus,
} from "@/lib/types";
import { dateBR, daysUntil, todayISO } from "@/lib/format";
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

const COLUMNS: TaskStatus[] = ["todo", "doing", "review", "done"];
const PRIORITIES: Priority[] = ["low", "medium", "high", "urgent"];
const RANK: Record<Priority, number> = { urgent: 0, high: 1, medium: 2, low: 3 };

const TONE: Record<Priority, "neutral" | "brand" | "warn" | "neg"> = {
  low: "neutral",
  medium: "brand",
  high: "warn",
  urgent: "neg",
};

const blank = () => ({
  title: "",
  description: "",
  client: "",
  priority: "medium" as Priority,
  status: "todo" as TaskStatus,
  due_date: "",
});

export default function DemandasPage() {
  const supabase = React.useMemo(() => createClient(), []);
  const [rows, setRows] = React.useState<Task[]>([]);
  const [loading, setLoading] = React.useState(true);
  const [view, setView] = React.useState<"board" | "list">("board");
  const [q, setQ] = React.useState("");
  const [prio, setPrio] = React.useState<"all" | Priority>("all");
  const [open, setOpen] = React.useState(false);
  const [editing, setEditing] = React.useState<Task | null>(null);
  const [form, setForm] = React.useState(blank());
  const [busy, setBusy] = React.useState(false);
  const [err, setErr] = React.useState("");
  const [drag, setDrag] = React.useState<string | null>(null);
  const confirm = useConfirm();

  const load = React.useCallback(async () => {
    const { data } = await supabase
      .from("tasks")
      .select("*")
      .order("created_at", { ascending: false });
    setRows((data as Task[]) ?? []);
    setLoading(false);
  }, [supabase]);

  React.useEffect(() => {
    load();
  }, [load]);

  const startNew = (status: TaskStatus = "todo") => {
    setEditing(null);
    setForm({ ...blank(), status });
    setErr("");
    setOpen(true);
  };

  const startEdit = (t: Task) => {
    setEditing(t);
    setForm({
      title: t.title,
      description: t.description,
      client: t.client,
      priority: t.priority,
      status: t.status,
      due_date: t.due_date?.slice(0, 10) ?? "",
    });
    setErr("");
    setOpen(true);
  };

  const save = async (e: React.FormEvent) => {
    e.preventDefault();
    setErr("");
    if (!form.title.trim()) return setErr("Informe o título da demanda.");
    setBusy(true);

    const payload = {
      title: form.title.trim(),
      description: form.description.trim(),
      client: form.client.trim(),
      priority: form.priority,
      status: form.status,
      due_date: form.due_date || null,
      completed_at: form.status === "done" ? new Date().toISOString() : null,
    };

    let error;
    if (editing) {
      ({ error } = await supabase
        .from("tasks")
        .update(payload)
        .eq("id", editing.id));
    } else {
      const { data: u } = await supabase.auth.getUser();
      ({ error } = await supabase
        .from("tasks")
        .insert({ ...payload, user_id: u.user!.id }));
    }
    setBusy(false);
    if (error) return setErr(error.message);
    setOpen(false);
    load();
  };

  const move = async (t: Task, status: TaskStatus) => {
    if (t.status === status) return;
    setRows((r) => r.map((x) => (x.id === t.id ? { ...x, status } : x)));
    await supabase
      .from("tasks")
      .update({
        status,
        completed_at: status === "done" ? new Date().toISOString() : null,
      })
      .eq("id", t.id);
    load();
  };

  const remove = (t: Task) =>
    confirm.ask(`Excluir "${t.title}"?`, async () => {
      await supabase.from("tasks").delete().eq("id", t.id);
      load();
    });

  /* ------------------------------ derivados ------------------------------ */

  const filtered = React.useMemo(() => {
    const term = q.trim().toLowerCase();
    return rows
      .filter((t) => prio === "all" || t.priority === prio)
      .filter(
        (t) =>
          !term ||
          t.title.toLowerCase().includes(term) ||
          t.client.toLowerCase().includes(term) ||
          t.description.toLowerCase().includes(term)
      )
      .sort((a, b) => {
        if (RANK[a.priority] !== RANK[b.priority])
          return RANK[a.priority] - RANK[b.priority];
        return (a.due_date ?? "9999").localeCompare(b.due_date ?? "9999");
      });
  }, [rows, q, prio]);

  const byStatus = (s: TaskStatus) => filtered.filter((t) => t.status === s);
  const openCount = rows.filter((t) => t.status !== "done").length;
  const lateCount = rows.filter(
    (t) => t.status !== "done" && t.due_date && daysUntil(t.due_date) < 0
  ).length;

  return (
    <div className="space-y-5 rise">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Demandas</h1>
          <p className="mt-1 text-sm text-fg-mute">
            {openCount} aberta{openCount === 1 ? "" : "s"}
            {lateCount > 0 && <span className="text-neg"> · {lateCount} atrasada{lateCount === 1 ? "" : "s"}</span>}
          </p>
        </div>
        <Button variant="primary" onClick={() => startNew()}>
          <Plus size={15} />
          Nova demanda
        </Button>
      </div>

      <div className="flex flex-wrap items-center gap-3">
        <Segmented
          value={view}
          onChange={setView}
          options={[
            { value: "board", label: "Quadro" },
            { value: "list", label: "Lista" },
          ]}
        />
        <Segmented
          value={prio}
          onChange={setPrio}
          options={[
            { value: "all", label: "Todas" },
            ...PRIORITIES.map((p) => ({ value: p, label: PRIORITY_LABEL[p] })),
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
            placeholder="Buscar demanda ou cliente..."
            className="pl-9"
          />
        </div>
      </div>

      {loading ? (
        <div className="grid gap-4 lg:grid-cols-4">
          {Array.from({ length: 4 }).map((_, i) => (
            <Skeleton key={i} className="h-64" />
          ))}
        </div>
      ) : rows.length === 0 ? (
        <Card>
          <Empty
            icon={<ListChecks size={18} />}
            title="Nenhuma demanda ainda"
            sub="Crie demandas manualmente ou deixe as recorrentes gerarem sozinhas."
            action={
              <Button variant="primary" size="sm" onClick={() => startNew()}>
                <Plus size={14} />
                Nova demanda
              </Button>
            }
          />
        </Card>
      ) : view === "board" ? (
        /* ------------------------------ quadro ------------------------------ */
        <div className="grid gap-4 lg:grid-cols-4">
          {COLUMNS.map((col) => {
            const items = byStatus(col);
            return (
              <div
                key={col}
                onDragOver={(e) => e.preventDefault()}
                onDrop={() => {
                  const t = rows.find((x) => x.id === drag);
                  if (t) move(t, col);
                  setDrag(null);
                }}
                className="flex min-h-[220px] flex-col rounded-2xl border border-line bg-ink-900/40 p-2.5"
              >
                <div className="flex items-center justify-between px-2 py-2">
                  <div className="flex items-center gap-2">
                    <span
                      className={cx(
                        "h-2 w-2 rounded-full",
                        col === "todo" && "bg-ink-600",
                        col === "doing" && "bg-brand-400",
                        col === "review" && "bg-warn",
                        col === "done" && "bg-pos"
                      )}
                    />
                    <span className="text-[13px] font-medium">
                      {STATUS_LABEL[col]}
                    </span>
                    <span className="text-[11px] text-fg-mute tnum">
                      {items.length}
                    </span>
                  </div>
                  <button
                    onClick={() => startNew(col)}
                    aria-label={`Nova demanda em ${STATUS_LABEL[col]}`}
                    className="rounded-lg p-1 text-fg-mute transition-colors hover:bg-ink-800 hover:text-fg"
                  >
                    <Plus size={14} />
                  </button>
                </div>

                <div className="flex flex-1 flex-col gap-2">
                  {items.length === 0 ? (
                    <div className="flex flex-1 items-center justify-center rounded-xl border border-dashed border-line-soft py-8 text-[11px] text-fg-mute">
                      Arraste aqui
                    </div>
                  ) : (
                    items.map((t) => (
                      <TaskCard
                        key={t.id}
                        t={t}
                        onDragStart={() => setDrag(t.id)}
                        onEdit={() => startEdit(t)}
                        onDelete={() => remove(t)}
                        onAdvance={() => {
                          const i = COLUMNS.indexOf(t.status);
                          if (i < COLUMNS.length - 1) move(t, COLUMNS[i + 1]);
                        }}
                      />
                    ))
                  )}
                </div>
              </div>
            );
          })}
        </div>
      ) : (
        /* ------------------------------ lista ------------------------------ */
        <Card className="overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full min-w-[720px] text-sm">
              <thead>
                <tr className="border-b border-line-soft text-left text-[11px] uppercase tracking-wider text-fg-mute">
                  <th className="px-5 py-2.5 font-medium">Demanda</th>
                  <th className="px-3 py-2.5 font-medium">Cliente</th>
                  <th className="px-3 py-2.5 font-medium">Prioridade</th>
                  <th className="px-3 py-2.5 font-medium">Prazo</th>
                  <th className="px-3 py-2.5 font-medium">Status</th>
                  <th className="w-24 px-4 py-2.5" />
                </tr>
              </thead>
              <tbody>
                {filtered.map((t) => (
                  <tr
                    key={t.id}
                    className="group border-b border-line-soft/60 last:border-0 transition-colors hover:bg-ink-800/40"
                  >
                    <td className="px-5 py-3">
                      <p
                        className={cx(
                          "max-w-[280px] truncate font-medium",
                          t.status === "done" && "text-fg-mute line-through"
                        )}
                      >
                        {t.title}
                      </p>
                      {t.description && (
                        <p className="max-w-[280px] truncate text-[11px] text-fg-mute">
                          {t.description}
                        </p>
                      )}
                    </td>
                    <td className="px-3 py-3 text-xs text-fg-dim">
                      {t.client || "—"}
                    </td>
                    <td className="px-3 py-3">
                      <Badge tone={TONE[t.priority]}>
                        {PRIORITY_LABEL[t.priority]}
                      </Badge>
                    </td>
                    <td className="px-3 py-3">
                      {t.due_date ? (
                        <span
                          className={cx(
                            "text-xs tnum",
                            t.status !== "done" && daysUntil(t.due_date) < 0
                              ? "text-neg"
                              : "text-fg-dim"
                          )}
                        >
                          {dateBR(t.due_date)}
                        </span>
                      ) : (
                        <span className="text-xs text-fg-mute">—</span>
                      )}
                    </td>
                    <td className="px-3 py-3">
                      <Select
                        value={t.status}
                        onChange={(e) => move(t, e.target.value as TaskStatus)}
                        className="h-8 w-[130px] text-xs"
                      >
                        {COLUMNS.map((s) => (
                          <option key={s} value={s}>
                            {STATUS_LABEL[s]}
                          </option>
                        ))}
                      </Select>
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex items-center justify-end gap-1 opacity-0 transition-opacity group-hover:opacity-100 focus-within:opacity-100">
                        <button
                          onClick={() => startEdit(t)}
                          aria-label="Editar"
                          className="rounded-lg p-1.5 text-fg-mute hover:bg-ink-750 hover:text-fg"
                        >
                          <Pencil size={14} />
                        </button>
                        <button
                          onClick={() => remove(t)}
                          aria-label="Excluir"
                          className="rounded-lg p-1.5 text-fg-mute hover:bg-neg/15 hover:text-neg"
                        >
                          <Trash2 size={14} />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>
      )}

      {/* ------------------------------ modal ------------------------------ */}
      <Modal
        open={open}
        onClose={() => setOpen(false)}
        title={editing ? "Editar demanda" : "Nova demanda"}
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
              placeholder="Ajustar criativos da campanha"
            />
          </Field>

          <Field label="Descrição">
            <Textarea
              rows={3}
              value={form.description}
              onChange={(e) => setForm({ ...form, description: e.target.value })}
              placeholder="Contexto, links, o que precisa ser entregue..."
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
            <Field label="Prazo">
              <Input
                type="date"
                value={form.due_date}
                onChange={(e) => setForm({ ...form, due_date: e.target.value })}
              />
            </Field>
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
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
            <Field label="Status">
              <Select
                value={form.status}
                onChange={(e) =>
                  setForm({ ...form, status: e.target.value as TaskStatus })
                }
              >
                {COLUMNS.map((s) => (
                  <option key={s} value={s}>
                    {STATUS_LABEL[s]}
                  </option>
                ))}
              </Select>
            </Field>
          </div>

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

/* ------------------------------ card do quadro ------------------------------ */

function TaskCard({
  t,
  onDragStart,
  onEdit,
  onDelete,
  onAdvance,
}: {
  t: Task;
  onDragStart: () => void;
  onEdit: () => void;
  onDelete: () => void;
  onAdvance: () => void;
}) {
  const late = t.status !== "done" && t.due_date && daysUntil(t.due_date) < 0;
  const isToday = t.due_date?.slice(0, 10) === todayISO();

  return (
    <div
      draggable
      onDragStart={onDragStart}
      className="group cursor-grab rounded-xl border border-line bg-ink-850 p-3 transition-all hover:border-ink-600 active:cursor-grabbing"
    >
      <div className="flex items-start justify-between gap-2">
        <p
          className={cx(
            "text-[13px] font-medium leading-snug",
            t.status === "done" && "text-fg-mute line-through"
          )}
        >
          {t.title}
        </p>
        <div className="flex shrink-0 items-center gap-0.5 opacity-0 transition-opacity group-hover:opacity-100">
          {t.status !== "done" && (
            <button
              onClick={onAdvance}
              aria-label="Avançar status"
              className="rounded-md p-1 text-fg-mute hover:bg-ink-750 hover:text-brand-400"
            >
              <ArrowRight size={13} />
            </button>
          )}
          <button
            onClick={onEdit}
            aria-label="Editar"
            className="rounded-md p-1 text-fg-mute hover:bg-ink-750 hover:text-fg"
          >
            <Pencil size={13} />
          </button>
          <button
            onClick={onDelete}
            aria-label="Excluir"
            className="rounded-md p-1 text-fg-mute hover:bg-neg/15 hover:text-neg"
          >
            <Trash2 size={13} />
          </button>
        </div>
      </div>

      {t.description && (
        <p className="mt-1.5 line-clamp-2 text-[11px] leading-relaxed text-fg-mute">
          {t.description}
        </p>
      )}

      <div className="mt-2.5 flex flex-wrap items-center gap-1.5">
        <Badge tone={TONE[t.priority]}>{PRIORITY_LABEL[t.priority]}</Badge>
        {t.origin_id && (
          <Badge tone="violet">
            <Repeat2 size={10} />
            recorrente
          </Badge>
        )}
        {t.client && (
          <span className="inline-flex items-center gap-1 text-[10px] text-fg-mute">
            <Building2 size={9} />
            {t.client}
          </span>
        )}
        {t.due_date && (
          <span
            className={cx(
              "inline-flex items-center gap-1 text-[10px] tnum",
              late ? "text-neg" : isToday ? "text-warn" : "text-fg-mute"
            )}
          >
            {late ? <AlertCircle size={9} /> : <CalendarDays size={9} />}
            {isToday ? "hoje" : dateBR(t.due_date)}
          </span>
        )}
      </div>
    </div>
  );
}
