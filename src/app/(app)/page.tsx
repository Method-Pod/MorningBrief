"use client";

import * as React from "react";
import Link from "next/link";
import {
  AlertCircle,
  BookOpen,
  Library,
  CalendarDays,
  CheckCircle2,
  CreditCard,
  ListChecks,
  Pin,
  PieChart,
  Plus,
  Repeat2,
  Trash2,
  Wallet,
  Zap,
  Check,
  Repeat,
} from "lucide-react";
import { Clima } from "@/components/Clima";
import { createClient } from "@/lib/supabase/client";
import { nenhumaLinha } from "@/lib/erros";
import { temCache, useEstadoCacheado } from "@/lib/cachePagina";
import { currentUserId, SESSION_EXPIRED } from "@/lib/session";
import {
  CORES_HEX,
  dataDoFechamento,
  jaFechou,
  semValorAinda,
} from "@/lib/types";
import type { Bill, CalendarEvent, Note, RecurringTask, Task } from "@/lib/types";
import {
  brl,
  dataCurta,
  dateBR,
  daysUntil,
  greeting,
  inicioDeOntem,
  localDay,
  localTime,
  todayISO,
  valorDigitado,
} from "@/lib/format";
import { textoDaNota } from "@/lib/notas";
import { frequencyDescription, isDueOn, nextOccurrence } from "@/lib/recurring";
import { ultimaVirada } from "@/lib/viradaDoDia";
import {
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
import { Card, useNotice, cx,
  EsqueletoPagina,
} from "@/components/ui";
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

type Habito = { id: string; name: string; color: string };

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
    () =>
      !temCache(
        "bills",
        "tasks",
        "recurring_tasks",
        "painel_eventos",
        "painel_notas"
      )
  );
  const [bills, setBills] = useEstadoCacheado<Bill[]>("bills", []);
  const [tasks, setTasks] = useEstadoCacheado<Task[]>("tasks", []);
  const [recurring, setRecurring] = useEstadoCacheado<RecurringTask[]>("recurring_tasks", []);
  /*
   * Chave própria, e não a do calendário e a das anotações.
   *
   * As duas consultas abaixo passaram a trazer um recorte — os eventos de
   * hoje em diante, e só as duas notas fixadas. Guardar esse recorte sob a
   * chave que o Calendário e as Anotações leem faria aquelas telas abrirem
   * com um pedaço dos dados até a consulta delas responder, o que é pior do
   * que abrirem vazias.
   *
   * O preço é real e assumido: o painel deixa de adiantar o cache daquelas
   * duas telas. Ele é a tela de entrada e a que mais se abre; carregar a
   * agenda inteira e o corpo de todas as anotações aqui para adiantar uma
   * visita que pode não acontecer é pagar sempre por um ganho eventual.
   */
  const [events, setEvents] = useEstadoCacheado<CalendarEvent[]>("painel_eventos", []);
  const [notes, setNotes] = useEstadoCacheado<Note[]>("painel_notas", []);
  const [lendo, setLendo] = useEstadoCacheado<Livro[]>("painel_lendo", []);
  const [refs, setRefs] = useEstadoCacheado<Ref[]>("painel_refs", []);
  /*
   * Hábitos no brief da manhã.
   *
   * O brief tinha Hoje, Contas e Agenda — e não tinha hábitos, que é
   * justamente a coisa que se marca de manhã. Para dar baixa num hábito era
   * preciso lembrar sozinho de abrir outra aba, o que anula o sentido de
   * existir um brief: ele deveria ser o único lugar que se olha ao acordar.
   */
  const [habitos, setHabitos] = useEstadoCacheado<Habito[]>("painel_habitos", []);
  const [marcados, setMarcados] = useEstadoCacheado<string[]>("painel_habitos_hoje", []);
  const [generated, setGenerated] = React.useState(0);
  const [limpas, setLimpas] = React.useState(0);
  const [draft, setDraft] = React.useState("");
  const [adding, setAdding] = React.useState(false);
  const notice = useNotice();
  const { nome } = useIdentity();

  const today = todayISO();

  const load = React.useCallback(async () => {
    const [b, t, r, e, n, lv, rf, hb, hl] = await Promise.all([
      supabase.from("bills").select("*").order("due_date"),
      supabase.from("tasks").select("*").order("created_at", { ascending: false }),
      supabase.from("recurring_tasks").select("*").order("created_at"),
      /*
       * Agenda: de ontem para frente, e não a vida inteira.
       *
       * O painel mostra dois recortes — o que é hoje e os quatro próximos.
       * Nada atrás disso aparece em lugar nenhum desta tela, e `events` não
       * tinha filtro de data: ano após ano, cada abertura do painel baixava
       * de novo tudo o que já aconteceu.
       *
       * O corte é a meia-noite de *ontem*, não a de hoje, porque o fuso
       * mexe: um evento gravado em UTC pode cair no dia anterior quando lido
       * na hora local, e é a hora local que a tela usa para decidir o que é
       * "hoje". Um dia de folga cobre a diferença. O teto de 100 é o que
       * garante os quatro próximos com sobra — vêm em ordem de data.
       */
      supabase
        .from("events")
        .select("*")
        .gte("start_at", inicioDeOntem())
        .order("start_at")
        .limit(100),
      /*
       * Anotações: só as fixadas, e só duas.
       *
       * Era `select("*")` sem filtro, para desenhar dois cartõezinhos. Como
       * `content` guarda o HTML inteiro da anotação, o painel baixava o
       * corpo de **todas** elas a cada abertura para mostrar o começo de
       * duas — de longe a maior transferência desta tela, e ela cresce a
       * cada anotação escrita.
       */
      supabase
        .from("notes")
        .select("id,title,content,color,pinned,updated_at")
        .eq("pinned", true)
        .order("updated_at", { ascending: false })
        .limit(2),
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
      /* Só os ativos, e só as marcas de hoje: o brief não mostra histórico.
         Tolera falha como leitura e referências — quem não rodou o SQL de
         hábitos simplesmente não vê o cartão. */
      supabase.from("habits").select("id,name,color").eq("active", true),
      supabase.from("habit_logs").select("habit_id").eq("day", today),
    ]);
    // numeric do Postgres vem como string no JSON; normaliza na fronteira
    setBills(
      ((b.data as Bill[]) ?? []).map((x) => ({ ...x, amount: Number(x.amount) }))
    );
    /* Descarta o que a limpeza vai apagar: sem isso, a demanda concluída num
       dia de manutenção já encerrado apareceria por um instante antes de o
       delete responder. Mesma virada que a limpeza usa, senão o que some da
       tela e o que sai do banco discordariam. */
    const corte = ultimaVirada().getTime();
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
    setHabitos((hb.data as Habito[]) ?? []);
    setMarcados(((hl.data as { habit_id: string }[]) ?? []).map((x) => x.habit_id));
    return (r.data as RecurringTask[]) ?? [];
  }, [supabase]);


  /**
   * Marca ou desmarca um hábito sem sair do brief.
   *
   * Otimista: a marca muda na hora e o banco confirma atrás. Esperar a volta
   * da rede para riscar o item faria o toque parecer engasgado, e é um toque
   * que se dá várias vezes em sequência de manhã.
   *
   * Em caso de falha, desfaz o que foi mostrado — é a única forma honesta de
   * ser otimista: assumir sucesso e corrigir a tela se não foi.
   */
  const alternarHabito = React.useCallback(
    async (habitId: string) => {
      const tinha = marcados.includes(habitId);
      setMarcados((v) =>
        tinha ? v.filter((x) => x !== habitId) : [...v, habitId]
      );

      const desfazer = () =>
        setMarcados((v) =>
          tinha ? [...v, habitId] : v.filter((x) => x !== habitId)
        );

      if (tinha) {
        const { error } = await supabase
          .from("habit_logs")
          .delete()
          .eq("habit_id", habitId)
          .eq("day", today);
        if (error) desfazer();
        return;
      }

      const uid = await currentUserId(supabase);
      if (!uid) return desfazer();
      const { error } = await supabase
        .from("habit_logs")
        .insert({ user_id: uid, habit_id: habitId, day: today });
      /* 23505 = unique(habit_id, day): já estava marcado em outra aba. O
         resultado desejado é o que está na tela, então não é falha. */
      if (error && error.code !== "23505") desfazer();
    },
    [marcados, setMarcados, supabase]
  );

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
    const { data: gravadas, error } = await supabase
      .from("tasks")
      .update({
        status: done ? "todo" : "done",
        completed_at: done ? null : new Date().toISOString(),
      })
      .eq("id", t.id)
      .select("id");
    // A tela já foi atualizada de forma otimista; só recarrega se falhou,
    // para desfazer. Recarregar sempre custava uma busca completa por clique.
    if (notice.check(error ?? nenhumaLinha(gravadas), done ? "reabrir a tarefa" : "concluir a tarefa"))
      load();
  };

  /* ------------------------------ derivados ------------------------------ */
  /**
   * As contas que já fecharam e ainda esperam um valor.
   *
   * Paga também entra, e isso é de propósito. A primeira versão cobrava só as
   * em aberto, pelo raciocínio de que conta paga é assunto encerrado. Está
   * errado para fatura de valor variável: quem paga a fatura e marca como
   * paga antes de lançar o número tem uma conta **mais** incompleta que a
   * outra, não menos — o dinheiro já saiu e ninguém sabe quanto foi. O total
   * do mês fica mentindo em R$ 0,00, e o lembrete, que era o que faria a
   * pessoa corrigir, não aparecia justamente no caso em que mais falta.
   */
  const aCobrar = React.useMemo(
    () => bills.filter((b) => semValorAinda(b) && jaFechou(b, today)),
    [bills, today]
  );

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
      /*
       * O que JA saiu do mes, e o que dele esta vencido.
       *
       * `totalMes` e `abertoMes` ja existiam e dizem quanto falta. Faltava a
       * outra metade — quanto andou — e e ela que o resumo mostra: um mes com
       * R$ 200 em aberto significa coisas muito diferentes se o total for
       * R$ 300 ou R$ 3.000.
       */
      pagoMes: bills
        .filter(
          (b) => b.status === "paid" && b.due_date.startsWith(today.slice(0, 7))
        )
        .reduce((s, b) => s + Number(b.amount), 0),
      vencidoMes: bills
        .filter(
          (b) =>
            b.status === "pending" &&
            b.due_date.startsWith(today.slice(0, 7)) &&
            daysUntil(b.due_date) < 0
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

    };
  }, [tasks, bills, recurring, events, notes, today]);

  if (loading) return <EsqueletoPagina blocos={4} />;

  /* Raio e circunferência do anel do card escuro: o `strokeDashoffset` precisa
     do perímetro para desenhar a fatia. */
  const R = 34;
  const C = 2 * Math.PI * R;

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
        <span className="flex items-center gap-2.5 whitespace-nowrap rounded-full bg-ink-900 px-4 py-2.5 text-[13px] font-semibold text-fg-dim shadow-[var(--elev-1)]">
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
          {limpas > 1 ? "s" : ""} de ontem {limpas > 1 ? "foram" : "foi"}{" "}
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

      {/*
        Fatura fechou e ninguém disse quanto foi.

        Em cima de tudo, e com o campo aqui mesmo: a conta já existe e já está
        na lista de Contas a pagar, mas com valor zero ela não puxa a atenção
        de ninguém — some no meio das outras e só aparece como problema quando
        o total do mês não fecha. Perguntar no lugar em que se abre o dia é o
        que faz a pergunta ser respondida.

        Só a partir do dia do fechamento: as contas fixas são geradas um mês
        antes, e sem esse corte o aviso cobraria em setembro o valor de uma
        fatura de outubro. Ver `jaFechou` em lib/types.
      */}
      {aCobrar.map((b) => (
        <ValorDaFatura
          key={b.id}
          conta={b}
          onGravar={async (valor) => {
            const { error } = await supabase
              .from("bills")
              .update({ amount: valor })
              .eq("id", b.id)
              .select("id");
            if (error) return notice.show("Não deu para gravar o valor.");
            setBills((r) =>
              r.map((x) => (x.id === b.id ? { ...x, amount: valor } : x))
            );
          }}
        />
      ))}

      {/* ------------------------ seu dia + hoje ------------------------ */}
      <div className="grid grid-cols-1 gap-4 xl:grid-cols-[300px_minmax(0,1fr)]">
        <div className="flex flex-col rounded-[22px] bg-gradient-to-br from-[var(--bloco-1)] to-[var(--bloco-2)] p-[22px] text-white">
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
            {/* O número e a barra saíram: são os mesmos da faixa acima. Este
                cartão passa a ser só a lista e o campo de adicionar. */}
            <form onSubmit={quickAdd} className="flex gap-2.5">
              <input
                value={draft}
                onChange={(e) => setDraft(e.target.value)}
                placeholder="Adicionar tarefa de hoje..."
                aria-label="Adicionar tarefa de hoje"
                className="h-[38px] flex-1 rounded-[14px] border border-transparent bg-ink-800 px-3.5 text-sm outline-none transition-colors focus:border-brand-500 focus:bg-ink-900"
              />
              <button
                type="submit"
                disabled={adding || !draft.trim()}
                aria-label="Adicionar"
                className="grid h-[38px] w-[38px] shrink-0 place-items-center rounded-[14px] bg-brand-500 shadow-[var(--brilho)] hover:shadow-[var(--brilho-forte)] text-on-brand transition-[filter] hover:brightness-95 disabled:opacity-40"
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
      {/*
        Anotações sozinha na faixa, largura cheia.
        
        Ela dividia esta linha com "O que vem", que saiu. Deixá-la na grade de
        duas colunas faria o cartão ocupar 60% da linha e o resto ficar vazio.
      */}
      <div className="mt-4">
        <Card>
          <Head icon={<StickyIcon />} title="Anotações" href="/anotacoes" link="escrever" />
          <div className="px-[18px] pb-[18px] pt-3">
            {m.pinned.length === 0 ? (
              <Ghost>Nada fixado ainda.</Ghost>
            ) : (
              m.pinned.map((n) => {
                const previa = textoDaNota(n.content);
                return (
                <div key={n.id} className="border-b border-line-soft py-2.5 last:border-0">
                  <div className="flex items-center gap-1.5">
                    <Pin size={12} style={{ color: CORES_HEX[n.color] ?? CORES_HEX.blue }} />
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
                  {previa && (
                    <p className="mt-1 line-clamp-2 text-[11.5px] leading-relaxed text-fg-mute">
                      {previa}
                    </p>
                  )}
                </div>
                );
              })
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

        {/*
          Hábitos, com a marcação aqui mesmo.

          Mostrar só a lista obrigaria a abrir a aba de Hábitos para dar baixa
          — e aí o brief vira um aviso, não um lugar onde se resolve. Marcar
          custa um toque e a tela não recarrega: a mudança é otimista, e o
          banco confirma atrás.

          Só aparece se houver hábito ativo. Sem nenhum, um cartão vazio
          ocuparia a faixa mais valiosa da tela para dizer que não há nada.
        */}
        {habitos.length > 0 && (
          <Card>
            <Head
              icon={<Repeat size={14} />}
              title="Hábitos"
              href="/habitos"
              link="ver todos"
            />
            <div className="px-[18px] pb-[18px] pt-1.5">
              <div className="flex items-baseline gap-2.5 pt-2.5">
                <b className="text-2xl font-bold tracking-[-0.035em] tnum">
                  {marcados.length}/{habitos.length}
                </b>
                <span className="text-xs text-fg-mute">marcados hoje</span>
              </div>
              <div className="mt-3 flex flex-col">
                {habitos.map((h) => {
                  const feito = marcados.includes(h.id);
                  return (
                    <button
                      key={h.id}
                      onClick={() => alternarHabito(h.id)}
                      aria-pressed={feito}
                      className="flex items-center gap-2.5 rounded-[10px] py-1.5 pr-1 text-left transition-colors hover:bg-ink-800"
                    >
                      <span
                        className={cx(
                          "grid h-[18px] w-[18px] shrink-0 place-items-center rounded-[6px] border transition-colors",
                          feito
                            ? "border-transparent bg-brand-500 text-white"
                            : "border-line"
                        )}
                      >
                        {feito && <Check size={12} strokeWidth={3} />}
                      </span>
                      <span
                        className={cx(
                          "min-w-0 flex-1 truncate text-sm font-medium",
                          feito && "text-fg-mute line-through"
                        )}
                      >
                        {h.name}
                      </span>
                    </button>
                  );
                })}
              </div>
            </div>
          </Card>
        )}

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
                      style={{ background: CORES_HEX[e.color] ?? "var(--a)" }}
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

        {/* --------------------------- resumo do mês --------------------------- */}
        {/*
          A quarta peça da faixa, e ela existe por duas razões.

          A primeira é o buraco: a faixa tem três cartões e duas colunas na
          largura de tablet, então o terceiro ficava sozinho na segunda linha
          com meia tela vazia ao lado. Com quatro, fecha 2×2. No `xl:`, onde as
          três cabem numa linha, esta atravessa as três colunas e vira uma
          faixa — que é a forma certa para uma fileira de números.

          A segunda é o conteúdo: "Contas a pagar" diz quanto FALTA, e nunca
          quanto andou. R$ 200 em aberto quer dizer coisas opostas num mês de
          R$ 300 e num de R$ 3.000. Aqui a barra responde isso de um olhar.
        */}
        <Card className="md:col-span-2 xl:col-span-3">
          <Head icon={<PieChart size={14} />} title={`Resumo de ${nomeMes}`} href="/contas" link="abrir contas" />
          <div className="px-[18px] pb-[18px] pt-3">
            {m.totalMes === 0 ? (
              <Ghost>Nenhuma conta lançada neste mês.</Ghost>
            ) : (
              <>
                {/*
                  Uma barra só, com as três parcelas na ordem em que se lê o
                  mês: o que saiu, o que está vencido, o que ainda vai vencer.
                  A folga de 2px entre elas é o que deixa duas parcelas
                  vizinhas de cores próximas ainda se separarem.
                */}
                <div className="flex h-2.5 w-full gap-[2px] overflow-hidden rounded-full bg-ink-800">
                  {[
                    ["pago", m.pagoMes, "bg-pos"],
                    ["vencido", m.vencidoMes, "bg-neg"],
                    ["a vencer", Math.max(0, m.abertoMes - m.vencidoMes), "bg-[var(--cor-barra)]"],
                  ].map(([nome, valor, cor]) =>
                    (valor as number) > 0 ? (
                      <span
                        key={nome as string}
                        className={cx("h-full first:rounded-l-full last:rounded-r-full", cor as string)}
                        style={{ width: `${((valor as number) / m.totalMes) * 100}%` }}
                        title={`${nome}: ${brl(valor as number)}`}
                      />
                    ) : null
                  )}
                </div>

                {/*
                  O NÚMERO vai em tinta de texto — preto no claro, branco no
                  escuro —, e nunca na cor da série.

                  Quem diz "isto é o pago" é a bolinha ao lado, que já repete a
                  cor do pedaço da barra. Pintando o número também, a cor passa
                  a ser dita duas vezes e o valor perde legibilidade nas duas
                  pontas: vermelho sobre branco e vermelho sobre quase-preto são
                  os dois piores contrastes desta tela.
                */}
                <dl className="mt-3.5 grid grid-cols-2 gap-x-4 gap-y-3 sm:grid-cols-4">
                  {[
                    ["Total do mês", m.totalMes, null],
                    ["Pago", m.pagoMes, "bg-pos"],
                    ["Vencido", m.vencidoMes, "bg-neg"],
                    ["A vencer", Math.max(0, m.abertoMes - m.vencidoMes), "bg-[var(--cor-barra)]"],
                  ].map(([rotulo, valor, ponto]) => (
                    <div key={rotulo as string}>
                      <dt className="flex items-center gap-1.5 text-[11.5px] text-fg-mute">
                        {/* A bolinha liga o número ao pedaço da barra: sem ela
                            a barra vira enfeite e a lista vira tabela. */}
                        {ponto && (
                          <span className={cx("h-[7px] w-[7px] shrink-0 rounded-full", ponto as string)} />
                        )}
                        {rotulo as string}
                      </dt>
                      <dd className="mt-0.5 text-[17px] font-bold tracking-[-0.03em] text-fg tnum">
                        {brl(valor as number)}
                      </dd>
                    </div>
                  ))}
                </dl>
              </>
            )}
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
        <div className="mt-4 grid grid-cols-1 gap-4 xl:grid-cols-[minmax(0,1fr)_minmax(0,1.35fr)]">
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
                                className="block h-full w-full origin-left rounded-full bg-[var(--cor-barra)] transition-transform duration-300"
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

/**
 * O aviso de fatura fechada, com o campo para digitar o valor.
 *
 * Componente próprio porque cada aviso tem o seu rascunho: com um estado só,
 * digitar no aviso do cartão A escreveria no campo do cartão B.
 */
function ValorDaFatura({
  conta,
  onGravar,
}: {
  conta: Bill;
  onGravar: (valor: number) => Promise<void>;
}) {
  const [texto, setTexto] = React.useState("");
  const [gravando, setGravando] = React.useState(false);
  /* A data no aviso serve de conferência: se ela não bate com o fechamento
     do cartão, o erro está no cadastro e dá para ver sem esperar o mês. */
  const fechou = dataDoFechamento(conta);

  /* Aceita "1.234,56" e "1234.56": é o mesmo tratamento do formulário de
     contas, e quem digita não deveria ter de saber qual dos dois o campo
     espera. */
  const valor = valorDigitado(texto);
  const vale = Number.isFinite(valor) && valor >= 0;

  const gravar = async () => {
    if (!vale || gravando) return;
    setGravando(true);
    await onGravar(valor);
    setGravando(false);
  };

  return (
    <div className="mb-4 flex flex-wrap items-center gap-2.5 rounded-[14px] bg-warn/12 px-4 py-3 text-[12.5px] font-medium text-warn">
      <CreditCard size={15} className="shrink-0" />
      {/* "quanto foi" na paga, "quanto ficou" na que ainda vence: a primeira
          já aconteceu, e perguntar no futuro soaria como se o app não
          soubesse que ela foi paga. */}
      <span className="min-w-0">
        A fatura de <b>{conta.description}</b>{" "}
        {conta.status === "paid" ? (
          <>foi paga e ainda não tem valor. Quanto foi?</>
        ) : (
          <>
            fechou{fechou && ` em ${dataCurta(fechou)}`}. Quanto ficou?
          </>
        )}
      </span>
      <div className="ml-auto flex items-center gap-2">
        <input
          value={texto}
          onChange={(e) => setTexto(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && gravar()}
          inputMode="decimal"
          placeholder="0,00"
          aria-label={`Valor da fatura de ${conta.description}`}
          className="h-8 w-[110px] rounded-lg border border-warn/30 bg-ink-900 px-2.5 text-right text-[13px] font-bold text-fg outline-none transition-colors tnum focus:border-warn"
        />
        <button
          type="button"
          onClick={gravar}
          disabled={!vale || gravando}
          className="h-8 rounded-lg bg-warn px-3 text-[12px] font-bold text-white transition-opacity disabled:opacity-40"
        >
          {gravando ? "..." : "Lançar"}
        </button>
      </div>
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
      {/*
        `prefetch={false}` pelo mesmo motivo da barra lateral: são sete
        cabeçalhos de cartão, todos visíveis ao abrir, e cada um adiantava a
        sua tela sozinho. Somados aos nove da barra, davam dezesseis pedidos
        ao servidor antes de o painel buscar o primeiro dado dele.
      */}
      <Link
        href={href}
        prefetch={false}
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
