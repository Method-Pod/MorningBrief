import type { SupabaseClient } from "@supabase/supabase-js";

/** Janela de retenção de uma demanda concluída, em horas. */
export const HORAS_RETENCAO = 24;

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
 * Apaga contas pagas de meses anteriores.
 *
 * O efeito pedido é "no dia 1º do mês seguinte a conta paga sai": como não há
 * agendador, a regra é comparada por mês em cada abertura. Uma conta paga com
 * vencimento em agosto sobrevive todo o mês de agosto e desaparece na primeira
 * abertura de setembro — inclusive se o app ficar fechado até outubro, porque a
 * comparação é com o início do mês corrente e não com "ontem".
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
   * seguinte, e na virada do mês apagaria as pagas algumas horas antes da hora.
   */
  const hoje = opcoes.hoje ?? (() => {
    const a = new Date();
    return `${a.getFullYear()}-${String(a.getMonth() + 1).padStart(2, "0")}-01`;
  })();
  const inicioDoMes = `${hoje.slice(0, 7)}-01`;

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
