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
  supabase: SupabaseClient
): Promise<number | null> {
  const limite = new Date(
    Date.now() - HORAS_RETENCAO * 60 * 60 * 1000
  ).toISOString();

  const { data, error } = await supabase
    .from("tasks")
    .delete()
    .eq("status", "done")
    .not("completed_at", "is", null)
    .lt("completed_at", limite)
    .select("id");

  if (error) return null;
  return data?.length ?? 0;
}
