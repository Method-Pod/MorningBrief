"use client";

import * as React from "react";
import { Pencil, Pin, PinOff, Plus, Search, StickyNote, Trash2 } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { currentUserId, SESSION_EXPIRED } from "@/lib/session";
import { NOTE_COLORS, type Note } from "@/lib/types";
import { dateTimeBR } from "@/lib/format";
import {
  Button,
  Card,
  Empty,
  Field,
  Input,
  Modal,
  Textarea,
  useConfirm,
  useNotice,
  cx,
} from "@/components/ui";

const SWATCH: Record<string, { dot: string; edge: string; glow: string }> = {
  blue: { dot: "bg-brand-500", edge: "border-l-brand-500", glow: "from-brand-500/8" },
  violet: { dot: "bg-violet-500", edge: "border-l-violet-500", glow: "from-violet-500/8" },
  emerald: { dot: "bg-pos", edge: "border-l-pos", glow: "from-pos/8" },
  amber: { dot: "bg-warn", edge: "border-l-warn", glow: "from-warn/8" },
  rose: { dot: "bg-neg", edge: "border-l-neg", glow: "from-neg/8" },
  slate: { dot: "bg-ink-600", edge: "border-l-ink-600", glow: "from-white/5" },
};

const blank = () => ({ title: "", content: "", color: "blue", pinned: false });

