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

/**
 * Segundos → "1h23m45s", "23m45s", "45s".
 *
 * Mostra o segundo, que é o que a duração passou a guardar. As partes que
 * valem zero saem fora: "1h" em vez de "1h00m00s", que é ruído para dizer a
 * mesma coisa. Segundo cru passando de um minuto fica ilegível, então nunca
 * aparece sozinho acima de 59.
 */
export const duracaoExata = (seg: number | null | undefined) => {
  if (!seg || seg <= 0) return null;
  const h = Math.floor(seg / 3600);
  const m = Math.floor((seg % 3600) / 60);
  const s = seg % 60;

  /* Com hora, minuto e segundo ganham dois dígitos: "1h23m45s" alinha, e
     "1h3m5s" parece truncado. Sem hora, o minuto vem cru — "3m34s", não
     "03m34s". */
  const partes = [
    h ? `${h}h` : "",
    m ? `${h ? String(m).padStart(2, "0") : m}m` : "",
    s ? `${h || m ? String(s).padStart(2, "0") : s}s` : "",
  ];
  return partes.join("") || null;
};

/**
 * A duração da aula em segundos, venha de onde vier.
 *
 * Entre subir o código novo e rodar DURACAO-EXATA.sql existe uma janela em que
 * o banco ainda tem `minutos` e não tem `duracao_seg`. Sem esta ponte, nesse
 * intervalo toda aula já cadastrada apareceria sem duração — um susto por uma
 * migração de um minuto. Depois de migrar, `minutos` não existe mais e só o
 * primeiro caminho é usado.
 */
export const duracaoDaAula = (l: {
  duracao_seg?: number | null;
  minutos?: number | null;
}) => l.duracao_seg ?? (l.minutos ? l.minutos * 60 : null);

/**
 * Quanto da aula já foi vista.
 *
 * `em_minuto` é onde a pessoa parou, em minutos — é o que ela digita, e
 * minuto é a granularidade certa para "parei aqui". A duração é em segundos,
 * então o minuto é convertido antes de dividir; comparar as duas na unidade
 * errada daria 60 vezes menos.
 */
export const pctAssistido = (l: {
  duracao_seg?: number | null;
  minutos?: number | null;
  em_minuto: number | null;
}) => {
  const total = duracaoDaAula(l);
  return total && l.em_minuto != null
    ? Math.min(100, Math.round(((l.em_minuto * 60) / total) * 100))
    : null;
};

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
 * Duração ISO 8601 do YouTube ("PT1H2M10S") em segundos.
 *
 * Exato, sem arredondar: o segundo é justamente o que se quer guardar. O `D`
 * opcional no começo aparece em transmissão longa; é aceito e ignorado,
 * porque uma aula de mais de um dia não existe.
 */
export function segundosDaDuracao(iso: unknown): number | null {
  if (typeof iso !== "string") return null;
  const m = iso.match(/^P(?:\d+D)?T(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?$/);
  if (!m) return null;
  const total =
    Number(m[1] ?? 0) * 3600 + Number(m[2] ?? 0) * 60 + Number(m[3] ?? 0);
  return total > 0 ? total : null;
}

export type AulaDaPlaylist = {
  title: string;
  url: string;
  canal: string | null;
  thumb_url: string | null;
  duracao_seg: number | null;
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
 * "1:23:45", "1h23m45s", "83min", "45s", "83" → segundos.
 *
 * O campo era um `type="number"` em minutos, e para um vídeo de uma hora e
 * vinte era preciso fazer a conta de cabeça — hora e segundo não tinham onde
 * entrar. Aqui qualquer das formas serve, e o resultado é sempre em segundos,
 * que é a unidade em que a aula é gravada.
 *
 * Exato, sem arredondar: escrever "1:23:45" grava os 45 segundos. Número sem
 * unidade é minuto, porque é o que "83" quer dizer. Devolve null quando não dá
 * para entender.
 */
export function segundosDoTexto(cru: string): number | null {
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
    return segundos > 0 ? segundos : null;
  }

  /*
   * Com letra: 1h23m45s, 1h23, 90min, 45s, 83.
   *
   * Lido como uma sequência de "número + unidade", e não como um único padrão
   * com grupos opcionais. Com grupos opcionais o motor de expressão regular
   * reparte o número para fazer o resto casar: "45s" saía como 4 minutos e 5
   * segundos, porque assim sobrava um dígito para o "s".
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
  return segundos > 0 ? segundos : null;
}

/**
 * Segundos → o texto que vai no campo, no formato que ele mesmo entende.
 *
 * Devolve "1h23m45s" ou "42m", que é o que `segundosDoTexto` lê de volta sem
 * perder nada — o campo pode ser preenchido pelo link e editado à mão sem
 * mudar de linguagem no meio.
 */
export const textoDaDuracao = (segundos: number | null) =>
  duracaoExata(segundos) ?? "";
