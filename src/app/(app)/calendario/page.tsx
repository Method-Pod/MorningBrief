"use client";

import * as React from "react";
import {
  CalendarDays,
  ChevronLeft,
  ChevronRight,
  Clock,
  ListChecks,
  MapPin,
  Pencil,
  Plus,
  Trash2,
  Wallet,
} from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { currentUserId, SESSION_EXPIRED } from "@/lib/session";
import { limparEventosPassados } from "@/lib/limpeza";
import {
  estenderEventosRecorrentes,
  fimDaJanelaDeEventos,
  ocorrenciasDeEvento,
} from "@/lib/manutencao";
import {
  EVENT_RECURRENCE_LABEL,
  PRIORITY_LABEL,
  type Bill,
  type CalendarEvent,
  type EventRecurrence,
  type Task,
} from "@/lib/types";
import { brl, dateBR, localDay, localTime, todayISO } from "@/lib/format";
import {
  Badge,
  Button,
  Card,
  Empty,
  Field,
  Input,
  Modal,
  Select,
  Textarea,
  useConfirm,
  useNotice,
  cx,
} from "@/components/ui";

const MONTHS = [
  "Janeiro", "Fevereiro", "Março", "Abril", "Maio", "Junho",
  "Julho", "Agosto", "Setembro", "Outubro", "Novembro", "Dezembro",
];
const DOW = ["D", "S", "T", "Q", "Q", "S", "S"];
const DOW_FULL = ["Dom", "Seg", "Ter", "Qua", "Qui", "Sex", "Sáb"];

/*
 * `key` é o que está gravado no banco e não muda; `nome` é só o rótulo.
 *
 * As chaves são as do Tailwind e apareciam cruas na tela: ninguém sabe de cor
 * que "rose" é rosa e "amber" é amarelo. A bolinha ao lado resolve de vez, e o
 * nome em português ajuda quem lê antes de olhar.
 */
const EVENT_COLORS = [
  { key: "blue", nome: "azul", cls: "bg-brand-500" },
  { key: "violet", nome: "violeta", cls: "bg-violet-500" },
  { key: "emerald", nome: "verde", cls: "bg-pos" },
  { key: "amber", nome: "âmbar", cls: "bg-warn" },
  { key: "rose", nome: "rosa", cls: "bg-neg" },
];

const pad = (n: number) => String(n).padStart(2, "0");
const isoOf = (y: number, m: number, d: number) => `${y}-${pad(m + 1)}-${pad(d)}`;

const blank = (date: string) => ({
  title: "",
  description: "",
  date,
  time: "09:00",
  end_time: "",
  all_day: false,
  color: "blue",
  location: "",
  recurrence: "none" as EventRecurrence,
});