export default function AnotacoesPage() {
  const supabase = React.useMemo(() => createClient(), []);
  const [rows, setRows] = React.useState<Note[]>([]);
  const [loading, setLoading] = React.useState(true);
  const [q, setQ] = React.useState("");
  const [open, setOpen] = React.useState(false);
  const [editing, setEditing] = React.useState<Note | null>(null);
  const [form, setForm] = React.useState(blank());
  const [busy, setBusy] = React.useState(false);
  const [err, setErr] = React.useState("");
  const confirm = useConfirm();
  const notice = useNotice();

  const load = React.useCallback(async () => {
    const { data } = await supabase
      .from("notes")
      .select("*")
      .order("pinned", { ascending: false })
      .order("updated_at", { ascending: false });
    setRows((data as Note[]) ?? []);
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

  const startEdit = (n: Note) => {
    setEditing(n);
    setForm({
      title: n.title,
      content: n.content,
      color: n.color,
      pinned: n.pinned,
    });
    setErr("");
    setOpen(true);
  };

  const save = async (e: React.FormEvent) => {
    e.preventDefault();
    setErr("");
    if (!form.title.trim() && !form.content.trim())
      return setErr("Escreva um título ou algum conteúdo.");
    setBusy(true);

    const payload = {
      title: form.title.trim(),
      content: form.content,
      color: form.color,
      pinned: form.pinned,
    };

    let error;
    if (editing) {
      ({ error } = await supabase
        .from("notes")
        .update(payload)
        .eq("id", editing.id));
    } else {
      const uid = await currentUserId(supabase);
      if (!uid) {
        setBusy(false);
        return setErr(SESSION_EXPIRED);
      }
      ({ error } = await supabase
        .from("notes")
        .insert({ ...payload, user_id: uid }));
    }
    setBusy(false);
    if (error) return setErr(error.message);
    setOpen(false);
    load();
  };

  const togglePin = async (n: Note) => {
    setRows((r) =>
      r.map((x) => (x.id === n.id ? { ...x, pinned: !x.pinned } : x))
    );
    const { error } = await supabase
      .from("notes")
      .update({ pinned: !n.pinned })
      .eq("id", n.id);
    if (notice.check(error, n.pinned ? "desafixar a nota" : "fixar a nota"))
      load();
  };

  const remove = (n: Note) =>
    confirm.ask(`Excluir "${n.title || "esta anotação"}"?`, async () => {
      const { error } = await supabase.from("notes").delete().eq("id", n.id);
      if (!notice.check(error, "excluir a anotação")) load();
    });

  const view = React.useMemo(() => {
    const term = q.trim().toLowerCase();
    if (!term) return rows;
    return rows.filter(
      (n) =>
        n.title.toLowerCase().includes(term) ||
        n.content.toLowerCase().includes(term)
    );
  }, [rows, q]);

  const pinned = view.filter((n) => n.pinned);
  const rest = view.filter((n) => !n.pinned);

  return (
    <div className="space-y-5 rise">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Anotações</h1>
          <p className="mt-1 text-sm text-fg-mute">
            {rows.length} nota{rows.length === 1 ? "" : "s"}
            {pinned.length > 0 && ` · ${pinned.length} fixada${pinned.length === 1 ? "" : "s"}`}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <div className="relative w-48 sm:w-64">
            <Search
              size={14}
              className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-fg-mute"
            />
            <Input
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder="Buscar..."
              className="pl-9"
            />
          </div>
          <Button variant="primary" onClick={startNew}>
            <Plus size={15} />
            Nova
          </Button>
        </div>
      </div>

      {loading ? (
        null
      ) : view.length === 0 ? (
        <Card>
          <Empty
            icon={<StickyNote size={18} />}
            title={q ? "Nada encontrado" : "Nenhuma anotação"}
            sub={
              q
                ? "Tente outro termo."
                : "Ideias, senhas de ambiente, roteiros, recados — o que precisar ficar à mão."
            }
            action={
              !q ? (
                <Button variant="primary" size="sm" onClick={startNew}>
                  <Plus size={14} />
                  Nova anotação
                </Button>
              ) : undefined
            }
          />
        </Card>
      ) : (
        <div className="space-y-6">
          {pinned.length > 0 && (
            <section>
              <p className="mb-3 flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-[0.14em] text-fg-mute">
                <Pin size={11} />
                Fixadas
              </p>
              <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
                {pinned.map((n) => (
                  <NoteCard
                    key={n.id}
                    n={n}
                    onEdit={() => startEdit(n)}
                    onPin={() => togglePin(n)}
                    onDelete={() => remove(n)}
                  />
                ))}
              </div>
            </section>
          )}

          {rest.length > 0 && (
            <section>
              {pinned.length > 0 && (
                <p className="mb-3 text-[11px] font-semibold uppercase tracking-[0.14em] text-fg-mute">
                  Outras
                </p>
              )}
              <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
                {rest.map((n) => (
                  <NoteCard
                    key={n.id}
                    n={n}
                    onEdit={() => startEdit(n)}
                    onPin={() => togglePin(n)}
                    onDelete={() => remove(n)}
                  />
                ))}
              </div>
            </section>
          )}
        </div>
      )}

      {/* ------------------------------ modal ------------------------------ */}
      <Modal
        open={open}
        onClose={() => setOpen(false)}
        title={editing ? "Editar anotação" : "Nova anotação"}
        size="xl"
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
              placeholder="Ideias para a campanha de setembro"
            />
          </Field>

          <Field label="Conteúdo">
            <Textarea
              rows={10}
              value={form.content}
              onChange={(e) => setForm({ ...form, content: e.target.value })}
              placeholder="Escreva livremente. Quebras de linha são preservadas."
              className="resize-y font-normal"
            />
          </Field>

          <div className="flex flex-wrap items-center justify-between gap-4">
            <div>
              <span className="mb-2 block text-[11px] font-medium uppercase tracking-wider text-fg-mute">
                Cor
              </span>
              <div className="flex items-center gap-2">
                {NOTE_COLORS.map((c) => (
                  <button
                    key={c}
                    type="button"
                    onClick={() => setForm({ ...form, color: c })}
                    aria-label={`Cor ${c}`}
                    className={cx(
                      "h-7 w-7 rounded-full transition-colors",
                      SWATCH[c].dot,
                      form.color === c
                        ? "ring-2 ring-white/70 ring-offset-2 ring-offset-ink-850"
                        : "opacity-60 hover:opacity-100"
                    )}
                  />
                ))}
              </div>
            </div>

            <label className="flex cursor-pointer items-center gap-2.5 rounded-xl border border-line-soft bg-ink-900/50 px-3.5 py-3">
              <input
                type="checkbox"
                checked={form.pinned}
                onChange={(e) => setForm({ ...form, pinned: e.target.checked })}
                className="h-4 w-4 accent-[#2f7bff]"
              />
              <span className="text-sm text-fg-dim">Fixar no topo</span>
            </label>
          </div>

          {err && (
            <p className="rounded-xl border border-neg/30 bg-neg/10 p-3 text-xs text-neg">
              {err}
            </p>
          )}
        </form>
      </Modal>

      {confirm.node}
      {notice.node}
    </div>
  );
}

function NoteCard({
  n,
  onEdit,
  onPin,
  onDelete,
}: {
  n: Note;
  onEdit: () => void;
  onPin: () => void;
  onDelete: () => void;
}) {
  const s = SWATCH[n.color] ?? SWATCH.blue;
  return (
    <Card
      className={cx(
        "group relative flex h-full flex-col overflow-hidden border-l-2 p-4 transition-colors hover:border-ink-600",
        s.edge
      )}
    >
      <div
        className={cx(
          "pointer-events-none absolute inset-0 bg-gradient-to-br to-transparent opacity-70",
          s.glow
        )}
      />
      <div className="relative flex items-start justify-between gap-2">
        <p className="min-w-0 flex-1 truncate text-[14px] font-medium">
          {n.title || <span className="text-fg-mute">Sem título</span>}
        </p>
        <div className="flex shrink-0 items-center gap-0.5">
          <button
            onClick={onPin}
            aria-label={n.pinned ? "Desafixar" : "Fixar"}
            className={cx(
              "rounded-md p-1.5 transition-colors",
              n.pinned
                ? "text-brand-400 hover:bg-ink-750"
                : "text-fg-mute opacity-0 hover:bg-ink-750 hover:text-fg group-hover:opacity-100"
            )}
          >
            {n.pinned ? <Pin size={13} /> : <PinOff size={13} />}
          </button>
          <button
            onClick={onEdit}
            aria-label="Editar"
            className="rounded-md p-1.5 text-fg-mute opacity-0 transition-opacity hover:bg-ink-750 hover:text-fg group-hover:opacity-100"
          >
            <Pencil size={13} />
          </button>
          <button
            onClick={onDelete}
            aria-label="Excluir"
            className="rounded-md p-1.5 text-fg-mute opacity-0 transition-opacity hover:bg-neg/15 hover:text-neg group-hover:opacity-100"
          >
            <Trash2 size={13} />
          </button>
        </div>
      </div>

      {n.content && (
        <p className="relative mt-2 line-clamp-[7] whitespace-pre-wrap text-[12px] leading-relaxed text-fg-dim">
          {n.content}
        </p>
      )}

      <p className="relative mt-auto pt-3 text-[10px] text-fg-mute">
        {dateTimeBR(n.updated_at)}
      </p>
    </Card>
  );
}
