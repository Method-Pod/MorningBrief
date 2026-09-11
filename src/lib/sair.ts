"use client";

import { createClient } from "./supabase/client";
import { limparCache } from "./cachePagina";

/**
 * Sair da conta, num lugar só.
 *
 * Existiam duas saídas — o botão da barra lateral e o da tela de conta — e
 * elas tinham deixado de fazer a mesma coisa: a da barra limpava a memória
 * de página, a da tela de conta não. Quem saísse pela tela de conta deixava
 * os próprios dados guardados na aba, e eles apareceriam por um instante
 * para quem entrasse depois ali.
 *
 * Duas cópias de uma rotina de segurança sempre acabam assim. Agora é uma.
 *
 * Quem chama decide para onde ir depois: as duas telas mandam para /login,
 * mas a navegação é do componente, não daqui.
 */
export async function sairDaConta(): Promise<void> {
  await createClient().auth.signOut();
  /* A memória que acelera a troca de aba é por aba do navegador e não sabe
     de quem é. Ver cachePagina. */
  limparCache();
}
