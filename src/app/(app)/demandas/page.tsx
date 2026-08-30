"use client";

import * as React from "react";
import Link from "next/link";
import {
  AlertCircle,
  ArrowRight,
  Building2,
  CalendarDays,
  Info,
  ListChecks,
  Pencil,
  Plus,
  Repeat2,
  Search,
  Trash2,
} from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { currentUserId, SESSION_EXPIRED } from "@/lib/session";
import {
  FREQUENCY_LABEL,
  PRIORITY_LABEL,
  STATUS_LABEL,
  WEEKDAYS,
  WEEKDAYS_SIGLA,
  type Frequency,
  type Priority,
  type Task,
  type TaskStatus,

  type TaskItem,
} from "@/lib/types";
import { dateBR, daysUntil, todayISO } from "@/lib/format";
import { HORAS_RETENCAO } from "@/lib/limpeza";
import { frequencyDescription } from "@/lib/recurring";
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
  Textarea,
  useConfirm,
  useNotice,
  cx,
} from "@/components/ui";
import {
  EditorChecklist,
  ListaDeItens,
  ProgressoChecklist,
} from "@/components/Checklist";

const COLUMNS: TaskStatus[] = ["todo", "doing", "review", "done"];
const PRIORITIES: Priority[] = ["low", "medium", "high", "urgent"];
const RANK: Record<Priority, number> = { urgent: 0, high: 1, medium: 2, low: 3 };

const TONE: Record<Priority, "neutral" | "brand" | "warn" | "neg"> = {
  low: "neutral",
  medium: "brand",
  high: "warn",
  urgent: "neg",
};

const FREQS: Frequency[] = [
  "daily",
  "weekly",
  "biweekly",
  "monthly",
  "quarterly",
  "yearly",
];

