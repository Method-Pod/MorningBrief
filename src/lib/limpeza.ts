import type { SupabaseClient } from "@supabase/supabase-js";

/** Janela de retenção de uma demanda concluída, em horas. */
export const HORAS_RETENCAO = 24;

/**
 * Meses que uma conta paga fica guardada, contando o mês atual.
 *
 * A primeira versão apagava no dia 1º do mês seguinte, o que esvaziava o
 * gráfico de evolução — ele precisa do histórico para dizer qualquer coisa.
 * Doze meses cobrem a janela inteira do gráfico e ainda impedem a tabela de
 * crescer para sempre: em cada virada de mês, sai um mês e entra outro.
 *
 * A janela do gráfico é derivada deste número, e não fixada em paralelo. Assim
 * nenhum mês pode aparecer vazio por construção — um mês zerado porque o dado
 * foi apagado mentiria sobre o gasto — e mudar a retenção move as duas coisas
 * juntas.
 */
export const MESES_RETENCAO_PAGAS = 12;

/**
 * Apaga demandas concluídas há mais de 24 horas.
 *
 * Roda quando o Início é aberto, no mesmo momento em que as recorrências são
 * materializadas. Não há agendador: se o app ficar dias fechado, a limpeza
 * acontece na próxima abertura e alcança tudo que já passou da janela.
 *
 * Duas salvaguardas deliberadas:
 *
 * 1. Só apaga linhas com `completed_at` preenchido. Demandas marcadas como
 *    concluídas antes desta função existir têm o campo nulo, e não há como
 *    saber quando foram concluídas — apagá-las pela data de criação seria
 *    destruir dado com base em suposição.
 *
 * 2. O RLS limita o delete às linhas do próprio usuário, então a operação não
 *    depende de o filtro estar correto para ser segura.
 *
 * Devolve quantas linhas saíram, ou null se a operação falhou.
 */
export async function limparConcluidas(
  supabase: SupabaseClient,
  opcoes: { userId?: string } = {}
): Promise<number | null> {
  const limite = new Date(
    Date.now() - HORAS_RETENCAO * 60 * 60 * 1000
  ).toISOString();

  /*
   * `userId` é obrigatório quando quem chama usa a chave de serviço.
   *
   * A chave de serviço passa por cima do RLS, e a salvaguarda 2 acima deixa de
   * valer: sem o filtro explícito, este delete alcançaria as linhas de todos os
   * usuários. No navegador o parâmetro é dispensável, porque lá o RLS restringe.
   */
  let consulta = supabase
    .from("tasks")
    .delete()
    .eq("status", "done")
    .not("completed_at", "is", null)
    .lt("completed_at", limite);
  if (opcoes.userId) consulta = consulta.eq("user_id", opcoes.userId);

  const { data, error } = await consulta.select("id");

  if (error) return null;
  return data?.length ?? 0;
}

/**
 * Apaga contas pagas com mais de seis meses.
 *
 * A regra é comparada por mês a cada passada, e não por "ontem": uma conta paga
 * de agosto sai quando o mês corrente chega a fevereiro, e sai igual se o app
 * ficar fechado por meses — o corte é calculado a partir do mês atual.
 *
 * O critério é `due_date`, e não `paid_at`: o recorte da tela é por mês de
 * vencimento, e uma conta de agosto paga adiantada em julho pertence a agosto.
 *
 * Duas salvaguardas:
 *
 * 1. Só apaga `status = paid`. Nada em aberto ou atrasado é tocado, em nenhuma
 *    hipótese — é justamente a dívida que precisa continuar à vista.
 * 2. O RLS limita o delete às linhas do próprio usuário, então a operação não
 *    depende de o filtro estar certo para ser segura.
 *
 * Devolve quantas linhas saíram, ou null se falhou.
 */
export async function limparPagasDeMesesAnteriores(
  supabase: SupabaseClient,
  opcoes: { userId?: string; hoje?: string } = {}
): Promise<number | null> {
  /*
   * `hoje` pode vir de fora porque no servidor o relógio está em UTC.
   *
   * Sem isso, entre 21h e meia-noite em São Paulo o servidor já acha que é o dia
   * seguinte, e na virada do mês a limpeza aconteceria algumas horas adiantada.
   */
  const hoje =
    opcoes.hoje ??
    (() => {
      const a = new Date();
      return `${a.getFullYear()}-${String(a.getMonth() + 1).padStart(2, "0")}-01`;
    })();

  /*
   * Primeiro dia do mês mais antigo que fica.
   *
   * Com retenção de 6 e estando em fevereiro, o corte cai em setembro: setembro
   * a fevereiro são os seis meses guardados, e agosto sai. O cálculo passa por
   * Date para a virada de ano se resolver sozinha.
   */
  const [ano, mes] = hoje.split("-").map(Number);
  const corte = new Date(ano, mes - 1 - (MESES_RETENCAO_PAGAS - 1), 1);
  const inicioDoMes = `${corte.getFullYear()}-${String(
    corte.getMonth() + 1
  ).padStart(2, "0")}-01`;

  /* Mesma razão do userId em limparConcluidas: com a chave de serviço, sem o
     filtro explícito o delete alcançaria todos os usuários. */
  let consulta = supabase
    .from("bills")
    .delete()
    .eq("status", "paid")
    .lt("due_date", inicioDoMes);
  if (opcoes.userId) consulta = consulta.eq("user_id", opcoes.userId);

  const { data, error } = await consulta.select("id");

  if (error) return null;
  return data?.length ?? 0;
}

