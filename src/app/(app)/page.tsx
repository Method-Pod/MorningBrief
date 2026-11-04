"use client";

import * as React from "react";
import Link from "next/link";
import {
  AlertCircle,
  ArrowUpRight,
  Library,
  CalendarDays,
  CheckCircle2,
  CreditCard,
  Pin,
  Plus,
  Repeat2,
  Trash2,
  Wallet,
  Zap,
} from "lucide-react";
import { Clima } from "@/components/Clima";
import { CartaoRevisao, EnergiaDoDia } from "@/components/RevisaoDaSemana";
import { Contador } from "@/components/Contador";
import { Kpi } from "@/components/CabecalhoPagina";
import { Explicacao, Ressalva } from "@/components/Explicacao";
import { createClient } from "@/lib/supabase/client";
import { nenhumaLinha } from "@/lib/erros";
import { temCache, useEstadoCacheado } from "@/lib/cachePagina";
import { currentUserId, SESSION_EXPIRED } from "@/lib/session";
import {
  corDoRotulo,
  dataDoFechamento,
  estaArquivada,
  jaFechou,
  semValorAinda,
} from "@/lib/types";
import type { Bill, CalendarEvent, Note, RecurringTask, Task } from "@/lib/types";
import {
  brl,
  dataCurta,
  dateBR,
  daysUntil,
  decodificarEntidades,
  greeting,
  inicioDeOntem,
  localDay,
  localTime,
  todayISO,
  valorDigitado,
} from "@/lib/format";
import { textoDaNota } from "@/lib/notas";
import { fechamentoDoMes, mesAnterior, nomeDoMes } from "@/lib/brief";
import { frequencyDescription, isDueOn, nextOccurrence } from "@/lib/recurring";
import { ultimaVirada } from "@/lib/viradaDoDia";
import {
  limparAulasAssistidas,
  limparConcluidas,
  MESES_RETENCAO_PAGAS,
} from "@/lib/limpeza";
import { evolucaoDosGastos } from "@/lib/evolucao";
import { imagemReduzida, voltarAoOriginal } from "@/lib/imagem";
import { EvolucaoMensal } from "@/components/charts";
import {
  estenderEventosRecorrentes,
  lancarProximoMesDasFixas,
  marcarManutencaoFeita,
  precisaDeManutencao,
  reporRecorrentesPerdidas,
} from "@/lib/manutencao";
import { Card, useNotice, cx,
  EsqueletoPagina,
  ErroDeCarga,
} from "@/components/ui";
import { useIdentity } from "@/components/identity";

