"use client";

import * as React from "react";
import { useRouter, useSearchParams } from "next/navigation";
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
  Users,
} from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { NADA_GRAVADO, nenhumaLinha } from "@/lib/erros";
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
  type Cliente,
  type Projeto,
  type RecurringTask,
  nomeDoCliente,
} from "@/lib/types";
import { dateBR, daysUntil, horaCurta, todayISO } from "@/lib/format";
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
  ErroDeCarga,
} from "@/components/ui";
import { SeletorDeData } from "@/components/SeletorDeData";
import { ChipsDeLink, EditorLinks, limparLinks } from "@/components/Links";
import { useArrastarCartao } from "@/components/arrastarCartao";
import { MenuSuspenso } from "@/components/MenuSuspenso";
import {
  COLUNAS_OPCIONAIS,
  colunaQueFaltou,
  semColuna,
  type ColunaOpcional,
} from "@/lib/colunaOpcional";
import {
  CartaoDeDemanda,
  COLUNAS_DO_QUADRO,
  FATO,
  TONE,
} from "@/components/CartaoDeDemanda";
import { temCache, useEstadoCacheado } from "@/lib/cachePagina";
import {
  EditorChecklist,
  ListaDeItens,
  ProgressoChecklist,
  type ItemEmEdicao,
} from "@/components/Checklist";

/* A ordem das colunas mora com o cartão, que é quem precisa saber qual é
   a próxima. */
const COLUMNS = COLUNAS_DO_QUADRO;

/*
 * Chave do grupo de quem não tem cliente.
 *
 * String vazia não serve como valor de <option>: o navegador a trata como
 * "nada selecionado" e o filtro voltaria sozinho para Todos. Daí uma sentinela
 * — em texto comum, porque byte nulo em atributo do DOM é terreno que alguns
 * navegadores limpam sem avisar.
 */
const SEM_CLIENTE = "::sem-cliente::";
const PRIORITIES: Priority[] = ["low", "medium", "high", "urgent"];
const RANK: Record<Priority, number> = { urgent: 0, high: 1, medium: 2, low: 3 };

/*
 * Media e um PAPEL, e nao uma cor: ela e o accent no claro e cinza no
 * escuro. Media e a prioridade da maioria das demandas, entao no escuro ela
 * pintava o quadro inteiro de uma cor que queria dizer "normal". No claro
 * isso nao incomodava, e foi o que ele disse. Ver `--pri-media-*`.
 */
/**
 * O horário como ele vai para o banco.
 *
 * Sempre presente, inclusive nulo: na edição, omitir significa "não mexe", e
 * sem gravar nulo apagar a hora na tela não apagaria nada no banco — o mesmo
 * tropeço que os links já tinham.
 *
 * Sem data não há hora. Uma demanda com "14:30" e sem dia é uma hora de dia
 * nenhum: ela não teria onde aparecer, e ainda assim ocuparia o canto do
 * cartão dizendo algo que ninguém consegue usar.
 */
const horaGravada = (f: { due_date: string; due_time: string }) => ({
  due_time: f.due_date && f.due_time ? f.due_time : null,
});

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
  /* O cadastro. Vazio = "sem cliente"; o texto acima fica só como o que a
     linha antiga já tinha, para não sumir de quem não rodou CLIENTES.sql. */
  cliente_id: "",
  projeto_id: "",
  links: [] as string[],
  priority: "medium" as Priority,
  status: "todo" as TaskStatus,
  due_date: "",
  due_time: "",
  // recorrencia: quando marcada, a demanda passa a ser uma regra que se repete
  recurring: false,
  frequency: "weekly" as Frequency,
  weekday: new Date().getDay(),
  weekdays: [new Date().getDay()] as number[],
  day_of_month: new Date().getDate(),
});

