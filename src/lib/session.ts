import type { SupabaseClient } from "@supabase/supabase-js";

export const SESSION_EXPIRED =
  "Sua sessão expirou. Entre novamente para continuar.";

/**
 * Id do usuário logado, sem ida ao servidor.
 *
 * getUser() é uma chamada de rede ao servidor de auth — 105ms medidos daqui.
 * Como toda gravação chamava currentUserId() antes do insert, cada ação
 * custava duas viagens em sequência em vez de uma.
 *
 * getClaims() verifica a assinatura do JWT localmente e lê o `sub` de dentro
 * dele, então é confiável sem custo de rede. Cai para getSession() quando o
 * projeto ainda usa chave simétrica e a verificação local não está disponível.
 */
export async function currentUserId(
  supabase: SupabaseClient
): Promise<string | null> {
  try {
    const { data } = await supabase.auth.getClaims();
    const sub = data?.claims?.sub;
    if (typeof sub === "string" && sub) return sub;
  } catch {
    // segue para o caminho alternativo
  }
  const { data } = await supabase.auth.getSession();
  return data.session?.user.id ?? null;
}

/** Id e e-mail juntos, para telas que mostram quem está logado. */
export async function currentIdentity(
  supabase: SupabaseClient
): Promise<{ id: string; email: string } | null> {
  try {
    const { data } = await supabase.auth.getClaims();
    const c = data?.claims;
    if (c && typeof c.sub === "string")
      return { id: c.sub, email: typeof c.email === "string" ? c.email : "" };
  } catch {
    // segue para o caminho alternativo
  }
  const { data } = await supabase.auth.getSession();
  const u = data.session?.user;
  return u ? { id: u.id, email: u.email ?? "" } : null;
}
