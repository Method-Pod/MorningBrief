import type { SupabaseClient } from "@supabase/supabase-js";
import type { Bill, CalendarEvent, EventRecurrence, RecurringTask } from "./types";
import { isDueOn } from "./recurring";
import { todayISO } from "./format";
import { diaDeManutencao } from "./viradaDoDia";

const DIA = 86_400_000;
const pad = (n: number) => String(n).padStart(2, "0");

const paraData = (iso: string) => new Date(iso.slice(0, 10) + "T00:00:00");
const paraISO = (d: Date) =>
  `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;

/**
 * A mesma data, `n` meses adiante, encolhida quando o mês de destino é curto.
 *
 * Duplica `mesesAdiante` de components/ContasExtras de propósito: este módulo
 * roda também no servidor, na rota do cron, e importar de um componente
 * "use client" arrastaria React para lá.
 */
const mesesAdiante = (iso: string, n: number, dia?: number) => {
  const [y, m, d] = iso.slice(0, 10).split("-").map(Number);
  const alvo = m - 1 + n;
  const ano = y + Math.floor(alvo / 12);
  const mes = (alvo % 12) + 1;
  const ultimo = new Date(ano, mes, 0).getDate();
  return `${ano}-${pad(mes)}-${pad(Math.min(dia ?? d, ultimo))}`;
};

const ultimoDiaDoMes = (iso: string) => {
  const [y, m] = iso.slice(0, 10).split("-").map(Number);
  return new Date(y, m, 0).getDate();
};

/**
 * O dia do mês em que uma série mensal realmente vence.
 *
 * O próximo lançamento parte do último, e o último pode ter sido encolhido:
 * uma conta do dia 31 cai em 28 de fevereiro, e calcular março a partir dali
 * dava 28 de março, 28 de abril — o dia 31 sumia para sempre depois do
 * primeiro mês curto.
 *
 * Quando a última ocorrência caiu no último dia do mês dela, pode ser que ela
 * tenha sido encolhida; aí o dia certo é o maior dia visto na série. Fora
 * desse caso, vale o dia da última — que é também o que respeita uma conta
 * que a pessoa mudou de dia de propósito.
 *
 * Exportada para o teste.
 */
export function diaDaSerie(datas: string[], ultima: string): number {
  const dia = Number(ultima.slice(8, 10));
  if (dia !== ultimoDiaDoMes(ultima)) return dia;
  return Math.max(dia, ...datas.map((d) => Number(d.slice(8, 10))));
}

const mesDe = (iso: string) => iso.slice(0, 7);


const distanciaEmMeses = (de: string, para: string) => {
  const [ay, am] = de.split("-").map(Number);
  const [by, bm] = para.split("-").map(Number);
  return (by - ay) * 12 + (bm - am);
};

/** Janela da reposição de recorrências perdidas, em dias. */
export const JANELA_REPOSICAO = 7;

/* ------------------------------ contas fixas ------------------------------ */

/**
 * Garante que cada conta fixa tenha o lançamento do mês corrente.
 *
 * O mês entra no dia 1º: a automação das 6h roda todo dia, e no primeiro dia
 * do mês ela encontra as fixas sem o lançamento do mês e cria. Nos outros dias
 * não há nada a fazer — e, se o dia 1º falhar, o dia 2 cobre.
 *
 * Antes o lançamento vinha um mês adiantado, e a tela ainda oferecia um botão
 * "Lançar próximo mês". O pedido foi o contrário: o mês aparece sozinho no
 * dia 1º, sem clique nenhum.
 *
 * A série é identificada pela descrição, que é o que liga os lançamentos neste
 * modelo. O novo lançamento copia valor, categoria e observações do mais
 * recente da série, e nasce em aberto.
 *
 * Quem decide se a série continua é o lançamento MAIS RECENTE dela, fixo ou
 * não. Antes só as fixas eram lidas: desmarcar "fixa" na conta de novembro
 * não parava nada, porque a de outubro, já paga, continuava fixa e virava a
 * "última" — e novembro era lançado de novo, duplicado. Agora:
 *
 * - a mais recente não é fixa → a série acabou;
 * - a mais recente é parcela → a série é de parcelas, e parcela tem fim
 *   (uma conta marcada "fixa" e "parcelada" seguia cobrando depois da última);
 * - qualquer lançamento com a mesma descrição no mês alvo, fixo ou não,
 *   conta como "já tem" — é o que impede a duplicata quando alguém lançou o
 *   mês na mão.
 *
 * Devolve quantos lançamentos foram criados, ou null se falhou.
 */
export async function lancarProximoMesDasFixas(
  supabase: SupabaseClient,
  opcoes: { userId?: string; hoje?: string } = {}
): Promise<number | null> {
  const hoje = opcoes.hoje ?? todayISO();
  const alvo = mesDe(hoje);

  let consulta = supabase.from("bills").select("*");
  if (opcoes.userId) consulta = consulta.eq("user_id", opcoes.userId);
  const { data, error } = await consulta;
  if (error) return null;

  const contas = (data as Bill[]) ?? [];
  if (!contas.some((b) => b.recurring)) return 0;

  /* Por pessoa e descrição: numa passada sem filtro de usuário, o "Aluguel"
     de um não pode esconder o do outro. */
  const chave = (b: Bill) => `${b.user_id}\u0000${b.description}`;
  const series = new Map<string, Bill[]>();
  contas.forEach((b) => {
    const lista = series.get(chave(b));
    if (lista) lista.push(b);
    else series.set(chave(b), [b]);
  });

  const novas = [...series.values()]
    .map((lista) => {
      if (lista.some((b) => mesDe(b.due_date) === alvo)) return null;
      const b = lista.reduce((a, c) =>
        c.due_date > a.due_date || (c.due_date === a.due_date && c.recurring) ? c : a
      );
      if (!b.recurring || b.installment_total != null) return null;
      return { b, dia: diaDaSerie(lista.map((x) => x.due_date), b.due_date) };
    })
    .filter((x): x is { b: Bill; dia: number } => x !== null)
    .map(({ b, dia }) => {
      const n = distanciaEmMeses(mesDe(b.due_date), alvo);
      /*
       * n <= 0 significa que a série já passou do mês alvo — acontece quando
       * alguém lançou meses à frente na mão. Nada a fazer.
       */
      if (n <= 0) return null;
      return {
        user_id: b.user_id,
        description: b.description,
        /*
         * Conta de valor variável nasce zerada, e não com o valor do mês
         * passado.
         *
         * Copiar serve para aluguel e internet. Para a fatura do cartão, o
         * valor copiado é errado todos os meses — e errado do pior jeito,
         * porque é plausível: entra no total do mês sem parecer suspeito, e
         * a pessoa planeja em cima de um número que ninguém conferiu.
         *
         * Zerada mais `valor_variavel` é o par que a tela lê como "a
         * informar". Ver `semValorAinda` em lib/types.
         */
        amount: b.valor_variavel ? 0 : Number(b.amount),
        due_date: mesesAdiante(b.due_date, n, dia),
        category: b.category,
        status: "pending",
        notes: b.notes,
        recurring: true,
        paid_at: null,
        /* Seguem a série: quem é de cartão continua sendo, e o dia de
           fechamento continua valendo no mês novo. */
        cartao_id: b.cartao_id ?? null,
        valor_variavel: !!b.valor_variavel,
        fecha_dia: b.fecha_dia ?? null,
      };
    })
    .filter((x): x is NonNullable<typeof x> => x !== null);

  if (!novas.length) return 0;

  const { data: criadas, error: erroInsert } = await supabase
    .from("bills")
    .insert(novas)
    .select("id");

  /* 23505: o índice único de supabase/CONTAS-SEM-DUPLICATA.sql pegou uma
     corrida entre o cron e uma aba aberta. Já existe, tudo bem — não é
     falha. Sem o índice, a corrida passa e a conta sai duas vezes. */
  if (erroInsert) return erroInsert.code === "23505" ? 0 : null;
  return criadas?.length ?? 0;
}

/* --------------------------- demandas recorrentes --------------------------- */

/**
 * Cria as demandas recorrentes dos dias em que o app ficou fechado.
 *
 * Antes só o dia de hoje era materializado: um fim de semana sem abrir o app
 * apagava, em silêncio, as demandas que a regra teria gerado. Agora a janela
 * volta até sete dias.
 *
 * A janela é limitada de propósito. Sem limite, voltar de duas semanas de
 * férias despejaria dezenas de demandas atrasadas de uma vez, e uma lista que
 * ninguém consegue encarar é tão inútil quanto a demanda perdida.
 *
 * As datas são avaliadas em ordem, atualizando `last_run_on` a cada acerto, para
 * que quinzenal, trimestral e anual respeitem o intervalo mínimo dentro da
 * própria janela.
 *
 * A reivindicação é um compare-and-swap: o update só encontra a linha se
 * `last_run_on` ainda for o valor que lemos. Duas abas abertas disputam e só
 * uma leva, como já acontecia com a materialização de hoje.
 *
 * Devolve quantas demandas foram criadas, ou null se falhou.
 */
export async function reporRecorrentesPerdidas(
  supabase: SupabaseClient,
  opcoes: { userId?: string; hoje?: string } = {}
): Promise<number | null> {
  const hoje = opcoes.hoje ?? todayISO();

  let consulta = supabase
    .from("recurring_tasks")
    .select("*")
    .eq("active", true);
  if (opcoes.userId) consulta = consulta.eq("user_id", opcoes.userId);
  const { data, error } = await consulta;
  if (error) return null;

  const regras = (data as RecurringTask[]) ?? [];
  if (!regras.length) return 0;

  /*
   * Uma regra não espera a outra.
   *
   * Cada regra mexe só nas próprias linhas — a reivindicação é na linha dela,
   * as demandas nascem com o `origin_id` dela —, então não há ordem a
   * respeitar entre regras. Em fila, quinze recorrências eram quinze idas ao
   * banco em sequência a cada abertura do Início; a ordem interna de cada
   * regra (reivindicar, depois inserir) continua como estava, que é o que
   * garante que duas abas não criem a mesma demanda duas vezes.
   */
  const porRegra = await Promise.all(regras.map((r) => umaRegra(supabase, r, hoje)));
  /* Uma regra que falhou faz a passada inteira contar como falha: antes ela
     virava 0, igual a "nada a fazer", e o dia era marcado como feito. */
  if (porRegra.some((n) => n === null)) return null;
  return porRegra.reduce<number>((s, n) => s + (n ?? 0), 0);
}

/** Repõe o que uma regra perdeu. Devolve quantas demandas nasceram, ou null
 *  se a gravação falhou. */
async function umaRegra(
  supabase: SupabaseClient,
  r: RecurringTask,
  hoje: string
): Promise<number | null> {
  const datas = datasPendentes(r, hoje);
  if (!datas.length) return 0;

  /* Compare-and-swap na regra antes de inserir. */
  const alvo = datas[datas.length - 1];
  let claim = supabase
    .from("recurring_tasks")
    .update({ last_run_on: alvo })
    .eq("id", r.id);
  claim =
    r.last_run_on === null
      ? claim.is("last_run_on", null)
      : claim.eq("last_run_on", r.last_run_on);

  const { data: ganhou } = await claim.select("id");
  if (!ganhou || !ganhou.length) return 0;

  const { data: criadasAgora, error: erroInsert } = await supabase
    .from("tasks")
    .insert(
      datas.map((d) => ({
        user_id: r.user_id,
        title: r.title,
        description: r.description,
        client: r.client,
        /* O vínculo com o cadastro vai junto. Sem ele a demanda gerada só
           tinha o nome do cliente em texto, e a tela de Clientes não a
           contava — "Universo Lubrificantes: nada em aberto" com a demanda
           dele aberta no Início. Só quando existem, pelo mesmo motivo dos
           links abaixo. */
        ...(r.cliente_id ? { cliente_id: r.cliente_id } : {}),
        ...(r.projeto_id ? { projeto_id: r.projeto_id } : {}),
        priority: r.priority,
        status: "todo",
        due_date: d,
        origin_id: r.id,
        /* Só quando existem: numa base sem LINK-NA-DEMANDA.sql, mandar a
           coluna derrubaria toda a geração automática — inclusive das
           regras que não têm link. */
        ...(r.links?.length ? { links: r.links } : {}),
      }))
    )
    .select("id");

  if (erroInsert) {
    /* 23505 = tasks_origin_day_uniq: a demanda daquele dia já existe. */
    if (erroInsert.code === "23505") return 0;
    /* Devolve a reivindicação para a próxima passada tentar de novo. */
    await supabase
      .from("recurring_tasks")
      .update({ last_run_on: r.last_run_on })
      .eq("id", r.id);
    return null;
  }

  /*
   * Cada ocorrência nasce com os itens do modelo, desmarcados.
   *
   * É o que faz o checklist valer a pena numa recorrente diária: os cinco
   * cortes já estão lá toda manhã, sem ninguém digitar. Falha aqui não
   * desfaz a demanda — ela existe e vale mais sem checklist do que não
   * existir; e `checklist` é nulo em regra criada antes da migração.
   */
  const modelo = r.checklist ?? [];
  if (modelo.length && criadasAgora?.length)
    await supabase.from("task_items").insert(
      (criadasAgora as { id: string }[]).flatMap((t) =>
        modelo.map((title, i) => ({
          user_id: r.user_id,
          task_id: t.id,
          title,
          position: i,
        }))
      )
    );

  return datas.length;
}

/**
 * As datas, dentro da janela, em que a regra deveria ter gerado demanda.
 *
 * Exportada para poder ser testada sem banco.
 */
export function datasPendentes(
  r: RecurringTask,
  hoje: string,
  janela = JANELA_REPOSICAO
): string[] {
  const fim = paraData(hoje);
  const limite = new Date(fim.getTime() - janela * DIA);
  const desdeUltimo = r.last_run_on
    ? new Date(paraData(r.last_run_on).getTime() + DIA)
    : limite;
  const inicio = desdeUltimo > limite ? desdeUltimo : limite;

  const datas: string[] = [];
  let ultimo = r.last_run_on;

  for (let t = inicio.getTime(); t <= fim.getTime(); t += DIA) {
    const iso = paraISO(new Date(t));
    if (isDueOn({ ...r, last_run_on: ultimo }, iso)) {
      datas.push(iso);
      ultimo = iso;
    }
  }
  return datas;
}

/* --------------------------- eventos recorrentes --------------------------- */

/** Último instante do mês seguinte ao de `hoje`: o fim da janela. */
export function fimDaJanelaDeEventos(hoje: string): Date {
  const [y, m] = hoje.split("-").map(Number);
  /* Dia 0 do mês +2 é o último dia do mês +1. */
  return new Date(y, m + 1, 0, 23, 59, 59, 999);
}

/**
 * As próximas ocorrências de um evento que repete, até o fim da janela.
 *
 * Não inclui a data de partida — devolve só o que vem depois dela, que é o que
 * falta criar.
 *
 * A duração é preservada: o fim de cada ocorrência fica à mesma distância do
 * início que no evento original, então uma reunião de uma hora continua de uma
 * hora em todas as repetições.
 *
 * No mensal o dia é preservado e encolhido quando o mês é curto — dia 31 vira
 * 28 em fevereiro. E soma sempre a partir da data de partida, não somando um
 * mês repetidamente: encadear perderia o dia depois de passar por fevereiro.
 */
export function ocorrenciasDeEvento({
  inicio,
  fim,
  recorrencia,
  limite,
  diaDoMes,
}: {
  inicio: string;
  fim: string | null;
  recorrencia: EventRecurrence;
  limite: Date;
  /** No mensal, o dia em que a série cai; ausente = o dia da partida. */
  diaDoMes?: number;
}): { start_at: string; end_at: string | null }[] {
  if (recorrencia === "none") return [];

  const base = new Date(inicio);
  const duracao = fim ? new Date(fim).getTime() - base.getTime() : null;
  const saida: { start_at: string; end_at: string | null }[] = [];

  /* Teto de segurança: a janela é de dois meses, então nenhuma regra passa de
     ~10 ocorrências. Sem ele, uma data de partida inválida daria laço infinito. */
  for (let n = 1; n <= 64; n++) {
    let proximo: Date;
    if (recorrencia === "monthly") {
      const alvo = new Date(base);
      alvo.setDate(1);
      alvo.setMonth(base.getMonth() + n);
      const ultimoDia = new Date(
        alvo.getFullYear(),
        alvo.getMonth() + 1,
        0
      ).getDate();
      alvo.setDate(Math.min(diaDoMes ?? base.getDate(), ultimoDia));
      alvo.setHours(base.getHours(), base.getMinutes(), 0, 0);
      proximo = alvo;
    } else {
      const passo = recorrencia === "biweekly" ? 14 : 7;
      proximo = new Date(base.getTime() + n * passo * DIA);
    }

    if (proximo > limite) break;
    saida.push({
      start_at: proximo.toISOString(),
      end_at:
        duracao === null
          ? null
          : new Date(proximo.getTime() + duracao).toISOString(),
    });
  }

  return saida;
}

/**
 * Mantém as repetições do calendário preenchidas até o fim do mês que vem.
 *
 * A janela é de dois meses — o atual e o seguinte — e não de um ano: cada
 * ocorrência é uma linha no banco, e encher doze meses de uma repetição semanal
 * são mais de cinquenta linhas por evento que ninguém vai olhar hoje. Como isto
 * roda todo dia, a janela anda sozinha e o calendário nunca fica vazio à frente.
 *
 * Estende a partir da ÚLTIMA ocorrência de cada série, então apagar uma
 * ocorrência do meio não a faz voltar. Para encerrar uma repetição, exclua a
 * série — é o que o botão de excluir oferece quando o evento tem série.
 *
 * Devolve quantas ocorrências foram criadas, ou null se falhou.
 */
export async function estenderEventosRecorrentes(
  supabase: SupabaseClient,
  opcoes: { userId?: string; hoje?: string } = {}
): Promise<number | null> {
  const hoje = opcoes.hoje ?? todayISO();
  const limite = fimDaJanelaDeEventos(hoje);

  let consulta = supabase
    .from("events")
    .select("*")
    .not("series_id", "is", null)
    .neq("recurrence", "none");
  if (opcoes.userId) consulta = consulta.eq("user_id", opcoes.userId);

  const { data, error } = await consulta;
  /* PGRST204/42703: a migração EVENTOS-RECORRENTES.sql ainda não rodou. Sem
     recorrência não há nada a estender, e o calendário segue funcionando. */
  if (error) return null;

  const eventos = (data as CalendarEvent[]) ?? [];
  if (!eventos.length) return 0;

  /* Última ocorrência de cada série, e as datas de todas elas. */
  const ultima = new Map<string, CalendarEvent>();
  const datas = new Map<string, string[]>();
  eventos.forEach((e) => {
    if (!e.series_id) return;
    const atual = ultima.get(e.series_id);
    if (!atual || e.start_at > atual.start_at) ultima.set(e.series_id, e);
    const lista = datas.get(e.series_id) ?? [];
    lista.push(paraISO(new Date(e.start_at)));
    datas.set(e.series_id, lista);
  });

  const novas = [...ultima.values()].flatMap((e) =>
    ocorrenciasDeEvento({
      inicio: e.start_at,
      fim: e.end_at,
      recorrencia: e.recurrence,
      limite,
      /* Mesmo cuidado das contas fixas: a última do dia 31 pode ter caído
         em 30 ou 28, e partir dela perderia o 31 para sempre. */
      diaDoMes:
        e.recurrence === "monthly"
          ? diaDaSerie(datas.get(e.series_id!) ?? [], paraISO(new Date(e.start_at)))
          : undefined,
    }).map((o) => ({
      user_id: e.user_id,
      title: e.title,
      description: e.description,
      all_day: e.all_day,
      color: e.color,
      location: e.location,
      recurrence: e.recurrence,
      series_id: e.series_id,
      ...o,
    }))
  );

  if (!novas.length) return 0;

  const { data: criadas, error: erroInsert } = await supabase
    .from("events")
    .insert(novas)
    .select("id");

  /* 23505 = events_serie_inicio_uniq: outra passada chegou primeiro. */
  if (erroInsert) return erroInsert.code === "23505" ? 0 : null;
  return criadas?.length ?? 0;
}

/* ------------------------------ uma vez por dia ------------------------------ */

const CHAVE_DIA = "mb.manutencao.dia";

/**
 * A manutenção da página precisa rodar agora?
 *
 * As cinco rotinas acima rodavam a cada montagem do painel — ou seja, a cada
 * volta para o Início pela navegação, cada uma com as suas próprias idas ao
 * banco. Só que o trabalho delas é por dia, não por visita: depois da primeira
 * passada do dia todas percorrem o banco para concluir que não há nada a
 * fazer.
 *
 * Quem faz o serviço de verdade é o cron diário; esta cópia na página existe
 * para o caso de o cron não ter rodado. Uma vez por dia por aparelho cobre
 * isso igual, e as visitas seguintes ao painel abrem sem as cinco varreduras.
 *
 * A marca é local ao navegador de propósito: gravá-la no banco custaria a ida
 * que o atalho quer evitar, e errar para o lado de rodar de novo é inofensivo
 * — as rotinas são idempotentes.
 *
 * O dia aqui é o de manutenção, que vira às 6h, e não a data do calendário.
 *
 * Com a data do calendário, abrir o app às 00h10 já contava como dia novo: a
 * reserva rodava ali e as recorrentes do dia nasciam de madrugada, seis horas
 * antes do combinado — e a limpeza junto. Com a virada às 6h, quem abre o app
 * de madrugada ainda está no dia anterior, que já foi feito, e nada acontece
 * até as 6h. Passado o horário, o cron já terá feito o serviço e esta reserva
 * não encontra nada a fazer; se o cron falhar, ela cobre.
 */
export function precisaDeManutencao(hoje = diaDeManutencao()) {
  if (typeof window === "undefined") return true;
  try {
    return window.localStorage.getItem(CHAVE_DIA) !== hoje;
  } catch {
    /* Navegador com armazenamento bloqueado: roda, que é o comportamento
       antigo, em vez de nunca rodar. */
    return true;
  }
}

/** Marca o dia como feito. Só chame quando nenhuma rotina falhou. */
export function marcarManutencaoFeita(hoje = diaDeManutencao()) {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(CHAVE_DIA, hoje);
  } catch {}
}