/* Recorte das referências: só as colunas que o cartão mostra. */
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
const REPETE: Record<string, string> = {
  weekly: "toda semana",
  biweekly: "a cada 2 semanas",
  monthly: "todo mês",
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
  const [refs, setRefs] = useEstadoCacheado<Ref[]>("painel_refs", []);
  /*
   * Hábitos, Aulas e Leitura saíram do Início — pedido dele: continuam no
   * menu, cada um com a sua tela, mas o brief fica com o que vence (dinheiro,
   * prazos, agenda). As consultas saíram junto: o Início não busca mais o que
   * não mostra.
   */
  const [erroCarga, setErroCarga] = React.useState("");
  const [generated, setGenerated] = React.useState(0);
  const [limpas, setLimpas] = React.useState(0);
  const [draft, setDraft] = React.useState("");
  const [adding, setAdding] = React.useState(false);
  const notice = useNotice();
  const { nome } = useIdentity();

  const today = todayISO();

  const load = React.useCallback(async () => {
    const [b, t, r, e, n, rf] = await Promise.all([
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
      /* Referências toleram falha: quem não rodou REFERENCIAS.sql
         simplesmente não vê o cartão. */
      supabase
        .from("referencias")
        .select("id,name,url,image_url,icon_url,image_own,busca,created_at")
        .order("created_at", { ascending: false })
        .limit(8),
    ]);
    /*
     * Falha não vira tela vazia.
     *
     * O painel ignorava o erro das consultas: uma queda de rede virava
     * "Nenhuma conta lançada", R$ 0,00 e agenda livre — tudo apresentado como
     * verdade, e gravado no cache da aba. Agora, se alguma das consultas que
     * sustentam o brief falha, nada é sobrescrito: a tela continua com o que
     * já tinha e avisa no topo.
     */
    const falhou = b.error ?? t.error ?? r.error ?? e.error ?? n.error;
    if (falhou) {
      setErroCarga(falhou.message);
      return null;
    }
    setErroCarga("");
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
    setEvents(((e.data as CalendarEvent[]) ?? []).filter((x) => !x.cancelado));
    setNotes((n.data as Note[]) ?? []);
    if (!rf.error) setRefs((rf.data as Ref[]) ?? []);
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
      /* Sem argumento: o dia de manutenção, que vira às 6h. Passar `today`
         (a data do calendário) fazia abrir o app à 00h10 rodar a limpeza e
         as recorrentes seis horas antes da virada combinada. */
      if (!precisaDeManutencao()) return;

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
        marcarManutencaoFeita();

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

  /* Os mesmos meses do gráfico do Financeiro: os que a retenção guarda para
     trás, e o resto à frente. */
  const evolucao = React.useMemo(
    () =>
      evolucaoDosGastos(bills, today, MESES_RETENCAO_PAGAS - 1, 12 - MESES_RETENCAO_PAGAS),
    [bills, today]
  );

  const m = React.useMemo(() => {
    /* Arquivada fica fora do dia: está guardada, não é trabalho de hoje. */
    const ativas = tasks.filter((t) => !estaArquivada(t));
    const hoje = ativas.filter((t) => t.due_date?.slice(0, 10) === today);
    const open = ativas.filter((t) => t.status !== "done");
    const pend = bills.filter((b) => b.status === "pending");

    /*
     * O que "Hoje" mostra: o que vence hoje mais o que passou do prazo.
     *
     * O atrasado entra aqui porque é a coisa mais urgente que existe, e
     * ficava escondido num contador. Ordem: atrasado primeiro, depois por
     * prioridade, e o concluído desce.
     */
    const doDia = [
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
    );

    /*
     * O número de cima conta a MESMA lista que aparece embaixo.
     *
     * Contava só o que vence hoje, e a lista mostrava também as atrasadas:
     * "0/2" em cima de três linhas. Quem lê um número que não bate com a
     * lista ao lado para de acreditar nos dois.
     */
    const feitas = doDia.filter((t) => t.status === "done").length;
    const pct = doDia.length ? Math.round((feitas / doDia.length) * 100) : 0;

    /*
     * Agenda: um evento que se repete aparece uma vez, a próxima.
     *
     * A mentoria semanal ocupava as quatro linhas do cartão — 06/10, 13/10,
     * 20/10, 27/10 —, e qualquer outro compromisso do mês ficava de fora.
     * A repetição vira um rótulo ("toda semana") na própria linha.
     */
    const vistos = new Set<string>();
    const up = events
      .filter((e) => localDay(e.start_at) >= today)
      .filter((e) => {
        if (!e.series_id) return true;
        if (vistos.has(e.series_id)) return false;
        vistos.add(e.series_id);
        return true;
      })
      .slice(0, 4);

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
      up,
      pinned: notes.filter((n) => n.pinned).slice(0, 2),

      doDia,
    };
  }, [tasks, bills, recurring, events, notes, today]);

  if (loading) return <EsqueletoPagina blocos={4} />;

  /* Raio e circunferência do anel do card escuro: o `strokeDashoffset` precisa
     do perímetro para desenhar a fatia. */
  const R = 70;
  const C = 2 * Math.PI * R;

  const now = new Date();
  const nomeMes = now.toLocaleDateString("pt-BR", { month: "long" });

  return (
    <div className="rise">
      {/*
        O cabeçalho da referência: o título grande em duas linhas e, ao lado,
        os números que importam ao abrir o dia, cada um com o seu ícone num
        círculo de vidro. Data e clima ficam na pílula da direita.
      */}
      <div className="mb-6 flex flex-wrap items-center gap-x-8 gap-y-3 sm:gap-y-5">
        <h1 className="titulo-pagina w-full min-w-0 sm:w-auto">
          {greeting()},
          <br />
          <span className="text-fg-dim">{nome ? `${nome}!` : "bem-vindo!"}</span>
        </h1>

        <div className="flex w-full flex-wrap items-center gap-x-4 gap-y-3 sm:w-auto sm:flex-1 sm:gap-x-7">
          <Kpi
            icone={<CheckCircle2 size={17} />}
            valor={
              <>
                <Contador valor={m.feitas} />
                <span className="text-fg-mute">/{m.doDia.length}</span>
              </>
            }
            rotulo="tarefas de hoje"
            selo={
              m.lateT.length > 0 ? (
                <span className="rounded-full bg-neg/15 px-2 py-0.5 text-[11px] font-bold text-neg">
                  {m.lateT.length} atrasada{m.lateT.length > 1 ? "s" : ""}
                </span>
              ) : null
            }
          />
          <Kpi
            icone={<Wallet size={17} />}
            valor={<Contador valor={m.abertoMes} formatar={brl} />}
            rotulo={`em aberto em ${nomeMes}`}
          />
          <Kpi
            icone={<CalendarDays size={17} />}
            valor={<Contador valor={m.soon.length} />}
            rotulo="vencem em 7 dias"
            selo={
              m.late.length > 0 ? (
                <span className="rounded-full bg-neg/15 px-2 py-0.5 text-[11px] font-bold text-neg">
                  {m.late.length} em atraso
                </span>
              ) : null
            }
          />
        </div>

        {/* Data e clima na mesma pílula, separados por um traço fino. */}
        <span className="vidro-solido flex items-center gap-2.5 whitespace-nowrap rounded-full px-4 py-2.5 text-[13px] font-semibold text-fg-dim">
          {now.toLocaleDateString("pt-BR", {
            weekday: "long",
            day: "2-digit",
            month: "long",
          })}
          <Clima className="flex items-center gap-1.5 border-l border-line pl-2.5" />
        </span>
      </div>

      {erroCarga && (
        <ErroDeCarga detalhe={erroCarga} onTentar={load} className="mb-4" />
      )}

      {limpas > 0 && (
        <div className="vidro-solido mb-4 flex items-center gap-2.5 rounded-full px-4 py-2.5 text-[12.5px] text-fg-mute">
          <Trash2 size={15} className="shrink-0" />
          {limpas} demanda{limpas > 1 ? "s" : ""} concluída
          {limpas > 1 ? "s" : ""} de ontem {limpas > 1 ? "foram" : "foi"}{" "}
          removida{limpas > 1 ? "s" : ""}.
        </div>
      )}

      {generated > 0 && (
        <div className="mb-4 flex items-center gap-2.5 rounded-full border border-brand-500/30 bg-brand-500/15 px-4 py-2.5 text-[12.5px] font-medium text-brand-400">
          <Repeat2 size={15} className="shrink-0" />
          {generated} demanda{generated > 1 ? "s" : ""} criada
          {generated > 1 ? "s" : ""} pelas recorrências de hoje.
          <Link href="/demandas" className="ml-auto font-bold underline">
            Ver
          </Link>
        </div>
      )}

      {/*
        Fatura fechou e ninguém disse quanto foi: pergunta no lugar em que se
        abre o dia. Ver `jaFechou` em lib/types.
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

      {/*
        A grade da referência: a coluna larga com a lista do dia e, ao lado, o
        cartão de cor com o anel -- o "Team quota" de lá, que aqui é o dia.
      */}
      <div className="grid gap-4 lg:grid-cols-12">
        {/* A semana fechada, de domingo às 18h até segunda à noite. Some
            sozinho fora dessa janela. Ver components/RevisaoDaSemana. */}
        <CartaoRevisao />

        {/* ------------------------------ hoje ------------------------------ */}
        <Card className="lg:col-span-8">
          <Head
            title="Hoje"
            sub="o que vence hoje e o que ficou para trás"
            href="/demandas"
            link="ver todas"
          />
          <div className="flex flex-col px-5 pb-5 pt-4">
            <form onSubmit={quickAdd} className="flex gap-2.5">
              <input
                value={draft}
                onChange={(e) => setDraft(e.target.value)}
                placeholder="Adicionar tarefa de hoje..."
                aria-label="Adicionar tarefa de hoje"
                className="h-11 flex-1 rounded-full border border-line bg-ink-800 px-4 text-sm outline-none transition-colors focus:border-brand-500 focus:bg-ink-900"
              />
              <button
                type="submit"
                disabled={adding || !draft.trim()}
                aria-label="Adicionar"
                className="grid h-11 w-11 shrink-0 place-items-center rounded-full bg-brand-500 bg-[image:var(--a-degrade)] text-on-brand shadow-[var(--brilho)] transition-[filter,box-shadow] hover:shadow-[var(--brilho-forte)] hover:brightness-95 disabled:opacity-40"
              >
                <Plus size={18} />
              </button>
            </form>

            <div className="mt-2 flex flex-col">
              {m.doDia.length === 0 ? (
                <Ghost>Nada pra hoje. Adicione acima.</Ghost>
              ) : (
                m.doDia.map((t) => (
                  <Row key={t.id}>
                    <button
                      onClick={() => toggleTask(t)}
                      aria-label={t.status === "done" ? "Reabrir" : "Concluir"}
                      className={cx(
                        "grid h-[22px] w-[22px] shrink-0 place-items-center rounded-full border-[1.8px] transition-colors",
                        t.status === "done"
                          ? "border-brand-500 bg-brand-500 text-on-brand"
                          : "border-ink-600 text-transparent hover:border-brand-500"
                      )}
                    >
                      <CheckCircle2 size={13} />
                    </button>
                    <span className="min-w-0 flex-1 text-[14px] font-semibold">
                      <span
                        className={cx(
                          "block truncate",
                          t.status === "done" && "text-fg-mute line-through"
                        )}
                      >
                        {t.title}
                      </span>
                      <span className="mt-0.5 flex items-center gap-1.5 text-[12px] font-medium text-fg-mute">
                        {/* Diz qual é a atrasada, e de quando. */}
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
                      className={cx("h-2 w-2 shrink-0 rounded-full", PRIO_DOT[t.priority])}
                    />
                  </Row>
                ))
              )}
            </div>
          </div>
        </Card>

        {/* ---------------------------- seu dia ---------------------------- */}
        <Card className="relative overflow-hidden border-brand-500/35 bg-[linear-gradient(160deg,color-mix(in_srgb,var(--a)_30%,transparent),color-mix(in_srgb,var(--a)_8%,transparent)_60%)] lg:col-span-4">
          <div className="flex items-center justify-between gap-3 px-5 pt-5">
            <span className="flex items-center gap-1.5 text-[15px] font-semibold text-fg">
              Seu dia
              <Explicacao>
                <p>
                  Conta as demandas da lista ao lado: as que vencem <b>hoje</b> e
                  as <b>atrasadas</b>. Quantas estão concluídas, sobre o total.
                </p>
                <Ressalva>
                  Demanda sem data não entra. Por isso dá para ter 0 de 0 num
                  dia cheio de trabalho — o dia está vazio de{" "}
                  <i>vencimentos</i>, não de tarefa.
                </Ressalva>
              </Explicacao>
            </span>
          </div>

          <div className="grid place-items-center px-5 pb-2 pt-4">
            <div className="relative">
              <svg width="168" height="168" viewBox="0 0 168 168" className="-rotate-90">
                <circle
                  cx="84"
                  cy="84"
                  r={R}
                  fill="none"
                  stroke="var(--a-line)"
                  strokeWidth="12"
                />
                <circle
                  cx="84"
                  cy="84"
                  r={R}
                  fill="none"
                  stroke="var(--a)"
                  strokeWidth="12"
                  strokeLinecap="round"
                  strokeDasharray={C.toFixed(1)}
                  strokeDashoffset={(C * (1 - m.pct / 100)).toFixed(1)}
                  className="anel-desenha"
                  style={{ "--anel-c": C.toFixed(1) } as React.CSSProperties}
                />
              </svg>
              <span className="absolute inset-0 grid place-content-center text-center">
                <span className="text-[38px] font-semibold leading-none tracking-[-0.04em]">
                  <Contador valor={m.pct} />%
                </span>
                <span className="mt-1.5 text-[12px] font-medium text-fg-mute">
                  {m.feitas} de {m.doDia.length}{" "}
                  {m.doDia.length === 1 ? "tarefa" : "tarefas"}
                </span>
              </span>
            </div>
          </div>

          <div className="grid grid-cols-3 gap-2 px-5 pb-4 pt-2">
            <Mini icon={<CheckCircle2 size={15} />} value={m.feitas} label="feitas" />
            <Mini icon={<Repeat2 size={15} />} value={m.actRec.length} label="recorrentes" />
            <Mini icon={<CalendarDays size={15} />} value={m.evToday.length} label="na agenda" />
          </div>
          {/* Um toque por dia: é o que deixa os padrões cruzarem energia com
              o resto. Ver lib/padroes. */}
          <EnergiaDoDia />
        </Card>

        {/* ------------------------ fechamento do mês ------------------------ */}
        <Fechamento contas={bills} hoje={today} />

        {/* --------------------------- resumo do mês --------------------------- */}
        <Card className="flex flex-col lg:col-span-8">
          <Head
            title={`Resumo de ${nomeMes}`}
            href="/contas"
            link="abrir contas"
            explicacao={
              <Explicacao>
                <p>
                  Soma as contas com <b>vencimento dentro de {nomeMes}</b>. Pago
                  e o que esta marcado como pago; vencido e o que continua em
                  aberto com a data ja passada; a vencer e o resto do que esta em
                  aberto. As tres fecham o total.
                </p>
                <Ressalva>
                  O recorte e a data de VENCIMENTO, nao a de pagamento. Uma conta
                  de setembro que voce pagou em outubro conta em setembro.
                </Ressalva>
              </Explicacao>
            }
          />
          {m.totalMes === 0 ? (
            <div className="px-5 pb-5">
              <Ghost>Nenhuma conta lançada neste mês.</Ghost>
            </div>
          ) : (
            <div className="px-5 pb-5 pt-3">
              <p className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
                <span className="text-[36px] font-semibold leading-none tracking-[-0.04em]">
                  <Contador valor={m.totalMes} formatar={brl} />
                </span>
                <span className="text-[13px] font-medium text-fg-mute">
                  no mês · <b className="text-fg-dim tnum">{brl(m.pagoMes)}</b> pago
                </span>
              </p>
              {/*
                Cada valor é uma PORTA para /contas já filtrado. O número vai em
                tinta de texto; quem diz "isto é o vencido" é a bolinha.
              */}
              <div className="mt-4 grid grid-cols-2 gap-2.5 sm:grid-cols-4">
                {([
                  ["Total do mês", m.totalMes, null, "todas"],
                  ["Pago", m.pagoMes, "bg-pos", "pagas"],
                  ["Vencido", m.vencidoMes, "bg-neg", "atrasadas"],
                  [
                    "A vencer",
                    Math.max(0, m.abertoMes - m.vencidoMes),
                    "bg-[var(--cor-barra)]",
                    "pendentes",
                  ],
                ] as [string, number, string | null, string][]).map(
                  ([rotulo, valor, ponto, filtro]) => (
                    <Link
                      key={rotulo}
                      href={`/contas?filtro=${filtro}`}
                      prefetch={false}
                      className="group rounded-[18px] border border-line bg-ink-800 px-4 py-3.5 transition-[background-color,transform] duration-200 hover:-translate-y-0.5 hover:bg-fg/[0.08]"
                    >
                      <span className="flex items-center gap-1.5 text-[12px] font-medium text-fg-mute">
                        {ponto && (
                          <span className={cx("h-2 w-2 shrink-0 rounded-full", ponto)} />
                        )}
                        {rotulo}
                      </span>
                      <span className="mt-1 block text-[19px] font-semibold tracking-[-0.03em] text-fg tnum group-hover:text-brand-400">
                        {brl(valor)}
                      </span>
                    </Link>
                  )
                )}
              </div>
            </div>
          )}
          {/*
            A evolução dos gastos no espaço que sobrava embaixo dos números,
            a pedido dele. É o mesmo gráfico e o mesmo cálculo do Financeiro,
            para os dois dizerem o mesmo valor para o mesmo mês.
          */}
          <div className="flex flex-1 flex-col px-3 pb-4">
            <p className="px-2 text-[12px] font-semibold text-fg-mute">Evolução dos gastos</p>
            <EvolucaoMensal dados={evolucao} preencher />
          </div>
        </Card>

        {/* ----------------------- próximos vencimentos ----------------------- */}
        <Card className="lg:col-span-4">
          {/* A fila do que vence primeiro; o total do mês está no resumo. */}
          <Head title="Próximos vencimentos" href="/contas" link="ver todas" />
          <div className="px-5 pb-5 pt-3">
            <div className="flex flex-wrap gap-1.5">
              {m.late.length > 0 ? (
                <span className="rounded-full bg-neg/15 px-2.5 py-1 text-[11.5px] font-semibold text-neg">
                  {m.late.length} em atraso
                </span>
              ) : (
                <span className="rounded-full bg-pos/15 px-2.5 py-1 text-[11.5px] font-semibold text-pos">
                  nada em atraso
                </span>
              )}
              {m.soon.length > 0 && (
                <span className="rounded-full bg-warn/15 px-2.5 py-1 text-[11.5px] font-semibold text-warn">
                  {m.soon.length} {m.soon.length === 1 ? "vence" : "vencem"} em 7 dias
                </span>
              )}
            </div>
            <div className="mt-2 flex flex-col">
              {m.pend.length === 0 ? (
                <Ghost>Tudo pago.</Ghost>
              ) : (
                /* Cinco: o selo dizia "4 vencem em 7 dias" e a lista mostrava
                   três, sem dizer qual faltava. */
                [...m.pend]
                  .sort((a, b) => a.due_date.localeCompare(b.due_date))
                  .slice(0, 5)
                  .map((b) => {
                    const d = daysUntil(b.due_date);
                    return (
                      <Row key={b.id}>
                        <span
                          className={cx(
                            "h-2 w-2 shrink-0 rounded-full",
                            d < 0 ? "bg-neg" : d <= 7 ? "bg-warn" : "bg-ink-600"
                          )}
                        />
                        <span className="min-w-0 flex-1">
                          <span className="block truncate text-[13.5px] font-semibold">
                            {b.description}
                          </span>
                          <span
                            className={cx(
                              "block text-[12px] tnum",
                              d < 0 ? "font-semibold text-neg" : "text-fg-mute"
                            )}
                          >
                            {d < 0 ? `${-d}d atraso` : d === 0 ? "hoje" : dataCurta(b.due_date)}
                          </span>
                        </span>
                        <span
                          className={cx(
                            "shrink-0 text-[14px] font-semibold tnum",
                            d < 0 && "text-neg"
                          )}
                        >
                          {brl(Number(b.amount))}
                        </span>
                      </Row>
                    );
                  })
              )}
            </div>
          </div>
        </Card>

        {/* ------------------------------ agenda ------------------------------ */}
        <Card className="lg:col-span-4">
          <Head title="Agenda" href="/calendario" link="ver tudo" />
          <div className="flex flex-col px-5 pb-5 pt-2">
            {m.up.length === 0 ? (
              <Ghost>Agenda livre.</Ghost>
            ) : (
              m.up.map((e) => {
                const isToday = localDay(e.start_at) === today;
                return (
                  <Row key={e.id}>
                    <span
                      className="h-2 w-2 shrink-0 rounded-full"
                      style={{ background: corDoRotulo(e.color) }}
                    />
                    <span className="min-w-0 flex-1 text-[14px] font-semibold">
                      <span className="block truncate">{e.title}</span>
                      <span className="mt-0.5 block text-[12px] font-medium text-fg-mute">
                        {isToday ? "hoje" : dateBR(localDay(e.start_at)).slice(0, 5)}
                        {e.all_day ? " · dia inteiro" : ` · ${localTime(e.start_at)}`}
                        {e.series_id && REPETE[e.recurrence] && ` · ${REPETE[e.recurrence]}`}
                        {e.location && ` · ${e.location}`}
                      </span>
                    </span>
                  </Row>
                );
              })
            )}
          </div>
        </Card>

        {/* ---------------------------- recorrentes ---------------------------- */}
        <Card className="lg:col-span-4">
          <Head title="Recorrentes" href="/recorrentes" link="gerenciar" />
          <div className="px-5 pb-5 pt-2">
            {m.dueRec.length > 0 && (
              <div className="mb-1 mt-1 flex items-center gap-2 rounded-full bg-warn/15 px-3.5 py-2 text-[12px] font-semibold text-warn">
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
                      <span className={cx("h-2 w-2 shrink-0 rounded-full", PRIO_DOT[r.priority])} />
                      <span className="min-w-0 flex-1 text-[14px] font-semibold">
                        <span className="block truncate">{r.title}</span>
                        <span className="mt-0.5 block text-[12px] font-medium text-fg-mute">
                          {frequencyDescription(r)}
                        </span>
                      </span>
                      <span className="shrink-0 text-[12px] font-semibold text-fg-mute tnum">
                        {nx === today ? "hoje" : nx ? dateBR(nx).slice(0, 5) : "—"}
                      </span>
                    </Row>
                  );
                })
              )}
            </div>
          </div>
        </Card>

        {/* ----------------------------- anotações ----------------------------- */}
        <Card className="lg:col-span-4">
          <Head title="Anotações" href="/anotacoes" link="escrever" />
          <div className="px-5 pb-5 pt-2">
            {m.pinned.length === 0 ? (
              <Ghost>Nada fixado ainda.</Ghost>
            ) : (
              m.pinned.map((n) => {
                /* O texto por trás das tags: `content` guarda HTML. */
                const previa = textoDaNota(n.content);
                return (
                  <div key={n.id} className="border-b border-line-soft py-3 last:border-0">
                    <div className="flex items-center gap-1.5">
                      <Pin size={12} style={{ color: corDoRotulo(n.color) }} />
                      <p className="truncate text-[14px] font-semibold">
                        {n.title || "Sem título"}
                      </p>
                    </div>
                    {previa && (
                      <p className="mt-1 line-clamp-2 text-[12px] leading-relaxed text-fg-mute">
                        {previa}
                      </p>
                    )}
                  </div>
                );
              })
            )}
          </div>
        </Card>

        {/* ---------------------------- referências ---------------------------- */}
        {refs.length > 0 && (
          <Card className="lg:col-span-12">
            <Head title="Referências recentes" href="/referencias" link="ver todas" />
            <div className="px-5 pb-5 pt-4">
              {/* Miniaturas, não linhas: referência se reconhece de olho. */}
              <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
                {refs.slice(0, 6).map((r) => (
                  <Link
                    key={r.id}
                    href="/referencias"
                    title={decodificarEntidades(r.name)}
                    className="group block rounded-[18px] border border-line bg-ink-800 p-2 transition-[transform,background-color] duration-300 ease-[cubic-bezier(0.16,1,0.3,1)] hover:-translate-y-1 hover:bg-fg/[0.08]"
                  >
                    <span className="relative block aspect-[4/3] w-full overflow-hidden rounded-[12px] bg-ink-800">
                      {r.image_url ? (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img
                          /* Na medida da miniatura: a imagem guardada chegava
                             a 835 KB para aparecer em 181 pixels. */
                          src={imagemReduzida(r.image_url, 210) ?? undefined}
                          alt=""
                          loading="lazy"
                          decoding="async"
                          onError={voltarAoOriginal}
                          className="h-full w-full object-cover transition-transform duration-500 group-hover:scale-[1.05]"
                        />
                      ) : (
                        <span className="grid h-full w-full place-items-center text-brand-400/40">
                          <Library size={16} />
                        </span>
                      )}
                    </span>
                    <span className="mt-2 block truncate px-1 text-[12px] font-semibold text-fg-dim group-hover:text-brand-400">
                      {decodificarEntidades(r.name)}
                    </span>
                  </Link>
                ))}
              </div>
            </div>
          </Card>
        )}
      </div>

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
          className="h-8 rounded-lg bg-warn px-3 text-[12px] font-bold text-sobre-cor transition-opacity disabled:opacity-40"
        >
          {gravando ? "..." : "Lançar"}
        </button>
      </div>
    </div>
  );
}

