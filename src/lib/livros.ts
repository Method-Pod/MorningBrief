/**
 * Normalização de metadados de livro, de duas fontes, para uma forma só.
 *
 * Aqui só há função pura: quem busca é /api/livros, no servidor. A busca saiu
 * do navegador porque o Google Books responde 429 a chamada sem chave — medido,
 * em toda tentativa, tanto por linha de comando quanto pelo navegador. Com a
 * chave a cota é folgada, e chave só pode viver no servidor.
 */

export type LivroAchado = {
  /** Chave da lista de resultados, não do banco. */
  id: string;
  title: string;
  authors: string | null;
  isbn: string | null;
  cover_url: string | null;
  publisher: string | null;
  published_on: string | null;
  description: string | null;
  categories: string | null;
  language: string | null;
  total_pages: number | null;
  /** Qual fonte respondeu. Aparece na tela quando o registro vem incompleto. */
  fonte: "google" | "openlibrary";
};

/** Uma string ou nada — as duas APIs omitem campos, e "" no banco não diz nada. */
const texto = (v: unknown): string | null => {
  const s = typeof v === "string" ? v.trim() : "";
  return s || null;
};

const lista = (v: unknown): string | null =>
  Array.isArray(v) && v.length ? v.filter(Boolean).join(", ") : null;

const paginas = (v: unknown): number | null => {
  const n = Number(v);
  /* As duas mandam 0 em vez de omitir de vez em quando, e "0 páginas" viraria
     uma barra de progresso impossível de completar. */
  return Number.isFinite(n) && n > 0 ? Math.round(n) : null;
};

/** Só dígitos e X, 10 ou 13 caracteres — aí a busca vira busca por ISBN. */
export const pareceIsbn = (t: string) => {
  const cru = t.replace(/[\s-]/g, "");
  return /^[0-9]{9}[0-9X]$|^[0-9]{13}$/i.test(cru);
};

export const soIsbn = (t: string) => t.replace(/[\s-]/g, "");

/* ------------------------------ Google Books ------------------------------ */

/**
 * ISBN-13 na frente do ISBN-10: é o que está impresso nas edições atuais e o
 * que serve para procurar a mesma edição em qualquer outro lugar depois.
 */
const isbnGoogle = (ids: unknown): string | null => {
  if (!Array.isArray(ids)) return null;
  const achar = (tipo: string) =>
    texto(
      (ids as { type?: string; identifier?: string }[]).find(
        (i) => i?.type === tipo
      )?.identifier
    );
  return achar("ISBN_13") ?? achar("ISBN_10") ?? null;
};

/**
 * A capa em https.
 *
 * O Google devolve os links de imagem em http puro. O app é servido em https, e
 * imagem em http é bloqueada como conteúdo misto: a capa não aparecia, sem erro
 * visível.
 */
