import { createClient } from "@supabase/supabase-js";

/**
 * Cliente com a chave de serviço. **Só no servidor.**
 *
 * Esta chave passa por cima do RLS: com ela, uma consulta sem filtro de usuário
 * alcança as linhas de todo mundo. Por isso duas coisas valem sempre:
 *
 * 1. O arquivo não tem "use client" e a variável não tem prefixo NEXT_PUBLIC_,
 *    então o Next não a embute no pacote do navegador. Se algum dia alguém
 *    importar isto num componente de cliente, a build quebra — que é o
 *    comportamento desejado.
 * 2. Quem usa este cliente passa `user_id` explicitamente em cada operação. As
 *    funções de manutenção aceitam `userId` justamente para isso.
 *
 * `persistSession: false` porque não há navegador nem sessão a guardar: cada
 * execução do cron é um processo novo e curto.
 */
export function createServiceClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const chave = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!url || !chave)
    throw new Error(
      "Faltam NEXT_PUBLIC_SUPABASE_URL ou SUPABASE_SERVICE_ROLE_KEY nas variáveis de ambiente."
    );

  return createClient(url, chave, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}
