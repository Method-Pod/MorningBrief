/*
 * As chaves que ligam o Claude Code ao app (rota /api/mcp).
 *
 * A chave é mostrada uma vez, ao ser criada em Conta, e o banco guarda só a
 * impressão digital dela (SHA-256). Quem ler a tabela não consegue usar
 * nada; quem perder a chave gera outra e revoga a velha.
 *
 * 32 bytes aleatórios do sistema, em base64url: adivinhar está fora de
 * questão, e o prefixo "mb_" deixa a chave reconhecível num arquivo de
 * configuração ou num vazamento ("isto é do Morning Brief").
 */

export const PREFIXO_DA_CHAVE = "mb_";

const base64url = (bytes: Uint8Array) => {
  let s = "";
  for (const b of bytes) s += String.fromCharCode(b);
  return btoa(s).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
};

/** A impressão digital que o banco guarda, em hexadecimal. */
export async function hashDaChave(chave: string): Promise<string> {
  const dados = new TextEncoder().encode(chave);
  const resumo = new Uint8Array(await crypto.subtle.digest("SHA-256", dados));
  return [...resumo].map((b) => b.toString(16).padStart(2, "0")).join("");
}

/** Uma chave nova: o texto (mostrado uma vez), o começo dela e o hash. */
export async function gerarChave() {
  const bytes = new Uint8Array(32);
  crypto.getRandomValues(bytes);
  const chave = PREFIXO_DA_CHAVE + base64url(bytes);
  return { chave, prefixo: chave.slice(0, 10), hash: await hashDaChave(chave) };
}

/** Tira a chave do cabeçalho `Authorization: Bearer mb_...`; nulo se não houver. */
export function chaveDoCabecalho(valor: string | null): string | null {
  const m = /^Bearer\s+(mb_[A-Za-z0-9_-]{20,})\s*$/.exec(valor ?? "");
  return m ? m[1] : null;
}