const blank = () => ({
  title: "",
  description: "",
  client: "",
  priority: "medium" as Priority,
  status: "todo" as TaskStatus,
  due_date: "",
  // recorrencia: quando marcada, a demanda passa a ser uma regra que se repete
  recurring: false,
  frequency: "weekly" as Frequency,
  weekday: new Date().getDay(),
  weekdays: [new Date().getDay()] as number[],
  day_of_month: new Date().getDate(),
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
  /* Itens de checklist agrupados por demanda. */
  const [itens, setItens] = React.useState<Record<string, TaskItem[]>>({});
  const [marcando, setMarcando] = React.useState<string | null>(null);
  /* Títulos do checklist em edição: da demanda, ou o modelo da regra. */
  const [checklist, setChecklist] = React.useState<string[]>([]);
  const today = todayISO();
  const confirm = useConfirm();
  const notice = useNotice();

  const load = React.useCallback(async () => {
    /*
     * As duas leituras em paralelo, e a dos itens tolerando falha.
     *
     * Se SUBTAREFAS.sql ainda não rodou, a consulta de task_items erra e o
     * checklist simplesmente não aparece — o quadro continua funcionando. Um
     * erro ali não pode derrubar a página inteira.
     */
    const [t, i] = await Promise.all([
      supabase.from("tasks").select("*").order("created_at", { ascending: false }),
      supabase.from("task_items").select("*").order("position"),
    ]);

    setRows((t.data as Task[]) ?? []);

    const porDemanda: Record<string, TaskItem[]> = {};
    ((i.data as TaskItem[]) ?? []).forEach((item) => {
      (porDemanda[item.task_id] ??= []).push(item);
    });
    setItens(porDemanda);
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
      recurring: false,
      frequency: "weekly",
      weekday: new Date().getDay(),
      weekdays: [new Date().getDay()] as number[],
      day_of_month: new Date().getDate(),
    });
    setChecklist((itens[t.id] ?? []).map((i) => i.title));
    setErr("");
    setOpen(true);
  };

  const save = async (e: React.FormEvent) => {
    e.preventDefault();
    setErr("");
    if (!form.title.trim()) return setErr("Informe o título da demanda.");

    /*
     * O campo Status é o outro caminho para "concluída", e vale a mesma regra.
     *
     * Aqui a checagem é sobre o checklist EM EDIÇÃO, não sobre o gravado: se a
     * pessoa acabou de marcar tudo na tela, o gravado ainda está desatualizado.
     */
    if (form.status === "done" && checklist.length) {
      const feitos = (itens[editing?.id ?? ""] ?? []).filter((i) => i.done).length;
      if (feitos < checklist.length)
        return setErr(
          `Faltam ${checklist.length - feitos} ${
            checklist.length - feitos === 1 ? "item" : "itens"
          } do checklist. Marque tudo antes de concluir a demanda.`
        );
    }

    setBusy(true);

    const base = {
      title: form.title.trim(),
      description: form.description.trim(),
      client: form.client.trim(),
      priority: form.priority,
    };

    if (editing) {
      const { error } = await supabase
        .from("tasks")
        .update({
          ...base,
          status: form.status,
          due_date: form.due_date || null,
          /*
           * Preserva a conclusão original.
           *
           * Marcar `new Date()` aqui reescrevia a data de conclusão a cada
           * edição: além de perder quando a demanda foi de fato concluída, a
           * janela de 24h da limpeza reiniciava, e editar de vez em quando
           * mantinha a demanda viva para sempre.
           */
          completed_at:
            form.status === "done"
              ? (editing.completed_at ?? new Date().toISOString())
              : null,
        })
        .eq("id", editing.id);
      if (error) {
        setBusy(false);
        return setErr(error.message);
      }

      const uidEdit = await currentUserId(supabase);
      if (uidEdit && !(await salvarChecklist(editing.id, checklist, uidEdit))) {
        setBusy(false);
        return;
      }

      setBusy(false);
      setOpen(false);
      return load();
    }

    const uid = await currentUserId(supabase);
    if (!uid) {
      setBusy(false);
      return setErr(SESSION_EXPIRED);
    }

    /*
     * Demanda recorrente: cria a regra e já materializa a ocorrência de hoje.
     *
     * Sem gerar agora, a regra ficaria invisível até cair a próxima data —
     * a pessoa marca "repetir", salva, e nada aparece. Gravar last_run_on
     * como hoje evita que o dashboard gere uma segunda cópia ao abrir.
     */
    if (form.recurring) {
      const weekly = form.frequency === "weekly" || form.frequency === "biweekly";
      const monthly = ["monthly", "quarterly", "yearly"].includes(form.frequency);

      const { data: rule, error: ruleError } = await supabase
        .from("recurring_tasks")
        .insert({
          ...base,
          user_id: uid,
          frequency: form.frequency,
          /*
           * `weekday` segue sendo gravado: é o que as regras antigas usam e o
           * que o quinzenal continua lendo. No semanal ele fica com o primeiro
           * dia marcado, então uma regra criada aqui funciona igual num banco
           * sem a migração de vários dias.
           */
          weekday: weekly
            ? form.frequency === "weekly"
              ? Math.min(...form.weekdays)
              : Number(form.weekday)
            : null,
          /*
           * A coluna de vários dias só entra quando há mais de um.
           *
           * Vem de DIAS-DA-SEMANA.sql. Mandá-la sempre faria toda demanda
           * recorrente falhar num banco onde a migração não rodou, inclusive as
           * de um dia só, que funcionam sem ela.
           */
          ...(form.frequency === "weekly" && form.weekdays.length > 1
            ? { weekdays: form.weekdays }
            : {}),
          day_of_month: monthly
            ? Math.min(31, Math.max(1, Number(form.day_of_month) || 1))
            : null,
          active: true,
          last_run_on: today,
          /* O modelo só entra quando há itens: sem a migração, mandá-lo faria
             toda recorrente falhar, inclusive as sem checklist. */
          ...(checklist.length ? { checklist } : {}),
        })
        .select("id")
        .single();

      if (ruleError || !rule) {
        setBusy(false);
        /* PGRST204/42703: a coluna de vários dias não existe no banco ainda. */
        if (ruleError && /weekdays/.test(ruleError.message))
          return setErr(
            "Vários dias da semana precisa de supabase/DIAS-DA-SEMANA.sql no banco. Rode o arquivo ou deixe um dia só marcado."
          );
        if (ruleError && /checklist/.test(ruleError.message))
          return setErr(
            "Checklist precisa de supabase/SUBTAREFAS.sql no banco. Rode o arquivo ou deixe a lista vazia."
          );
        return setErr(ruleError?.message ?? "Não foi possível criar a recorrência.");
      }

      const { data: hoje1, error: taskError } = await supabase
        .from("tasks")
        .insert({
          ...base,
          user_id: uid,
          status: "todo",
          due_date: today,
          origin_id: rule.id,
        })
        .select("id")
        .single();

      if (taskError) {
        setBusy(false);
        return setErr(taskError.message);
      }

      /* A ocorrência de hoje já nasce com os itens do modelo. */
      if (hoje1 && checklist.length)
        await supabase.from("task_items").insert(
          checklist.map((title, i) => ({
            user_id: uid,
            task_id: hoje1.id,
            title,
            position: i,
          }))
        );

      setBusy(false);
      setOpen(false);
      return load();
    }

    const { data: criada, error } = await supabase
      .from("tasks")
      .insert({
      ...base,
      user_id: uid,
      status: form.status,
      due_date: form.due_date || null,
      completed_at: form.status === "done" ? new Date().toISOString() : null,
    })
      .select("id")
      .single();
    setBusy(false);
    if (error) return setErr(error.message);

    if (criada && checklist.length)
      await supabase.from("task_items").insert(
        checklist.map((title, idx) => ({
          user_id: uid,
          task_id: criada.id,
          title,
          position: idx,
        }))
      );

    setOpen(false);
    load();
  };

  /**
   * Grava o checklist de uma demanda, preservando o que já está marcado.
   *
   * Casa por posição em vez de apagar tudo e reinserir: recriar zeraria o
   * `done` de itens já concluídos, e editar o título do item 3 apagaria o
   * progresso dos outros quatro.
   *
   * Devolve false se falhou.
   */
  const salvarChecklist = async (taskId: string, titulos: string[], uid: string) => {
    const atuais = itens[taskId] ?? [];
    const limpos = titulos.map((t) => t.trim()).filter(Boolean);

    const renomear = limpos
      .slice(0, atuais.length)
      .map((titulo, i) => ({ id: atuais[i].id, titulo }))
      .filter((x, i) => atuais[i].title !== x.titulo);

    const novos = limpos.slice(atuais.length).map((title, i) => ({
      user_id: uid,
      task_id: taskId,
      title,
      position: atuais.length + i,
    }));

    const sobrando = atuais.slice(limpos.length).map((i) => i.id);

    const erros = await Promise.all([
      ...renomear.map((x) =>
        supabase.from("task_items").update({ title: x.titulo }).eq("id", x.id)
      ),
      novos.length
        ? supabase.from("task_items").insert(novos)
        : Promise.resolve({ error: null }),
      sobrando.length
        ? supabase.from("task_items").delete().in("id", sobrando)
        : Promise.resolve({ error: null }),
    ]);

    const falhou = erros.find((r) => r && "error" in r && r.error);
    if (falhou && "error" in falhou && falhou.error) {
      /* PGRST205: SUBTAREFAS.sql ainda não rodou. */
      setErr(
        /task_items/.test(falhou.error.message)
          ? "Checklist precisa de supabase/SUBTAREFAS.sql no banco. Rode o arquivo ou deixe a lista vazia."
          : falhou.error.message
      );
      return false;
    }
    return true;
  };

  /**
   * Quantos itens do checklist ainda faltam.
   *
   * Uma função só, usada por todos os caminhos que mudam status: o botão de
   * avançar, o arrastar entre colunas e o campo Status do formulário. Se a
   * regra morasse em um deles, os outros dois viravam porta dos fundos.
   */
  const faltamNoChecklist = (taskId: string) =>
    (itens[taskId] ?? []).filter((i) => !i.done).length;

  /**
   * Marca ou desmarca um item, direto no cartão.
   *
   * Atualiza o estado local antes da resposta do banco: o ciclo diário é fazer
   * um corte e marcar, e esperar a ida de rede a cada clique tornaria o
   * checklist mais lento que o trabalho que ele acompanha.
   */
  const alternarItem = async (item: TaskItem) => {
    const novo = !item.done;
    setMarcando(item.id);
    setItens((m) => ({
      ...m,
      [item.task_id]: (m[item.task_id] ?? []).map((i) =>
        i.id === item.id ? { ...i, done: novo } : i
      ),
    }));
    const { error } = await supabase
      .from("task_items")
      .update({ done: novo })
      .eq("id", item.id);
    setMarcando(null);
    if (notice.check(error, "marcar o item")) load();
  };

  /** Marca todos os itens da demanda como feitos. */
  const concluirItens = async (taskId: string) => {
    const abertos = (itens[taskId] ?? []).filter((i) => !i.done);
    if (!abertos.length) return true;
    const { error } = await supabase
      .from("task_items")
      .update({ done: true })
      .in("id", abertos.map((i) => i.id));
    return !notice.check(error, "concluir os itens");
  };

  /**
   * Grava a mudança de status. Sem regra nenhuma — a regra fica em `move`.
   *
   * Separado porque, depois de concluir os itens em massa, o estado local ainda
   * está velho: chamar `move` de novo cairia na mesma verificação e abriria o
   * aviso outra vez, em laço.
   */
  const aplicarStatus = async (t: Task, status: TaskStatus) => {
    setRows((r) => r.map((x) => (x.id === t.id ? { ...x, status } : x)));
    const { error } = await supabase
      .from("tasks")
      .update({
        status,
        completed_at: status === "done" ? new Date().toISOString() : null,
      })
      .eq("id", t.id);
    notice.check(error, "mover a demanda");
    load();
  };

  const move = async (t: Task, status: TaskStatus) => {
    if (t.status === status) return;

    /*
     * Concluir exige o checklist inteiro feito.
     *
     * Em vez de só recusar, oferece o atalho: quem terminou os cinco cortes e
     * não marcou nenhum quer concluir tudo, não voltar e clicar cinco vezes.
     * Cancelar não muda nada.
     */
    const faltam = status === "done" ? faltamNoChecklist(t.id) : 0;
    if (faltam > 0) {
      confirm.ask(
        `"${t.title}" tem ${faltam} ${
          faltam === 1 ? "item" : "itens"
        } do checklist em aberto. Concluir ${
          faltam === 1 ? "ele" : "eles"
        } e a demanda?`,
        async () => {
          if (await concluirItens(t.id)) await aplicarStatus(t, status);
        },
        {
          titulo: "Concluir a demanda",
          rotulo: "Concluir tudo",
          variante: "primary",
        }
      );
      return;
    }

    await aplicarStatus(t, status);
  };

  const remove = (t: Task) =>
    confirm.ask(`Excluir "${t.title}"?`, async () => {
      const { error } = await supabase.from("tasks").delete().eq("id", t.id);
      if (!notice.check(error, "excluir a demanda")) load();
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
        <div className="flex flex-wrap items-center gap-2">
          {/* Atalho para as regras. Sem ele a página de recorrentes só era
              alcançável pela URL: ela saiu do menu da esquerda a pedido, mas
              continua sendo onde se pausa, edita e gera na hora. */}
          <Link href="/recorrentes">
            <Button>
              <Repeat2 size={15} />
              Gerenciar recorrentes
            </Button>
          </Link>
          <Button variant="primary" onClick={() => startNew()}>
            <Plus size={15} />
            Nova demanda
          </Button>
        </div>
      </div>

      {/* A remoção automática precisa estar escrita: sem isso, a demanda
          desaparece do quadro e parece que o app perdeu o dado. */}
      <p className="mb-4 flex items-center gap-2 text-[12px] text-fg-mute">
        <Info size={13} className="shrink-0" />
        Demandas concluídas são removidas {HORAS_RETENCAO}h depois.
      </p>

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
        null
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
                        itens={itens[t.id] ?? []}
                        onAlternarItem={alternarItem}
                        marcando={marcando}
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
                      <div className="flex items-center justify-end gap-1 transition-opacity lg:opacity-0 lg:group-hover:opacity-100 lg:focus-within:opacity-100">
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

          <Field
            label="Checklist"
            hint={
              form.recurring
                ? "Vira o modelo da recorrência: cada dia nasce com estes itens desmarcados."
                : "A demanda só vai para Concluída com todos marcados."
            }
          >
            <EditorChecklist
              itens={checklist}
              onChange={setChecklist}
              /* Só ao editar existe item gravado para marcar. */
              salvos={editing ? (itens[editing.id] ?? []) : []}
              onAlternar={alternarItem}
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

          {/* Prazo e status só fazem sentido em demanda avulsa: numa recorrente
              quem manda na data é a frequência, e ela sempre nasce "a fazer". */}
          {!form.recurring && (
            <div className="grid gap-4 sm:grid-cols-2">
              <Field label="Prazo">
                <Input
                  type="date"
                  value={form.due_date}
                  onChange={(e) => setForm({ ...form, due_date: e.target.value })}
                />
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
          )}

          {editing?.origin_id && (
            <p className="rounded-[14px] bg-brand-500/10 px-3.5 py-3 text-xs text-brand-400">
              Esta demanda foi gerada por uma recorrência. Editar aqui muda só
              esta ocorrência —{" "}
              <Link href="/recorrentes" className="font-semibold underline">
                abra a regra
              </Link>{" "}
              para mudar todas as próximas.
            </p>
          )}

          {!editing && (
            <div className="rounded-[14px] bg-ink-800 p-3.5">
              <label className="flex cursor-pointer items-start gap-2.5">
                <input
                  type="checkbox"
                  checked={form.recurring}
                  onChange={(e) =>
                    setForm({ ...form, recurring: e.target.checked })
                  }
                  className="mt-0.5 h-4 w-4 accent-[var(--a)]"
                />
                <span className="text-sm text-fg-dim">
                  <span className="font-semibold text-fg">Demanda recorrente</span>
                  <span className="mt-0.5 block text-[11.5px] text-fg-mute">
                    Cria a regra e já lança a demanda de hoje. Depois ela volta
                    sozinha em cada data.
                  </span>
                </span>
              </label>

              {form.recurring && (
                <div className="mt-3.5 grid gap-4 border-t border-line-soft pt-3.5 sm:grid-cols-2">
                  <Field label="Frequência">
                    <Select
                      value={form.frequency}
                      onChange={(e) =>
                        setForm({
                          ...form,
                          frequency: e.target.value as Frequency,
                        })
                      }
                    >
                      {FREQS.map((f) => (
                        <option key={f} value={f}>
                          {FREQUENCY_LABEL[f]}
                        </option>
                      ))}
                    </Select>
                  </Field>

                  {form.frequency === "weekly" && (
                    <Field
                      label="Dias da semana"
                      hint={
                        form.weekdays.length > 1
                          ? "A demanda volta em cada dia marcado."
                          : undefined
                      }
                    >
                      {/*
                        Caixinhas em vez de um select: com vários dias, um
                        select múltiplo esconde o que está escolhido atrás de
                        uma rolagem. Aqui os sete dias e o que está marcado se
                        leem de uma vez, no mesmo formato das bolinhas de
                        hábitos.
                      */}
                      <div className="flex gap-1">
                        {WEEKDAYS_SIGLA.map((sigla, i) => {
                          const marcado = form.weekdays.includes(i);
                          return (
                            <button
                              key={i}
                              type="button"
                              aria-label={WEEKDAYS[i]}
                              aria-pressed={marcado}
                              onClick={() =>
                                setForm({
                                  ...form,
                                  /*
                                    Nunca deixa ficar sem nenhum: uma regra
                                    semanal sem dia não dispararia nunca, e a
                                    tela não teria como avisar disso.
                                  */
                                  weekdays: marcado
                                    ? form.weekdays.length > 1
                                      ? form.weekdays.filter((d) => d !== i)
                                      : form.weekdays
                                    : [...form.weekdays, i].sort((a, b) => a - b),
                                })
                              }
                              className={cx(
                                "h-9 flex-1 rounded-[12px] text-[12.5px] font-bold transition-colors",
                                marcado
                                  ? "bg-brand-500 text-on-brand"
                                  : "bg-ink-800 text-fg-mute hover:text-fg-dim"
                              )}
                            >
                              {sigla}
                            </button>
                          );
                        })}
                      </div>
                    </Field>
                  )}

                  {form.frequency === "biweekly" && (
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

                  {["monthly", "quarterly", "yearly"].includes(
                    form.frequency
                  ) && (
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
                          setForm({
                            ...form,
                            day_of_month: Number(e.target.value),
                          })
                        }
                      />
                    </Field>
                  )}

                  <p className="text-[11.5px] text-fg-mute sm:col-span-2">
                    {frequencyDescription({
                      frequency: form.frequency,
                      weekday: form.weekday,
                      weekdays: form.weekdays,
                      day_of_month: form.day_of_month,
                    })}
                    .
                  </p>
                </div>
              )}
            </div>
          )}

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

/* ------------------------------ card do quadro ------------------------------ */

function TaskCard({
  t,
  itens,
  onAlternarItem,
  marcando,
  onDragStart,
  onEdit,
  onDelete,
  onAdvance,
}: {
  t: Task;
  itens: TaskItem[];
  onAlternarItem: (i: TaskItem) => void;
  marcando: string | null;
  onDragStart: () => void;
  onEdit: () => void;
  onDelete: () => void;
  onAdvance: () => void;
}) {
  const feitos = itens.filter((i) => i.done).length;
  const late = t.status !== "done" && t.due_date && daysUntil(t.due_date) < 0;
  const isToday = t.due_date?.slice(0, 10) === todayISO();

  return (
    <div
      draggable
      onDragStart={onDragStart}
      className="group cursor-grab rounded-xl border border-line bg-ink-850 p-3 transition-colors hover:border-ink-600 active:cursor-grabbing"
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
        <div className="flex shrink-0 items-center gap-0.5 transition-opacity lg:opacity-0 lg:group-hover:opacity-100">
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

      {/*
        Checklist no próprio cartão, com o progresso acima.

        Marcar é um clique, sem abrir modal e sem salvar: o ciclo real é fazer
        um corte e riscar. Se exigisse editar a demanda, o checklist viraria
        trabalho em vez de atalho.
      */}
      {itens.length > 0 && (
        <div className="mt-2">
          <ProgressoChecklist feitos={feitos} total={itens.length} />
          <ListaDeItens
            itens={itens}
            onAlternar={onAlternarItem}
            ocupado={marcando}
          />
        </div>
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
