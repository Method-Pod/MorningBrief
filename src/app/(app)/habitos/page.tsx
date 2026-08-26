"use client";

import * as React from "react";
import {
  Check,
  ChevronLeft,
  ChevronRight,
  Flame,
  Pencil,
  Plus,
  Power,
  Repeat2,
  Trash2,
} from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { currentUserId, SESSION_EXPIRED } from "@/lib/session";
import { HABIT_COLORS, type Habit, type HabitLog } from "@/lib/types";
import { dataCurta, semanaDe, todayISO, ultimosDias } from "@/lib/format";
import {
  Button,
  Card,
  Field,
  Input,
  Modal,
  Carregando,
  Select,
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

/** semanaDe devolve segunda→domingo, então os nomes seguem a mesma ordem. */
const DIAS = ["seg", "ter", "qua", "qui", "sex", "sáb", "dom"];

const vazio = () => ({ name: "", color: "blue", target_per_week: 7, active: true });

export default function HabitosPage() {
  const supabase = React.useMemo(() => createClient(), []);
  const [habits, setHabits] = React.useState<Habit[]>([]);
  const [logs, setLogs] = React.useState<HabitLog[]>([]);
  const [loading, setLoading] = React.useState(true);
  const [semanas, setSemanas] = React.useState(0);
  const [open, setOpen] = React.useState(false);
  const [editing, setEditing] = React.useState<Habit | null>(null);
  const [form, setForm] = React.useState(vazio());
  const [busy, setBusy] = React.useState(false);
  const [err, setErr] = React.useState("");
  const confirm = useConfirm();
  const notice = useNotice();

  const hoje = todayISO();
  const semana = React.useMemo(() => semanaDe(hoje, semanas), [hoje, semanas]);

  /* A sigla vive dentro da bolinha: sem ela, sete círculos vazios não dizem
     que dia é cada um. A data completa fica no title e no aria-label, que é
     o que resolve o S/S e o Q/Q repetidos. */
  const sigla = (iso: string) => {
    const i = semana.indexOf(iso);
    return i >= 0 ? DIAS[i][0].toUpperCase() : "";
  };
  const ehHoje = (iso: string) => iso === hoje;

  const load = React.useCallback(async () => {
    // 90 dias cobrem a sequência mais longa e algumas semanas para trás
    const desde = ultimosDias(todayISO(), 90)[0];
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
      if (notice.check(error, "desmarcar o hábito")) load();
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
      if (error && error.code !== "23505" && notice.check(error, "marcar o hábito"))
        load();
    }
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
    if (error) return setErr(error.message);
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
    if (notice.check(error, h.active ? "pausar o hábito" : "retomar o hábito"))
      load();
  };

  /** Dias seguidos terminando hoje (ou ontem, se hoje ainda não foi marcado). */
  const sequencia = React.useCallback(
    (id: string) => {
      const dias = ultimosDias(hoje, 90).reverse();
      const inicio = marcado(id, dias[0]) ? 0 : 1;
      let n = 0;
      for (let i = inicio; i < dias.length; i++) {
        if (marcado(id, dias[i])) n++;
        else break;
      }
      return n;
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [feitos, hoje]
  );

  const ativos = habits.filter((h) => h.active);
  const feitosHoje = ativos.filter((h) => marcado(h.id, hoje)).length;
  const semanaAtual = semanas === 0;

  /** "24 de ago. – 30 de ago." */
  const rotuloSemana = semanaAtual
    ? "Esta semana"
    : `${dataCurta(semana[0]).replace(".", "")} – ${dataCurta(semana[6])}`;

  if (loading) return <Carregando />;

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
          {/* ---------------- navegação de semana ---------------- */}
          <div className="flex items-center justify-between gap-2 px-4 py-3">
            <button
              onClick={() => setSemanas((s) => s - 1)}
              aria-label="Semana anterior"
              className="grid h-8 w-8 place-items-center rounded-[10px] text-fg-mute transition-colors hover:bg-ink-800 hover:text-fg"
            >
              <ChevronLeft size={16} />
            </button>
            <span className="text-[13px] font-bold">{rotuloSemana}</span>
            <button
              onClick={() => setSemanas((s) => Math.min(0, s + 1))}
              disabled={semanaAtual}
              aria-label="Próxima semana"
              className="grid h-8 w-8 place-items-center rounded-[10px] text-fg-mute transition-colors hover:bg-ink-800 hover:text-fg disabled:opacity-30 disabled:hover:bg-transparent"
            >
              <ChevronRight size={16} />
            </button>
          </div>

          {/* ---------------- linhas ---------------- */}
          <ul>
            {habits.map((h) => {
              const seq = sequencia(h.id);
              const naSemana = semana.filter((d) => marcado(h.id, d)).length;
              const meta = h.target_per_week;
              const cor = COR[h.color] ?? COR.blue;
              return (
                <li
                  key={h.id}
                  className={cx(
                    // Em 375px as 7 bolinhas mais as 3 ações somam 332px num
                    // espaço de 303px. No mobile a grade desce para a própria
                    // linha em vez de comprimir o nome até desaparecer.
                    "group flex flex-col gap-2.5 border-b border-line-soft px-4 py-3 last:border-0 lg:flex-row lg:items-center lg:gap-3",
                    !h.active && "opacity-55"
                  )}
                >
                  <div className="flex min-w-0 items-start justify-between gap-3 lg:flex-1">
                   <div className="min-w-0">
                    <div className="flex items-center gap-2">
                      <span
                        className="h-2.5 w-2.5 shrink-0 rounded-full"
                        style={{ background: cor }}
                      />
                      <p className="truncate text-[13.5px] font-semibold">
                        {h.name}
                      </p>
                    </div>
                    <p className="mt-1 flex flex-wrap items-center gap-x-2 text-[11px] text-fg-mute">
                      <span
                        className={cx(
                          "font-bold tnum",
                          naSemana >= meta && "text-pos"
                        )}
                      >
                        {naSemana}/{meta}
                      </span>
                      <span>na semana</span>
                      {seq > 0 && (
                        <>
                          <span className="opacity-40">·</span>
                          <span className="inline-flex items-center gap-1 font-bold text-warn">
                            <Flame size={10} />
                            {seq} {seq === 1 ? "dia" : "dias"} seguidos
                          </span>
                        </>
                      )}
                      {!h.active && (
                        <>
                          <span className="opacity-40">·</span>
                          <span>pausado</span>
                        </>
                      )}
                    </p>
                   </div>

                    {/* no mobile as ações moram na linha do nome */}
                    <div className="flex shrink-0 gap-0.5 lg:hidden">
                      <button
                        onClick={() => pausar(h)}
                        aria-label={h.active ? "Pausar" : "Retomar"}
                        className="grid h-7 w-7 place-items-center rounded-lg text-fg-mute transition-colors hover:bg-ink-800 hover:text-fg"
                      >
                        <Power size={14} />
                      </button>
                      <button
                        onClick={() => editar(h)}
                        aria-label="Editar"
                        className="grid h-7 w-7 place-items-center rounded-lg text-fg-mute transition-colors hover:bg-ink-800 hover:text-fg"
                      >
                        <Pencil size={14} />
                      </button>
                      <button
                        onClick={() => excluir(h)}
                        aria-label="Excluir"
                        className="grid h-7 w-7 place-items-center rounded-lg text-fg-mute transition-colors hover:bg-neg/15 hover:text-neg"
                      >
                        <Trash2 size={14} />
                      </button>
                    </div>
                  </div>

                  <div className="flex shrink-0 justify-between gap-1 lg:justify-end">
                    {semana.map((d) => {
                      const on = marcado(h.id, d);
                      const futuro = d > hoje;
                      const travado = futuro || !h.active;
                      return (
                        <div key={d} className="grid place-items-center lg:w-9">
                          <button
                            disabled={travado}
                            onClick={() => alternar(h, d)}
                            aria-label={`${h.name} — ${dataCurta(d)}${
                              on ? ", feito" : ""
                            }`}
                            aria-pressed={on}
                            title={dataCurta(d)}
                            className={cx(
                              "grid h-8 w-8 place-items-center rounded-full border-[1.5px] text-[10px] font-bold uppercase transition-colors",
                              on
                                ? "border-transparent text-white"
                                : ehHoje(d)
                                  ? "border-brand-500 bg-white text-brand-400"
                                  : "border-line bg-white text-fg-mute",
                              !travado && !on && "hover:border-brand-500",
                              travado && "cursor-not-allowed opacity-35"
                            )}
                            style={on ? { background: cor } : undefined}
                          >
                            {on ? <Check size={13} strokeWidth={3} /> : sigla(d)}
                          </button>
                        </div>
                      );
                    })}
                  </div>

                  <div className="hidden shrink-0 gap-0.5 transition-opacity lg:flex lg:opacity-0 lg:group-hover:opacity-100 lg:focus-within:opacity-100">
                    <button
                      onClick={() => pausar(h)}
                      aria-label={h.active ? "Pausar" : "Retomar"}
                      className="grid h-7 w-7 place-items-center rounded-lg text-fg-mute transition-colors hover:bg-ink-800 hover:text-fg"
                    >
                      <Power size={14} />
                    </button>
                    <button
                      onClick={() => editar(h)}
                      aria-label="Editar"
                      className="grid h-7 w-7 place-items-center rounded-lg text-fg-mute transition-colors hover:bg-ink-800 hover:text-fg"
                    >
                      <Pencil size={14} />
                    </button>
                    <button
                      onClick={() => excluir(h)}
                      aria-label="Excluir"
                      className="grid h-7 w-7 place-items-center rounded-lg text-fg-mute transition-colors hover:bg-neg/15 hover:text-neg"
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