/**
 * Como o mês anterior fechou — só na primeira semana do mês.
 *
 * Só para ler: nada a marcar, nada a preencher. Some sozinho no dia 8, quando
 * o assunto já é o mês corrente. E só o lado das contas: o app não registra o
 * que entra, por escolha dele.
 */
function Fechamento({ contas, hoje }: { contas: Bill[]; hoje: string }) {
  if (Number(hoje.slice(8, 10)) > 7) return null;
  const f = fechamentoDoMes(contas, mesAnterior(hoje.slice(0, 7)));
  if (f.total === 0) return null;

  const variacao =
    f.totalAnterior && f.totalAnterior > 0
      ? Math.round(((f.total - f.totalAnterior) / f.totalAnterior) * 100)
      : null;

  return (
    <Card className="lg:col-span-12">
      <Head
        title={`Fechamento de ${nomeDoMes(f.mes)}`}
        href="/contas"
        link="ver contas"
      />
      <div className="grid grid-cols-2 gap-x-4 gap-y-3 px-5 pb-5 pt-3 sm:grid-cols-4">
        <div>
          <span className="block text-[11.5px] text-fg-mute">Pago</span>
          <b className="text-[19px] font-bold tracking-[-0.04em] tnum">{brl(f.pago)}</b>
          <span className="block text-[11px] text-fg-mute">
            {f.qtdPagas} conta{f.qtdPagas === 1 ? "" : "s"}
          </span>
        </div>
        <div>
          <span className="block text-[11.5px] text-fg-mute">Ficou em aberto</span>
          <b
            className={cx(
              "text-[19px] font-bold tracking-[-0.04em] tnum",
              f.qtdAbertas > 0 && "text-neg"
            )}
          >
            {brl(f.aberto)}
          </b>
          <span className="block text-[11px] text-fg-mute">
            {f.qtdAbertas ? `${f.qtdAbertas} conta${f.qtdAbertas === 1 ? "" : "s"}` : "nada"}
          </span>
        </div>
        <div className="col-span-2">
          <span className="block text-[11.5px] text-fg-mute">Onde mais pesou</span>
          <span className="mt-0.5 block text-[13px] font-medium leading-snug">
            {f.categorias
              .map((c) => `${c.categoria} ${brl(c.valor)}`)
              .join(" · ")}
          </span>
          {variacao !== null && (
            <span className="mt-0.5 block text-[11px] text-fg-mute">
              {variacao === 0
                ? `igual a ${nomeDoMes(mesAnterior(f.mes))}`
                : `${variacao > 0 ? "+" : ""}${variacao}% em relação a ${nomeDoMes(mesAnterior(f.mes))}`}
            </span>
          )}
        </div>
      </div>
    </Card>
  );
}