export default function DemandasPage() {
  const supabase = React.useMemo(() => createClient(), []);
  const [rows, setRows] = useEstadoCacheado<Task[]>("tasks", []);
  /* O CADASTRO de clientes e projetos. Diferente de `clientes`, mais
     abaixo, que é a lista derivada das demandas para o filtro. */
  const [cadastro, setCadastro] = useEstadoCacheado<Cliente[]>("clientes", []);
  const [projetos, setProjetos] = useEstadoCacheado<Projeto[]>("projetos", []);
  /* Já visitou nesta sessão? Então abre com conteúdo e atualiza atrás. */
  const [loading, setLoading] = React.useState(
    () => !temCache("tasks", "task_items")
  );
  const [view, setView] = React.useState<"board" | "list" | "cliente">("board");
  /*
   * `useSearchParams`, e não `window.location.search`.
   *
   * Lendo direto do `window`, a semeadura funcionava ao abrir a URL colada na
   * barra e falhava vinda da busca global — na navegação do lado do cliente o
   * `useState` roda antes de o endereço ser atualizado, então o parâmetro
   * ainda não estava lá. O hook entrega os parâmetros da rota que está
   * entrando, que é o que se quer nos dois casos.
   */
  const paramDaUrl = useSearchParams();
  const router = useRouter();

  /*
   * Semeado pela busca global: `?q=` na URL entra como filtro inicial.
   *
   * Sem isto a busca global levava a pessoa até a tela certa e a largava na
   * lista inteira, para procurar de novo o que ela acabou de digitar.
   * `useState` com valor inicial, e não um efeito depois da montagem, para a
   * tela já abrir filtrada em vez de mostrar tudo e encolher no quadro
   * seguinte.
   */
  const [q, setQ] = React.useState(() => paramDaUrl.get("q") ?? "");
  const [prio, setPrio] = React.useState<"all" | Priority>("all");
  const [cliente, setCliente] = React.useState<"all" | string>("all");
  const [open, setOpen] = React.useState(false);
  const [editing, setEditing] = React.useState<Task | null>(null);
  const [form, setForm] = React.useState(blank());
  const [busy, setBusy] = React.useState(false);
  const [err, setErr] = React.useState("");

  /* Itens de checklist agrupados por demanda. */
  const [itens, setItens] = useEstadoCacheado<Record<string, TaskItem[]>>(
    "task_items",
    {}
  );
  const [marcando, setMarcando] = React.useState<string | null>(null);
  /* Checklist em edição: da demanda, ou o modelo da regra. */
  const [checklist, setChecklist] = React.useState<ItemEmEdicao[]>([]);
  const today = todayISO();
  const confirm = useConfirm();
  const notice = useNotice();
  const [erroCarga, setErroCarga] = React.useState("");

  const load = React.useCallback(async () => {
    /*
     * As duas leituras em paralelo, e a dos itens tolerando falha.
     *
     * Se SUBTAREFAS.sql ainda não rodou, a consulta de task_items erra e o
     * checklist simplesmente não aparece — o quadro continua funcionando. Um
     * erro ali não pode derrubar a página inteira.
     */
    const [t, i, c, pr] = await Promise.all([
      supabase.from("tasks").select("*").order("created_at", { ascending: false }),
      supabase.from("task_items").select("*").order("position"),
      /* O cadastro tolera falha pelo mesmo motivo do checklist: numa base
         sem CLIENTES.sql a tela continua funcionando com o texto de sempre. */
      supabase.from("clientes").select("*").order("nome"),
      supabase.from("projetos").select("*").order("nome"),
    ]);

    /* Sem as demandas não há tela: avisa e mantém o que já estava, em vez
       de mostrar "Nenhuma demanda ainda" por causa de uma queda de rede. */
    if (t.error) {
      setErroCarga(t.error.message);
      setLoading(false);
      return;
    }
    setErroCarga("");
    setRows((t.data as Task[]) ?? []);
    setCadastro((c.data as Cliente[]) ?? []);
    setProjetos((pr.data as Projeto[]) ?? []);

    const porDemanda: Record<string, TaskItem[]> = {};
    ((i.data as TaskItem[]) ?? []).forEach((item) => {
      (porDemanda[item.task_id] ??= []).push(item);
    });
    setItens(porDemanda);
    setLoading(false);
  }, [supabase, setCadastro, setProjetos]);

  React.useEffect(() => {
    load();
  }, [load]);

  const startNew = (status: TaskStatus = "todo") => {
    setEditing(null);
    setForm({ ...blank(), status });
    // O checklist mora fora de `form`, entao `blank()` nao o alcanca: sem esta
    // linha a lista da demanda anterior reaparecia na demanda nova.
    setChecklist([]);
    setErr("");
    setOpen(true);
  };

  const startEdit = (t: Task) => {
    setEditing(t);
    setForm({
      title: t.title,
      description: t.description,
      client: t.client,
      cliente_id: t.cliente_id ?? "",
      projeto_id: t.projeto_id ?? "",
      links: t.links ?? [],
      priority: t.priority,
      status: t.status,
      due_date: t.due_date?.slice(0, 10) ?? "",
      due_time: horaCurta(t.due_time),
      recurring: false,
      frequency: "weekly",
      weekday: new Date().getDay(),
      weekdays: [new Date().getDay()] as number[],
      day_of_month: new Date().getDate(),
    });
    setChecklist(
      (itens[t.id] ?? []).map((i) => ({ id: i.id, title: i.title, done: i.done }))
    );
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
      const faltam = checklist.filter((i) => !i.done).length;
      if (faltam > 0)
        return setErr(
          `Faltam ${faltam} ${
            faltam === 1 ? "item" : "itens"
          } do checklist. Marque tudo antes de concluir a demanda.`
        );
    }

    setBusy(true);

    const links = limparLinks(form.links);

    /*
     * O texto de `client` passa a ser um retrato, não a fonte.
     *
     * Quem manda são `cliente_id` e `projeto_id`; o texto é gravado junto
     * com o nome de agora e só volta a ser usado se o cadastro sumir — aí a
     * demanda mostra o nome sob o qual ela aconteceu, em vez de um vazio.
     */
    const cSel = cadastro.find((c) => c.id === form.cliente_id);
    const pSel = projetos.find((p) => p.id === form.projeto_id);
    const textoCliente = cSel
      ? pSel
        ? `${cSel.nome} - ${pSel.nome}`
        : cSel.nome
      : form.client.trim();

    const base = {
      title: form.title.trim(),
      description: form.description.trim(),
      client: textoCliente,
      priority: form.priority,
    };

    /*
     * As colunas do cadastro só entram quando ele existe.
     *
     * Mandá-las sempre faria toda demanda falhar numa base onde
     * CLIENTES.sql ainda não rodou. Mesma escolha de `links`, `weekdays` e
     * `checklist`.
     */
    const comCliente = cadastro.length
      ? {
          cliente_id: form.cliente_id || null,
          projeto_id: form.projeto_id || null,
        }
      : {};

    /*
     * Os links entram na criação só quando existem.
     *
     * Mandá-los sempre faria toda demanda falhar numa base onde
     * LINK-NA-DEMANDA.sql ainda não rodou — inclusive as sem link, que
     * funcionam sem a coluna. Mesma escolha de `weekdays` e `checklist`.
     */
    const comLink = links.length ? { links } : {};

    if (editing) {
      const mudanca = {
        ...base,
        ...comCliente,
        status: form.status,
          due_date: form.due_date || null,
          ...horaGravada(form),
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
      };

      /*
       * Aqui os links vão sempre, inclusive vazios.
       *
       * Na criação basta omitir, mas na edição omitir significa "não mexe": sem
       * gravar nulo, apagar os endereços na tela não apagaria nada no banco. Se
       * a coluna ainda não existe, a segunda tentativa salva o resto — editar
       * uma demanda não pode depender de uma migração pendente.
       */
      /*
       * `select("id")` não é enfeite: sem ele, um update que não atinge linha
       * nenhuma volta 204 sem erro, e a tela comemora um salvamento que não
       * aconteceu — foi mudar o prazo, ver a demanda seguir atrasada e não ter
       * o que investigar. Com a linha de volta, zero atingidas é uma falha
       * visível.
       */
      const { data: salvo, error, faltaram } = await gravarTolerando<
        { id: string }[]
      >(
        { ...mudanca, links: links.length ? links : null },
        (campos) =>
          supabase.from("tasks").update(campos).eq("id", editing.id).select("id")
      );
      if (!error && faltaram.length) notice.show(recadoDoQueFaltou(faltaram));

      if (error) {
        setBusy(false);
        return setErr(error.message);
      }
      if (!salvo?.length) {
        setBusy(false);
        return setErr(
          "Nada foi gravado: a demanda não foi encontrada. Recarregue a página e tente de novo."
        );
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

      /*
       * Só materializa hoje se a regra cai hoje.
       *
       * Criava a demanda de hoje sempre: uma mensal do dia 20 criada no dia 3
       * nascia com uma demanda no dia 3 — e no dia 20 vinha outra. E gravar
       * "rodou hoje" pulava a primeira de uma quinzenal ou trimestral. Fora do
       * dia, a regra nasce sem nada e a primeira sai na data dela.
       */
      const regraNova = {
        active: true,
        last_run_on: null,
        frequency: form.frequency,
        weekday: weekly
          ? form.frequency === "weekly"
            ? Math.min(...form.weekdays)
            : Number(form.weekday)
          : null,
        weekdays: form.frequency === "weekly" ? form.weekdays : null,
        day_of_month: monthly
          ? Math.min(31, Math.max(1, Number(form.day_of_month) || 1))
          : null,
      } as unknown as RecurringTask;
      const venceHoje = isDueOn(regraNova, today);

      const { data: rule, error: ruleError } = await supabase
        .from("recurring_tasks")
        .insert({
          ...base,
          ...comLink,
          ...comCliente,
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
          last_run_on: venceHoje ? today : null,
          /* O modelo só entra quando há itens: sem a migração, mandá-lo faria
             toda recorrente falhar, inclusive as sem checklist. */
          /* O modelo guarda só os títulos: cada ocorrência nasce desmarcada. */
          ...(checklist.length
            ? { checklist: checklist.map((i) => i.title) }
            : {}),
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
        if (ruleError && /links/.test(ruleError.message))
          return setErr(
            "Links precisam de supabase/LINK-NA-DEMANDA.sql no banco. Rode o arquivo ou deixe os campos vazios."
          );
        return setErr(ruleError?.message ?? "Não foi possível criar a recorrência.");
      }

      if (!venceHoje) {
        const primeira = nextOccurrence(regraNova, today);
        setBusy(false);
        setOpen(false);
        notice.show(
          primeira
            ? `Recorrência criada. A primeira demanda sai em ${dateBR(primeira).slice(0, 5)}.`
            : "Recorrência criada.",
          "ok"
        );
        return load();
      }

      const { data: hoje1, error: taskError } = await supabase
        .from("tasks")
        .insert({
          ...base,
          ...comLink,
          ...comCliente,
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
          checklist.map((item, i) => ({
            user_id: uid,
            task_id: hoje1.id,
            title: item.title,
            done: item.done,
            position: i,
          }))
        );

      setBusy(false);
      setOpen(false);
      return load();
    }

    const { data: criada, error, faltaram } = await gravarTolerando<{ id: string }>(
      {
        ...base,
        ...comLink,
        ...comCliente,
        user_id: uid,
        status: form.status,
        due_date: form.due_date || null,
        ...horaGravada(form),
        completed_at: form.status === "done" ? new Date().toISOString() : null,
      },
      (campos) => supabase.from("tasks").insert(campos).select("id").single()
    );
    setBusy(false);
    if (error) return setErr(error.message);
    if (faltaram.length) notice.show(recadoDoQueFaltou(faltaram));

    if (criada && checklist.length)
      await supabase.from("task_items").insert(
        checklist.map((item, idx) => ({
          user_id: uid,
          task_id: criada.id,
          title: item.title,
          done: item.done,
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
  const salvarChecklist = async (
    taskId: string,
    titulos: ItemEmEdicao[],
    uid: string
  ) => {
    const atuais = itens[taskId] ?? [];
    const limpos = titulos
      .map((t) => ({ ...t, title: t.title.trim() }))
      .filter((t) => t.title);

    const mudados = limpos
      .slice(0, atuais.length)
      .map((item, i) => ({ id: atuais[i].id, item }))
      .filter(
        (x, i) => atuais[i].title !== x.item.title || atuais[i].done !== x.item.done
      );

    const novos = limpos.slice(atuais.length).map((item, i) => ({
      user_id: uid,
      task_id: taskId,
      title: item.title,
      done: item.done,
      position: atuais.length + i,
    }));

    const sobrando = atuais.slice(limpos.length).map((i) => i.id);

    const erros = await Promise.all([
      ...mudados.map((x) =>
        supabase
          .from("task_items")
          .update({ title: x.item.title, done: x.item.done })
          .eq("id", x.id)
          /* `select("id")` para o item que sumiu não passar por gravado: o
             PostgREST responde 204 sem erro quando o `eq` não casa. */
          .select("id")
          .then((r) =>
            r.error || r.data?.length
              ? r
              : { error: { message: NADA_GRAVADO }, data: null }
          )
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
    const { data: gravadas, error } = await supabase
      .from("task_items")
      .update({ done: novo })
      .eq("id", item.id)
      .select("id");
    setMarcando(null);
    if (notice.check(error ?? nenhumaLinha(gravadas), "marcar o item")) load();
  };

  /** Marca todos os itens da demanda como feitos. */
  const concluirItens = async (taskId: string) => {
    const abertos = (itens[taskId] ?? []).filter((i) => !i.done);
    if (!abertos.length) return true;
    const { data: gravadas, error } = await supabase
      .from("task_items")
      .update({ done: true })
      .in("id", abertos.map((i) => i.id))
      .select("id");
    return !notice.check(error ?? nenhumaLinha(gravadas), "concluir os itens");
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
      .eq("id", t.id)
      .select("id");

    /* O estado local já foi corrigido acima, então o `load()` que existia aqui
       relia as duas tabelas para confirmar o que a tela já mostrava. Só volta a
       ler quando a gravação falha — aí a tela precisa voltar à verdade. */
    if (notice.check(error, "mover a demanda")) load();
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

  /*
   * O arrasto entrega a coluna onde o cartão foi solto, e `move` decide o
   * resto — inclusive a regra do checklist, que continua valendo: soltar em
   * "Concluída" com item em aberto abre a mesma confirmação do botão.
   */
  const { iniciar: iniciarArrasto } = useArrastarCartao<Task>({
    onSoltar: (t, coluna) => move(t, coluna as TaskStatus),
  });

  const remove = (t: Task) =>
    confirm.ask(`Excluir "${t.title}"?`, async () => {
      const { error } = await supabase.from("tasks").delete().eq("id", t.id);
      if (notice.check(error, "excluir a demanda")) return;
      setRows((r) => r.filter((x) => x.id !== t.id));
      setItens(({ [t.id]: _, ...resto }) => resto);
    });

  /* ------------------------------ derivados ------------------------------ */

  /*
   * O nome que a demanda mostra: o do cadastro, ou o texto antigo.
   *
   * É o que junta as cinco Bias. Enquanto o nome vinha de `t.client`, cada
   * grafia era um cliente; vindo do cadastro, as cinco apontam para a mesma
   * linha e viram uma só — e renomear lá muda aqui sem tocar em demanda
   * nenhuma. Quem não rodou CLIENTES.sql cai no texto e vê o de sempre.
   */
  const porId = React.useMemo(
    () => new Map(cadastro.map((c) => [c.id, c])),
    [cadastro]
  );
  const projetoPorId = React.useMemo(
    () => new Map(projetos.map((p) => [p.id, p])),
    [projetos]
  );
  const nomeDe = React.useCallback(
    (t: Task) => nomeDoCliente(t, porId, projetoPorId),
    [porId, projetoPorId]
  );

  /* Os projetos do cliente que está escolhido no formulário. */
  /* Na mesma ordem da ficha do cliente: a lista que ele arrastou la e a
     lista que ele ve aqui. Ver `position` em ORDEM-PROJETOS.sql. */
  const projetosDoCliente = React.useMemo(
    () =>
      projetos
        .filter((p) => p.cliente_id === form.cliente_id)
        .sort(
          (a, b) =>
            (a.position ?? 0) - (b.position ?? 0) ||
            a.nome.localeCompare(b.nome)
        ),
    [projetos, form.cliente_id]
  );

  const filtered = React.useMemo(() => {
    const term = q.trim().toLowerCase();
    return rows
      .filter((t) => prio === "all" || t.priority === prio)
      .filter(
        (t) => cliente === "all" || (nomeDe(t) || SEM_CLIENTE) === cliente
      )
      .filter(
        (t) =>
          !term ||
          t.title.toLowerCase().includes(term) ||
          nomeDe(t).toLowerCase().includes(term) ||
          t.description.toLowerCase().includes(term)
      )
      .sort((a, b) => {
        if (RANK[a.priority] !== RANK[b.priority])
          return RANK[a.priority] - RANK[b.priority];
        const porData = (a.due_date ?? "9999").localeCompare(b.due_date ?? "9999");
        if (porData) return porData;
        /* Mesma prioridade e mesmo dia: quem tem hora marcada vem na ordem do
           relógio, e quem não tem vai para o fim do dia — a demanda sem hora
           não disputa horário com a que tem. */
        return (horaCurta(a.due_time) || "99:99").localeCompare(
          horaCurta(b.due_time) || "99:99"
        );
      });
  }, [rows, q, prio, cliente, nomeDe]);

  const byStatus = (s: TaskStatus) => filtered.filter((t) => t.status === s);

  /**
   * Os clientes que existem, com quanto cada um tem em aberto.
   *
   * Contado sobre `rows` e não sobre `filtered`: o número ao lado do nome
   * precisa dizer o tamanho real do cliente, não o resultado do filtro atual —
   * senão escolher um cliente zeraria a contagem de todos os outros.
   */
  const clientes = React.useMemo(() => {
    const m = new Map<string, { nome: string; abertas: number; atrasadas: number }>();
    rows.forEach((t) => {
      const chave = nomeDe(t) || SEM_CLIENTE;
      const g =
        m.get(chave) ??
        { nome: nomeDe(t) || "Sem cliente", abertas: 0, atrasadas: 0 };
      if (t.status !== "done") {
        g.abertas++;
        if (t.due_date && daysUntil(t.due_date) < 0) g.atrasadas++;
      }
      m.set(chave, g);
    });
    return [...m.entries()]
      .map(([chave, g]) => ({ chave, ...g }))
      /* Quem tem mais em aberto primeiro; "Sem cliente" sempre por último,
         porque é o balaio, não um cliente. */
      .sort((a, b) => {
        if ((a.chave === SEM_CLIENTE) !== (b.chave === SEM_CLIENTE))
          return a.chave === SEM_CLIENTE ? 1 : -1;
        if (a.abertas !== b.abertas) return b.abertas - a.abertas;
        return a.nome.localeCompare(b.nome, "pt-BR");
      });
  }, [rows, nomeDe]);

  /* As demandas já filtradas, agrupadas para a visão por cliente. */
  const grupos = React.useMemo(
    () =>
      clientes
        .map((c) => ({
          ...c,
          tarefas: filtered.filter((t) => (nomeDe(t) || SEM_CLIENTE) === c.chave),
        }))
        .filter((g) => g.tarefas.length > 0),
    [clientes, filtered]
  );
  /* Alguma coluna tem cartão? Decide se as vazias podem sumir no celular. */
  const algumaCheia = COLUMNS.some((c) => byStatus(c).length > 0);
  const openCount = rows.filter((t) => t.status !== "done").length;
  const lateCount = rows.filter(
    (t) => t.status !== "done" && t.due_date && daysUntil(t.due_date) < 0
  ).length;

  return (
    <div className="space-y-5 rise">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="titulo-pagina">Demandas</h1>
          <p className="mt-1 text-sm text-fg-mute">
            {/* Enquanto carrega, não diz "0 abertas": era um número falso
                piscando antes do verdadeiro. */}
            {loading ? (
              "carregando…"
            ) : (
              <>
                {openCount} aberta{openCount === 1 ? "" : "s"}
                {lateCount > 0 && <span className="text-neg"> · {lateCount} atrasada{lateCount === 1 ? "" : "s"}</span>}
              </>
            )}
          </p>
        </div>
        {/*
          No celular os dois botões dividem a linha em vez de empilhar.

          Empilhados, eram duas faixas cheias de altura antes de qualquer
          demanda aparecer — e junto com o aviso e os dois filtros davam cinco
          faixas de controle numa tela de 812px.
        */}
        <div className="flex w-full items-center gap-2 sm:w-auto">
          {/*
            Os dois cadastros desta tela num menu só, como em Contas.

            Eram um botão solto de "Recorrentes" ao lado do de criar. Com o
            cadastro de clientes entrando, seriam três botões lado a lado no
            cabeçalho — e dois deles levam a telas que se visita de vez em
            quando, não a cada uso. Menu para o que é ocasional, botão para o
            que é o gesto da tela.
          */}
          <MenuSuspenso
            rotulo="Gerenciar demandas"
            rotuloVisivel="Gerenciar"
            className="min-w-0 flex-1 sm:flex-none"
            itens={[
              {
                rotulo: "Clientes e projetos",
                icone: <Users size={15} />,
                aoEscolher: () => router.push("/demandas/clientes"),
              },
              {
                rotulo: "Recorrentes",
                icone: <Repeat2 size={15} />,
                aoEscolher: () => router.push("/recorrentes"),
              },
            ]}
          />
          <Button
            variant="primary"
            onClick={() => startNew()}
            className="min-w-0 flex-1 justify-center sm:flex-none"
          >
            <Plus size={15} className="shrink-0" />
            <span className="truncate">Nova demanda</span>
          </Button>
        </div>
      </div>

      {/* A remoção automática precisa estar escrita: sem isso, a demanda
          desaparece do quadro e parece que o app perdeu o dado. */}
      {/* Aviso encolhe no celular: é informação de fundo, e ocupava uma faixa
          inteira acima dos filtros. */}
      <p className="mb-3 flex items-center gap-1.5 text-[11px] text-fg-mute sm:mb-4 sm:gap-2 sm:text-[12px]">
        <Info size={12} className="shrink-0" />
        {/* "Apagadas", e não "saem": elas não vão para lugar nenhum. */}
        Concluídas são apagadas às 6h da manhã seguinte.
      </p>

      {erroCarga && <ErroDeCarga detalhe={erroCarga} onTentar={load} />}

      <div className="flex flex-wrap items-center gap-2.5 sm:gap-3">
        {/* Cada tira rola de lado. Antes cada uma tomava uma faixa própria no
            celular, e as duas somavam mais altura que o primeiro cartão. */}
        <div className="-mx-1 max-w-full overflow-x-auto px-1 pb-0.5">
          <Segmented
            value={view}
            onChange={setView}
            options={[
              { value: "board", label: "Quadro" },
              { value: "list", label: "Lista" },
              { value: "cliente", label: "Por cliente" },
            ]}
          />
        </div>
        <div className="-mx-1 max-w-full overflow-x-auto px-1 pb-0.5">
          <Segmented
            value={prio}
            onChange={setPrio}
            options={[
              { value: "all", label: "Todas" },
              ...PRIORITIES.map((p) => ({ value: p, label: PRIORITY_LABEL[p] })),
            ]}
          />
        </div>
        {/* Dropdown e não Segmented: cliente é lista aberta — com seis canais
            os botões já quebrariam a linha dos filtros. O número é o que está
            em aberto, que é a pergunta real ("o que devo pro canal X"). */}
        {/* No celular, cliente e busca dividem uma linha: eram duas faixas
            cheias, e somadas aos filtros davam ~540px de controles antes da
            primeira demanda. */}
        <div className="flex w-full gap-2.5 sm:contents">
        {clientes.length > 1 && (
          <Select
            value={cliente}
            onChange={(e) => setCliente(e.target.value)}
            className="min-w-0 flex-1 sm:w-[200px] sm:flex-none"
            aria-label="Filtrar por cliente"
          >
            {/*
              Separado em dois grupos, e não numa lista corrida.

              O número ao lado do nome conta o que está EM ABERTO, então um
              cliente sem nada pendente aparece com (0) — e ficava misturado,
              do mesmo tamanho, entre os que têm trabalho esperando. Metade da
              lista podia estar zerada sem nada dizer isso antes de clicar.

              Os dois grupos respondem perguntas diferentes: "quem está me
              esperando" e "com quem eu já trabalhei". Nenhum cliente some — o
              histórico continua acessível, que é o motivo de o (0) existir.
            */}
            <option value="all">Todos os clientes</option>
            {(() => {
              const comTrabalho = clientes.filter((c) => c.abertas > 0);
              const semTrabalho = clientes.filter((c) => c.abertas === 0);
              const grupo = (
                rotulo: string,
                lista: typeof clientes,
                mostrarNumero: boolean
              ) =>
                lista.length > 0 && (
                  <optgroup label={rotulo}>
                    {lista.map((c) => (
                      <option key={c.chave} value={c.chave}>
                        {c.nome}
                        {mostrarNumero ? ` (${c.abertas})` : ""}
                      </option>
                    ))}
                  </optgroup>
                );
              return (
                <>
                  {grupo("Com demandas abertas", comTrabalho, true)}
                  {grupo("Sem nada em aberto", semTrabalho, false)}
                </>
              );
            })()}
          </Select>
        )}

        <div className="relative min-w-0 flex-1 sm:ml-auto sm:w-64 sm:flex-none">
          <Search
            size={14}
            className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-fg-mute"
          />
          <Input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Buscar..."
            aria-label="Buscar demanda ou cliente"
            className="pl-9"
          />
        </div>
        </div>
      </div>

      {loading ? (
        <div className="card p-4"><EsqueletoLista linhas={5} /></div>
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
            /*
             * Coluna vazia desaparece no celular.
             *
             * No desktop as quatro ficam lado a lado e a vazia é o alvo do
             * arrasto. Empilhadas no celular, três molduras vazias de
             * 220px viravam a maior parte da rolagem — num aparelho
             * onde arrastar entre colunas nem funciona bem. O `algumaCheia`
             * evita a tela em branco quando o filtro não deixa nada.
             */
            const esconderNoCelular = items.length === 0 && algumaCheia;
            return (
              <div
                key={col}
                /* `data-coluna` é como o arrasto acha o destino: ele consulta
                   `elementFromPoint` no ponto onde o cartão foi solto e sobe até
                   o ancestral que carrega este atributo. */
                data-coluna={col}
                className={cx(
                  "coluna flex min-h-[220px] flex-col rounded-2xl border border-line bg-ink-900/40 p-2.5",
                  esconderNoCelular && "hidden lg:flex"
                )}
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
                    /* Sem texto: a moldura tracejada já diz que ali cabe
                       alguma coisa, e quatro "Arraste aqui" repetidos eram
                       ruído numa tela que ele lê o dia inteiro. Ela continua
                       sendo o alvo do arrasto e ainda acende no destino. */
                    <div
                      aria-hidden
                      className="solte flex flex-1 items-center justify-center rounded-xl border border-dashed border-line-soft py-8 transition-colors duration-150"
                    />
                  ) : (
                    items.map((t, i) => (
                      <CartaoDeDemanda
                        key={t.id}
                        indice={i}
                        t={t}
                        itens={itens[t.id] ?? []}
                        onAlternarItem={alternarItem}
                        marcando={marcando}
                        onPointerDown={(e) => iniciarArrasto(e, t)}
                        onEdit={() => startEdit(t)}
                        onDelete={() => remove(t)}
                        onAdvance={() => {
                          const i = COLUMNS.indexOf(t.status);
                          if (i < COLUMNS.length - 1) move(t, COLUMNS[i + 1]);
                        }}
                        onClient={setCliente}
                      />
                    ))
                  )}
                </div>
              </div>
            );
          })}
        </div>
      ) : view === "cliente" ? (
        /* --------------------------- por cliente --------------------------- */
        /*
         * Um bloco por canal, o que tem mais em aberto primeiro.
         *
         * O quadro responde "em que pé está cada demanda". Esta visão responde
         * outra pergunta — "o que eu devo pro canal X" — e por isso agrupa por
         * cliente e mostra o status como campo, não como coluna.
         */
        grupos.length === 0 ? (
          <Card>
            <Empty
              icon={<Building2 size={18} />}
              title="Nada com esse filtro"
              sub="Ajuste a busca, a prioridade ou o cliente."
            />
          </Card>
        ) : (
          <div className="space-y-4">
            {grupos.map((g) => (
              <Card key={g.chave} className="overflow-hidden">
                <div className="flex flex-wrap items-center gap-2 border-b border-line-soft px-5 py-3">
                  <Building2 size={14} className="text-fg-mute" />
                  <h2 className="text-[13.5px] font-semibold">{g.nome}</h2>
                  <span className="text-[11px] text-fg-mute tnum">
                    {g.abertas} aberta{g.abertas === 1 ? "" : "s"}
                  </span>
                  {g.atrasadas > 0 && (
                    <Badge tone="neg">
                      {g.atrasadas} atrasada{g.atrasadas === 1 ? "" : "s"}
                    </Badge>
                  )}
                  {g.chave !== SEM_CLIENTE && cliente === "all" && (
                    <button
                      type="button"
                      onClick={() => setCliente(g.chave)}
                      className="ml-auto text-[11px] text-fg-mute transition-colors hover:text-brand-400"
                    >
                      ver só este
                    </button>
                  )}
                </div>

                <ul className="divide-y divide-line-soft/60">
                  {g.tarefas.map((t) => {
                    const doChecklist = itens[t.id] ?? [];
                    const late =
                      t.status !== "done" &&
                      t.due_date &&
                      daysUntil(t.due_date) < 0;
                    return (
                      <li
                        key={t.id}
                        className="group flex flex-wrap items-center gap-x-3 gap-y-2 px-5 py-3 transition-colors hover:bg-ink-800/40"
                      >
                        <div className="min-w-0 flex-1">
                          <p
                            className={cx(
                              "truncate text-[13px] font-medium",
                              t.status === "done" && "text-fg-mute line-through"
                            )}
                          >
                            {t.title}
                          </p>
                          {/* Mesma voz do rodapé do cartão do quadro: uma
                              pastilha só, o resto em `FATO`, e "recorrente"
                              como glifo. As duas telas mostram a mesma
                              demanda; falarem diferente é que era o estranho. */}
                          <div className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-1">
                            <Badge tone={TONE[t.priority]}>
                              {PRIORITY_LABEL[t.priority]}
                            </Badge>
                            {t.origin_id && (
                              <span
                                title="Gerada por uma recorrência"
                                className="text-[var(--recorrente-txt)]"
                              >
                                <Repeat2 size={11} />
                              </span>
                            )}
                            {doChecklist.length > 0 && (
                              <ProgressoChecklist
                                feitos={doChecklist.filter((i) => i.done).length}
                                total={doChecklist.length}
                                className="w-[86px]"
                              />
                            )}
                            <ChipsDeLink links={t.links} tamanho="md" tom="mudo" />
                            {t.due_date && (
                              <span
                                className={cx(
                                  FATO,
                                  "tnum",
                                  late ? "text-neg" : "text-fg-mute"
                                )}
                              >
                                {late ? (
                                  <AlertCircle size={10} />
                                ) : (
                                  <CalendarDays size={10} />
                                )}
                                {dateBR(t.due_date)}
                                {horaCurta(t.due_time) && (
                                  <span className="opacity-80">
                                    · {horaCurta(t.due_time)}
                                  </span>
                                )}
                              </span>
                            )}
                          </div>
                        </div>

                        {/*
                          Select dentro de um div de largura fixa: o
                          `fieldBase` traz `w-full`, e como ele sai depois no
                          CSS gerado, um `w-[130px]` na própria classe perde.
                          Na visão de lista isso não aparece porque a célula da
                          tabela já segura a largura; aqui, solto num flex, ele
                          esticaria a linha inteira.
                        */}
                        <div className="w-[130px] shrink-0">
                          <Select
                            value={t.status}
                            onChange={(e) =>
                              move(t, e.target.value as TaskStatus)
                            }
                            className="h-8 text-xs"
                          >
                            {COLUMNS.map((c) => (
                              <option key={c} value={c}>
                                {STATUS_LABEL[c]}
                              </option>
                            ))}
                          </Select>
                        </div>

                        <div className="flex shrink-0 items-center gap-1 transition-opacity lg:opacity-0 lg:group-hover:opacity-100 lg:focus-within:opacity-100">
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
                      </li>
                    );
                  })}
                </ul>
              </Card>
            ))}
          </div>
        )
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
                      {t.links?.length ? (
                        <div className="mt-0.5 flex max-w-[280px] flex-wrap items-center gap-1.5">
                          <ChipsDeLink links={t.links} tamanho="md" />
                        </div>
                      ) : null}
                    </td>
                    <td className="px-3 py-3 text-xs text-fg-dim">
                      {t.client ? (
                        <button
                          type="button"
                          onClick={() => setCliente(t.client)}
                          title={`Ver só ${t.client}`}
                          className="rounded px-1 py-0.5 transition-colors hover:bg-ink-750 hover:text-brand-400"
                        >
                          {t.client}
                        </button>
                      ) : (
                        "—"
                      )}
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
                          {horaCurta(t.due_time) && (
                            <span className="text-fg-mute"> · {horaCurta(t.due_time)}</span>
                          )}
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
        /*
         * Largo, porque este formulário tem campo demais para uma coluna de
         * 512px: título, descrição, links, checklist, cliente, prioridade,
         * prazo, status e ainda o bloco de recorrência. Empilhado nessa
         * largura, tudo fica estreito e a descrição cortava.
         */
        size="lg"
        footer={
          <>
            <Button onClick={() => setOpen(false)}>Cancelar</Button>
            <Button variant="primary" onClick={save} disabled={busy}>
              {busy ? "Salvando..." : "Salvar"}
            </Button>
          </>
        }
      >
        {/*
          Tres blocos, e nao nove campos numa pilha.

          Era uma lista de blocos de peso igual em que nada dizia o que e
          essencial e o que e detalhe -- e o campo que MUDA A FORMA do
          formulario ("demanda recorrente") era o ultimo: a pessoa
          preenchia prazo e status, marcava a caixa no fim e via os dois
          sumirem. Era essa a parte confusa.

          Agora: o que a demanda e (titulo e tipo), de quem e para
          quando, e so depois o conteudo. Os fios separam os blocos sem
          acrescentar mais texto cinza numa tela que ja tinha rotulo
          demais.
        */}
        <form onSubmit={save} className="space-y-5">
          <Field label="Título">
            <Input
              autoFocus
              value={form.title}
              onChange={(e) => setForm({ ...form, title: e.target.value })}
              placeholder="Ajustar criativos da campanha"
            />
          </Field>

          {/*
            O tipo vem ANTES dos campos que ele controla. Escolhido aqui,
            a linha de prazo ja nasce sendo a certa: prazo, horario e
            status para a avulsa; frequencia para a recorrente. Na edicao
            nao aparece, porque demanda que ja existe nao vira regra.
          */}
          {!editing && (
            <div>
              <Segmented
                value={form.recurring ? "recorrente" : "avulsa"}
                onChange={(v) =>
                  setForm({ ...form, recurring: v === "recorrente" })
                }
                options={[
                  { value: "avulsa", label: "Avulsa" },
                  { value: "recorrente", label: "Recorrente" },
                ]}
              />
              <p className="mt-1.5 text-[11px] text-fg-mute">
                {form.recurring
                  ? "Cria a regra e já lança a de hoje. Depois ela volta sozinha em cada data."
                  : "Uma vez só, com prazo próprio."}
              </p>
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

          <div className="space-y-4 border-t border-line-soft pt-5">
            {/*
              Cliente, projeto e prioridade em TRES colunas. Em duas, o
              projeto sobrava sozinho numa linha e deixava meia largura
              vazia embaixo do cliente -- um buraco no meio do formulario.
            */}
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
              {/*
                Cliente e projeto vêm do cadastro, e não mais de texto livre.

                O campo era um `<input>` com sugestões, e sugestão não impede
                nada: bastava um espaço a mais para nascer um cliente novo em
                silêncio — foi assim que a Bia virou cinco. Escolhendo de uma
                lista, a demanda aponta para uma linha do cadastro, e renomear
                lá muda aqui.

                O projeto depende do cliente: sem cliente escolhido ele não tem
                o que oferecer, e por isso fica desabilitado em vez de mostrar
                uma lista de projetos soltos de donos diferentes.
              */}
              <Field
                label="Cliente"
                hint={
                  cadastro.length === 0
                    ? "Cadastre em Gerenciar › Clientes e projetos."
                    : undefined
                }
              >
                <Select
                  value={form.cliente_id}
                  onChange={(e) =>
                    setForm({
                      ...form,
                      cliente_id: e.target.value,
                      /* Trocar de cliente zera o projeto: manter o anterior
                         deixaria a demanda apontando para um projeto de outro
                         dono, que é pior que não ter projeto. */
                      projeto_id: "",
                    })
                  }
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
                  onChange={(e) =>
                    setForm({ ...form, projeto_id: e.target.value })
                  }
                >
                  <option value="">Sem projeto</option>
                  {projetosDoCliente.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.nome}
                    </option>
                  ))}
                </Select>
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

            {/* A linha fica no MESMO lugar nos dois tipos, para o
                formulario nao saltar ao trocar de avulsa para recorrente. */}
            {!form.recurring ? (
              <div className="grid gap-4 sm:grid-cols-3">
                <Field label="Prazo">
                  <SeletorDeData
                    value={form.due_date}
                    onChange={(due_date) => setForm({ ...form, due_date })}
                  />
                </Field>
                {/*
                  Horário é opcional, e o campo diz isso sem precisar de rótulo
                  extra: ele só liga quando há um dia escolhido.

                  A maioria das demandas é do dia inteiro — "gravar o vídeo" não
                  tem hora. Um campo obrigatório faria inventar uma hora para
                  todas, e aí o cartão mostraria um horário que não quer dizer
                  nada. Desligado sem data porque hora de dia nenhum não tem
                  onde aparecer.
                */}
                <Field
                  label="Horário"
                  hint={form.due_date ? "Opcional." : "Escolha o prazo primeiro."}
                >
                  <Input
                    type="time"
                    value={form.due_time}
                    disabled={!form.due_date}
                    onChange={(e) => setForm({ ...form, due_time: e.target.value })}
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
            ) : (
              <div className="grid gap-4 sm:grid-cols-2">
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

          <div className="space-y-4 border-t border-line-soft pt-5">
            <Field label="Descrição">
              <Textarea
                rows={3}
                value={form.description}
                onChange={(e) => setForm({ ...form, description: e.target.value })}
                placeholder="Contexto, o que precisa ser entregue..."
              />
            </Field>

            <Field
              label="Links do material"
              hint="Roteiro, vídeo bruto, pasta. Abrem em outra aba."
            >
              <EditorLinks
                links={form.links}
                onChange={(links) => setForm({ ...form, links })}
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
              <EditorChecklist itens={checklist} onChange={setChecklist} />
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
      {notice.node}
    </div>
  );
}

/**
 * Grava, e se o banco não conhecer uma coluna opcional, grava sem ela.
 *
 * Duas colunas desta tela vêm de arquivos SQL que podem não ter rodado:
 * `links` e `due_time`. A tentativa se repete sem quem faltou, e devolve a
 * lista do que ficou de fora para a tela avisar qual arquivo rodar.
 *
 * O limite de voltas é o número de colunas opcionais: sem ele, um erro que
 * sempre casa giraria para sempre.
 */
type Campos = Record<string, unknown>;

async function gravarTolerando<R>(
  campos: Campos,
  /* PromiseLike e não Promise: o builder do Supabase é um thenable, e exigir
     Promise obrigaria um `await` extra em cada chamada só para agradar o
     tipo. `any` no retorno do builder vem da própria biblioteca. */
  executar: (
    campos: Campos
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
  ) => PromiseLike<{ data: any; error: { message: string } | null }>
): Promise<{
  data: R | null;
  error: { message: string } | null;
  faltaram: ColunaOpcional[];
}> {
  let atual = campos;
  const faltaram: ColunaOpcional[] = [];
  for (let volta = 0; volta <= COLUNAS_OPCIONAIS.length; volta++) {
    const r = await executar(atual);
    const falta = colunaQueFaltou(r.error?.message);
    if (!falta || !(falta.coluna in atual)) return { ...r, faltaram };
    faltaram.push(falta);
    atual = semColuna(atual, falta.coluna);
  }
  const r = await executar(atual);
  return { ...r, faltaram };
}

/** "Demanda salva, mas os links não: rode supabase/X.sql no banco." */
const recadoDoQueFaltou = (faltaram: ColunaOpcional[]) =>
  `Demanda salva, mas ${faltaram.map((f) => f.rotulo).join(" e ")} não: rode ${faltaram
    .map((f) => "supabase/" + f.arquivo)
    .join(" e ")} no banco.`;