const capaGoogle = (links: unknown): string | null => {
  const l = links as Record<string, string> | undefined;
  const u = texto(l?.thumbnail ?? l?.smallThumbnail);
  return u ? u.replace(/^http:\/\//, "https://") : null;
};

export function normalizarGoogle(item: unknown): LivroAchado | null {
  const it = item as { id?: string; volumeInfo?: Record<string, unknown> };
  const v = it.volumeInfo;
  const title = texto(v?.title);
  if (!v || !title) return null;

  const sub = texto(v.subtitle);
  return {
    id: `g:${it.id ?? title}`,
    /* Subtítulo junto do título: em livro técnico é ele que distingue duas
       edições com o mesmo nome de capa. */
    title: sub ? `${title}: ${sub}` : title,
    authors: lista(v.authors),
    isbn: isbnGoogle(v.industryIdentifiers),
    cover_url: capaGoogle(v.imageLinks),
    publisher: texto(v.publisher),
    published_on: texto(v.publishedDate),
    description: texto(v.description),
    categories: lista(v.categories),
    language: texto(v.language),
    total_pages: paginas(v.pageCount),
    fonte: "google",
  };
}

/* ------------------------------ Open Library ------------------------------ */

/** Um ISBN-13 entre os muitos que o Open Library lista para o mesmo título. */
const isbnOL = (v: unknown): string | null => {
  if (!Array.isArray(v)) return null;
  const treze = (v as string[]).find(
    (x) => typeof x === "string" && x.length === 13
  );
  return texto(treze ?? (v as string[])[0]);
};

export function normalizarOpenLibrary(doc: unknown): LivroAchado | null {
  const d = doc as Record<string, unknown>;
  const title = texto(d.title);
  if (!title) return null;

  const capa = Number(d.cover_i);
  const ano = Number(d.first_publish_year);

  return {
    id: `o:${texto(d.key) ?? title}`,
    title,
    authors: lista(d.author_name),
    isbn: isbnOL(d.isbn),
    /* A capa do Open Library é montada pelo id, não vem pronta na resposta. */
    cover_url: Number.isFinite(capa)
      ? `https://covers.openlibrary.org/b/id/${capa}-M.jpg`
      : null,
    publisher: Array.isArray(d.publisher)
      ? texto((d.publisher as string[])[0])
      : null,
    published_on: Number.isFinite(ano) ? String(ano) : null,
    description: null,
    categories: lista(d.subject),
    language: Array.isArray(d.language)
      ? texto((d.language as string[])[0])
      : null,
    /*
     * Mediana entre as edições, e não o número de uma delas.
     *
     * O Open Library agrupa todas as edições de um título; a busca não sabe
     * qual está na sua mão. A mediana é o palpite honesto — e por isso o campo
     * fica editável depois de adicionar.
     */
    total_pages: paginas(d.number_of_pages_median),
    fonte: "openlibrary",
  };
}

/**
 * Completa os buracos de um registro com os de outro.
 *
 * Serve ao caso medido: o Open Library trouxe capa e editora em 6 de 6 edições
 * brasileiras, mas total de páginas em só 4 — e é justo o número de que a barra
 * de progresso depende. Preenche, nunca sobrescreve.
 */
export function completar(base: LivroAchado, extra: LivroAchado): LivroAchado {
  const pegar = <K extends keyof LivroAchado>(k: K) =>
    base[k] ?? extra[k] ?? null;
  return {
    ...base,
    authors: pegar("authors") as string | null,
    isbn: pegar("isbn") as string | null,
    cover_url: pegar("cover_url") as string | null,
    publisher: pegar("publisher") as string | null,
    published_on: pegar("published_on") as string | null,
    description: pegar("description") as string | null,
    categories: pegar("categories") as string | null,
    language: pegar("language") as string | null,
    total_pages: (base.total_pages ?? extra.total_pages) as number | null,
  };
}

/**
 * Um livro pelo ISBN exato, na forma do endpoint `/api/books` do Open Library.
 *
 * Existe porque `search.json` NÃO faz consulta por ISBN: medido, um ISBN
 * desconhecido devolvia 24 resultados sem relação nenhuma, e o prefixo `isbn:`
 * não mudava nada — a busca cai em correspondência difusa. Era isso que fazia
 * "procurar pelo ISBN" devolver uma lista de livros errados.
 *
 * Já `/api/books?bibkeys=ISBN:...&jscmd=data` é consulta exata, e ainda traz o
 * nome dos autores e a capa prontos, sem a segunda chamada que `/isbn/` exigia.
 */
export function normalizarOpenLibraryIsbn(
  v: unknown,
  isbn: string
): LivroAchado | null {
  const d = v as Record<string, unknown>;
  const title = texto(d?.title);
  if (!title) return null;

  const sub = texto(d.subtitle);
  const nomes = Array.isArray(d.authors)
    ? (d.authors as { name?: string }[]).map((a) => a?.name).filter(Boolean)
    : [];
  const capa = (d.cover as Record<string, string> | undefined)?.medium;

  /* `publish_date` vem como "Sep 26, 2008", então o ano sai por regex: cortar
     os quatro primeiros caracteres daria "Sep " no lugar do ano. */
  const ano = texto(d.publish_date)?.match(/\b(1[5-9]\d{2}|20\d{2})\b/)?.[1];

  return {
    id: `oi:${isbn}`,
    title: sub ? `${title}: ${sub}` : title,
    authors: nomes.length ? nomes.join(", ") : null,
    isbn,
    cover_url: texto(capa),
    publisher: Array.isArray(d.publishers)
      ? texto((d.publishers as { name?: string }[])[0]?.name)
      : null,
    published_on: ano ?? texto(d.publish_date),
    description: texto((d.notes as string) ?? null),
    categories: Array.isArray(d.subjects)
      ? lista((d.subjects as { name?: string }[]).slice(0, 6).map((x) => x?.name))
      : null,
    language: null,
    total_pages: paginas(d.number_of_pages),
    fonte: "openlibrary",
  };
}
