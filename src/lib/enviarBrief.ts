import type { SupabaseClient } from "@supabase/supabase-js";
import webpush from "web-push";

/*
 * O "bom dia" das 6h nos aparelhos de uma pessoa.
 *
 * A notificação é só o convite — "Bom dia! Veja o resumo do seu dia" — e
 * tocar nela abre o Início, que é onde o resumo mora. Pedido dele: o resumo
 * não vai dentro da notificação; ela serve para levar até o app.
 *
 * Roda no fim da automação das 6h (api/cron) e no botão "Receber agora" da
 * tela Conta. Só no servidor: usa a chave privada do push
 * (VAPID_PRIVATE_KEY, nas variáveis da Vercel). Sem a chave, não manda nada
 * e diz por quê; não é falha da manutenção.
 */

const CHAVE_PUBLICA =
  process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY ||
  "BGT93wcMEAWTbtPj2qai8pB0xRvkzjyh2B2ukY0szMnH8ZR50bmqbUVBdynnoCd4VJdk3V2xg25i1MMx1IamqS0";

export const BOM_DIA = { titulo: "Bom dia! ☀️", corpo: "Veja o resumo do seu dia", url: "/" };

type Assinatura = { id: string; endpoint: string; p256dh: string; auth: string };

export type ResultadoBrief =
  /* `recusados` existe por um caso que passava por sucesso: o servidor de
     push recusar o envio (403, tipico de par de chaves VAPID trocado). O
     aparelho esta inscrito, nada e removido, e `enviados` fica em 0 — a tela
     dizia "Enviado para 0 aparelhos", que soa como se tivesse funcionado. */
  | { enviados: number; removidos: number; recusados: number }
  | { pulado: "sem-chave" | "sem-aparelho" | "sem-tabela" }
  | null;

export async function enviarBrief(
  supabase: SupabaseClient,
  { userId }: { userId: string }
): Promise<ResultadoBrief> {
  const privada = process.env.VAPID_PRIVATE_KEY;
  if (!privada) return { pulado: "sem-chave" };

  const { data: subs, error } = await supabase
    .from("push_assinaturas")
    .select("id,endpoint,p256dh,auth")
    .eq("user_id", userId);
  if (error) return { pulado: "sem-tabela" };
  const aparelhos = (subs as Assinatura[]) ?? [];
  if (!aparelhos.length) return { pulado: "sem-aparelho" };

  webpush.setVapidDetails(
    "mailto:morningbrief@users.noreply.github.com",
    CHAVE_PUBLICA,
    privada
  );
  const carga = JSON.stringify(BOM_DIA);

  let enviados = 0;
  let recusados = 0;
  const vencidas: string[] = [];
  await Promise.all(
    aparelhos.map(async (a) => {
      try {
        await webpush.sendNotification(
          { endpoint: a.endpoint, keys: { p256dh: a.p256dh, auth: a.auth } },
          carga,
          /* Se o aparelho estiver desligado, vale até o meio-dia; depois
             disso o "bom dia" já não serve. */
          { TTL: 6 * 3600, urgency: "high" }
        );
        enviados += 1;
      } catch (e) {
        /* 404/410: o aparelho cancelou a inscrição (app removido, permissão
           tirada). A linha sai para não tentar de novo todo dia. */
        const status = (e as { statusCode?: number }).statusCode;
        if (status === 404 || status === 410) vencidas.push(a.id);
        else {
          recusados += 1;
          console.error("[brief] falha ao enviar", status, (e as Error).message);
        }
      }
    })
  );
  if (vencidas.length)
    await supabase.from("push_assinaturas").delete().in("id", vencidas);

  return { enviados, removidos: vencidas.length, recusados };
}
