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

/* ------------------------------ duração ------------------------------ */

/**
 * O id do vídeo dentro do link.
 *
 * Cobre as formas que aparecem ao copiar do YouTube: a página normal
 * (`/watch?v=`), o link curto de compartilhar (`youtu.be/`), o Shorts, o
 * embed e a transmissão. Aceitar só a primeira faria o botão de compartilhar
 * do celular — que dá `youtu.be` — não funcionar.
 */
export function idDoVideo(url: string): string | null {
  try {
    const u = new URL(normalizarUrl(url));
    const host = u.hostname.replace(/^www\.|^m\./, "").toLowerCase();

    if (host === "youtu.be") return limparId(u.pathname.slice(1));
    if (!/(^|\.)youtube\.com$/.test(host)) return null;

    const v = u.searchParams.get("v");
    if (v) return limparId(v);

    const m = u.pathname.match(/^\/(?:shorts|embed|live|v)\/([^/?]+)/);
    return m ? limparId(m[1]) : null;
  } catch {
    return null;
  }
}

/* Um id de vídeo tem 11 caracteres do alfabeto de URL. Conferir isto evita
   montar um endereço com um pedaço de caminho que não é id. */
const limparId = (v: string) => (/^[\w-]{11}$/.test(v) ? v : null);

/**
 * "1:23:45", "1h23", "83min", "45s", "83" → minutos.
 *
 * O campo era um `type="number"` em minutos, e para um vídeo de uma hora e
 * vinte era preciso fazer a conta de cabeça — hora e segundo não tinham onde
 * entrar. Aqui qualquer das formas serve, e o resultado é sempre em minutos,
 * que é a unidade em que a aula é gravada e em que o marcador de "onde parei"
 * anda.
 *
 * Arredonda para o minuto mais próximo, com piso de 1: um corte de 40
 * segundos é "1min" e não "0min", que viraria uma barra impossível de
 * completar. Devolve null quando não dá para entender.
 */
export function minutosDoTexto(cru: string): number | null {
  const t = cru.trim().toLowerCase().replace(/\s+/g, "");
  if (!t) return null;

  /* Relógio: 1:23:45 (h:m:s) ou 23:45 (m:s). Duas partes são minuto e
     segundo, não hora e minuto — é assim que o YouTube mostra a duração. */
  const relogio = t.match(/^(\d+):([0-5]?\d)(?::([0-5]?\d))?$/);
  if (relogio) {
    const [, a, b, c] = relogio;
    const segundos =
      c === undefined
        ? Number(a) * 60 + Number(b)
        : Number(a) * 3600 + Number(b) * 60 + Number(c);
    return segundosEmMinutos(segundos);
  }

  /*
   * Com letra: 1h23m45s, 1h23, 90min, 45s, 83.
   *
   * Lido como uma sequência de "número + unidade", e não como um único padrão
   * com grupos opcionais. Com grupos opcionais o motor de expressão regular
   * reparte o número para fazer o resto casar: "45s" saía como 4 minutos e 5
   * segundos, porque assim sobrava um dígito para o "s". Aqui cada número
   * carrega a sua unidade, e número sem unidade é minuto — que é o que "83"
   * quer dizer.
   */
  const pedacos = [...t.matchAll(/(\d+)(h|min|m|s)?/g)];
  const sobra = t.replace(/(\d+)(h|min|m|s)?/g, "");
  if (!pedacos.length || sobra) return null;

  let segundos = 0;
  for (const [, numero, unidade] of pedacos) {
    const n = Number(numero);
    if (unidade === "h") segundos += n * 3600;
    else if (unidade === "s") segundos += n;
    else segundos += n * 60;
  }
  return segundosEmMinutos(segundos);
}

const segundosEmMinutos = (s: number) =>
  s > 0 ? Math.max(1, Math.round(s / 60)) : null;

/**
 * Segundos → o texto que vai no campo, no formato que ele mesmo entende.
 *
 * Devolve "1h23" ou "42min", que é o que `minutosDoTexto` lê de volta sem
 * perder nada — o campo pode ser preenchido pelo link e editado à mão sem
 * mudar de linguagem no meio.
 */
export const textoDaDuracao = (minutos: number | null) =>
  duracaoCurta(minutos) ?? "";