/**
 * Apaga eventos de calendário de meses anteriores.
 *
 * Diferente das contas pagas, que ficam 12 meses: não há gráfico nem soma que
 * dependa do histórico de eventos, então evento de mês fechado é só ruído ao
 * navegar para trás no calendário.
 *
 * A comparação é com o primeiro dia do mês corrente, e não com "ontem": o mês
 * em curso fica inteiro, inclusive os dias já passados dele. É o mesmo critério
 * do recorte por mês da tela.
 *
 * Duas salvaguardas:
 *
 * 1. A ÚLTIMA ocorrência de cada repetição nunca é apagada. `estender` parte
 *    dela para preencher a janela adiante; apagá-la encerraria a repetição em
 *    silêncio. Só acontece se a repetição inteira estiver no passado — o que
 *    exigiria o app e o cron parados por mais de dois meses — mas o custo de
 *    proteger é uma consulta e o de não proteger é perder a regra.
 *
 * 2. O RLS limita o delete às linhas do próprio usuário. Quem chama com a chave
 *    de serviço passa `userId`, porque ali o RLS não vale.
 *
 * Devolve quantos eventos saíram, ou null se falhou.
 */
export async function limparEventosPassados(
  supabase: SupabaseClient,
  opcoes: { userId?: string; hoje?: string } = {}
): Promise<number | null> {
  const hoje =
    opcoes.hoje ??
    (() => {
      const a = new Date();
      return `${a.getFullYear()}-${String(a.getMonth() + 1).padStart(2, "0")}-01`;
    })();

  /* Meia-noite local do primeiro dia do mês corrente. */
  const [ano, mes] = hoje.split("-").map(Number);
  const corte = new Date(ano, mes - 1, 1).toISOString();

  let candidatos = supabase
    .from("events")
    .select("id, series_id, start_at")
    .lt("start_at", corte);
  if (opcoes.userId) candidatos = candidatos.eq("user_id", opcoes.userId);

  const { data, error } = await candidatos;
  if (error) return null;

  const linhas =
    (data as { id: string; series_id: string | null; start_at: string }[]) ?? [];
  if (!linhas.length) return 0;

  /*
   * Quais séries não têm nenhuma ocorrência a partir do corte.
   *
   * Para essas, a mais recente do passado é a única âncora que resta e precisa
   * ficar. Uma consulta só, pedindo as séries que sobrevivem ao corte.
   */
  const seriesNoPassado = new Set(
    linhas.map((e) => e.series_id).filter((s): s is string => !!s)
  );

  const protegidos = new Set<string>();
  if (seriesNoPassado.size) {
    let futuras = supabase
      .from("events")
      .select("series_id")
      .gte("start_at", corte)
      .in("series_id", [...seriesNoPassado]);
    if (opcoes.userId) futuras = futuras.eq("user_id", opcoes.userId);

    const { data: adiante } = await futuras;
    const temFuturo = new Set(
      ((adiante as { series_id: string | null }[]) ?? [])
        .map((e) => e.series_id)
        .filter((s): s is string => !!s)
    );

    /* Série sem nada adiante: preserva a ocorrência mais recente dela. */
    const maisRecente = new Map<string, { id: string; start_at: string }>();
    linhas.forEach((e) => {
      if (!e.series_id || temFuturo.has(e.series_id)) return;
      const atual = maisRecente.get(e.series_id);
      if (!atual || e.start_at > atual.start_at)
        maisRecente.set(e.series_id, { id: e.id, start_at: e.start_at });
    });
    maisRecente.forEach((e) => protegidos.add(e.id));
  }

  const apagar = linhas.filter((e) => !protegidos.has(e.id)).map((e) => e.id);
  if (!apagar.length) return 0;

  const { data: saiu, error: erroDelete } = await supabase
    .from("events")
    .delete()
    .in("id", apagar)
    .select("id");

  if (erroDelete) return null;
  return saiu?.length ?? 0;
}
