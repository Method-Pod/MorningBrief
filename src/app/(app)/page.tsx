"use client";

import * as React from "react";
import Link from "next/link";
import {
  AlertCircle,
  ArrowUpRight,
  CalendarClock,
  CheckCircle2,
  Clock,
  ListChecks,
  Pin,
  Repeat2,
  TrendingDown,
  TrendingUp,
  Wallet,
} from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import type { Bill, CalendarEvent, Note, RecurringTask, Task } from "@/lib/types";
import { PRIORITY_LABEL } from "@/lib/types";
import { brl, dateBR, daysUntil, greeting, todayISO } from "@/lib/format";
import { isDueOn } from "@/lib/recurring";
import { AreaChart, type Point } from "@/components/AreaChart";
import { Badge, Button, Card, CardHead, Empty, Skeleton } from "@/components/ui";

const MONTHS = ["Jan", "Fev", "Mar", "Abr", "Mai", "Jun", "Jul", "Ago", "Set", "Out", "Nov", "Dez"];

export default function DashboardPage() {
  const supabase = React.useMemo(() => createClient(), []);
  const [loading, setLoading] = React.useState(true);
  const [bills, setBills] = React.useState<Bill[]>([]);
  const [tasks, setTasks] = React.useState<Task[]>([]);
  const [recurring, setRecurring] = React.useState<RecurringTask[]>([]);
  const [events, setEvents] = React.useState<CalendarEvent[]>([]);
  const [notes, setNotes] = React.useState<Note[]>([]);
  const [generated, setGenerated] = React.useState(0);

  const today = todayISO();

  const load = React.useCallback(async () => {
    const [b, t, r, e, n] = await Promise.all([
      supabase.from("bills").select("*").order("due_date"),
      supabase.from("tasks").select("*").order("created_at", { ascending: false }),
      supabase.from("recurring_tasks").select("*").order("created_at"),
      supabase.from("events").select("*").order("start_at"),
      supabase.from("notes").select("*").order("updated_at", { ascending: false }),
    ]);
    setBills((b.data as Bill[]) ?? []);
    setTasks((t.data as Task[]) ?? []);
    setRecurring((r.data as RecurringTask[]) ?? []);
    setEvents((e.data as CalendarEvent[]) ?? []);
    setNotes((n.data as Note[]) ?? []);
    return (r.data as RecurringTask[]) ?? [];
  }, [supabase]);

  /* Gera as demandas das recorrências vencidas hoje, uma vez por dia. */
  const materialize = React.useCallback(
    async (rows: RecurringTask[]) => {
      const due = rows.filter((r) => isDueOn(r, today));
      if (!due.length) return 0;

      const { data: user } = await supabase.auth.getUser();
      const uid = user.user?.id;
      if (!uid) return 0;

      const { error } = await supabase.from("tasks").insert(
        due.map((r) => ({
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
      if (error) return 0;

      await supabase
        .from("recurring_tasks")
        .update({ last_run_on: today })
        .in(
          "id",
          due.map((r) => r.id)
        );
      return due.length;
    },
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

  /* ------------------------------ derivados ------------------------------ */

  const m = React.useMemo(() => {
    const pending = bills.filter((b) => b.status === "pending");
    const now = new Date(today + "T00:00:00");
    const ym = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
    const prev = new Date(now.getFullYear(), now.getMonth() - 1, 1);
    const prevYm = `${prev.getFullYear()}-${String(prev.getMonth() + 1).padStart(2, "0")}`;

    const monthTotal = bills
      .filter((b) => b.due_date.startsWith(ym))
      .reduce((s, b) => s + Number(b.amount), 0);
    const prevTotal = bills
      .filter((b) => b.due_date.startsWith(prevYm))
      .reduce((s, b) => s + Number(b.amount), 0);
    const delta = prevTotal > 0 ? ((monthTotal - prevTotal) / prevTotal) * 100 : 0;

    const overdue = pending.filter((b) => daysUntil(b.due_date) < 0);
    const next7 = pending.filter((b) => {
      const d = daysUntil(b.due_date);
      return d >= 0 && d <= 7;
    });

    const openTasks = tasks.filter((t) => t.status !== "done");
    const lateTasks = openTasks.filter(
      (t) => t.due_date && daysUntil(t.due_date) < 0
    );
    const doneToday = tasks.filter(
      (t) => t.completed_at && t.completed_at.slice(0, 10) === today
    );

    const todayEvents = events.filter((e) => e.start_at.slice(0, 10) === today);
    const upcoming = events
      .filter((e) => e.start_at.slice(0, 10) >= today)
      .slice(0, 5);

    /* série dos últimos 6 meses */
    const series: Point[] = [];
    for (let i = 5; i >= 0; i--) {
      const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
      const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
      series.push({
        label: MONTHS[d.getMonth()],
        value: bills
          .filter((b) => b.due_date.startsWith(key))
          .reduce((s, b) => s + Number(b.amount), 0),
      });
    }

    return {
      monthTotal,
      delta,
      pendingTotal: pending.reduce((s, b) => s + Number(b.amount), 0),
      overdue,
      next7,
      openTasks,
      lateTasks,
      doneToday,
      todayEvents,
      upcoming,
      series,
      pinned: notes.filter((n) => n.pinned).slice(0, 4),
      activeRecurring: recurring.filter((r) => r.active),
    };
  }, [bills, tasks, events, notes, recurring, today]);

  if (loading) return <DashboardSkeleton />;

  return (
    <div className="space-y-5 rise">
      {/* ------------------------------ topo ------------------------------ */}
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">
            {greeting()}
            <span className="text-brand-400">.</span>
          </h1>
          <p className="mt-1 text-sm text-fg-mute">
            {m.overdue.length > 0
              ? `${m.overdue.length} conta${m.overdue.length > 1 ? "s" : ""} em atraso pedindo atenção.`
              : m.next7.length > 0
                ? `${m.next7.length} vencimento${m.next7.length > 1 ? "s" : ""} nos próximos 7 dias.`
                : "Nada em atraso. Dia limpo."}
          </p>
        </div>
        <Link href="/contas">
          <Button variant="primary" size="sm">
            Nova conta
            <ArrowUpRight size={14} />
          </Button>
        </Link>
      </div>

      {generated > 0 && (
        <div className="flex items-center gap-2.5 rounded-xl border border-brand-500/25 bg-brand-500/8 px-4 py-3 text-xs text-brand-400">
          <Repeat2 size={15} className="shrink-0" />
          {generated} demanda{generated > 1 ? "s" : ""} gerada
          {generated > 1 ? "s" : ""} automaticamente pelas recorrências de hoje.
          <Link href="/demandas" className="ml-auto font-medium underline">
            Ver
          </Link>
        </div>
      )}

      {/* ------------------------ hero + kpi strip ------------------------ */}
      <div className="grid gap-4 xl:grid-cols-[300px_1fr]">
        <Card className="relative overflow-hidden p-5">
          <div
            className="pointer-events-none absolute -right-16 -top-16 h-48 w-48 rounded-full opacity-50"
            style={{
              background:
                "radial-gradient(circle, #1e4bb8 0%, transparent 68%)",
            }}
          />
          <div className="relative">
            <div className="flex items-center gap-2 text-xs text-fg-mute">
              <Wallet size={13} />
              A pagar neste mês
            </div>
            <p className="mt-3 text-[32px] font-semibold leading-none tracking-tight tnum">
              {brl(m.monthTotal)}
            </p>
            <div className="mt-3 flex items-center gap-2">
              {m.delta !== 0 && (
                <Badge tone={m.delta > 0 ? "neg" : "pos"}>
                  {m.delta > 0 ? (
                    <TrendingUp size={11} />
                  ) : (
                    <TrendingDown size={11} />
                  )}
                  {Math.abs(m.delta).toFixed(1)}%
                </Badge>
              )}
              <span className="text-[11px] text-fg-mute">vs. mês anterior</span>
            </div>
            <div className="mt-5 border-t border-line-soft pt-4">
              <div className="flex items-baseline justify-between">
                <span className="text-xs text-fg-mute">Em aberto (total)</span>
                <span className="text-sm font-medium tnum">
                  {brl(m.pendingTotal)}
                </span>
              </div>
              {m.overdue.length > 0 && (
                <div className="mt-2 flex items-baseline justify-between">
                  <span className="text-xs text-neg">Em atraso</span>
                  <span className="text-sm font-medium text-neg tnum">
                    {brl(
                      m.overdue.reduce((s, b) => s + Number(b.amount), 0)
                    )}
                  </span>
                </div>
              )}
            </div>
          </div>
        </Card>

        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
          <Kpi
            icon={<CalendarClock size={14} />}
            label="Vence em 7 dias"
            value={String(m.next7.length)}
            sub={brl(m.next7.reduce((s, b) => s + Number(b.amount), 0))}
            tone={m.next7.length ? "warn" : "neutral"}
            href="/contas"
          />
          <Kpi
            icon={<ListChecks size={14} />}
            label="Demandas abertas"
            value={String(m.openTasks.length)}
            sub={
              m.lateTasks.length
                ? `${m.lateTasks.length} atrasada${m.lateTasks.length > 1 ? "s" : ""}`
                : "nenhuma atrasada"
            }
            tone={m.lateTasks.length ? "neg" : "neutral"}
            href="/demandas"
          />
          <Kpi
            icon={<Repeat2 size={14} />}
            label="Recorrentes ativas"
            value={String(m.activeRecurring.length)}
            sub="rodando automático"
            tone="brand"
            href="/recorrentes"
          />
          <Kpi
            icon={<CheckCircle2 size={14} />}
            label="Concluídas hoje"
            value={String(m.doneToday.length)}
            sub={`${m.todayEvents.length} evento${m.todayEvents.length === 1 ? "" : "s"} na agenda`}
            tone={m.doneToday.length ? "pos" : "neutral"}
            href="/calendario"
          />
        </div>
      </div>

      {/* ------------------------------ gráfico ------------------------------ */}
      <Card>
        <CardHead
          title="Contas por mês"
          sub="Soma dos vencimentos, últimos 6 meses"
          right={
            <Badge tone="brand">
              <Wallet size={11} />
              {brl(m.series.reduce((s, p) => s + p.value, 0))} no período
            </Badge>
          }
        />
        <div className="px-2 pb-3">
          {m.series.some((p) => p.value > 0) ? (
            <AreaChart data={m.series} height={230} />
          ) : (
            <Empty
              icon={<Wallet size={18} />}
              title="Sem contas lançadas"
              sub="Cadastre suas contas a pagar para ver a curva de gastos por mês."
              action={
                <Link href="/contas">
                  <Button variant="primary" size="sm">
                    Lançar primeira conta
                  </Button>
                </Link>
              }
            />
          )}
        </div>
      </Card>

      {/* ---------------------- vencimentos + coluna ---------------------- */}
      <div className="grid gap-4 xl:grid-cols-[1fr_340px]">
        <Card className="overflow-hidden">
          <CardHead
            title="Próximos vencimentos"
            sub="Contas em aberto ordenadas por data"
            right={
              <Link
                href="/contas"
                className="text-xs text-brand-400 hover:text-brand-500"
              >
                Ver todas
              </Link>
            }
          />
          {(() => {
            const rows = bills
              .filter((b) => b.status === "pending")
              .sort((a, b) => a.due_date.localeCompare(b.due_date))
              .slice(0, 7);
            if (!rows.length)
              return (
                <Empty
                  icon={<CheckCircle2 size={18} />}
                  title="Nenhuma conta em aberto"
                  sub="Tudo pago por aqui."
                />
              );
            return (
              <div className="overflow-x-auto">
                <table className="w-full min-w-[520px] text-sm">
                  <thead>
                    <tr className="border-y border-line-soft text-left text-[11px] uppercase tracking-wider text-fg-mute">
                      <th className="px-5 py-2.5 font-medium">Descrição</th>
                      <th className="px-3 py-2.5 font-medium">Categoria</th>
                      <th className="px-3 py-2.5 font-medium">Vencimento</th>
                      <th className="px-5 py-2.5 text-right font-medium">Valor</th>
                    </tr>
                  </thead>
                  <tbody>
                    {rows.map((b) => {
                      const d = daysUntil(b.due_date);
                      return (
                        <tr
                          key={b.id}
                          className="border-b border-line-soft/60 last:border-0 transition-colors hover:bg-ink-800/40"
                        >
                          <td className="max-w-[220px] truncate px-5 py-3 font-medium">
                            {b.description}
                          </td>
                          <td className="px-3 py-3 text-xs text-fg-mute">
                            {b.category}
                          </td>
                          <td className="px-3 py-3">
                            <div className="flex items-center gap-2">
                              <span className="text-xs text-fg-dim tnum">
                                {dateBR(b.due_date)}
                              </span>
                              {d < 0 ? (
                                <Badge tone="neg">
                                  <AlertCircle size={10} />
                                  {Math.abs(d)}d atrás
                                </Badge>
                              ) : d === 0 ? (
                                <Badge tone="warn">
                                  <Clock size={10} />
                                  hoje
                                </Badge>
                              ) : d <= 7 ? (
                                <Badge tone="warn">{d}d</Badge>
                              ) : null}
                            </div>
                          </td>
                          <td className="px-5 py-3 text-right font-medium tnum">
                            {brl(Number(b.amount))}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            );
          })()}
        </Card>

        <div className="space-y-4">
          {/* agenda */}
          <Card>
            <CardHead title="Agenda" sub="Próximos compromissos" />
            <div className="space-y-1 px-3 pb-4">
              {m.upcoming.length === 0 ? (
                <Empty icon={<CalendarClock size={18} />} title="Agenda livre" />
              ) : (
                m.upcoming.map((e) => {
                  const isToday = e.start_at.slice(0, 10) === today;
                  return (
                    <div
                      key={e.id}
                      className="flex items-start gap-3 rounded-xl px-2 py-2.5 transition-colors hover:bg-ink-800/50"
                    >
                      <div
                        className={`mt-1 h-2 w-2 shrink-0 rounded-full ${isToday ? "bg-brand-400" : "bg-ink-600"}`}
                      />
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-[13px] font-medium">
                          {e.title}
                        </p>
                        <p className="mt-0.5 text-[11px] text-fg-mute tnum">
                          {isToday ? "Hoje" : dateBR(e.start_at.slice(0, 10))}
                          {!e.all_day &&
                            ` · ${new Date(e.start_at).toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" })}`}
                          {e.location && ` · ${e.location}`}
                        </p>
                      </div>
                    </div>
                  );
                })
              )}
            </div>
          </Card>

          {/* demandas de hoje */}
          <Card>
            <CardHead
              title="Foco de hoje"
              sub="Demandas abertas mais urgentes"
              right={
                <Link
                  href="/demandas"
                  className="text-xs text-brand-400 hover:text-brand-500"
                >
                  Ver
                </Link>
              }
            />
            <div className="space-y-1 px-3 pb-4">
              {m.openTasks.length === 0 ? (
                <Empty icon={<CheckCircle2 size={18} />} title="Nada pendente" />
              ) : (
                [...m.openTasks]
                  .sort((a, b) => {
                    const w = { urgent: 0, high: 1, medium: 2, low: 3 };
                    if (w[a.priority] !== w[b.priority])
                      return w[a.priority] - w[b.priority];
                    return (a.due_date ?? "9999").localeCompare(
                      b.due_date ?? "9999"
                    );
                  })
                  .slice(0, 5)
                  .map((t) => (
                    <div
                      key={t.id}
                      className="flex items-start gap-2.5 rounded-xl px-2 py-2.5 transition-colors hover:bg-ink-800/50"
                    >
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-[13px] font-medium">
                          {t.title}
                        </p>
                        <div className="mt-1 flex items-center gap-1.5">
                          <Badge
                            tone={
                              t.priority === "urgent"
                                ? "neg"
                                : t.priority === "high"
                                  ? "warn"
                                  : "neutral"
                            }
                          >
                            {PRIORITY_LABEL[t.priority]}
                          </Badge>
                          {t.due_date && (
                            <span
                              className={`text-[11px] tnum ${daysUntil(t.due_date) < 0 ? "text-neg" : "text-fg-mute"}`}
                            >
                              {dateBR(t.due_date)}
                            </span>
                          )}
                        </div>
                      </div>
                    </div>
                  ))
              )}
            </div>
          </Card>

          {/* notas fixadas */}
          {m.pinned.length > 0 && (
            <Card>
              <CardHead
                title="Anotações fixadas"
                right={
                  <Link
                    href="/anotacoes"
                    className="text-xs text-brand-400 hover:text-brand-500"
                  >
                    Ver
                  </Link>
                }
              />
              <div className="space-y-2 px-4 pb-4">
                {m.pinned.map((n) => (
                  <div
                    key={n.id}
                    className="rounded-xl border border-line-soft bg-ink-900/60 p-3"
                  >
                    <div className="flex items-center gap-1.5">
                      <Pin size={11} className="text-brand-400" />
                      <p className="truncate text-[12px] font-medium">
                        {n.title || "Sem título"}
                      </p>
                    </div>
                    {n.content && (
                      <p className="mt-1 line-clamp-3 text-[11px] leading-relaxed text-fg-mute">
                        {n.content}
                      </p>
                    )}
                  </div>
                ))}
              </div>
            </Card>
          )}
        </div>
      </div>
    </div>
  );
}

/* ------------------------------ subcomponentes ------------------------------ */

function Kpi({
  icon,
  label,
  value,
  sub,
  tone,
  href,
}: {
  icon: React.ReactNode;
  label: string;
  value: string;
  sub: string;
  tone: "neutral" | "brand" | "pos" | "neg" | "warn";
  href: string;
}) {
  const accent = {
    neutral: "text-fg-dim",
    brand: "text-brand-400",
    pos: "text-pos",
    neg: "text-neg",
    warn: "text-warn",
  }[tone];
  return (
    <Link href={href}>
      <Card className="group h-full p-4 transition-colors hover:border-ink-600">
        <div className="flex items-center justify-between">
          <span className={`flex items-center gap-1.5 text-[11px] ${accent}`}>
            {icon}
            {label}
          </span>
          <ArrowUpRight
            size={13}
            className="text-fg-mute opacity-0 transition-opacity group-hover:opacity-100"
          />
        </div>
        <p className="mt-3 text-2xl font-semibold leading-none tracking-tight tnum">
          {value}
        </p>
        <p className="mt-1.5 text-[11px] text-fg-mute">{sub}</p>
      </Card>
    </Link>
  );
}

function DashboardSkeleton() {
  return (
    <div className="space-y-5">
      <Skeleton className="h-9 w-56" />
      <div className="grid gap-4 xl:grid-cols-[300px_1fr]">
        <Skeleton className="h-[210px]" />
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
          {Array.from({ length: 4 }).map((_, i) => (
            <Skeleton key={i} className="h-[110px]" />
          ))}
        </div>
      </div>
      <Skeleton className="h-[300px]" />
      <div className="grid gap-4 xl:grid-cols-[1fr_340px]">
        <Skeleton className="h-[320px]" />
        <Skeleton className="h-[320px]" />
      </div>
    </div>
  );
}
