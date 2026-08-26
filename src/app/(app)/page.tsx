"use client";

import * as React from "react";
import Link from "next/link";
import {
  AlertCircle,
  CalendarDays,
  CheckCircle2,
  ListChecks,
  Pin,
  Plus,
  Repeat2,
  Wallet,
  Zap,
} from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { currentUserId, SESSION_EXPIRED } from "@/lib/session";
import type { Bill, CalendarEvent, Note, RecurringTask, Task } from "@/lib/types";
import { STATUS_LABEL, type TaskStatus } from "@/lib/types";
import {
  brl,
  dateBR,
  daysUntil,
  greeting,
  localDay,
  localTime,
  todayISO,
} from "@/lib/format";
import { frequencyDescription, isDueOn, nextOccurrence } from "@/lib/recurring";
import { Card, Skeleton, useNotice, cx } from "@/components/ui";

const PRIO_DOT: Record<string, string> = {
  urgent: "bg-neg",
  high: "bg-warn",
  medium: "bg-brand-500",
  low: "bg-ink-600",
};
const PRIO_RANK: Record<string, number> = { urgent: 0, high: 1, medium: 2, low: 3 };
const STATUS_DOT: Record<TaskStatus, string> = {
  todo: "bg-ink-600",
  doing: "bg-brand-500",
  review: "bg-warn",
  done: "bg-pos",
};
const NOTE_HEX: Record<string, string> = {
  blue: "#2563a8",
  violet: "#6d5bd0",
  emerald: "#1f9d63",
  amber: "#b8820c",
  rose: "#cf4a3f",
  slate: "#666e74",
};

