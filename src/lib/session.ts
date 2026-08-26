import type { SupabaseClient } from "@supabase/supabase-js";

export const SESSION_EXPIRED =
  "Sua sessão expirou. Entre novamente para continuar.";

/**
 * Id do usuário logado, ou null se a sessão caiu.
 *
 * Substitui o `u.user!.id` que estava espalhado pelas páginas: a asserção
 * mentia para o TypeScript e estourava em runtime quando o token vencia,
 * em vez de mandar a pessoa para o login.
 */
export async function currentUserId(
  supabase: SupabaseClient
): Promise<string | null> {
  const { data, error } = await supabase.auth.getUser();
  if (error || !data.user) return null;
  return data.user.id;
}
