"use client";

import * as React from "react";
import Link from "next/link";
import {
  AlertCircle,
  BookOpen,
  Library,
  CalendarClock,
  CalendarDays,
  CheckCircle2,
  ListChecks,
  Pin,
  Plus,
  Repeat2,
  Trash2,
  Wallet,
  Zap,
} from "lucide-react";
import { Clima } from "@/components/Clima";
import { createClient } from "@/lib/supabase/client";
import { temCache, useEstadoCacheado } from "@/lib/cachePagina";
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
import { textoDaNota } from "@/lib/notas";
import { frequencyDescription, isDueOn, nextOccurrence } from "@/lib/recurring";
import {
  HORAS_RETENCAO,
  limparAulasAssistidas,
  limparConcluidas,
} from "@/lib/limpeza";
import {
  estenderEventosRecorrentes,
  lancarProximoMesDasFixas,
  marcarManutencaoFeita,
  precisaDeManutencao,
  reporRecorrentesPerdidas,
} from "@/lib/manutencao";
import { Card, useNotice, cx } from "@/components/ui";
import { useIdentity } from "@/components/identity";

/*
 * Recortes das duas tabelas novas.
 *
 * O painel lê só as colunas que mostra, e não a linha inteira: a descrição de
 * um livro tem parágrafos, e trazê-la para desenhar uma barra de progresso
 * seria payload por nada. Foi a mesma razão de `BookLista` na estante.
 */
type Livro = {
  id: string;
  title: string;
  authors: string | null;
  cover_url: string | null;
  total_pages: number | null;
  current_page: number;
};