export default function CalendarioPage() {
  const supabase = React.useMemo(() => createClient(), []);
  const today = todayISO();

  const [cursor, setCursor] = React.useState(() => {
    const d = new Date(today + "T00:00:00");
    return { y: d.getFullYear(), m: d.getMonth() };
  });
  const [events, setEvents] = React.useState<CalendarEvent[]>([]);
  const [bills, setBills] = React.useState<Bill[]>([]);
  const [tasks, setTasks] = React.useState<Task[]>([]);
  const [loading, setLoading] = React.useState(true);
  const [selected, setSelected] = React.useState(today);
  const [open, setOpen] = React.useState(false);
  const [editing, setEditing] = React.useState<CalendarEvent | null>(null);
  const [form, setForm] = React.useState(blank(today));
  const [busy, setBusy] = React.useState(false);
  const [err, setErr] = React.useState("");
  const confirm = useConfirm();
  const notice = useNotice();

  const load = React.useCallback(async () => {
    const [e, b, t] = await Promise.all([
      supabase.from("events").select("*").order("start_at"),
      supabase.from("bills").select("*"),
      supabase.from("tasks").select("*"),
    ]);
    setEvents((e.data as CalendarEvent[]) ?? []);
    setBills((b.data as Bill[]) ?? []);
    setTasks((t.data as Task[]) ?? []);
    setLoading(false);
  }, [supabase]);

  React.useEffect(() => {
    (async () => {
      await load();
      /* Eventos de meses fechados saem, mas depois de pintar: a tela do mês
         atual já está completa sem isso. */
      const apagados = await limparEventosPassados(supabase);
      /*
       * Empurra a janela das repetições depois de pintar.
       *
       * Depois, e não antes: a extensão custa uma ida de rede e o calendário
       * do mês atual já está completo sem ela. Se criou algo, recarrega.
       */
      const criadas = await estenderEventosRecorrentes(supabase);
      if ((criadas ?? 0) > 0 || (apagados ?? 0) > 0) load();
    })();
  }, [load, supabase]);

  /* ------------------------------ índice por dia ------------------------------ */

  const index = React.useMemo(() => {
    const map = new Map<
      string,
      { events: CalendarEvent[]; bills: Bill[]; tasks: Task[] }
    >();
    const put = (iso: string) => {
      if (!map.has(iso)) map.set(iso, { events: [], bills: [], tasks: [] });
      return map.get(iso)!;
    };
    events.forEach((e) => put(localDay(e.start_at)).events.push(e));
    bills.forEach((b) => put(b.due_date.slice(0, 10)).bills.push(b));
    tasks.forEach((t) => {
      if (t.due_date) put(t.due_date.slice(0, 10)).tasks.push(t);
    });
    return map;
  }, [events, bills, tasks]);

  const grid = React.useMemo(() => {
    const first = new Date(cursor.y, cursor.m, 1);
    const lead = first.getDay();
    const total = new Date(cursor.y, cursor.m + 1, 0).getDate();
    const cells: { iso: string; day: number; inMonth: boolean }[] = [];

    const prevTotal = new Date(cursor.y, cursor.m, 0).getDate();
    for (let i = lead - 1; i >= 0; i--) {
      const d = prevTotal - i;
      const pm = cursor.m === 0 ? 11 : cursor.m - 1;
      const py = cursor.m === 0 ? cursor.y - 1 : cursor.y;
      cells.push({ iso: isoOf(py, pm, d), day: d, inMonth: false });
    }
    for (let d = 1; d <= total; d++) {
      cells.push({ iso: isoOf(cursor.y, cursor.m, d), day: d, inMonth: true });
    }
    while (cells.length % 7 !== 0) {
      const d = cells.length - lead - total + 1;
      const nm = cursor.m === 11 ? 0 : cursor.m + 1;
      const ny = cursor.m === 11 ? cursor.y + 1 : cursor.y;
      cells.push({ iso: isoOf(ny, nm, d), day: d, inMonth: false });
    }
    return cells;
  }, [cursor]);

  const monthStats = React.useMemo(() => {
    const prefix = `${cursor.y}-${pad(cursor.m + 1)}`;
    return {
      events: events.filter((e) => localDay(e.start_at).startsWith(prefix)).length,
      bills: bills.filter((b) => b.due_date.startsWith(prefix)),
      tasks: tasks.filter((t) => t.due_date?.startsWith(prefix)).length,
    };
  }, [cursor, events, bills, tasks]);

  /* ------------------------------ ações ------------------------------ */

  const startNew = (date: string) => {
    setEditing(null);
    setForm(blank(date));
    setErr("");
    setOpen(true);
  };

  const startEdit = (e: CalendarEvent) => {
    const start = new Date(e.start_at);
    setEditing(e);
    setForm({
      title: e.title,
      description: e.description,
      date: localDay(e.start_at),
      time: `${pad(start.getHours())}:${pad(start.getMinutes())}`,
      end_time: e.end_at
        ? `${pad(new Date(e.end_at).getHours())}:${pad(new Date(e.end_at).getMinutes())}`
        : "",
      all_day: e.all_day,
      color: e.color,
      location: e.location,
      recurrence: e.recurrence ?? "none",
    });
    setErr("");
    setOpen(true);
  };

  /**
   * `escopo` só importa ao editar uma ocorrência de repetição.
   *
   * "uma" altera o lançamento aberto. "serie" leva as mudanças para as outras
   * ocorrências dali para frente.
   */
  const save = async (
    ev: React.FormEvent | null,
    escopo: "uma" | "serie" = "uma"
  ) => {
    ev?.preventDefault();
    setErr("");
    if (!form.title.trim()) return setErr("Informe o título do evento.");
    setBusy(true);

    const startAt = new Date(
      `${form.date}T${form.all_day ? "00:00" : form.time || "00:00"}:00`
    );
    const endAt =
      !form.all_day && form.end_time
        ? new Date(`${form.date}T${form.end_time}:00`)
        : null;

    const payload = {
      title: form.title.trim(),
      description: form.description.trim(),
      start_at: startAt.toISOString(),
      end_at: endAt ? endAt.toISOString() : null,
      all_day: form.all_day,
      color: form.color,
      location: form.location.trim(),
    };

    let error;
    if (editing) {
      ({ error } = await supabase
        .from("events")
        .update(payload)
        .eq("id", editing.id));

      /*
       * "Todas": leva as mudanças para as outras ocorrências da repetição.
       *
       * A DATA não vai — cada ocorrência tem a sua, e propagá-la empilharia a
       * repetição toda num único dia. O que vai é a HORA: mudar de 20:00 para
       * 21:00 move todas para 21:00 nas datas delas.
       *
       * Vai para todas, inclusive as que já passaram. É o que "todas" diz, e
       * uma repetição de horário trocado pela metade seria pior que o problema:
       * o histórico mostraria dois horários para o mesmo compromisso.
       */
      if (!error && escopo === "serie" && editing.series_id) {
        const { data: irmas, error: erroBusca } = await supabase
          .from("events")
          .select("id, start_at")
          .eq("series_id", editing.series_id)
          .neq("id", editing.id);

        if (erroBusca) error = erroBusca;
        else {
          const duracao =
            endAt ? endAt.getTime() - startAt.getTime() : null;
          const comuns = {
            title: payload.title,
            description: payload.description,
            all_day: payload.all_day,
            color: payload.color,
            location: payload.location,
          };

          /*
           * Uma requisição por ocorrência, e não um update em lote, porque cada
           * start_at novo depende da data que aquela linha já tem: só a hora
           * muda. Um update único não calcularia isso por linha.
           */
          for (const irma of (irmas as { id: string; start_at: string }[]) ?? []) {
            const dia = localDay(irma.start_at);
            const novoInicio = new Date(
              `${dia}T${form.all_day ? "00:00" : form.time || "00:00"}:00`
            );
            const { error: erroUpdate } = await supabase
              .from("events")
              .update({
                ...comuns,
                start_at: novoInicio.toISOString(),
                end_at:
                  duracao === null
                    ? null
                    : new Date(novoInicio.getTime() + duracao).toISOString(),
              })
              .eq("id", irma.id);
            if (erroUpdate) {
              error = erroUpdate;
              break;
            }
          }
          if (!error && irmas?.length)
            notice.show(
              `Alterado em ${irmas.length + 1} ocorrências da repetição.`
            );
        }
      }
    } else {
      const uid = await currentUserId(supabase);
      if (!uid) {
        setBusy(false);
        setErr(SESSION_EXPIRED);
        return;
      }
      /*
       * Evento que repete nasce com a janela já preenchida.
       *
       * A janela é o mês atual e o seguinte, e não um ano: cada ocorrência é
       * uma linha, e uma repetição semanal por doze meses são mais de cinquenta
       * linhas que ninguém vai olhar hoje. A manutenção diária empurra a janela
       * adiante, então o calendário nunca fica vazio à frente.
       *
       * O series_id sai do navegador porque as ocorrências são inseridas de uma
       * vez: sem um id decidido antes, cada linha viria com um id diferente e
       * não haveria série.
       */
      const repete = form.recurrence !== "none";
      const serie = repete ? crypto.randomUUID() : null;
      const extras = repete
        ? ocorrenciasDeEvento({
            inicio: payload.start_at,
            fim: payload.end_at,
            recorrencia: form.recurrence,
            limite: fimDaJanelaDeEventos(today),
          })
        : [];

      /*
       * As colunas de repetição só entram quando há repetição.
       *
       * Elas vêm de EVENTOS-RECORRENTES.sql. Mandá-las sempre faria o evento
       * simples falhar com "could not find the column" num banco onde a
       * migração ainda não rodou — quebrando o que já funcionava para entregar
       * o que é novo.
       */
      const colunasDeRepeticao = repete
        ? { recurrence: form.recurrence, series_id: serie }
        : {};

      ({ error } = await supabase.from("events").insert([
        { ...payload, ...colunasDeRepeticao, user_id: uid },
        ...extras.map((o) => ({
          ...payload,
          ...o,
          ...colunasDeRepeticao,
          user_id: uid,
        })),
      ]));

      if (!error && extras.length)
        notice.show(
          `${extras.length + 1} ocorrências criadas, até o fim do mês que vem.`
        );
    }
    setBusy(false);
    if (error) {
      /* 42703/PGRST204: a migração de recorrência ainda não rodou. */
      if (/recurrence|series_id/.test(error.message))
        return setErr(
          "Evento recorrente precisa de supabase/EVENTOS-RECORRENTES.sql no banco. Rode o arquivo ou deixe em \"Não repete\"."
        );
      return setErr(error.message);
    }
    setOpen(false);
    setSelected(form.date);
    load();
  };

  const remove = (e: CalendarEvent) =>
    confirm.ask(
      e.series_id
        ? `Excluir só esta ocorrência de "${e.title}"? As outras repetições ficam.`
        : `Excluir "${e.title}"?`,
      async () => {
        const { error } = await supabase.from("events").delete().eq("id", e.id);
        if (!notice.check(error, "excluir o evento")) load();
      }
    );

  /*
   * Excluir a repetição inteira.
   *
   * Existe separado porque apagar uma ocorrência do meio não encerra a
   * repetição: a manutenção estende a partir da última, então a série
   * continuaria nascendo. Encerrar é apagar a série.
   */
  const removerSerie = (e: CalendarEvent) => {
    if (!e.series_id) return;
    const quantas = events.filter((x) => x.series_id === e.series_id).length;
    confirm.ask(
      `Excluir a repetição de "${e.title}"? São ${quantas} ocorrências, e ela para de se repetir.`,
      async () => {
        const { error } = await supabase
          .from("events")
          .delete()
          .eq("series_id", e.series_id);
        if (!notice.check(error, "excluir a repetição")) {
          setOpen(false);
          load();
        }
      }
    );
  };

  const shift = (n: number) =>
    setCursor((c) => {
      const d = new Date(c.y, c.m + n, 1);
      return { y: d.getFullYear(), m: d.getMonth() };
    });

  const goToday = () => {
    const d = new Date(today + "T00:00:00");
    setCursor({ y: d.getFullYear(), m: d.getMonth() });
    setSelected(today);
  };

  const day = index.get(selected) ?? { events: [], bills: [], tasks: [] };

  if (loading) return null;

  return (
    <div className="space-y-5 rise">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Calendário</h1>
          <p className="mt-1 text-sm text-fg-mute">
            {monthStats.events} evento{monthStats.events === 1 ? "" : "s"} ·{" "}
            {monthStats.bills.length} vencimento
            {monthStats.bills.length === 1 ? "" : "s"} · {monthStats.tasks} prazo
            {monthStats.tasks === 1 ? "" : "s"} neste mês
          </p>
        </div>
        <Button variant="primary" onClick={() => startNew(selected)}>
          <Plus size={15} />
          Novo evento
        </Button>
      </div>

      <div className="grid gap-4 xl:grid-cols-[1fr_340px]">
        {/* ------------------------------ grade ------------------------------ */}
        <Card className="overflow-hidden">
          <div className="flex items-center justify-between gap-3 px-4 py-4">
            <div className="flex items-center gap-2">
              <button
                onClick={() => shift(-1)}
                aria-label="Mês anterior"
                className="rounded-lg border border-line p-1.5 text-fg-dim transition-colors hover:bg-ink-800 hover:text-fg"
              >
                <ChevronLeft size={15} />
              </button>
              <button
                onClick={() => shift(1)}
                aria-label="Próximo mês"
                className="rounded-lg border border-line p-1.5 text-fg-dim transition-colors hover:bg-ink-800 hover:text-fg"
              >
                <ChevronRight size={15} />
              </button>
              <h2 className="ml-1 text-[15px] font-semibold tracking-tight">
                {MONTHS[cursor.m]}{" "}
                <span className="text-fg-mute">{cursor.y}</span>
              </h2>
            </div>
            <Button size="sm" onClick={goToday}>
              Hoje
            </Button>
          </div>

          <div className="grid grid-cols-7 border-y border-line-soft">
            {DOW.map((d, i) => (
              <div
                key={i}
                className="py-2 text-center text-[10px] font-semibold uppercase tracking-wider text-fg-mute"
              >
                <span className="hidden sm:inline">{DOW_FULL[i]}</span>
                <span className="sm:hidden">{d}</span>
              </div>
            ))}
          </div>

          <div className="grid grid-cols-7">
            {grid.map((cell) => {
              const data = index.get(cell.iso);
              const isToday = cell.iso === today;
              const isSel = cell.iso === selected;
              const pendingBills = (data?.bills ?? []).filter(
                (b) => b.status === "pending"
              );
              const openTasks = (data?.tasks ?? []).filter(
                (t) => t.status !== "done"
              );
              const evs = data?.events ?? [];

              return (
                <button
                  key={cell.iso}
                  onClick={() => setSelected(cell.iso)}
                  onDoubleClick={() => startNew(cell.iso)}
                  className={cx(
                    "relative flex min-h-[62px] flex-col items-start gap-1 border-b border-r border-line-soft/60 p-1.5 text-left transition-colors last:border-r-0 sm:min-h-[84px] sm:p-2",
                    !cell.inMonth && "opacity-35",
                    isSel
                      ? "bg-brand-500/10 ring-1 ring-inset ring-brand-500/40"
                      : "hover:bg-ink-800/40"
                  )}
                >
                  <span
                    className={cx(
                      "grid h-6 w-6 shrink-0 place-items-center rounded-full text-[11px] font-medium tnum",
                      isToday
                        ? "bg-brand-500 text-white"
                        : isSel
                          ? "text-brand-400"
                          : "text-fg-dim"
                    )}
                  >
                    {cell.day}
                  </span>

                  <div className="w-full space-y-0.5 overflow-hidden">
                    {evs.slice(0, 2).map((e) => (
                      <div
                        key={e.id}
                        className="flex items-center gap-1 truncate rounded px-1 py-0.5 text-[9.5px] text-fg-dim"
                        style={{ background: "rgba(255,255,255,.04)" }}
                      >
                        <span
                          className={cx(
                            "h-1.5 w-1.5 shrink-0 rounded-full",
                            EVENT_COLORS.find((c) => c.key === e.color)?.cls ??
                              "bg-brand-500"
                          )}
                        />
                        <span className="truncate">{e.title}</span>
                      </div>
                    ))}
                    {evs.length > 2 && (
                      <p className="px-1 text-[9px] text-fg-mute">
                        +{evs.length - 2} evento{evs.length - 2 > 1 ? "s" : ""}
                      </p>
                    )}
                  </div>

                  {(pendingBills.length > 0 || openTasks.length > 0) && (
                    <div className="mt-auto flex items-center gap-1.5 pt-0.5">
                      {pendingBills.length > 0 && (
                        <span className="inline-flex items-center gap-0.5 text-[9px] text-warn">
                          <Wallet size={8} />
                          {pendingBills.length}
                        </span>
                      )}
                      {openTasks.length > 0 && (
                        <span className="inline-flex items-center gap-0.5 text-[9px] text-brand-400">
                          <ListChecks size={8} />
                          {openTasks.length}
                        </span>
                      )}
                    </div>
                  )}
                </button>
              );
            })}
          </div>

          <div className="flex flex-wrap items-center gap-4 border-t border-line-soft px-4 py-3 text-[10px] text-fg-mute">
            <span className="inline-flex items-center gap-1.5">
              <span className="h-2 w-2 rounded-full bg-brand-500" /> evento
            </span>
            <span className="inline-flex items-center gap-1.5">
              <Wallet size={10} className="text-warn" /> conta a vencer
            </span>
            <span className="inline-flex items-center gap-1.5">
              <ListChecks size={10} className="text-brand-400" /> prazo de demanda
            </span>
            <span className="ml-auto hidden sm:inline">
              duplo clique num dia cria evento
            </span>
          </div>
        </Card>

        {/* ------------------------------ painel do dia ------------------------------ */}
        <Card className="flex flex-col">
          <div className="flex items-start justify-between gap-3 px-5 pt-5 pb-4">
            <div>
              <p className="text-[11px] uppercase tracking-wider text-fg-mute">
                {selected === today
                  ? "Hoje"
                  : DOW_FULL[new Date(selected + "T00:00:00").getDay()]}
              </p>
              <h2 className="mt-0.5 text-[15px] font-semibold tracking-tight tnum">
                {dateBR(selected)}
              </h2>
            </div>
            <Button size="sm" variant="subtle" onClick={() => startNew(selected)}>
              <Plus size={13} />
              Evento
            </Button>
          </div>

          <div className="flex-1 space-y-5 px-5 pb-5">
            {/* eventos */}
            <section>
              <p className="mb-2 flex items-center gap-1.5 text-[10px] font-semibold uppercase tracking-[0.14em] text-fg-mute">
                <CalendarDays size={10} />
                Eventos
              </p>
              {day.events.length === 0 ? (
                <p className="rounded-xl border border-dashed border-line-soft py-5 text-center text-[11px] text-fg-mute">
                  Nenhum evento
                </p>
              ) : (
                <div className="space-y-2">
                  {day.events.map((e) => (
                    <div
                      key={e.id}
                      className="group rounded-xl border border-line-soft bg-ink-900/60 p-3"
                    >
                      <div className="flex items-start justify-between gap-2">
                        <div className="flex min-w-0 items-start gap-2">
                          <span
                            className={cx(
                              "mt-1.5 h-2 w-2 shrink-0 rounded-full",
                              EVENT_COLORS.find((c) => c.key === e.color)?.cls ??
                                "bg-brand-500"
                            )}
                          />
                          <div className="min-w-0">
                            <p className="truncate text-[13px] font-medium">
                              {e.title}
                            </p>
                            <p className="mt-0.5 flex flex-wrap items-center gap-x-2 text-[10.5px] text-fg-mute tnum">
                              {e.all_day ? (
                                "Dia inteiro"
                              ) : (
                                <span className="inline-flex items-center gap-1">
                                  <Clock size={9} />
                                  {localTime(e.start_at)}
                                  {e.end_at &&
                                    ` – ${localTime(e.end_at)}`}
                                </span>
                              )}
                              {e.location && (
                                <span className="inline-flex items-center gap-1">
                                  <MapPin size={9} />
                                  {e.location}
                                </span>
                              )}
                            </p>
                          </div>
                        </div>
                        <div className="flex shrink-0 items-center gap-0.5 transition-opacity lg:opacity-0 lg:group-hover:opacity-100 lg:focus-within:opacity-100">
                          <button
                            onClick={() => startEdit(e)}
                            aria-label="Editar"
                            className="rounded-md p-1 text-fg-mute hover:bg-ink-750 hover:text-fg"
                          >
                            <Pencil size={12} />
                          </button>
                          <button
                            onClick={() => remove(e)}
                            aria-label="Excluir"
                            className="rounded-md p-1 text-fg-mute hover:bg-neg/15 hover:text-neg"
                          >
                            <Trash2 size={12} />
                          </button>
                        </div>
                      </div>
                      {e.description && (
                        <p className="mt-2 whitespace-pre-wrap text-[11px] leading-relaxed text-fg-mute">
                          {e.description}
                        </p>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </section>

            {/* contas */}
            {day.bills.length > 0 && (
              <section>
                <p className="mb-2 flex items-center gap-1.5 text-[10px] font-semibold uppercase tracking-[0.14em] text-fg-mute">
                  <Wallet size={10} />
                  Vencimentos
                </p>
                <div className="space-y-1.5">
                  {day.bills.map((b) => (
                    <div
                      key={b.id}
                      className="flex items-center justify-between gap-2 rounded-xl border border-line-soft bg-ink-900/60 px-3 py-2.5"
                    >
                      <div className="min-w-0">
                        <p
                          className={cx(
                            "truncate text-[12px] font-medium",
                            b.status === "paid" && "text-fg-mute line-through"
                          )}
                        >
                          {b.description}
                        </p>
                        <p className="text-[10px] text-fg-mute">{b.category}</p>
                      </div>
                      <div className="shrink-0 text-right">
                        <p className="text-[12px] font-medium tnum">
                          {brl(Number(b.amount))}
                        </p>
                        <Badge tone={b.status === "paid" ? "pos" : "warn"}>
                          {b.status === "paid" ? "paga" : "aberta"}
                        </Badge>
                      </div>
                    </div>
                  ))}
                </div>
              </section>
            )}

            {/* demandas */}
            {day.tasks.length > 0 && (
              <section>
                <p className="mb-2 flex items-center gap-1.5 text-[10px] font-semibold uppercase tracking-[0.14em] text-fg-mute">
                  <ListChecks size={10} />
                  Prazos de demanda
                </p>
                <div className="space-y-1.5">
                  {day.tasks.map((t) => (
                    <div
                      key={t.id}
                      className="flex items-center justify-between gap-2 rounded-xl border border-line-soft bg-ink-900/60 px-3 py-2.5"
                    >
                      <p
                        className={cx(
                          "min-w-0 truncate text-[12px] font-medium",
                          t.status === "done" && "text-fg-mute line-through"
                        )}
                      >
                        {t.title}
                      </p>
                      <Badge
                        tone={
                          t.status === "done"
                            ? "pos"
                            : t.priority === "urgent"
                              ? "neg"
                              : t.priority === "high"
                                ? "warn"
                                : "neutral"
                        }
                      >
                        {t.status === "done"
                          ? "concluída"
                          : PRIORITY_LABEL[t.priority]}
                      </Badge>
                    </div>
                  ))}
                </div>
              </section>
            )}

            {day.events.length === 0 &&
              day.bills.length === 0 &&
              day.tasks.length === 0 && (
                <Empty
                  icon={<CalendarDays size={18} />}
                  title="Dia livre"
                  sub="Nenhum evento, vencimento ou prazo nesta data."
                />
              )}
          </div>
        </Card>
      </div>

      {/* ------------------------------ modal ------------------------------ */}
      <Modal
        open={open}
        onClose={() => setOpen(false)}
        title={editing ? "Editar evento" : "Novo evento"}
        footer={
          <>
            <Button onClick={() => setOpen(false)}>Cancelar</Button>
            {editing?.series_id ? (
              /*
               * Duas saídas quando a ocorrência é de uma repetição, porque as
               * duas intenções são legítimas e o app não tem como adivinhar:
               * remarcar um encontro específico, ou corrigir a repetição toda.
               * Com um botão só, uma das duas viraria trabalho manual nas
               * outras ocorrências.
               */
              <>
                <Button onClick={() => save(null, "uma")} disabled={busy}>
                  {busy ? "Salvando..." : "Salvar só esta"}
                </Button>
                <Button
                  variant="primary"
                  onClick={() => save(null, "serie")}
                  disabled={busy}
                >
                  {busy ? "Salvando..." : "Salvar em todas"}
                </Button>
              </>
            ) : (
              <Button variant="primary" onClick={() => save(null)} disabled={busy}>
                {busy ? "Salvando..." : "Salvar"}
              </Button>
            )}
          </>
        }
      >
        <form onSubmit={save} className="space-y-4">
          <Field label="Título">
            <Input
              autoFocus
              value={form.title}
              onChange={(e) => setForm({ ...form, title: e.target.value })}
              placeholder="Reunião de alinhamento"
            />
          </Field>

          <div className="grid gap-4 sm:grid-cols-3">
            <Field label="Data" className="sm:col-span-1">
              <Input
                type="date"
                value={form.date}
                onChange={(e) => setForm({ ...form, date: e.target.value })}
              />
            </Field>
            <Field label="Início">
              <Input
                type="time"
                disabled={form.all_day}
                value={form.time}
                onChange={(e) => setForm({ ...form, time: e.target.value })}
              />
            </Field>
            <Field label="Fim">
              <Input
                type="time"
                disabled={form.all_day}
                value={form.end_time}
                onChange={(e) => setForm({ ...form, end_time: e.target.value })}
              />
            </Field>
          </div>

          <label className="flex cursor-pointer items-center gap-2.5 rounded-xl border border-line-soft bg-ink-900/50 px-3.5 py-3">
            <input
              type="checkbox"
              checked={form.all_day}
              onChange={(e) => setForm({ ...form, all_day: e.target.checked })}
              className="h-4 w-4 accent-[#2f7bff]"
            />
            <span className="text-sm text-fg-dim">Dia inteiro</span>
          </label>

          {/*
            Repetição só na criação.
            
            Editar mexe numa ocorrência, não na regra: oferecer "toda semana"
            aqui sugeriria que a mudança vale para as outras, e não vale. Para
            trocar a regra, exclua a repetição e crie de novo.
          */}
          {!editing ? (
            <Field
              label="Repete"
              hint={
                form.recurrence === "none"
                  ? undefined
                  : "Preenche o mês atual e o próximo. A cada dia a janela avança sozinha."
              }
            >
              <Select
                value={form.recurrence}
                onChange={(e) =>
                  setForm({
                    ...form,
                    recurrence: e.target.value as EventRecurrence,
                  })
                }
              >
                {(
                  Object.keys(EVENT_RECURRENCE_LABEL) as EventRecurrence[]
                ).map((r) => (
                  <option key={r} value={r}>
                    {EVENT_RECURRENCE_LABEL[r]}
                  </option>
                ))}
              </Select>
            </Field>
          ) : (
            editing.series_id && (
              <div className="flex flex-wrap items-center justify-between gap-2 rounded-[14px] bg-ink-800 px-3.5 py-3">
                <span className="text-[12px] text-fg-dim">
                  Ocorrência de uma repetição{" "}
                  <span className="font-semibold text-fg">
                    {EVENT_RECURRENCE_LABEL[editing.recurrence] ?? ""}
                  </span>
                  . Ao salvar, escolha entre só esta e todas. A data fica sempre
                  só nesta; a hora vai junto.
                </span>
                <button
                  type="button"
                  onClick={() => removerSerie(editing)}
                  className="text-[11.5px] font-bold text-neg underline decoration-neg/30 underline-offset-2 transition-colors hover:decoration-neg"
                >
                  excluir a repetição
                </button>
              </div>
            )
          )}

          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Local">
              <Input
                value={form.location}
                onChange={(e) => setForm({ ...form, location: e.target.value })}
                placeholder="Sala 2, Google Meet..."
              />
            </Field>
            <Field label="Cor">
              <div className="relative">
                {/* A bolinha mostra a cor escolhida sem depender do nome. */}
                <span
                  aria-hidden
                  className={cx(
                    "pointer-events-none absolute left-3.5 top-1/2 h-3 w-3 -translate-y-1/2 rounded-full",
                    EVENT_COLORS.find((c) => c.key === form.color)?.cls ??
                      "bg-brand-500"
                  )}
                />
                <Select
                  value={form.color}
                  onChange={(e) => setForm({ ...form, color: e.target.value })}
                  className="!pl-[34px]"
                >
                  {EVENT_COLORS.map((c) => (
                    <option key={c.key} value={c.key}>
                      {c.nome}
                    </option>
                  ))}
                </Select>
              </div>
            </Field>
          </div>

          <Field label="Descrição">
            <Textarea
              rows={3}
              value={form.description}
              onChange={(e) => setForm({ ...form, description: e.target.value })}
              placeholder="Pauta, links, participantes..."
            />
          </Field>

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
