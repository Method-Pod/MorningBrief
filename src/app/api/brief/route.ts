import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { enviarBrief } from "@/lib/enviarBrief";

/*
 * Manda o brief agora, para os aparelhos de quem pediu.
 *
 * É o botão "Receber agora" da tela Conta: serve para conferir que a
 * notificação chega sem esperar as 6h. Usa a sessão de quem chamou — o RLS
 * garante que só os dados e os aparelhos dele entram.
 */
export const dynamic = "force-dynamic";

export async function POST() {
  const supabase = await createClient();
  const { data } = await supabase.auth.getUser();
  if (!data.user)
    return NextResponse.json({ erro: "sessão expirada" }, { status: 401 });

  const r = await enviarBrief(supabase, { userId: data.user.id });
  if (r === null)
    return NextResponse.json({ erro: "Não deu para enviar." }, { status: 500 });
  if ("pulado" in r) {
    const recado = {
      "sem-chave":
        "Falta a chave VAPID_PRIVATE_KEY nas variáveis da Vercel (e um novo deploy).",
      "sem-aparelho": "Nenhum aparelho com a notificação ligada.",
      "sem-tabela": "Falta rodar supabase/PRIVACIDADE-E-AGENDA.sql no Supabase.",
    }[r.pulado];
    return NextResponse.json({ erro: recado }, { status: 409 });
  }
  return NextResponse.json(r);
}