type Ref = {
  id: string;
  name: string;
  url: string | null;
  image_url: string | null;
  icon_url: string | null;
  image_own: boolean;
  busca: boolean;
};

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
  /*
   * Já visitou nesta sessão? Abre com o brief de antes e atualiza atrás.
   *
   * Aqui pesa mais que nas outras: é a aba de abertura e a que se volta entre
   * uma coisa e outra, e era a que ficava mais tempo em branco — são cinco
   * consultas antes de a primeira linha aparecer.
   */
  const [loading, setLoading] = React.useState(
    () => !temCache("bills", "tasks", "recurring_tasks", "events", "notes")
  );
  const [bills, setBills] = useEstadoCacheado<Bill[]>("bills", []);
  const [tasks, setTasks] = useEstadoCacheado<Task[]>("tasks", []);
  const [recurring, setRecurring] = useEstadoCacheado<RecurringTask[]>("recurring_tasks", []);
  const [events, setEvents] = useEstadoCacheado<CalendarEvent[]>("events", []);
  const [notes, setNotes] = useEstadoCacheado<Note[]>("notes", []);
  const [lendo, setLendo] = useEstadoCacheado<Livro[]>("painel_lendo", []);
  const [refs, setRefs] = useEstadoCacheado<Ref[]>("painel_refs", []);
  const [generated, setGenerated] = React.useState(0);
  const [limpas, setLimpas] = React.useState(0);
  const [draft, setDraft] = React.useState("");
  const [adding, setAdding] = React.useState(false);
  const notice = useNotice();
  const { nome } = useIdentity();

  const today = todayISO();

  const load = React.useCallback(async () => {
    const [b, t, r, e, n, lv, rf] = await Promise.all([
      supabase.from("bills").select("*").order("due_date"),
      supabase.from("tasks").select("*").order("created_at", { ascending: false }),
      supabase.from("recurring_tasks").select("*").order("created_at"),
      supabase.from("events").select("*").order("start_at"),
      supabase.from("notes").select("*").order("updated_at", { ascending: false }),
      /*
       * Leitura e referências toleram falha: quem não rodou LEITURA.sql ou
       * REFERENCIAS.sql simplesmente não vê os dois cartões, e o resto do
       * painel não sabe que eles existem.
       */
      supabase
        .from("books")
        .select("id,title,authors,cover_url,total_pages,current_page,status")
        .eq("status", "reading"),
      supabase
        .from("referencias")
        .select("id,name,url,image_url,icon_url,image_own,busca,created_at")
        .order("created_at", { ascending: false })
        .limit(8),
    ]);
    // numeric do Postgres vem como string no JSON; normaliza na fronteira
    setBills(
      ((b.data as Bill[]) ?? []).map((x) => ({ ...x, amount: Number(x.amount) }))
    );
    /* Descarta o que a limpeza vai apagar: sem isso, a demanda concluída há
       mais de 24h apareceria por um instante antes de o delete responder. */
      const corte = Date.now() - HORAS_RETENCAO * 3600 * 1000;
    setTasks(
      ((t.data as Task[]) ?? []).filter(
        (x) =>
          !(
            x.status === "done" &&
            x.completed_at &&
            new Date(x.completed_at).getTime() < corte
          )
      )
    );
    setRecurring((r.data as RecurringTask[]) ?? []);
    setEvents((e.data as CalendarEvent[]) ?? []);
    setNotes((n.data as Note[]) ?? []);
    setLendo((lv.data as Livro[]) ?? []);
    setRefs((rf.data as Ref[]) ?? []);
    return (r.data as RecurringTask[]) ?? [];
  }, [supabase]);

  React.useEffect(() => {
    let alive = true;
    (async () => {
      /*
       * Só a leitura segura a primeira pintura.
       *
       * A manutenção e a limpeza ficavam antes do `setLoading(false)`, e o
       * comentário dizia "depois da primeira pintura" enquanto o código fazia o
       * contrário: a tela de entrada esperava quatro rotinas, cada uma com suas
       * próprias idas ao banco, antes de mostrar qualquer coisa.
       *
       * Nada aqui precisa bloquear: o que a limpeza vai apagar já é descartado
       * localmente em `load`, e o que a manutenção cria aparece na releitura
       * logo abaixo.
       */
      await load();
      if (!alive) return;
      setLoading(false);

      /*
       * Manutenção do dia, agora de fato em segundo plano.
       *
       * As rotinas vivem em lib/manutencao porque a rota do cron chama as
       * mesmas: com o app fechado é o cron que roda, e ao abrir é a página —
       * quem chegar primeiro faz, e a outra passada não encontra nada a fazer.
       * Com o cron diário no ar, quase sempre não há nada a fazer aqui.
       */
      /* Uma vez por dia por aparelho: ver precisaDeManutencao. Voltar para o
         Início pela navegação não repete as cinco varreduras. */
      if (!precisaDeManutencao(today)) return;

      const [apagadas, criadas, lancadas, eventos, aulas] = await Promise.all([
        limparConcluidas(supabase),
        reporRecorrentesPerdidas(supabase),
        lancarProximoMesDasFixas(supabase),
        estenderEventosRecorrentes(supabase),
        /* Vai no fim porque a desestruturação acima é por posição, e o
           resultado desta não é mostrado — as aulas saem em silêncio. */
        limparAulasAssistidas(supabase),
      ]);
      if (!alive) return;

      /* O dia só é marcado quando todas responderam. Um `null` é falha, e
         gravar por cima dela pularia a manutenção até amanhã. */
      if (
        [apagadas, criadas, lancadas, eventos, aulas].every((r) => r !== null)
      )
        marcarManutencaoFeita(today);

      if (apagadas && apagadas > 0) setLimpas(apagadas);
      if ((criadas ?? 0) > 0) setGenerated(criadas ?? 0);
      if ((criadas ?? 0) > 0 || (lancadas ?? 0) > 0 || (eventos ?? 0) > 0)
        await load();
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
    // A tela já foi atualizada de forma otimista; só recarrega se falhou,
    // para desfazer. Recarregar sempre custava uma busca completa por clique.
    if (notice.check(error, done ? "reabrir a tarefa" : "concluir a tarefa"))
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
      /* Mesmo recorte do card Total em Contas a pagar: mês atual, todas as
         situações. Dois lugares mostrando "total" com escopos diferentes
         fariam os números não fecharem entre as telas. */
      totalMes: bills
        .filter((b) => b.due_date.startsWith(today.slice(0, 7)))
        .reduce((s, b) => s + Number(b.amount), 0),
      abertoMes: bills
        .filter(
          (b) =>
            b.status === "pending" && b.due_date.startsWith(today.slice(0, 7))
        )
        .reduce((s, b) => s + Number(b.amount), 0),
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

      /*
       * O que "Hoje" mostra: o que vence hoje mais o que passou do prazo.
       *
       * O atrasado entra aqui porque é a coisa mais urgente que existe, e
       * ficava escondido num contador. Ordem: atrasado primeiro, depois por
       * prioridade, e o concluído desce.
       */
      doDia: [
        ...open.filter((t) => t.due_date?.slice(0, 10) === today),
        ...open.filter(
          (t) =>
            t.due_date &&
            t.due_date.slice(0, 10) !== today &&
            daysUntil(t.due_date) < 0
        ),
        ...hoje.filter((t) => t.status === "done"),
      ].sort(
          (a, b) =>
            Number(a.status === "done") - Number(b.status === "done") ||
            Number(daysUntil(b.due_date ?? today) < 0) -
              Number(daysUntil(a.due_date ?? today) < 0) ||
            PRIO_RANK[a.priority] - PRIO_RANK[b.priority]
        ),

      /*
       * O que "O que vem" mostra: prazo depois de hoje.
       *
       * Antes as duas seções liam a mesma lista e quatro das cinco linhas se
       * repetiam na tela, com títulos diferentes. Agora cada demanda aparece
       * num lugar só: hoje e atrasado em cima, o resto aqui.
       */
      depois: open
        .filter((t) => t.due_date && daysUntil(t.due_date) > 0)
        .sort((a, b) => (a.due_date ?? "").localeCompare(b.due_date ?? ""))
        .slice(0, 5),

      /* Sem prazo nenhum não cabe em "hoje" nem em "depois", e desapareceria
         do painel. Entra no fim de "o que vem". */
      semPrazo: open.filter((t) => !t.due_date).slice(0, 3),
    };
  }, [tasks, bills, recurring, events, notes, today]);

  if (loading) return null;

  const now = new Date();
  const nomeMes = now.toLocaleDateString("pt-BR", { month: "long" });

  return (
    <div className="rise">
      {/* ------------------------------ saudação ------------------------------ */}
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3.5">
        <div className="min-w-0">
          <h1 className="text-[clamp(24px,4vw,32px)] font-bold tracking-[-0.035em]">
            {nome ? `${greeting()}, ${nome}!` : `${greeting()}!`}
          </h1>
          {/*
            Sem subtítulo.
            
            Era "Vamos dar uma olhada no seu dia", que gastava a segunda linha
            sem informar. Troquei por um resumo com números e caí no problema
            que tinha acabado de consertar: "atrasada" aparecia no subtítulo,
            na faixa e em "O que vem". Os números do dia moram na faixa
            abaixo, e num lugar só — o que sobra aqui é o nome de quem entrou.
          */}
        </div>
        {/* Data e clima na mesma pílula, separados por um traço fino.
            Duas pílulas soltas competiriam entre si; aqui a data continua sendo
            o assunto e a temperatura entra como complemento. */}
        <span className="flex items-center gap-2.5 whitespace-nowrap rounded-full bg-white px-4 py-2.5 text-[13px] font-semibold text-fg-dim shadow-[0_1px_2px_rgb(20_24_26/0.05)]">
          {now.toLocaleDateString("pt-BR", {
            weekday: "long",
            day: "2-digit",
            month: "long",
          })}
          <Clima className="flex items-center gap-1.5 border-l border-line-soft pl-2.5" />
        </span>
      </div>

      {limpas > 0 && (
        <div className="mb-4 flex items-center gap-2.5 rounded-[14px] bg-ink-800 px-4 py-3 text-[12.5px] text-fg-mute">
          <Trash2 size={15} className="shrink-0" />
          {limpas} demanda{limpas > 1 ? "s" : ""} concluída
          {limpas > 1 ? "s" : ""} há mais de 24h {limpas > 1 ? "foram" : "foi"}{" "}
          removida{limpas > 1 ? "s" : ""}.
        </div>
      )}

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

      {/* ------------------------------ o dia ------------------------------ */}
      {/*
        Uma faixa fina, e não um cartão escuro com anel.
        
        O cartão anterior era a única coisa escura do app, tinha três níveis de
        escuro empilhados, e gastava o maior elemento da tela — um anel de 88px
        — para dizer o número que o cartão logo abaixo já dizia. Em zero, o
        anel vazio parecia defeito.
        
        Aqui o número aparece uma vez só, a barra ocupa a largura que sobra, e
        os contadores viram texto ao lado em vez de três sub-cartões.
      */}
      <div className="mb-4 flex flex-wrap items-center gap-x-5 gap-y-3 rounded-[18px] bg-white px-[18px] py-3.5 shadow-[0_1px_2px_rgb(20_24_26/0.05)]">
        <p className="shrink-0 text-[15px] font-bold tracking-[-0.02em]">
          {m.feitas}
          <span className="font-semibold text-fg-mute">/{m.hoje.length}</span>
          <span className="ml-1.5 text-[12.5px] font-medium text-fg-mute">
            hoje
          </span>
        </p>

        {/* Cresce por transform e não por width: largura recalcula layout a
            cada quadro, e esta barra fica na primeira coisa pintada. */}
        <span className="h-1.5 min-w-[80px] flex-1 overflow-hidden rounded-full bg-ink-800">
          <span
            className="block h-full w-full origin-left rounded-full bg-brand-500 transition-transform duration-[420ms] ease-[cubic-bezier(0.22,0.61,0.36,1)]"
            style={{ transform: `scaleX(${m.pct / 100})` }}
          />
        </span>

        <span className="flex shrink-0 items-center gap-x-4 gap-y-1 text-[12px] text-fg-mute">
          <span className="inline-flex items-center gap-1.5">
            <Repeat2 size={13} className="text-fg-mute/70" />
            <b className="font-bold text-fg-dim tnum">{m.actRec.length}</b>
            recorrentes
          </span>
          <span className="inline-flex items-center gap-1.5">
            <CalendarDays size={13} className="text-fg-mute/70" />
            <b className="font-bold text-fg-dim tnum">{m.evToday.length}</b>
            na agenda
          </span>
          {/* Contas da semana entram aqui porque a faixa é o resumo do dia, e
              vencimento é a pendência que dói se passar batido. */}
          {m.soon.length > 0 && (
            <span className="inline-flex items-center gap-1.5">
              <Wallet size={13} className="text-fg-mute/70" />
              <b className="font-bold text-fg-dim tnum">{m.soon.length}</b>
              vencendo
            </span>
          )}
          {/* Atrasada em vermelho e por último: é o que se quer ver primeiro
              justamente por ser o que não devia estar aí. */}
          {m.lateT.length > 0 && (
            <span className="inline-flex items-center gap-1.5 text-neg">
              <AlertCircle size={13} />
              <b className="font-bold tnum">{m.lateT.length}</b>
              atrasada{m.lateT.length === 1 ? "" : "s"}
            </span>
          )}
        </span>
      </div>

      {/* ------------------------------ hoje ------------------------------ */}
      <div>
        <Card className="flex flex-col">
          <Head icon={<ListChecks size={14} />} title="Hoje" href="/demandas" link="ver todas" />
          <div className="flex flex-1 flex-col px-[18px] pb-[18px] pt-3">
            {/* O número e a barra saíram: são os mesmos da faixa acima. Este
                cartão passa a ser só a lista e o campo de adicionar. */}
            <form onSubmit={quickAdd} className="flex gap-2.5">
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
              {m.doDia.length === 0 ? (
                <Ghost>Nada pra hoje. Adicione acima.</Ghost>
              ) : (
                m.doDia
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
                        <span className="mt-0.5 flex items-center gap-1.5 text-[11.5px] font-normal text-fg-mute">
                          {/*
                            Diz qual é a atrasada.
                            
                            Elas passaram a entrar nesta lista para ficarem à
                            vista, e sem marca ficavam idênticas às de hoje —
                            "1 atrasada" na faixa acima sem dizer qual. O
                            prazo entra junto: saber que passou não é saber de
                            quanto.
                          */}
                          {t.due_date && daysUntil(t.due_date) < 0 && (
                            <span className="inline-flex items-center gap-1 font-semibold text-neg">
                              <AlertCircle size={11} />
                              atrasada · {dateBR(t.due_date).slice(0, 5)}
                            </span>
                          )}
                          {t.client && <span className="truncate">{t.client}</span>}
                        </span>
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
          {/* "O que vem", e não "Demandas abertas": as abertas de hoje e as
              atrasadas já estão no cartão acima, e ler as duas listas do mesmo
              lugar fazia quatro das cinco linhas se repetirem na tela. */}
          <Head icon={<CalendarClock size={14} />} title="O que vem" href="/demandas" link="ver quadro" />
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
              {/* A contagem de atrasadas saiu: ela vive na faixa do topo, e
                  repetida aqui era a terceira aparição do mesmo número. */}
            </div>
            <div className="flex flex-col">
              {[...m.depois, ...m.semPrazo].length === 0 ? (
                <Ghost>
                  {m.doDia.length
                    ? "Nada além de hoje."
                    : "Nenhuma demanda aberta."}
                </Ghost>
              ) : (
                [...m.depois, ...m.semPrazo].map((t) => (
                    <Row key={t.id}>
                      <span className={cx("h-[7px] w-[7px] shrink-0 rounded-full", PRIO_DOT[t.priority])} />
                      <span className="min-w-0 flex-1 text-sm font-medium">
                        <span className="block truncate">{t.title}</span>
                        <span className="mt-0.5 block text-[11.5px] font-normal text-fg-mute">
                          {STATUS_LABEL[t.status]}
                          {t.client && ` · ${t.client}`}
                        </span>
                      </span>
                      {/* Sem prazo é informação, não ausência dela: a demanda
                          sem data é justamente a que some de vista. */}
                      <span
                        className={cx(
                          "shrink-0 text-[11.5px] font-semibold tnum",
                          t.due_date ? "text-fg-mute" : "text-fg-mute/60"
                        )}
                      >
                        {t.due_date
                          ? dateBR(t.due_date).slice(0, 5)
                          : "sem prazo"}
                      </span>
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
                  {/*
                    O texto por trás das tags.
                    
                    `content` guarda HTML desde que a anotação virou editor de
                    blocos, e este cartão mostrava a marcação crua na tela —
                    "<ul><li><p><strong>|&nbsp;TDAH..." em vez do texto.
                    `textoDaNota` é a mesma função que a busca usa.
                  */}
                  {textoDaNota(n.content) && (
                    <p className="mt-1 line-clamp-2 text-[11.5px] leading-relaxed text-fg-mute">
                      {textoDaNota(n.content)}
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
                {brl(m.totalMes)}
              </b>
              <span className="text-xs text-fg-mute">em {nomeMes}</span>
            </div>
            <p className="mt-1 text-[11.5px] text-fg-mute">
              <span className="font-bold text-fg-dim tnum">
                {brl(m.abertoMes)}
              </span>{" "}
              ainda em aberto
            </p>
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

      {/* ------------------------ leitura + referências ------------------------ */}
      {/*
        Duas abas que o painel ignorava.
        
        A estante e as referências existem há semanas e o Início nunca soube
        delas: um livro em 78% e uma parede de referências não apareciam em
        lugar nenhum da tela de entrada. Só aparecem quando têm o que mostrar —
        cartão vazio em painel é espaço morto.
      */}
      {(lendo.length > 0 || refs.length > 0) && (
        <div className="mt-4 grid gap-4 xl:grid-cols-[minmax(0,1fr)_minmax(0,1.35fr)]">
          {lendo.length > 0 && (
            <Card>
              <Head
                icon={<BookOpen size={14} />}
                title="Lendo agora"
                href="/leitura"
                link="estante"
              />
              <div className="flex flex-col px-[18px] pb-[18px] pt-3">
                {lendo.slice(0, 2).map((l) => {
                  const pct =
                    l.total_pages && l.total_pages > 0
                      ? Math.min(
                          100,
                          Math.round((l.current_page / l.total_pages) * 100)
                        )
                      : null;
                  return (
                    <Link
                      key={l.id}
                      href="/leitura"
                      className="group flex items-center gap-3 border-b border-line-soft py-2.5 last:border-0"
                    >
                      {/* 2:3 fixo, como na estante: sem trava, capa alta e
                          capa baixa fariam as duas linhas dançarem. */}
                      <span className="relative block aspect-[2/3] w-[38px] shrink-0 overflow-hidden rounded-md bg-ink-800">
                        {l.cover_url ? (
                          // eslint-disable-next-line @next/next/no-img-element
                          <img
                            src={l.cover_url}
                            alt=""
                            loading="lazy"
                            className="h-full w-full object-cover"
                          />
                        ) : (
                          <span className="grid h-full w-full place-items-center text-brand-400/40">
                            <BookOpen size={14} />
                          </span>
                        )}
                      </span>

                      <span className="min-w-0 flex-1">
                        <span className="block truncate text-[13px] font-semibold group-hover:text-brand-400">
                          {l.title}
                        </span>
                        {l.authors && (
                          <span className="mt-0.5 block truncate text-[11px] text-fg-mute">
                            {l.authors}
                          </span>
                        )}
                        {pct !== null && (
                          <span className="mt-1.5 flex items-center gap-2">
                            <span className="h-1 min-w-[40px] flex-1 overflow-hidden rounded-full bg-ink-800">
                              <span
                                className="block h-full w-full origin-left rounded-full bg-brand-500 transition-transform duration-300"
                                style={{ transform: `scaleX(${pct / 100})` }}
                              />
                            </span>
                            <span className="shrink-0 text-[10.5px] font-bold text-fg-mute tnum">
                              pág {l.current_page}
                              {l.total_pages ? ` de ${l.total_pages}` : ""}
                            </span>
                          </span>
                        )}
                      </span>
                    </Link>
                  );
                })}
              </div>
            </Card>
          )}

          {refs.length > 0 && (
            <Card>
              <Head
                icon={<Library size={14} />}
                title="Referências recentes"
                href="/referencias"
                link="ver todas"
              />
              <div className="px-[18px] pb-[18px] pt-3">
                {/*
                  Miniaturas, não linhas de texto.
                  
                  Referência é o que se reconhece de olho — o nome dela diz
                  muito menos que a imagem. Por isso aqui é a única parte do
                  painel que é imagem e não lista.
                */}
                <div className="grid grid-cols-3 gap-2 sm:grid-cols-4">
                  {refs.slice(0, 4).map((r) => (
                    <Link
                      key={r.id}
                      href="/referencias"
                      title={r.name}
                      className="group block"
                    >
                      <span className="relative block aspect-[4/3] w-full overflow-hidden rounded-[10px] bg-ink-800">
                        {r.image_url ? (
                          // eslint-disable-next-line @next/next/no-img-element
                          <img
                            src={r.image_url}
                            alt=""
                            loading="lazy"
                            className="h-full w-full object-cover transition-transform duration-300 group-hover:scale-[1.04]"
                          />
                        ) : (
                          <span className="grid h-full w-full place-items-center text-brand-400/40">
                            <Library size={16} />
                          </span>
                        )}
                      </span>
                      <span className="mt-1.5 block truncate text-[11px] font-medium text-fg-dim group-hover:text-brand-400">
                        {r.name}
                      </span>
                    </Link>
                  ))}
                </div>
              </div>
            </Card>
          )}
        </div>
      )}

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


/* ícone de nota sem puxar outro import do lucide */
const StickyIcon = () => (
  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <path d="M15 3H6a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h9l5-5V5a2 2 0 0 0-2-2Z" />
    <path d="M15 21v-4a1 1 0 0 1 1-1h4" />
  </svg>
);
