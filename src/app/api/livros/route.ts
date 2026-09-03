import { NextResponse } from "next/server";
import {
  completar,
  normalizarGoogle,
  normalizarOpenLibrary,
  normalizarOpenLibraryIsbn,
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

/**
 * Falha de rede ou cota não é erro daqui: é motivo para tentar a outra fonte.
 *
 * Devolve o status junto porque sem ele um "não achei" e um "a chave está
 * errada" chegam iguais na tela — foi exatamente o que travou o diagnóstico de
 * uma busca por ISBN que não achava nada.
 */
async function json(url: string): Promise<{ d: unknown; status: number }> {
  try {
    const r = await fetch(url, { next: { revalidate: 3600 } });
    if (!r.ok) return { d: null, status: r.status };
    return { d: await r.json(), status: r.status };
  } catch {
    return { d: null, status: 0 };
  }
}

async function google(
  termo: string
): Promise<{ itens: LivroAchado[]; status: number }> {
  if (!CHAVE) return { itens: [], status: -1 };
  const q = pareceIsbn(termo) ? `isbn:${soIsbn(termo)}` : termo;
  const { d, status } = await json(
    "https://www.googleapis.com/books/v1/volumes?maxResults=12" +
      `&q=${encodeURIComponent(q)}&key=${encodeURIComponent(CHAVE)}`
  );
  const brutos: unknown[] = Array.isArray((d as { items?: unknown[] })?.items)
    ? (d as { items: unknown[] }).items
    : [];
  return {
    itens: brutos
      .map(normalizarGoogle)
      .filter((x): x is LivroAchado => x !== null),
    status,
  };
}

/**
 * ISBN no Open Library: consulta exata, não busca.
 *
 * `search.json` NÃO consulta por ISBN — medido: um ISBN desconhecido devolvia
 * 24 livros sem relação, e o prefixo `isbn:` não mudava nada, porque a busca
 * cai em correspondência difusa. Era a causa de "procurar pelo ISBN e receber
 * uma lista de livros errados".
 */
async function openLibraryIsbn(termo: string): Promise<LivroAchado[]> {
  const isbn = soIsbn(termo);
  const { d } = await json(
    `https://openlibrary.org/api/books?format=json&jscmd=data` +
      `&bibkeys=ISBN:${encodeURIComponent(isbn)}`
  );
  const achado = (d as Record<string, unknown> | null)?.[`ISBN:${isbn}`];
  if (!achado) return [];
  const livro = normalizarOpenLibraryIsbn(achado, isbn);
  return livro ? [livro] : [];
}

/** Texto no Open Library: aqui `search.json` é o endpoint certo. */
async function openLibraryTexto(termo: string): Promise<LivroAchado[]> {
  const { d } = await json(
    "https://openlibrary.org/search.json?limit=12" +
      "&fields=key,title,author_name,isbn,number_of_pages_median,publisher," +
      "first_publish_year,language,subject,cover_i" +
      `&q=${encodeURIComponent(termo)}`
  );
  const docs: unknown[] = Array.isArray((d as { docs?: unknown[] })?.docs)
    ? (d as { docs: unknown[] }).docs
    : [];
  return docs
    .map(normalizarOpenLibrary)
    .filter((x): x is LivroAchado => x !== null);
}

const openLibrary = (termo: string) =>
  pareceIsbn(termo) ? openLibraryIsbn(termo) : openLibraryTexto(termo);

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
  const usouGoogle = g.itens.length > 0;
  const itens = usouGoogle ? g.itens : await openLibrary(termo);

  return NextResponse.json(
    {
      itens,
      fonte: usouGoogle ? "google" : "openlibrary",
      comChave: !!CHAVE,
      /*
       * O que o Google respondeu, para o caso de a busca não achar nada.
       *
       * -1 = sem chave. 200 com lista vazia = a chave funciona e o livro não
       * está lá. 400 = chave inválida ou malformada. 403 = Books API não
       * habilitada no projeto, ou restrição de chave barrando. 429 = cota.
       * Sem isso, todos esses casos chegavam na tela como "nada encontrado".
       */
      google: g.status,
    },
    {
      /*
       * Resultado vazio não entra em cache.
       *
       * Com `max-age` fixo, um "nada encontrado" causado por chave errada ou
       * cota estourada ficava guardado uma hora — e continuava vazio nas
       * tentativas seguintes mesmo depois do problema resolvido. Era o defeito
       * que fazia a busca parecer quebrada em definitivo.
       */
      headers: {
        "Cache-Control": itens.length
          ? "public, max-age=3600"
          : "no-store",
      },
    }
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
      : (await google(livro.isbn)).itens;

  return NextResponse.json({
    livro: outra.length ? completar(livro, outra[0]) : livro,
  });
}
