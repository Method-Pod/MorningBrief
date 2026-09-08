import { NextResponse } from "next/server";
import {
  segundosDaDuracao,
  type AulaDaPlaylist,
} from "@/lib/aulas";

/**
 * Aulas de uma playlist do YouTube.
 *
 * No servidor porque exige chave: o oEmbed público resolve um vídeo, mas não
 * lista playlist — para isso só a YouTube Data API v3, e chave não pode viver
 * no navegador.
 *
 * `YOUTUBE_API_KEY` é separada da chave do Google Books de propósito. A do
 * Books está restrita à Books API, como deve estar; uma chave restrita a uma
 * API não serve para outra, e afrouxar a restrição para reaproveitar seria
 * trocar segurança por uma variável de ambiente.
 */

const CHAVE = process.env.YOUTUBE_API_KEY;

/** Uma página da API tem no máximo 50 itens; playlist de curso passa disso. */
const POR_PAGINA = 50;
/**
 * Teto de páginas.
 *
 * 6 × 50 dá 300 aulas, mais que qualquer curso razoável. O limite existe para
 * um link errado não virar centenas de chamadas e estourar a cota diária.
 */
const MAX_PAGINAS = 6;

type Item = {
  snippet?: {
    title?: string;
    videoOwnerChannelTitle?: string;
    channelTitle?: string;
    thumbnails?: Record<string, { url?: string }>;
    resourceId?: { videoId?: string };
  };
  contentDetails?: { videoId?: string };
};

const texto = (v: unknown) =>
  typeof v === "string" && v.trim() ? v.trim() : null;

async function json(url: string) {
  try {
    const r = await fetch(url, { next: { revalidate: 600 } });
    return { d: r.ok ? await r.json() : null, status: r.status };
  } catch {
    return { d: null, status: 0 };
  }
}

/** As durações em segundos, em uma chamada por lote de 50 ids. */
async function duracoes(ids: string[]): Promise<Map<string, number>> {
  const fora = new Map<string, number>();
  for (let i = 0; i < ids.length; i += POR_PAGINA) {
    const lote = ids.slice(i, i + POR_PAGINA);
    const { d } = await json(
      "https://www.googleapis.com/youtube/v3/videos?part=contentDetails" +
        `&id=${lote.join(",")}&key=${encodeURIComponent(CHAVE!)}`
    );
    const itens = (d as { items?: { id?: string; contentDetails?: { duration?: string } }[] })
      ?.items;
    if (!Array.isArray(itens)) continue;
    itens.forEach((v) => {
      const seg = segundosDaDuracao(v.contentDetails?.duration);
      if (v.id && seg) fora.set(v.id, seg);
    });
  }
  return fora;
}

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const playlist = (searchParams.get("id") ?? "").trim();
  if (!playlist) return NextResponse.json({ erro: "sem id" }, { status: 400 });

  if (!CHAVE)
    return NextResponse.json(
      {
        erro: "sem chave",
        recado:
          "Importar playlist precisa da variável YOUTUBE_API_KEY. Ative a YouTube Data API v3 no Google Cloud e crie uma chave.",
      },
      { status: 501 }
    );

  const itens: AulaDaPlaylist[] = [];
  const ids: string[] = [];
  let pagina: string | undefined;

  for (let n = 0; n < MAX_PAGINAS; n++) {
    const { d, status } = await json(
      "https://www.googleapis.com/youtube/v3/playlistItems" +
        `?part=snippet,contentDetails&maxResults=${POR_PAGINA}` +
        `&playlistId=${encodeURIComponent(playlist)}` +
        `&key=${encodeURIComponent(CHAVE)}` +
        (pagina ? `&pageToken=${pagina}` : "")
    );

    if (!d)
      return NextResponse.json(
        {
          erro: "falhou",
          status,
          /*
           * 403 e 404 têm causas distintas e conserto distinto, então a tela
           * precisa saber qual foi — "não deu" mandaria a pessoa procurar no
           * lugar errado.
           */
          recado:
            status === 403
              ? "O Google recusou a chave (403). Confira se a YouTube Data API v3 está ativada e se a restrição da chave permite ela."
              : status === 404
                ? "Playlist não encontrada (404). Ela pode ser privada."
                : status === 400
                  ? "A chave parece inválida (400)."
                  : "Não consegui falar com o YouTube agora.",
        },
        { status: 502 }
      );

    const lista = (d as { items?: Item[] }).items ?? [];
    lista.forEach((it) => {
      const s = it.snippet;
      const id = it.contentDetails?.videoId ?? s?.resourceId?.videoId;
      const title = texto(s?.title);
      /*
       * Vídeo apagado ou privado continua na playlist, com título
       * "Deleted video" e sem id útil. Entra como aula seria cadastrar um
       * link morto, então é descartado em silêncio.
       */
      if (!id || !title || /^(Deleted|Private) video$/i.test(title)) return;

      const t = s?.thumbnails ?? {};
      ids.push(id);
      itens.push({
        title,
        url: `https://www.youtube.com/watch?v=${id}`,
        canal: texto(s?.videoOwnerChannelTitle ?? s?.channelTitle),
        thumb_url: texto(
          t.medium?.url ?? t.high?.url ?? t.default?.url ?? null
        ),
        duracao_seg: null,
      });
    });

    pagina = (d as { nextPageToken?: string }).nextPageToken;
    if (!pagina) break;
  }

  /* As durações vêm depois, em lote: pedir por vídeo seria uma chamada por
     aula, e a cota da API é contada por chamada. */
  const mapa = await duracoes(ids);
  itens.forEach((a, i) => {
    a.duracao_seg = mapa.get(ids[i]) ?? null;
  });

  return NextResponse.json({ itens, total: itens.length });
}
