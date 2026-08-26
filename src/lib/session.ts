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

/**
 * Nome de exibição a partir do que existe.
 *
 * Prefere um nome de verdade se estiver no metadata; cai para a parte antes
 * do @ do e-mail, que é como o app já identifica a pessoa na barra lateral.
 */
function nomeDe(email: string, meta?: Record<string, unknown> | null) {
  const bruto =
    (typeof meta?.full_name === "string" && meta.full_name) ||
    (typeof meta?.nome === "string" && meta.nome) ||
    (typeof meta?.name === "string" && meta.name) ||
    email.split("@")[0] ||
    "";
  const limpo = bruto.trim();
  if (!limpo) return "";
  // ponto, hífen e underscore em handle de e-mail viram espaço:
  // "ana.silva" saía "Ana.silva" em vez de "Ana Silva"
  return limpo
    .replace(/[._-]+/g, " ")
    .split(" ")
    .filter(Boolean)
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(" ");
}

/** Id, e-mail e nome, para telas que mostram quem está logado. */
export async function currentIdentity(
  supabase: SupabaseClient
): Promise<{ id: string; email: string; nome: string } | null> {
  try {
    const { data } = await supabase.auth.getClaims();
    const c = data?.claims;
    if (c && typeof c.sub === "string") {
      const email = typeof c.email === "string" ? c.email : "";
      return { id: c.sub, email, nome: nomeDe(email, c.user_metadata) };
    }
  } catch {
    // segue para o caminho alternativo
  }
  const { data } = await supabase.auth.getSession();
  const u = data.session?.user;
  if (!u) return null;
  const email = u.email ?? "";
  return { id: u.id, email, nome: nomeDe(email, u.user_metadata) };
}
