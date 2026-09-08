import type { FonteAula } from "./types";

/**
 * Reconhecimento de link de aula.
 *
 * O YouTube tem oEmbed público — cola o link e vêm título, canal e miniatura,
 * sem chave, e com CORS liberado (medido: o navegador chama direto). O Telegram
 * não tem equivalente: canal privado não expõe metadado nenhum, então lá o
 * título é digitado, e é por isso que ele existe como fonte própria em vez de
 * "outro".
 */

export type AulaDoLink = {
  fonte: FonteAula;
  title?: string;
  canal?: string;
  thumb_url?: string;
};

/** Normaliza o que foi colado: quase ninguém digita o esquema. */
export const normalizarUrl = (v: string) => {
  const t = v.trim();
  if (!t) return "";
  return /^[a-z][a-z0-9+.-]*:\/\//i.test(t) ? t : `https://${t}`;
};

/**
 * De onde vem o link.
 *
 * Serve para decidir se vale tentar o oEmbed e para o rótulo na tela. O que
 * não é YouTube nem Telegram fica em "outro" — Drive, Vimeo, PDF de aula.
 */
export function fonteDoLink(url: string): FonteAula {
  const u = normalizarUrl(url).toLowerCase();
  if (/(^|\/\/|\.)(youtube\.com|youtu\.be)(\/|$)/.test(u)) return "youtube";
  if (/(^|\/\/|\.)(t\.me|telegram\.me|telegram\.org)(\/|$)/.test(u))
    return "telegram";
  return "outro";
}

/**
 * Título, canal e miniatura de um vídeo do YouTube.
 *
 * Falha em silêncio de propósito: vídeo privado, apagado ou link torto devolve
 * só a fonte, e a pessoa digita o título. Recusar o cadastro porque o oEmbed
 * não respondeu seria transformar um enfeite em obstáculo.
 */
export async function dadosDoLink(url: string): Promise<AulaDoLink> {
  const fonte = fonteDoLink(url);
  if (fonte !== "youtube") return { fonte };

  try {
    const r = await fetch(
      "https://www.youtube.com/oembed?format=json&url=" +
        encodeURIComponent(normalizarUrl(url))
    );
    if (!r.ok) return { fonte };
    const d = await r.json();
    return {
      fonte,
      title: typeof d?.title === "string" ? d.title : undefined,
      canal: typeof d?.author_name === "string" ? d.author_name : undefined,
      thumb_url:
        typeof d?.thumbnail_url === "string" ? d.thumbnail_url : undefined,
    };
  } catch {
    return { fonte };
  }
}

/** "1h50" ou "42min" — minuto cru fica ilegível passando de uma hora. */
export const duracaoCurta = (min: number | null) => {
  if (!min || min <= 0) return null;
  const h = Math.floor(min / 60);
  const m = min % 60;
  return h ? (m ? `${h}h${String(m).padStart(2, "0")}` : `${h}h`) : `${m}min`;
};

export const pctAssistido = (l: {
  minutos: number | null;
  em_minuto: number | null;
}) =>
  l.minutos && l.em_minuto != null
    ? Math.min(100, Math.round((l.em_minuto / l.minutos) * 100))
    : null;

/* ------------------------------ playlist ------------------------------ */

/**
 * O id da playlist dentro do link.
 *
 * Aceita as duas formas que o YouTube usa: a página da playlist
 * (`/playlist?list=...`) e o vídeo tocando dentro dela (`/watch?v=X&list=...`).
 * A segunda é a que se copia sem pensar, e recusá-la obrigaria a voltar ao
 * YouTube para pegar o link "certo".
 */
export function idDaPlaylist(url: string): string | null {
  try {
    const u = new URL(normalizarUrl(url));
    const id = u.searchParams.get("list");
    /* "WL" e "LL" são as listas privadas do próprio usuário (Assistir mais
       tarde e Curtidos). A API não as devolve nem com chave, então avisar é
       melhor que tentar e falhar sem explicação. */
    return id && id !== "WL" && id !== "LL" ? id : null;
  } catch {
    return null;
  }
}

/**
 * Duração ISO 8601 do YouTube ("PT1H2M10S") em minutos.
 *
 * Arredonda para o minuto mais próximo, com piso de 1: um vídeo de 40
 * segundos é "1min" e não "0min", que viraria uma barra impossível de
 * completar.
 */
export function minutosDaDuracao(iso: unknown): number | null {
  if (typeof iso !== "string") return null;
  const m = iso.match(/^P(?:\d+D)?T(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?$/);
  if (!m) return null;
  const total =
    Number(m[1] ?? 0) * 60 + Number(m[2] ?? 0) + Number(m[3] ?? 0) / 60;
  return total > 0 ? Math.max(1, Math.round(total)) : null;
}

export type AulaDaPlaylist = {
  title: string;
  url: string;
  canal: string | null;
  thumb_url: string | null;
  minutos: number | null;
};
