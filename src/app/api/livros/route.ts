import { NextResponse } from "next/server";
import {
  completar,
  normalizarGoogle,
  normalizarOpenLibrary,
  pareceIsbn,
  soIsbn,
  type LivroAchado,
} from "@/lib/livros";

/**
 * Busca de livro, no servidor.
 *
 * Está aqui e não no navegador por dois motivos que se somam. O primeiro é a
 * chave: o Google Books responde 429 a chamada sem chave — medido, em toda
 * tentativa, por linha de comando e por navegador, do mesmo IP — e chave só
 * pode viver no servidor. O segundo é a rede de segurança: quando o Google não
 * responde ou não sabe, o Open Library atende sem chave nenhuma, e quem decide
 * isso não pode ser a tela.
 *
 * GOOGLE_BOOKS_KEY é opcional. Sem ela a rota funciona só com Open Library, que
 * foi como isto entrou no ar antes de a chave existir.
 */

const CHAVE = process.env.GOOGLE_BOOKS_KEY;

/** Falha de rede ou cota não é erro daqui: é motivo para tentar a outra fonte. */
async function json(url: string) {
  try {
    const r = await fetch(url, { next: { revalidate: 3600 } });
    return r.ok ? await r.json() : null;
  } catch {
    return null;
  }
}

async function google(termo: string): Promise<LivroAchado[]> {
  if (!CHAVE) return [];
  const q = pareceIsbn(termo) ? `isbn:${soIsbn(termo)}` : termo;
  const d = await json(
    "https://www.googleapis.com/books/v1/volumes?maxResults=12" +
      `&q=${encodeURIComponent(q)}&key=${encodeURIComponent(CHAVE)}`
  );
  const itens: unknown[] = Array.isArray(d?.items) ? d.items : [];
  return itens
    .map(normalizarGoogle)
    .filter((x): x is LivroAchado => x !== null);
}

async function openLibrary(termo: string): Promise<LivroAchado[]> {
  /* Sempre search.json, inclusive para ISBN: o endpoint /isbn/ não traz o nome
     do autor, só uma referência que exigiria uma segunda chamada por livro. */
  const q = pareceIsbn(termo) ? soIsbn(termo) : termo;
  const d = await json(
    "https://openlibrary.org/search.json?limit=12" +
      "&fields=key,title,author_name,isbn,number_of_pages_median,publisher," +
      "first_publish_year,language,subject,cover_i" +
      `&q=${encodeURIComponent(q)}`
  );
  const docs: unknown[] = Array.isArray(d?.docs) ? d.docs : [];
  return docs
    .map(normalizarOpenLibrary)
    .filter((x): x is LivroAchado => x !== null);
}

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const termo = (searchParams.get("q") ?? "").trim();
  if (termo.length < 2) return NextResponse.json({ itens: [] });

  /*
   * Google primeiro, Open Library como rede.
   *
   * Nesta ordem porque o Google traz descrição e o total de páginas da edição
   * exata, e o Open Library dá a mediana entre edições. Quando o Google não
   * responde — sem chave, ou cota estourada — a lista vem inteira da rede, e a
   * tela nem precisa saber.
   */
  const g = await google(termo);
  const o = g.length ? [] : await openLibrary(termo);
  const itens = g.length ? g : o;

  return NextResponse.json(
    { itens, fonte: g.length ? "google" : "openlibrary", comChave: !!CHAVE },
    /* Um título buscado não é dado de ninguém, mas o resultado é o mesmo para
       todos: cache compartilhado serve, e poupa cota. */
    { headers: { "Cache-Control": "public, max-age=3600" } }
  );
}

/**
 * Completa um livro escolhido, indo à outra fonte pelo ISBN.
 *
 * Só quando o registro escolhido está incompleto, e só para aquele livro — é o
 * conserto do buraco medido (páginas faltando em 1 de 3 no Open Library) sem
 * gastar uma chamada extra por item de toda busca.
 */
export async function POST(req: Request) {
  let corpo: { livro?: LivroAchado };
  try {
    corpo = await req.json();
  } catch {
    return NextResponse.json({ erro: true }, { status: 400 });
  }

  const livro = corpo.livro;
  if (!livro?.title) return NextResponse.json({ erro: true }, { status: 400 });
  if (!livro.isbn) return NextResponse.json({ livro });

  /* Pergunta à fonte que ainda não falou. */
  const outra =
    livro.fonte === "google"
      ? await openLibrary(livro.isbn)
      : await google(livro.isbn);

  return NextResponse.json({
    livro: outra.length ? completar(livro, outra[0]) : livro,
  });
}
