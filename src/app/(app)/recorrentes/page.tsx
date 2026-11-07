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
import { currentUserId, SESSION_EXPIRED } from "@/lib/session";
import { NADA_GRAVADO, nenhumaLinha } from "@/lib/erros";
import {
  FREQUENCY_LABEL,
  PRIORITY_LABEL,
  WEEKDAYS,
  WEEKDAYS_SIGLA,
  type Cliente,
  type Frequency,
  type Priority,
  type Projeto,
  type RecurringTask,
} from "@/lib/types";
import { dateBR, todayISO } from "@/lib/format";
import { EditorLinks, limparLinks } from "@/components/Links";
import { EditorChecklist, type ItemEmEdicao } from "@/components/Checklist";
import { camposDaRegra, criarRecorrencia, recadoDoErro } from "@/lib/criarRecorrencia";
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
  Textarea,
  useConfirm,
  useNotice,
  cx,
  EsqueletoLista,
} from "@/components/ui";
import { MenuSuspenso } from "@/components/MenuSuspenso";

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
  cliente_id: "",
  projeto_id: "",
  links: [] as string[],
  priority: "medium" as Priority,
  frequency: "weekly" as Frequency,
  /* Começa no dia de hoje: quem cria na terça quase sempre quer a terça. */
  weekday: new Date().getDay(),
  weekdays: [new Date().getDay()] as number[],
  day_of_month: new Date().getDate(),
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
  /* O checklist que cada ocorrência recebe (o modelo da regra). */
  const [checklist, setChecklist] = React.useState<ItemEmEdicao[]>([]);
  /* O cadastro de clientes e projetos, para escolher em vez de digitar. */
  const [cadastro, setCadastro] = React.useState<Cliente[]>([]);
  const [projetos, setProjetos] = React.useState<Projeto[]>([]);
  const confirm = useConfirm();
  const notice = useNotice();

  const today = todayISO();

  const load = React.useCallback(async () => {
    const [r, c, p] = await Promise.all([
      supabase.from("recurring_tasks").select("*").order("created_at"),
      supabase.from("clientes").select("*").order("nome"),
      supabase.from("projetos").select("*").order("nome"),
    ]);
    setRows((r.data as RecurringTask[]) ?? []);
    /* Sem CLIENTES.sql as duas consultas falham: fica o campo de texto. */
    setCadastro((c.data as Cliente[]) ?? []);
    setProjetos((p.data as Projeto[]) ?? []);
    setLoading(false);
  }, [supabase]);

  const projetosDoCliente = React.useMemo(
    () =>
      projetos
        .filter((p) => p.cliente_id === form.cliente_id)
        .sort((a, b) => (a.position ?? 0) - (b.position ?? 0) || a.nome.localeCompare(b.nome)),
    [projetos, form.cliente_id]
  );

  /* O nome do cliente da regra: o do cadastro, ou o texto de antes dele. */
  const nomeDoCliente = (r: RecurringTask) => {
    const c = r.cliente_id ? cadastro.find((x) => x.id === r.cliente_id) : undefined;
    const p = r.projeto_id ? projetos.find((x) => x.id === r.projeto_id) : undefined;
    return c ? (p ? `${c.nome} - ${p.nome}` : c.nome) : r.client;
  };

  const startNew = () => {
    setEditing(null);
    setForm(blank());
    setChecklist([]);
    setErr("");
    setOpen(true);
  };

  React.useEffect(() => {
    load();
  }, [load]);

  const startEdit = (r: RecurringTask) => {
    setEditing(r);
    setForm({
      title: r.title,
      description: r.description,
      client: r.client,
      cliente_id: r.cliente_id ?? "",
      projeto_id: r.projeto_id ?? "",
      links: r.links ?? [],
      priority: r.priority,
      frequency: r.frequency,
      weekday: r.weekday ?? 1,
      weekdays:
        r.weekdays && r.weekdays.length ? r.weekdays : [r.weekday ?? 1],
      day_of_month: r.day_of_month ?? 1,
      active: r.active,
    });
    setChecklist((r.checklist ?? []).map((title) => ({ title, done: false })));
    setErr("");
    setOpen(true);
  };

  const save = async (e: React.FormEvent) => {
    e.preventDefault();
    setErr("");
    if (!form.title.trim()) return setErr("Informe o título.");
    setBusy(true);

    /* O texto do cliente vira o retrato do cadastro, como em Nova demanda. */
    const cSel = cadastro.find((c) => c.id === form.cliente_id);
    const pSel = projetos.find((p) => p.id === form.projeto_id);
    const textoCliente = cadastro.length
      ? cSel
        ? pSel
          ? `${cSel.nome} - ${pSel.nome}`
          : cSel.nome
        : ""
      : form.client.trim();
    const links = limparLinks(form.links);
    const itens = checklist.map((i) => i.title.trim()).filter(Boolean);

    if (!editing) {
      const uid = await currentUserId(supabase);
      if (!uid) {
        setBusy(false);
        return setErr(SESSION_EXPIRED);
      }
      const r = await criarRecorrencia(supabase, {
        uid,
        hoje: today,
        dados: {
          title: form.title.trim(),
          description: form.description.trim(),
          client: textoCliente,
          priority: form.priority,
          cliente_id: form.cliente_id || null,
          projeto_id: form.projeto_id || null,
          links,
        },
        regra: {
          frequency: form.frequency,
          weekday: form.weekday,
          weekdays: form.weekdays,
          day_of_month: form.day_of_month,
        },
        checklist: itens.map((title) => ({ title })),
        comCadastro: cadastro.length > 0,
      });
      setBusy(false);
      if ("erro" in r) return setErr(r.erro);
      setOpen(false);
      notice.show(
        r.geradaHoje
          ? `Recorrência criada. A demanda de hoje já está em Demandas.`
          : r.primeira
            ? `Recorrência criada. A primeira demanda sai em ${dateBR(r.primeira).slice(0, 5)}.`
            : "Recorrência criada.",
        "ok"
      );
      return load();
    }

    const payload = {
      title: form.title.trim(),
      description: form.description.trim(),
      client: textoCliente,
      ...(cadastro.length
        ? { cliente_id: form.cliente_id || null, projeto_id: form.projeto_id || null }
        : {}),
      /* O modelo do checklist, só quando a coluna existe (SUBTAREFAS.sql). */
      ...("checklist" in editing ? { checklist: itens.length ? itens : null } : {}),
      /* Sempre presente, inclusive nulo: apagar os campos na tela tem que
         apagar no banco. Se a coluna não existe, a mensagem de erro abaixo diz
         qual arquivo rodar. */
      links: links.length ? links : null,
      priority: form.priority,
      /* frequency, weekday e day_of_month: as mesmas contas da criação. */
      ...camposDaRegra(form),
      active: form.active,
      /* A coluna de vários dias só entra quando há mais de um. Ver o comentário
         equivalente em demandas: sem isso, um banco sem DIAS-DA-SEMANA.sql
         deixaria de aceitar qualquer regra recorrente. */
      /*
       * Mas a regra que JÁ tem a lista precisa recebê-la sempre.
       *
       * Desmarcar dias até sobrar um não gravava nada: a lista só ia no
       * payload com mais de um dia, a do banco ficava como estava — e é ela
       * que manda (`diasDaSemanaDe`), então a regra seguia disparando nos dias
       * desmarcados. Saindo do semanal, a lista é apagada pelo mesmo motivo.
       */
      ...(form.frequency === "weekly" &&
      (form.weekdays.length > 1 || editing?.weekdays != null)
        ? { weekdays: form.weekdays }
        : form.frequency !== "weekly" && editing?.weekdays != null
          ? { weekdays: null }
          : {}),
    };

    let error;
    {
      /*
       * `select("id")` para saber se gravou de verdade.
       *
       * Sem ele, um update que não atinge linha nenhuma volta 204 sem erro: o
       * formulário fecha, a lista recarrega e o valor antigo continua ali sem
       * explicação. Ver NADA_GRAVADO.
       */
      const { data: salvo, error: falha } = await supabase
        .from("recurring_tasks")
        .update(payload)
        .eq("id", editing.id)
        .select("id");
      error = falha;
      if (!falha && !salvo?.length) {
        setBusy(false);
        return setErr(NADA_GRAVADO);
      }
    }
    setBusy(false);
    if (error) return setErr(recadoDoErro(error.message));
    setOpen(false);
    load();
  };

  const toggleActive = async (r: RecurringTask) => {
    /*
     * Retomar começa de hoje, sem cobrar o período pausado.
     *
     * A reposição volta até sete dias para cobrir o app fechado — e via a
     * pausa do mesmo jeito: pausar uma diária por uma semana e retomar
     * despejava até oito demandas atrasadas de uma vez. Marcar ontem como a
     * última geração faz a regra recomeçar a partir de hoje.
     */
    const ontem = new Date(today + "T12:00:00");
    ontem.setDate(ontem.getDate() - 1);
    const ontemISO = ontem.toISOString().slice(0, 10);
    const retomando = !r.active;
    const mudanca = {
      active: !r.active,
      ...(retomando && (!r.last_run_on || r.last_run_on < ontemISO)
        ? { last_run_on: ontemISO }
        : {}),
    };
    setRows((v) => v.map((x) => (x.id === r.id ? { ...x, ...mudanca } : x)));
    const { data: gravadas, error } = await supabase
      .from("recurring_tasks")
      .update(mudanca)
      .eq("id", r.id)
      .select("id");
    /* Recarrega só quando falhou, para desfazer. Recarregar sempre jogaria a
       tabela inteira de volta pela rede e faria a linha piscar — apagando o
       efeito da troca otimista que acabou de acontecer acima. */
    if (notice.check(error ?? nenhumaLinha(gravadas), r.active ? "pausar a recorrência" : "ativar a recorrência"))
      load();
  };

  /** Gera a demanda agora, sem esperar a data. */
  const runNow = async (r: RecurringTask) => {
    const uid = await currentUserId(supabase);
    if (!uid) return notice.show(SESSION_EXPIRED);
    const { data: criada, error } = await supabase
      .from("tasks")
      .insert({
        user_id: uid,
        title: r.title,
        description: r.description,
        client: r.client,
        /* O vínculo com o cadastro, como na geração automática. */
        ...(r.cliente_id ? { cliente_id: r.cliente_id } : {}),
        ...(r.projeto_id ? { projeto_id: r.projeto_id } : {}),
        priority: r.priority,
        status: "todo",
        due_date: today,
        origin_id: r.id,
        ...(r.links?.length ? { links: r.links } : {}),
      })
      .select("id")
      .maybeSingle();

    /*
     * Já existir hoje não é erro: é a resposta certa.
     *
     * `tasks_origin_day_uniq` garante uma demanda por regra por dia, e é ela
     * que impede a duplicata quando o app está aberto em duas abas. Quando o
     * cron das 6h já gerou e alguém aperta "Gerar agora", o banco recusa a
     * segunda cópia — comportamento correto, mas a mensagem que chegava na
     * tela era `duplicate key value violates unique constraint`, jargão de
     * Postgres para algo que cabe em cinco palavras.
     *
     * A manutenção diária já tratava este código; aqui ele escapava.
     */
    const jaExistia = error?.code === "23505";
    if (error && !jaExistia)
      return notice.show(`Não foi possível gerar a demanda: ${error.message}`);

    /*
     * A ocorrência nasce com os itens do modelo — e não nascia.
     *
     * A geração automática cria o checklist junto, e criar a regra pela tela
     * de Demandas também. Só este caminho não criava: quem apertava "Gerar
     * agora" recebia a demanda vazia e tinha de digitar os cinco itens à mão,
     * sem nada indicando por que daquela vez veio diferente.
     *
     * Falha aqui não desfaz a demanda, pela mesma razão que na manutenção: ela
     * existe e vale mais sem checklist do que não existir.
     */
    const modelo = r.checklist ?? [];
    if (!jaExistia && criada?.id && modelo.length)
      await supabase.from("task_items").insert(
        modelo.map((title, i) => ({
          user_id: uid,
          task_id: criada.id,
          title,
          position: i,
        }))
      );

    /*
     * `last_run_on` é o que impede a duplicata: a manutenção diária olha essa
     * data para decidir se já gerou hoje. O erro dela era descartado, então
     * uma falha aqui passava por sucesso e a mesma demanda voltaria sozinha
     * mais tarde — com a pessoa sem motivo para desconfiar.
     *
     * Marca também quando a demanda já existia: se existe, a regra rodou hoje,
     * e deixar a data para trás faria a manutenção tentar de novo mais tarde e
     * bater na mesma trava.
     */
    const { data: marcou, error: erroMarca } = await supabase
      .from("recurring_tasks")
      .update({ last_run_on: today })
      .eq("id", r.id)
      .select("id");
    notice.show(
      jaExistia
        ? `"${r.title}" já tinha sido gerada hoje — está em Demandas.`
        : erroMarca || !marcou?.length
          ? `"${r.title}" foi criada em Demandas, mas não consegui marcar a recorrência como já gerada hoje — ela pode gerar de novo. Recarregue e confira.`
          : `"${r.title}" foi criada em Demandas.`,
      jaExistia ? "info" : erroMarca || !marcou?.length ? "erro" : "ok"
    );
    load();
  };

  const remove = (r: RecurringTask) =>
    confirm.ask(
      `Excluir a recorrência "${r.title}"? As demandas já geradas continuam em Demandas.`,
      async () => {
        const { data: saiu, error } = await supabase
          .from("recurring_tasks")
          .delete()
          .eq("id", r.id)
          .select("id");
        if (notice.check(error, "excluir a recorrência")) return;
        if (!saiu?.length) return notice.show(NADA_GRAVADO);
        setRows((v) => v.filter((x) => x.id !== r.id));
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
          <h1 className="titulo-pagina">
            Demandas recorrentes
          </h1>
          <p className="mt-1 text-sm text-fg-mute">
            {activeCount} ativa{activeCount === 1 ? "" : "s"} · a demanda volta
            sozinha em cada data.
          </p>
        </div>
        {/* Abre o painel aqui mesmo. Era um link para Demandas: o clique
            levava de volta para lá sem abrir painel nenhum. */}
        <Button variant="primary" onClick={startNew}>
          <Plus size={15} />
          Nova demanda recorrente
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
        <div className="card p-4"><EsqueletoLista linhas={4} /></div>
      ) : view.length === 0 ? (
        <Card>
          <Empty
            icon={<Repeat2 size={18} />}
            title={rows.length ? "Nada neste filtro" : "Nenhuma recorrência"}
            sub={
              rows.length
                ? "Troque o filtro para ver as outras."
                : "Crie uma demanda que volta sozinha toda semana, todo mês ou na frequência que quiser."
            }
            action={
              !rows.length ? (
                <Button variant="primary" size="sm" onClick={startNew}>
                  <Plus size={14} />
                  Nova demanda recorrente
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
                  <div className="-mr-1 -mt-0.5 shrink-0 transition-opacity lg:opacity-0 lg:group-hover:opacity-100 lg:focus-within:opacity-100">
                    <MenuSuspenso
                      rotulo={`Ações de ${r.title}`}
                      itens={[
                        { rotulo: "Editar", icone: <Pencil size={14} />, aoEscolher: () => startEdit(r) },
                        {
                          rotulo: "Excluir",
                          icone: <Trash2 size={14} />,
                          aoEscolher: () => remove(r),
                          perigo: true,
                        },
                      ]}
                    />
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
                  {nomeDoCliente(r) && (
                    <span className="inline-flex items-center gap-1 text-[10px] text-fg-mute">
                      <Building2 size={9} />
                      {nomeDoCliente(r)}
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


      {/* ------------------------------ modal ------------------------------ */}
      {/*
        Criar e editar no mesmo painel, com o que o formulário de Nova demanda
        tem para recorrente: cliente e projeto do cadastro (era texto livre, e
        mudar o nome aqui não mudava o cliente das demandas geradas) e o
        checklist que cada ocorrência recebe (não dava para editar).
      */}
      <Modal
        open={open}
        onClose={() => setOpen(false)}
        size="lg"
        title={editing ? "Editar recorrência" : "Nova demanda recorrente"}
        sub="O que se repete, para quem e com que frequência."
        footer={
          <>
            <Button onClick={() => setOpen(false)}>Cancelar</Button>
            <Button variant="primary" onClick={save} disabled={busy}>
              {busy ? "Salvando..." : "Salvar"}
            </Button>
          </>
        }
      >
        <form onSubmit={save} className="space-y-5">
          <Field label="Título">
            <Input
              autoFocus
              value={form.title}
              onChange={(e) => setForm({ ...form, title: e.target.value })}
              placeholder="Relatório semanal de performance"
            />
          </Field>

          <div className="space-y-4 border-t border-line-soft pt-5">
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
              {cadastro.length > 0 ? (
                <>
                  <Field label="Cliente">
                    <Select
                      value={form.cliente_id}
                      onChange={(e) => setForm({ ...form, cliente_id: e.target.value, projeto_id: "" })}
                    >
                      <option value="">Sem cliente</option>
                      {cadastro.map((c) => (
                        <option key={c.id} value={c.id}>
                          {c.nome}
                        </option>
                      ))}
                    </Select>
                  </Field>
                  <Field
                    label="Projeto"
                    hint={
                      !form.cliente_id
                        ? "Escolha um cliente primeiro."
                        : projetosDoCliente.length === 0
                          ? "Este cliente ainda não tem projeto."
                          : undefined
                    }
                  >
                    <Select
                      value={form.projeto_id}
                      disabled={!form.cliente_id || projetosDoCliente.length === 0}
                      onChange={(e) => setForm({ ...form, projeto_id: e.target.value })}
                    >
                      <option value="">Sem projeto</option>
                      {projetosDoCliente.map((p) => (
                        <option key={p.id} value={p.id}>
                          {p.nome}
                        </option>
                      ))}
                    </Select>
                  </Field>
                </>
              ) : (
                <Field label="Cliente / projeto" className="sm:col-span-2">
                  <Input
                    value={form.client}
                    onChange={(e) => setForm({ ...form, client: e.target.value })}
                    placeholder="Opcional"
                  />
                </Field>
              )}
              <Field label="Prioridade">
                <Select
                  value={form.priority}
                  onChange={(e) => setForm({ ...form, priority: e.target.value as Priority })}
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
                  onChange={(e) => setForm({ ...form, frequency: e.target.value as Frequency })}
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
                  hint={form.weekdays.length > 1 ? "A demanda volta em cada dia marcado." : undefined}
                >
                  {/* Caixinhas em vez de select: os sete dias e o que está
                      marcado se leem de uma vez. Mesmo formato usado em Nova
                      demanda. */}
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
                              /* Nunca deixa ficar sem nenhum dia marcado. */
                              weekdays: marcado
                                ? form.weekdays.length > 1
                                  ? form.weekdays.filter((d) => d !== i)
                                  : form.weekdays
                                : [...form.weekdays, i].sort((a, b) => a - b),
                            })
                          }
                          className={cx(
                            "h-9 flex-1 rounded-[12px] text-[12.5px] font-bold transition-colors",
                            marcado ? "bg-brand-500 text-on-brand" : "bg-ink-800 text-fg-mute hover:text-fg-dim"
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
                    onChange={(e) => setForm({ ...form, weekday: Number(e.target.value) })}
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
                <Field label="Dia do mês" hint="Em meses curtos, cai no último dia.">
                  <Input
                    type="number"
                    min={1}
                    max={31}
                    value={form.day_of_month}
                    onChange={(e) => setForm({ ...form, day_of_month: Number(e.target.value) })}
                  />
                </Field>
              )}
            </div>
            <p className="text-[11.5px] text-fg-mute">
              {frequencyDescription(form)}
              {!editing && " · se cair hoje, a demanda de hoje já é criada junto."}
            </p>
          </div>

          <div className="space-y-4 border-t border-line-soft pt-5">
            <Field label="Descrição">
              <Textarea
                rows={2}
                value={form.description}
                onChange={(e) => setForm({ ...form, description: e.target.value })}
                placeholder="O que precisa ser feito nessa recorrência"
              />
            </Field>

            <Field label="Links do material" hint="Cada demanda gerada nasce com eles.">
              <EditorLinks links={form.links} onChange={(links) => setForm({ ...form, links })} />
            </Field>

            <Field label="Checklist" hint="Cada demanda gerada nasce com estes itens desmarcados.">
              <EditorChecklist itens={checklist} onChange={setChecklist} />
            </Field>
          </div>

          {editing && (
            <label className="flex cursor-pointer items-center gap-2.5 rounded-xl border border-line-soft bg-ink-900/50 px-3.5 py-3">
              <input
                type="checkbox"
                checked={form.active}
                onChange={(e) => setForm({ ...form, active: e.target.checked })}
                className="h-4 w-4 accent-brand-500"
              />
              <span className="text-sm text-fg-dim">
                Ativa
                <span className="ml-1 text-[11px] text-fg-mute">(pausada não gera demandas)</span>
              </span>
            </label>
          )}

          {err && <p className="rounded-xl border border-neg/30 bg-neg/10 p-3 text-xs text-neg">{err}</p>}
        </form>
      </Modal>

      {confirm.node}
      {notice.node}
    </div>
  );
}
