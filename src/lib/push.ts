"use client";

import type { SupabaseClient } from "@supabase/supabase-js";

/*
 * A notificação da manhã, do lado do aparelho.
 *
 * Quem manda é a automação das 6h (api/cron), com a chave privada que mora
 * nas variáveis da Vercel. Aqui só se pede a permissão, se inscreve no
 * serviço de push do aparelho e se guarda a inscrição no banco.
 *
 * A chave PÚBLICA fica escrita no código de propósito: ela é pública por
 * definição (vai para o navegador de qualquer jeito), e deixá-la aqui poupa
 * uma variável a mais para configurar na Vercel.
 */
export const CHAVE_PUBLICA_PUSH =
  process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY ||
  "BGT93wcMEAWTbtPj2qai8pB0xRvkzjyh2B2ukY0szMnH8ZR50bmqbUVBdynnoCd4VJdk3V2xg25i1MMx1IamqS0";

export type SituacaoPush =
  | "sem-suporte"
  | "precisa-instalar"
  | "bloqueada"
  | "desligada"
  | "ligada";

/** iPhone/iPad, inclusive o iPad que se apresenta como Mac. */
const ehIOS = () =>
  /iphone|ipad|ipod/i.test(navigator.userAgent) ||
  (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1);

/** Aberto pela tela de início (app instalado), e não numa aba do Safari. */
const instalado = () =>
  window.matchMedia("(display-mode: standalone)").matches ||
  (navigator as Navigator & { standalone?: boolean }).standalone === true;

/**
 * Em que pé está a notificação neste aparelho.
 *
 * No iPhone o Safari só oferece push para o app adicionado à tela de início
 * (iOS 16.4 ou mais novo). Numa aba comum `PushManager` nem existe — por isso
 * o "precisa instalar" vem antes do "sem suporte": é o caso dele, e tem
 * conserto.
 */
export async function situacaoPush(): Promise<SituacaoPush> {
  if (typeof window === "undefined") return "sem-suporte";
  if (ehIOS() && !instalado()) return "precisa-instalar";
  if (!("serviceWorker" in navigator) || !("PushManager" in window) || !("Notification" in window))
    return "sem-suporte";
  if (Notification.permission === "denied") return "bloqueada";
  const reg = await navigator.serviceWorker.ready;
  const inscricao = await reg.pushManager.getSubscription();
  return inscricao && Notification.permission === "granted" ? "ligada" : "desligada";
}

const paraBytes = (base64: string) => {
  const padding = "=".repeat((4 - (base64.length % 4)) % 4);
  const bruto = atob((base64 + padding).replace(/-/g, "+").replace(/_/g, "/"));
  return Uint8Array.from(bruto, (c) => c.charCodeAt(0));
};

const nomeDoAparelho = () =>
  ehIOS() ? "iPhone" : /android/i.test(navigator.userAgent) ? "Android" : "Computador";

/**
 * Liga a notificação neste aparelho. Precisa vir de um toque — o iPhone só
 * mostra o pedido de permissão em resposta a um gesto.
 */
export async function ligarPush(
  supabase: SupabaseClient,
  userId: string
): Promise<{ ok: true } | { ok: false; erro: string }> {
  const permissao = await Notification.requestPermission();
  if (permissao !== "granted")
    return { ok: false, erro: "A permissão foi negada. Libere nas configurações do aparelho." };

  const reg = await navigator.serviceWorker.ready;
  const inscricao =
    (await reg.pushManager.getSubscription()) ??
    (await reg.pushManager.subscribe({
      userVisibleOnly: true,
      applicationServerKey: paraBytes(CHAVE_PUBLICA_PUSH),
    }));

  const json = inscricao.toJSON() as {
    endpoint?: string;
    keys?: { p256dh?: string; auth?: string };
  };
  if (!json.endpoint || !json.keys?.p256dh || !json.keys?.auth)
    return { ok: false, erro: "O aparelho não devolveu a inscrição completa." };

  const { error } = await supabase.from("push_assinaturas").upsert(
    {
      user_id: userId,
      endpoint: json.endpoint,
      p256dh: json.keys.p256dh,
      auth: json.keys.auth,
      aparelho: nomeDoAparelho(),
    },
    { onConflict: "endpoint" }
  );
  if (error)
    return {
      ok: false,
      erro: /push_assinaturas/.test(error.message)
        ? "Falta rodar supabase/PRIVACIDADE-E-AGENDA.sql no Supabase."
        : error.message,
    };
  return { ok: true };
}

/** Desliga neste aparelho: cancela a inscrição e tira a linha do banco. */
export async function desligarPush(supabase: SupabaseClient) {
  const reg = await navigator.serviceWorker.ready;
  const inscricao = await reg.pushManager.getSubscription();
  if (!inscricao) return;
  await supabase.from("push_assinaturas").delete().eq("endpoint", inscricao.endpoint);
  await inscricao.unsubscribe();
}
