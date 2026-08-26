"use client";

import * as React from "react";
import { Check, Flame, Pencil, Plus, Power, Repeat2, Trash2 } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { currentUserId, SESSION_EXPIRED } from "@/lib/session";
import { HABIT_COLORS, type Habit, type HabitLog } from "@/lib/types";
import { todayISO, ultimosDias } from "@/lib/format";
import {
  Button,
  Card,
  Field,
  Input,
  Modal,
  Select,
  Skeleton,
  cx,
  useConfirm,
  useNotice,
} from "@/components/ui";

const COR: Record<string, string> = {
  blue: "#2563a8",
  violet: "#6d5bd0",
  emerald: "#1f9d63",
  amber: "#b8820c",
  rose: "#cf4a3f",
  slate: "#666e74",
};

const SIGLA = ["D", "S", "T", "Q", "Q", "S", "S"];

const vazio = () => ({ name: "", color: "blue", target_per_week: 7, active: true });

export default function HabitosPage() {
  const supabase = React.useMemo(() => createClient(), []);
  const [habits, setHabits] = React.useState<Habit[]>([]);
  const [logs, setLogs] = React.useState<HabitLog[]>([]);
  const [loading, setLoading] = React.useState(true);
  const [open, setOpen] = React.useState(false);
  const [editing, setEditing] = React.useState<Habit | null>(null);
  const [form, setForm] = React.useState(vazio());
  const [busy, setBusy] = React.useState(false);
  const [err, setErr] = React.useState("");
  const confirm = useConfirm();
  const notice = useNotice();

  const hoje = todayISO();
  const semana = React.useMemo(() => ultimosDias(hoje, 7), [hoje]);

  const load = React.useCallback(async () => {
    // 60 dias cobrem a sequência mais longa que a tela mostra
    const desde = ultimosDias(todayISO(), 60)[0];
    const [h, l] = await Promise.all([
      supabase.from("habits").select("*").order("created_at"),
      supabase.from("habit_logs").select("*").gte("day", desde),
    ]);
    setHabits((h.data as Habit[]) ?? []);
    setLogs((l.data as HabitLog[]) ?? []);
    setLoading(false);
  }, [supabase]);

  React.useEffect(() => {
    load();
  }, [load]);

  /** Set de "habitId|dia" para consulta O(1) na renderização. */
  const feitos = React.useMemo(
    () => new Set(logs.map((l) => `${l.habit_id}|${l.day.slice(0, 10)}`)),
    [logs]
  );

  const marcado = (id: string, dia: string) => feitos.has(`${id}|${dia}`);

  const alternar = async (h: Habit, dia: string) => {
    const jaTinha = marcado(h.id, dia);

    // otimista: a grade responde no clique
    setLogs((v) =>
      jaTinha
        ? v.filter((l) => !(l.habit_id === h.id && l.day.slice(0, 10) === dia))
        : [
            ...v,
            {
              id: `tmp-${h.id}-${dia}`,
              user_id: "",
              habit_id: h.id,
              day: dia,
              created_at: new Date().toISOString(),
            },
          ]
    );

    if (jaTinha) {
      const { error } = await supabase
        .from("habit_logs")
        .delete()
        .eq("habit_id", h.id)
        .eq("day", dia);
      notice.check(error, "desmarcar o hábito");
    } else {
      const uid = await currentUserId(supabase);
      if (!uid) {
        notice.show(SESSION_EXPIRED);
        return load();
      }
      const { error } = await supabase
        .from("habit_logs")
        .insert({ user_id: uid, habit_id: h.id, day: dia });
      // 23505 = unique(habit_id, day): já estava marcado, não é falha
      if (error && error.code !== "23505")
        notice.check(error, "marcar o hábito");
    }
    load();
  };

  const novo = () => {
    setEditing(null);
    setForm(vazio());
    setErr("");
    setOpen(true);
  };

  const editar = (h: Habit) => {
    setEditing(h);
    setForm({
      name: h.name,
      color: h.color,
      target_per_week: h.target_per_week,
      active: h.active,
    });
    setErr("");
    setOpen(true);
  };

  const salvar = async (e: React.FormEvent) => {
    e.preventDefault();
    setErr("");
    const nome = form.name.trim();
    if (!nome) return setErr("Informe o nome do hábito.");
    setBusy(true);
    const payload = {
      name: nome,
      color: form.color,
      target_per_week: Number(form.target_per_week),
      active: form.active,
    };
    let error;
    if (editing) {
      ({ error } = await supabase
        .from("habits")
        .update(payload)
        .eq("id", editing.id));
    } else {
      const uid = await currentUserId(supabase);
      if (!uid) {
        setBusy(false);
        return setErr(SESSION_EXPIRED);
      }
      ({ error } = await supabase
        .from("habits")
        .insert({ ...payload, user_id: uid }));
    }
    setBusy(false);
    if (error) {
      if (error.code === "PGRST205")
        return setErr(
          "A tabela de hábitos ainda não existe. Rode supabase/PENDENTE.sql no SQL Editor."
        );
      return setErr(error.message);
    }
    setOpen(false);
    load();
  };

  const excluir = (h: Habit) =>
    confirm.ask(
      `Excluir "${h.name}"? O histórico de marcações vai junto.`,
      async () => {
        const { error } = await supabase.from("habits").delete().eq("id", h.id);
        if (!notice.check(error, "excluir o hábito")) load();
      }
    );

  const pausar = async (h: Habit) => {
    setHabits((v) =>
      v.map((x) => (x.id === h.id ? { ...x, active: !x.active } : x))
    );
    const { error } = await supabase
      .from("habits")
      .update({ active: !h.active })
      .eq("id", h.id);
    notice.check(error, h.active ? "pausar o hábito" : "retomar o hábito");
    load();
  };

  /** Dias seguidos até hoje, olhando para trás. */
  const sequencia = React.useCallback(
    (id: string) => {
      let n = 0;
      const dias = ultimosDias(hoje, 60).reverse();
      for (const d of dias) {
        if (marcado(id, d)) n++;
        else break;
      }
      return n;
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [feitos, hoje]
  );

  const ativos = habits.filter((h) => h.active);
  const feitosHoje = ativos.filter((h) => marcado(h.id, hoje)).length;

  if (loading)
    return (
      <div className="flex flex-col gap-4">
        <Skeleton className="h-10 w-48" />
        <Skeleton className="h-[120px] rounded-[22px]" />
        <Skeleton className="h-[260px] rounded-[22px]" />
      </div>
    );

  return (
    <div className="rise">
      <div className="mb-5 flex flex-wrap items-end justify-between gap-3.5">
        <div>
          <h1 className="text-[26px] font-bold tracking-[-0.03em]">Hábitos</h1>
          <p className="mt-1 text-sm text-fg-mute">
            {ativos.length
              ? `${feitosHoje} de ${ativos.length} feitos hoje`
              : "Nenhum hábito ativo"}
          </p>
        </div>
        <Button variant="primary" onClick={novo}>
          <Plus size={15} />
          Novo hábito
        </Button>
      </div>

      {habits.length === 0 ? (
        <Card>
          <div className="flex flex-col items-center px-6 py-14 text-center">
            <div className="mb-3 grid h-11 w-11 place-items-center rounded-[14px] bg-ink-800 text-fg-mute">
              <Repeat2 size={19} />
            </div>
            <p className="text-[13.5px] font-semibold text-fg-dim">
              Nenhum hábito ainda
            </p>
            <p className="mt-1 max-w-[330px] text-xs text-fg-mute">
              Academia, leitura, água — o que você quer repetir. Marque no dia e
              acompanhe a sequência.
            </p>
            <Button variant="primary" size="sm" className="mt-4" onClick={novo}>
              Criar o primeiro
            </Button>
          </div>
        </Card>
      ) : (
        <Card className="overflow-hidden">
          {/* cabeçalho de dias, alinhado com a grade abaixo */}
          <div className="flex items-center gap-3 border-b border-line-soft px-4 py-3">
            <span className="min-w-0 flex-1 text-[10.5px] font-bold uppercase tracking-[0.1em] text-fg-mute">
              Hábito
            </span>
            <div className="flex shrink-0 gap-1">
              {semana.map((d) => {
                const wd = new Date(d + "T00:00:00").getDay();
                const ehHoje = d === hoje;
                return (
                  <span
                    key={d}
                    className={cx(
                      "grid w-7 place-items-center text-[10px] font-bold sm:w-9",
                      ehHoje ? "text-brand-400" : "text-fg-mute"
                    )}
                  >
                    {SIGLA[wd]}
                  </span>
                );
              })}
            </div>
            <span className="hidden w-[76px] shrink-0 text-right text-[10.5px] font-bold uppercase tracking-[0.1em] text-fg-mute sm:block">
              Sequência
            </span>
          </div>

          <ul>
            {habits.map((h) => {
              const seq = sequencia(h.id);
              const naSemana = semana.filter((d) => marcado(h.id, d)).length;
              return (
                <li
                  key={h.id}
                  className={cx(
                    "group flex items-center gap-3 border-b border-line-soft px-4 py-3 last:border-0",
                    !h.active && "opacity-55"
                  )}
                >
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                      <span
                        className="h-2.5 w-2.5 shrink-0 rounded-full"
                        style={{ background: COR[h.color] ?? COR.blue }}
                      />
                      <p className="truncate text-[13.5px] font-semibold">
                        {h.name}
                      </p>
                    </div>
                    <p className="mt-0.5 text-[11px] text-fg-mute tnum">
                      {naSemana}/{h.target_per_week} nesta semana
                      {!h.active && " · pausado"}
                    </p>
                  </div>

                  <div className="flex shrink-0 gap-1">
                    {semana.map((d) => {
                      const on = marcado(h.id, d);
                      const futuro = d > hoje;
                      return (
                        <button
                          key={d}
                          disabled={futuro || !h.active}
                          onClick={() => alternar(h, d)}
                          aria-label={`${h.name} em ${d}`}
                          aria-pressed={on}
                          className={cx(
                            "grid h-7 w-7 place-items-center rounded-[9px] border-[1.5px] transition-colors sm:h-9 sm:w-9",
                            on
                              ? "border-transparent text-white"
                              : "border-line text-transparent hover:border-brand-500",
                            (futuro || !h.active) &&
                              "cursor-not-allowed opacity-40 hover:border-line"
                          )}
                          style={on ? { background: COR[h.color] ?? COR.blue } : undefined}
                        >
                          <Check size={14} />
                        </button>
                      );
                    })}
                  </div>

                  <span className="hidden w-[76px] shrink-0 items-center justify-end gap-1 text-right text-[13px] font-bold tnum sm:flex">
                    {seq > 0 && <Flame size={13} className="text-warn" />}
                    {seq}d
                  </span>

                  <div className="flex shrink-0 gap-0.5 transition-opacity lg:opacity-0 lg:group-hover:opacity-100 lg:focus-within:opacity-100">
                    <button
                      onClick={() => pausar(h)}
                      aria-label={h.active ? "Pausar" : "Retomar"}
                      className="grid h-7 w-7 place-items-center rounded-lg text-fg-mute hover:bg-ink-800 hover:text-fg"
                    >
                      <Power size={14} />
                    </button>
                    <button
                      onClick={() => editar(h)}
                      aria-label="Editar"
                      className="grid h-7 w-7 place-items-center rounded-lg text-fg-mute hover:bg-ink-800 hover:text-fg"
                    >
                      <Pencil size={14} />
                    </button>
                    <button
                      onClick={() => excluir(h)}
                      aria-label="Excluir"
                      className="grid h-7 w-7 place-items-center rounded-lg text-fg-mute hover:bg-neg/15 hover:text-neg"
                    >
                      <Trash2 size={14} />
                    </button>
                  </div>
                </li>
              );
            })}
          </ul>
        </Card>
      )}

      <Modal
        open={open}
        onClose={() => setOpen(false)}
        title={editing ? "Editar hábito" : "Novo hábito"}
        footer={
          <>
            <Button onClick={() => setOpen(false)}>Cancelar</Button>
            <Button variant="primary" onClick={salvar} disabled={busy}>
              {busy ? "Salvando..." : "Salvar"}
            </Button>
          </>
        }
      >
        <form onSubmit={salvar} className="flex flex-col gap-3.5">
          <Field label="Nome">
            <Input
              autoFocus
              value={form.name}
              onChange={(e) => setForm({ ...form, name: e.target.value })}
              placeholder="Academia"
            />
          </Field>

          <Field label="Meta por semana" hint="Quantos dias você quer cumprir.">
            <Select
              value={String(form.target_per_week)}
              onChange={(e) =>
                setForm({ ...form, target_per_week: Number(e.target.value) })
              }
            >
              {[1, 2, 3, 4, 5, 6, 7].map((n) => (
                <option key={n} value={n}>
                  {n} {n === 1 ? "dia" : "dias"}
                </option>
              ))}
            </Select>
          </Field>

          <div>
            <span className="mb-2 block text-[11px] font-medium uppercase tracking-wider text-fg-mute">
              Cor
            </span>
            <div className="flex gap-2.5">
              {HABIT_COLORS.map((c) => (
                <button
                  key={c}
                  type="button"
                  onClick={() => setForm({ ...form, color: c })}
                  aria-label={`Cor ${c}`}
                  aria-pressed={form.color === c}
                  style={{ background: COR[c] }}
                  className={cx(
                    "h-7 w-7 rounded-full transition-transform hover:scale-110",
                    form.color === c &&
                      "ring-2 ring-fg-dim ring-offset-2 ring-offset-white"
                  )}
                />
              ))}
            </div>
          </div>

          <label className="flex cursor-pointer items-center gap-2.5 rounded-[14px] bg-ink-800 px-3.5 py-3">
            <input
              type="checkbox"
              checked={form.active}
              onChange={(e) => setForm({ ...form, active: e.target.checked })}
              className="h-4 w-4 accent-[var(--a)]"
            />
            <span className="text-sm text-fg-dim">
              Ativo
              <span className="ml-1 text-[11px] text-fg-mute">
                (pausado não conta nem aparece no Início)
              </span>
            </span>
          </label>

          {err && (
            <p className="rounded-[14px] bg-neg/12 px-3.5 py-3 text-xs font-medium text-neg">
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