export default function HomePage() {
  const supabase = React.useMemo(() => createClient(), []);
  const [loading, setLoading] = React.useState(true);
  const [bills, setBills] = React.useState<Bill[]>([]);
  const [tasks, setTasks] = React.useState<Task[]>([]);
  const [recurring, setRecurring] = React.useState<RecurringTask[]>([]);
  const [events, setEvents] = React.useState<CalendarEvent[]>([]);
  const [notes, setNotes] = React.useState<Note[]>([]);
  const [generated, setGenerated] = React.useState(0);
  const [draft, setDraft] = React.useState("");
  const [adding, setAdding] = React.useState(false);
  const notice = useNotice();

  const today = todayISO();

  const load = React.useCallback(async () => {
    const [b, t, r, e, n] = await Promise.all([
      supabase.from("bills").select("*").order("due_date"),
      supabase.from("tasks").select("*").order("created_at", { ascending: false }),
      supabase.from("recurring_tasks").select("*").order("created_at"),
      supabase.from("events").select("*").order("start_at"),
      supabase.from("notes").select("*").order("updated_at", { ascending: false }),
    ]);
    // numeric do Postgres vem como string no JSON; normaliza na fronteira
    setBills(
      ((b.data as Bill[]) ?? []).map((x) => ({ ...x, amount: Number(x.amount) }))
    );
    setTasks((t.data as Task[]) ?? []);
    setRecurring((r.data as RecurringTask[]) ?? []);
    setEvents((e.data as CalendarEvent[]) ?? []);
    setNotes((n.data as Note[]) ?? []);
    return (r.data as RecurringTask[]) ?? [];
  }, [supabase]);

  /* Materializa as recorrências vencidas hoje, uma vez por dia. */
  const materialize = React.useCallback(
    async (rows: RecurringTask[]) => {
      const due = rows.filter((r) => isDueOn(r, today));
      if (!due.length) return 0;
      const uid = await currentUserId(supabase);
      if (!uid) return 0;

      /*
       * Reivindica a recorrência ANTES de criar a demanda.
       *
       * O update só encontra a linha se last_run_on ainda não é hoje, então
       * duas abas abertas ao mesmo tempo disputam e apenas uma leva. Antes a
       * ordem era inversa — inserir e depois marcar — e as duas abas inseriam
       * antes de qualquer uma marcar, gerando a demanda em dobro.
       *
       * O `or` é necessário porque em SQL `last_run_on <> hoje` é falso quando
       * a coluna é NULL: a recorrência que nunca rodou não seria reivindicada.
       */
      const claimed: RecurringTask[] = [];
      for (const r of due) {
        const { data } = await supabase
          .from("recurring_tasks")
          .update({ last_run_on: today })
          .eq("id", r.id)
          .or(`last_run_on.is.null,last_run_on.neq.${today}`)
          .select("id");
        if (data && data.length) claimed.push(r);
      }
      if (!claimed.length) return 0;

      const { error } = await supabase.from("tasks").insert(
        claimed.map((r) => ({
          user_id: uid,
          title: r.title,
          description: r.description,
          client: r.client,
          priority: r.priority,
          status: "todo",
          due_date: today,
          origin_id: r.id,
        }))
      );

      if (error) {
        // 23505 = índice único tasks_origin_day_uniq. A demanda já existe,
        // então não é falha: outra aba chegou primeiro.
        if (error.code === "23505") return 0;
        // devolve a reivindicação para a próxima abertura tentar de novo
        await supabase
          .from("recurring_tasks")
          .update({ last_run_on: null })
          .in("id", claimed.map((r) => r.id));
        notice.show(`Não foi possível gerar as recorrências: ${error.message}`);
        return 0;
      }
      return claimed.length;
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [supabase, today]
  );

  React.useEffect(() => {
    let alive = true;
    (async () => {
      const rows = await load();
      const made = await materialize(rows);
      if (!alive) return;
      if (made > 0) {
        setGenerated(made);
        await load();
      }
      setLoading(false);
    })();
    return () => {
      alive = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const quickAdd = async (e: React.FormEvent) => {
    e.preventDefault();
    const title = draft.trim();
    if (!title || adding) return;
    setAdding(true);
    const uid = await currentUserId(supabase);
    if (!uid) {
      notice.show(SESSION_EXPIRED);
      setAdding(false);
      return;
    }
    const { error } = await supabase.from("tasks").insert({
      user_id: uid,
      title,
      priority: "medium",
      status: "todo",
      due_date: today,
    });
    if (!notice.check(error, "adicionar a tarefa")) {
      setDraft("");
      await load();
    }
    setAdding(false);
  };

  const toggleTask = async (t: Task) => {
    const done = t.status === "done";
    setTasks((v) =>
      v.map((x) => (x.id === t.id ? { ...x, status: done ? "todo" : "done" } : x))
    );
    const { error } = await supabase
      .from("tasks")
      .update({
        status: done ? "todo" : "done",
        completed_at: done ? null : new Date().toISOString(),
      })
      .eq("id", t.id);
    notice.check(error, done ? "reabrir a tarefa" : "concluir a tarefa");
    load();
  };

  /* ------------------------------ derivados ------------------------------ */
  const m = React.useMemo(() => {
    const hoje = tasks.filter((t) => t.due_date?.slice(0, 10) === today);
    const feitas = hoje.filter((t) => t.status === "done").length;
    const pct = hoje.length ? Math.round((feitas / hoje.length) * 100) : 0;
    const open = tasks.filter((t) => t.status !== "done");
    const pend = bills.filter((b) => b.status === "pending");
    return {
      hoje,
      feitas,
      pct,
      open,
      lateT: open.filter((t) => t.due_date && daysUntil(t.due_date) < 0),
      pend,
      late: pend.filter((b) => daysUntil(b.due_date) < 0),
      soon: pend.filter((b) => {
        const d = daysUntil(b.due_date);
        return d >= 0 && d <= 7;
      }),
      dueRec: recurring.filter((r) => isDueOn(r, today)),
      actRec: recurring.filter((r) => r.active),
      evToday: events.filter((e) => localDay(e.start_at) === today),
      up: events
        .filter((e) => localDay(e.start_at) >= today)
        .slice(0, 4),
      pinned: notes.filter((n) => n.pinned).slice(0, 2),
    };
  }, [tasks, bills, recurring, events, notes, today]);

  if (loading) return <HomeSkeleton />;

  const R = 34;
  const C = 2 * Math.PI * R;
  const now = new Date();

  return (
    <div className="rise">
      {/* ------------------------------ saudação ------------------------------ */}
      <div className="mb-[22px] flex flex-wrap items-start justify-between gap-3.5">
        <div>
          <h1 className="flex items-center gap-2.5 text-[clamp(24px,4vw,32px)] font-bold tracking-[-0.035em]">
            {greeting()} <span className="text-[0.8em]">☀️</span>
          </h1>
          <p className="mt-1.5 text-[14.5px] text-fg-mute">
            Vamos dar uma olhada no seu dia — tudo em um só lugar.
          </p>
        </div>
        <span className="whitespace-nowrap rounded-full bg-white px-4 py-2.5 text-[13px] font-semibold text-fg-dim shadow-[0_1px_2px_rgb(20_24_26/0.05)]">
          {now.toLocaleDateString("pt-BR", {
            weekday: "long",
            day: "2-digit",
            month: "long",
          })}
        </span>
      </div>

      {generated > 0 && (
        <div className="mb-4 flex items-center gap-2.5 rounded-[14px] bg-brand-500/12 px-4 py-3 text-[12.5px] font-medium text-brand-400">
          <Repeat2 size={15} className="shrink-0" />
          {generated} demanda{generated > 1 ? "s" : ""} criada
          {generated > 1 ? "s" : ""} pelas recorrências de hoje.
          <Link href="/demandas" className="ml-auto font-bold underline">
            Ver
          </Link>
        </div>
      )}

      {/* ------------------------ seu dia + hoje ------------------------ */}
      <div className="grid gap-4 xl:grid-cols-[300px_minmax(0,1fr)]">
        <div className="flex flex-col rounded-[22px] bg-gradient-to-br from-[#26292b] to-[#1b1e20] p-[22px] text-white">
          <div className="flex items-start justify-between gap-4">
            <div>
              <p className="text-[10.5px] font-bold uppercase tracking-[0.14em] text-white/60">
                Seu dia
              </p>
              <p className="mt-2 text-[40px] font-bold leading-none tracking-[-0.04em]">
                {m.feitas}
                <span className="text-[0.5em] font-semibold opacity-60">
                  /{m.hoje.length}
                </span>
              </p>
              <p className="mt-1.5 text-[13px] text-white/70">
                tarefas concluídas hoje
              </p>
            </div>
            <div className="relative shrink-0">
              <svg width="88" height="88" viewBox="0 0 88 88" className="-rotate-90">
                <circle
                  cx="44"
                  cy="44"
                  r={R}
                  fill="none"
                  stroke="rgb(255 255 255 / 0.18)"
                  strokeWidth="7"
                />
                <circle
                  cx="44"
                  cy="44"
                  r={R}
                  fill="none"
                  stroke="var(--a)"
                  strokeWidth="7"
                  strokeLinecap="round"
                  strokeDasharray={C.toFixed(1)}
                  strokeDashoffset={(C * (1 - m.pct / 100)).toFixed(1)}
                />
              </svg>
              <span className="absolute inset-0 grid place-items-center text-[15px] font-bold">
                {m.pct}%
              </span>
            </div>
          </div>
          <div className="mt-auto grid grid-cols-3 gap-2 pt-[22px]">
            <Mini icon={<CheckCircle2 size={15} />} value={m.feitas} label="feitas" />
            <Mini icon={<Repeat2 size={15} />} value={m.actRec.length} label="recorrentes" />
            <Mini icon={<CalendarDays size={15} />} value={m.evToday.length} label="na agenda" />
          </div>
        </div>

        <Card className="flex flex-col">
          <Head icon={<ListChecks size={14} />} title="Hoje" href="/demandas" link="ver todas" />
          <div className="flex flex-1 flex-col px-[18px] pb-[18px] pt-3">
            <div className="flex items-baseline justify-between">
              <p className="text-[26px] font-bold tracking-[-0.035em]">
                {m.feitas}
                <span className="text-[0.55em] font-semibold text-fg-mute">
                  /{m.hoje.length}
                </span>
              </p>
              <span className="text-xs text-fg-mute">{m.pct}% do dia</span>
            </div>
            <div className="mt-3 h-1.5 overflow-hidden rounded-full bg-ink-800">
              <div
                className="h-full rounded-full bg-brand-500 transition-[width] duration-500"
                style={{ width: `${m.pct}%` }}
              />
            </div>

            <form onSubmit={quickAdd} className="mt-3.5 flex gap-2.5">
              <input
                value={draft}
                onChange={(e) => setDraft(e.target.value)}
                placeholder="Adicionar tarefa de hoje..."
                aria-label="Adicionar tarefa de hoje"
                className="h-[38px] flex-1 rounded-[14px] border border-transparent bg-ink-800 px-3.5 text-sm outline-none transition-colors focus:border-brand-500 focus:bg-white"
              />
              <button
                type="submit"
                disabled={adding || !draft.trim()}
                aria-label="Adicionar"
                className="grid h-[38px] w-[38px] shrink-0 place-items-center rounded-[14px] bg-brand-500 text-on-brand transition-[filter] hover:brightness-95 disabled:opacity-40"
              >
                <Plus size={18} />
              </button>
            </form>

            <div className="mt-1.5 flex flex-col">
              {m.hoje.length === 0 ? (
                <Ghost>Nada pra hoje. Adicione acima.</Ghost>
              ) : (
                [...m.hoje]
                  .sort(
                    (a, b) =>
                      Number(a.status === "done") - Number(b.status === "done") ||
                      PRIO_RANK[a.priority] - PRIO_RANK[b.priority]
                  )
                  .map((t) => (
                    <Row key={t.id}>
                      <button
                        onClick={() => toggleTask(t)}
                        aria-label={t.status === "done" ? "Reabrir" : "Concluir"}
                        className={cx(
                          "grid h-5 w-5 shrink-0 place-items-center rounded-full border-[1.8px] transition-colors",
                          t.status === "done"
                            ? "border-brand-500 bg-brand-500 text-on-brand"
                            : "border-ink-600 text-transparent hover:border-brand-500"
                        )}
                      >
                        <CheckCircle2 size={12} />
                      </button>
                      <span className="min-w-0 flex-1 text-sm font-medium">
                        <span
                          className={cx(
                            "block truncate",
                            t.status === "done" && "text-fg-mute line-through"
                          )}
                        >
                          {t.title}
                        </span>
                        {t.client && (
                          <span className="mt-0.5 block text-[11.5px] font-normal text-fg-mute">
                            {t.client}
                          </span>
                        )}
                      </span>
                      <span
                        className={cx("h-[7px] w-[7px] shrink-0 rounded-full", PRIO_DOT[t.priority])}
                      />
                    </Row>
                  ))
              )}
            </div>
          </div>
        </Card>
      </div>

      {/* ------------------------ demandas + notas ------------------------ */}
      <div className="mt-4 grid gap-4 xl:grid-cols-[minmax(0,1.55fr)_minmax(0,1fr)]">
        <Card>
          <Head icon={<ListChecks size={14} />} title="Demandas abertas" href="/demandas" link="ver quadro" />
          <div className="px-[18px] pb-[18px] pt-3">
            <div className="mb-3 flex flex-wrap gap-2">
              {(["todo", "doing", "review"] as TaskStatus[]).map((s) => (
                <span
                  key={s}
                  className="inline-flex items-center gap-1.5 rounded-full bg-ink-800 px-2 py-0.5 text-[11px] font-semibold text-fg-dim"
                >
                  <i className={cx("h-[7px] w-[7px] rounded-full", STATUS_DOT[s])} />
                  {STATUS_LABEL[s]}
                  <b className="tnum">{tasks.filter((t) => t.status === s).length}</b>
                </span>
              ))}
              {m.lateT.length > 0 && (
                <span className="inline-flex items-center gap-1 rounded-full bg-neg/12 px-2 py-0.5 text-[11px] font-semibold text-neg">
                  <AlertCircle size={11} />
                  {m.lateT.length} atrasada{m.lateT.length > 1 ? "s" : ""}
                </span>
              )}
            </div>
            <div className="flex flex-col">
              {m.open.length === 0 ? (
                <Ghost>Nenhuma demanda aberta.</Ghost>
              ) : (
                [...m.open]
                  .sort(
                    (a, b) =>
                      PRIO_RANK[a.priority] - PRIO_RANK[b.priority] ||
                      (a.due_date ?? "9999").localeCompare(b.due_date ?? "9999")
                  )
                  .slice(0, 5)
                  .map((t) => (
                    <Row key={t.id}>
                      <span className={cx("h-[7px] w-[7px] shrink-0 rounded-full", PRIO_DOT[t.priority])} />
                      <span className="min-w-0 flex-1 text-sm font-medium">
                        <span className="block truncate">{t.title}</span>
                        <span className="mt-0.5 block text-[11.5px] font-normal text-fg-mute">
                          {STATUS_LABEL[t.status]}
                          {t.client && ` · ${t.client}`}
                        </span>
                      </span>
                      {t.due_date && (
                        <span
                          className={cx(
                            "shrink-0 text-[11.5px] font-semibold tnum",
                            daysUntil(t.due_date) < 0 ? "text-neg" : "text-fg-mute"
                          )}
                        >
                          {t.due_date.slice(0, 10) === today
                            ? "hoje"
                            : dateBR(t.due_date).slice(0, 5)}
                        </span>
                      )}
                    </Row>
                  ))
              )}
            </div>
          </div>
        </Card>

        <Card>
          <Head icon={<StickyIcon />} title="Anotações" href="/anotacoes" link="escrever" />
          <div className="px-[18px] pb-[18px] pt-3">
            {m.pinned.length === 0 ? (
              <Ghost>Nada fixado ainda.</Ghost>
            ) : (
              m.pinned.map((n) => (
                <div key={n.id} className="border-b border-line-soft py-2.5 last:border-0">
                  <div className="flex items-center gap-1.5">
                    <Pin size={12} style={{ color: NOTE_HEX[n.color] ?? NOTE_HEX.blue }} />
                    <p className="truncate text-[13px] font-semibold">
                      {n.title || "Sem título"}
                    </p>
                  </div>
                  {n.content && (
                    <p className="mt-1 line-clamp-2 text-[11.5px] leading-relaxed text-fg-mute">
                      {n.content}
                    </p>
                  )}
                </div>
              ))
            )}
          </div>
        </Card>
      </div>

      {/* --------------- contas · agenda · recorrentes --------------- */}
      <div className="mt-4 grid gap-4 md:grid-cols-2 xl:grid-cols-3">
        <Card>
          <Head icon={<Wallet size={14} />} title="Contas a pagar" href="/contas" link="ver todas" />
          <div className="px-[18px] pb-[18px] pt-1.5">
            <div className="flex items-baseline gap-2.5 pt-2.5">
              <b className="text-2xl font-bold tracking-[-0.035em] tnum">
                {brl(m.pend.reduce((s, b) => s + Number(b.amount), 0))}
              </b>
              <span className="text-xs text-fg-mute">em aberto</span>
            </div>
            <div className="mt-2 flex flex-wrap gap-1.5">
              {m.late.length > 0 ? (
                <span className="rounded-full bg-neg/12 px-2 py-0.5 text-[11px] font-semibold text-neg">
                  {m.late.length} em atraso
                </span>
              ) : (
                <span className="rounded-full bg-pos/12 px-2 py-0.5 text-[11px] font-semibold text-pos">
                  nada em atraso
                </span>
              )}
              {m.soon.length > 0 && (
                <span className="rounded-full bg-warn/12 px-2 py-0.5 text-[11px] font-semibold text-warn">
                  {m.soon.length} vence em 7 dias
                </span>
              )}
            </div>
            <div className="mt-3 flex flex-col">
              {m.pend.length === 0 ? (
                <Ghost>Tudo pago.</Ghost>
              ) : (
                [...m.pend]
                  .sort((a, b) => a.due_date.localeCompare(b.due_date))
                  .slice(0, 3)
                  .map((b) => {
                    const d = daysUntil(b.due_date);
                    return (
                      <div
                        key={b.id}
                        className="flex items-center gap-2.5 border-b border-line-soft py-2.5 text-[13px] last:border-0"
                      >
                        <span
                          className={cx(
                            "h-[7px] w-[7px] shrink-0 rounded-full",
                            d < 0 ? "bg-neg" : d <= 7 ? "bg-warn" : "bg-ink-600"
                          )}
                        />
                        <span className="min-w-0 flex-1 truncate font-medium">
                          {b.description}
                        </span>
                        <span
                          className={cx(
                            "shrink-0 font-semibold tnum",
                            d < 0 && "text-neg"
                          )}
                        >
                          {brl(Number(b.amount))}
                        </span>
                      </div>
                    );
                  })
              )}
            </div>
          </div>
        </Card>

        <Card>
          <Head icon={<CalendarDays size={14} />} title="Agenda" href="/calendario" link="ver tudo" />
          <div className="flex flex-col px-[18px] pb-[18px] pt-1.5">
            {m.up.length === 0 ? (
              <Ghost>Agenda livre.</Ghost>
            ) : (
              m.up.map((e) => {
                const isToday = localDay(e.start_at) === today;
                return (
                  <Row key={e.id}>
                    <span
                      className="h-[7px] w-[7px] shrink-0 rounded-full"
                      style={{ background: NOTE_HEX[e.color] ?? "var(--a)" }}
                    />
                    <span className="min-w-0 flex-1 text-sm font-medium">
                      <span className="block truncate">{e.title}</span>
                      <span className="mt-0.5 block text-[11.5px] font-normal text-fg-mute">
                        {isToday ? "hoje" : dateBR(localDay(e.start_at)).slice(0, 5)}
                        {e.all_day
                          ? " · dia inteiro"
                          : ` · ${localTime(e.start_at)}`}
                        {e.location && ` · ${e.location}`}
                      </span>
                    </span>
                  </Row>
                );
              })
            )}
          </div>
        </Card>

        <Card>
          <Head icon={<Repeat2 size={14} />} title="Recorrentes" href="/recorrentes" link="gerenciar" />
          <div className="px-[18px] pb-[18px] pt-1.5">
            {m.dueRec.length > 0 && (
              <div className="mb-2.5 flex items-center gap-2 rounded-[14px] bg-warn/12 px-3 py-2.5 text-[12px] font-medium text-warn">
                <Zap size={14} className="shrink-0" />
                {m.dueRec.length} pendente{m.dueRec.length > 1 ? "s" : ""} hoje
              </div>
            )}
            <div className="flex flex-col">
              {m.actRec.length === 0 ? (
                <Ghost>Nenhuma recorrência ativa.</Ghost>
              ) : (
                m.actRec.slice(0, 4).map((r) => {
                  const nx = nextOccurrence(r);
                  return (
                    <Row key={r.id}>
                      <span className={cx("h-[7px] w-[7px] shrink-0 rounded-full", PRIO_DOT[r.priority])} />
                      <span className="min-w-0 flex-1 text-sm font-medium">
                        <span className="block truncate">{r.title}</span>
                        <span className="mt-0.5 block text-[11.5px] font-normal text-fg-mute">
                          {frequencyDescription(r)}
                        </span>
                      </span>
                      <span className="shrink-0 text-[11.5px] font-semibold text-fg-mute tnum">
                        {nx === today ? "hoje" : nx ? dateBR(nx).slice(0, 5) : "—"}
                      </span>
                    </Row>
                  );
                })
              )}
            </div>
          </div>
        </Card>
      </div>

      {notice.node}
    </div>
  );
}

/* ------------------------------ peças ------------------------------ */

function Head({
  icon,
  title,
  href,
  link,
}: {
  icon: React.ReactNode;
  title: string;
  href: string;
  link: string;
}) {
  return (
    <div className="flex items-center justify-between gap-3.5 px-[18px] pt-[17px]">
      <span className="flex items-center gap-2 text-[11px] font-semibold uppercase tracking-[0.1em] text-fg-mute">
        {icon}
        {title}
      </span>
      <Link
        href={href}
        className="text-xs font-medium text-fg-mute transition-colors hover:text-brand-400"
      >
        {link}
      </Link>
    </div>
  );
}

const Row = ({ children }: { children: React.ReactNode }) => (
  <div className="flex items-center gap-3 border-b border-line-soft py-2.5 last:border-0">
    {children}
  </div>
);

const Ghost = ({ children }: { children: React.ReactNode }) => (
  <p className="py-6 text-center text-[12.5px] text-fg-mute">{children}</p>
);

const Mini = ({
  icon,
  value,
  label,
}: {
  icon: React.ReactNode;
  value: number;
  label: string;
}) => (
  <div className="rounded-[14px] bg-white/10 px-2.5 py-3">
    <span className="opacity-65">{icon}</span>
    <b className="mt-1.5 block text-[19px] font-bold leading-none tracking-[-0.03em]">
      {value}
    </b>
    <small className="mt-1 block text-[10.5px] text-white/60">{label}</small>
  </div>
);

/* ícone de nota sem puxar outro import do lucide */
const StickyIcon = () => (
  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <path d="M15 3H6a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h9l5-5V5a2 2 0 0 0-2-2Z" />
    <path d="M15 21v-4a1 1 0 0 1 1-1h4" />
  </svg>
);

function HomeSkeleton() {
  return (
    <div className="space-y-4">
      <Skeleton className="h-10 w-64" />
      <div className="grid gap-4 xl:grid-cols-[300px_minmax(0,1fr)]">
        <Skeleton className="h-[260px] rounded-[22px]" />
        <Skeleton className="h-[260px] rounded-[22px]" />
      </div>
      <div className="grid gap-4 xl:grid-cols-[minmax(0,1.55fr)_minmax(0,1fr)]">
        <Skeleton className="h-[240px] rounded-[22px]" />
        <Skeleton className="h-[240px] rounded-[22px]" />
      </div>
      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
        {Array.from({ length: 3 }).map((_, i) => (
          <Skeleton key={i} className="h-[200px] rounded-[22px]" />
        ))}
      </div>
    </div>
  );
}
