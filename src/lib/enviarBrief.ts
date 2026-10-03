import type { SupabaseClient } from "@supabase/supabase-js";
import webpush from "web-push";
import type { Bill, CalendarEvent, Task } from "./types";
import {
  fechamentoDoMes,
  linhaDoFechamento,
  mesAnterior,
  montarBrief,
} from "./brief";

/*
 * Manda o brief da manhã para os aparelhos de uma pessoa.
 *
 * Roda dentro da automação das 6h, depois da manutenção — assim o brief já
 * conta as contas fixas lançadas e as recorrentes geradas naquela passada.
 *
 * Só no servidor: usa a chave privada do push (VAPID_PRIVATE_KEY, nas
 * variáveis da Vercel). Sem a chave, não manda nada e diz por quê; não é
 * falha da manutenção.
 */

const CHAVE_PUBLICA =
  process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY ||
  "BGT93wcMEAWTbtPj2qai8pB0xRvkzjyh2B2ukY0szMnH8ZR50bmqbUVBdynnoCd4VJdk3V2xg25i1MMx1IamqS0";

type Assinatura = { id: string; endpoint: string; p256dh: string; auth: string };

export type ResultadoBrief =
  | { enviados: number; removidos: number }
  | { pulado: "sem-chave" | "sem-aparelho" | "sem-tabela" }
  | null;

export async function enviarBrief(
  supabase: SupabaseClient,
  { userId, hoje, falhou }: { userId: string; hoje: string; falhou: boolean }
): Promise<ResultadoBrief> {
  const privada = process.env.VAPID_PRIVATE_KEY;
  if (!privada) return { pulado: "sem-chave" };

  const { data: subs, error: erroSubs } = await supabase
    .from("push_assinaturas")
    .select("id,endpoint,p256dh,auth")
    .eq("user_id", userId);
  if (erroSubs) return { pulado: "sem-tabela" };
  const aparelhos = (subs as Assinatura[]) ?? [];
  if (!aparelhos.length) return { pulado: "sem-aparelho" };

  /* Dia 1º também traz o fechamento do mês anterior: as contas desde lá. */
  const primeiroDia = hoje.endsWith("-01");
  const desde = primeiroDia ? `${mesAnterior(hoje.slice(0, 7))}-01` : "1900-01-01";

  const [contas, tarefas, eventos] = await Promise.all([
    supabase
      .from("bills")
      .select("*")
      .eq("user_id", userId)
      .or(`status.eq.pending,due_date.gte.${desde}`),
    supabase
      .from("tasks")
      .select("id,title,status,due_date,priority")
      .eq("user_id", userId)
      .neq("status", "done")
      .not("due_date", "is", null)
      .lte("due_date", hoje),
    /* Uma folga de um dia para cada lado: o filtro fino, em São Paulo, é do
       montarBrief. */
    supabase
      .from("events")
      .select("*")
      .eq("user_id", userId)
      .gte("start_at", new Date(new Date(hoje + "T00:00:00Z").getTime() - 86_400_000).toISOString())
      .lte("start_at", new Date(new Date(hoje + "T00:00:00Z").getTime() + 2 * 86_400_000).toISOString()),
  ]);
  if (contas.error || tarefas.error || eventos.error) return null;

  const todasContas = ((contas.data as Bill[]) ?? []).map((b) => ({
    ...b,
    amount: Number(b.amount),
  }));
  const brief = montarBrief({
    hoje,
    contas: todasContas.filter((b) => b.status !== "paid"),
    tarefas: (tarefas.data as Task[]) ?? [],
    eventos: (eventos.data as CalendarEvent[]) ?? [],
    falhou,
  });
  if (primeiroDia) {
    const f = fechamentoDoMes(todasContas, mesAnterior(hoje.slice(0, 7)));
    if (f.total > 0) brief.corpo = `${linhaDoFechamento(f)}\n${brief.corpo}`;
  }

  webpush.setVapidDetails(
    "mailto:morningbrief@users.noreply.github.com",
    CHAVE_PUBLICA,
    privada
  );
  const carga = JSON.stringify({ titulo: brief.titulo, corpo: brief.corpo, url: "/" });

  let enviados = 0;
  const vencidas: string[] = [];
  await Promise.all(
    aparelhos.map(async (a) => {
      try {
        await webpush.sendNotification(
          { endpoint: a.endpoint, keys: { p256dh: a.p256dh, auth: a.auth } },
          carga,
          /* Se o aparelho estiver desligado, vale até o meio-dia; depois
             disso o brief da manhã já não serve. */
          { TTL: 6 * 3600, urgency: "high" }
        );
        enviados += 1;
      } catch (e) {
        /* 404/410: o aparelho cancelou a inscrição (app removido, permissão
           tirada). A linha sai para não tentar de novo todo dia. */
        const status = (e as { statusCode?: number }).statusCode;
        if (status === 404 || status === 410) vencidas.push(a.id);
        else console.error("[brief] falha ao enviar", status, (e as Error).message);
      }
    })
  );
  if (vencidas.length)
    await supabase.from("push_assinaturas").delete().in("id", vencidas);

  return { enviados, removidos: vencidas.length };
}