/* ------------------------------ peças ------------------------------ */

function Head({
  title,
  sub,
  href,
  link,
  explicacao,
}: {
  title: string;
  sub?: string;
  href: string;
  /** O nome do destino: vira o balão e o rótulo do botão redondo. */
  link: string;
  /** O botao de "como calculamos", quando o cartao mostra numero derivado. */
  explicacao?: React.ReactNode;
}) {
  return (
    <div className="flex items-start justify-between gap-3.5 px-5 pt-5">
      <div className="min-w-0">
        <span className="flex items-center gap-1.5 text-[15px] font-semibold text-fg">
          {title}
          {explicacao}
        </span>
        {sub && <span className="mt-0.5 block text-[12px] text-fg-mute">{sub}</span>}
      </div>
      {/*
        O botão redondo com a seta, como nos cartões da referência. O texto
        ("ver todas", "gerenciar") continua no balão e no leitor de tela.
        `prefetch={false}`: são vários cabeçalhos visíveis ao abrir, e cada um
        adiantaria a sua tela sozinho.
      */}
      <Link
        href={href}
        prefetch={false}
        aria-label={link}
        title={link}
        className="grid h-9 w-9 shrink-0 place-items-center rounded-full border border-[var(--vidro-borda)] bg-ink-800 text-fg-dim transition-[background-color,color,transform] duration-200 hover:-translate-y-px hover:bg-fg/[0.09] hover:text-fg"
      >
        <ArrowUpRight size={16} />
      </Link>
    </div>
  );
}

const Row = ({ children }: { children: React.ReactNode }) => (
  <div className="flex items-center gap-3 border-b border-line-soft py-3 last:border-0">
    {children}
  </div>
);

/** Um contador dentro do cartão de cor: vidro sobre o roxo. */
const Mini = ({
  icon,
  value,
  label,
}: {
  icon: React.ReactNode;
  value: number;
  label: string;
}) => (
  <div className="rounded-[16px] border border-line bg-ink-800 px-3 py-3">
    <span className="text-fg-mute">{icon}</span>
    <b className="mt-1.5 block text-[20px] font-semibold leading-none tracking-[-0.03em]">
      <Contador valor={value} />
    </b>
    <small className="mt-1 block text-[11px] font-medium text-fg-mute">{label}</small>
  </div>
);

const Ghost = ({ children }: { children: React.ReactNode }) => (
  <p className="py-6 text-center text-[12.5px] text-fg-mute">{children}</p>
);
