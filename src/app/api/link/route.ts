import { NextResponse } from "next/server";
import { htmlAte, metatag, decodificarHtml } from "@/lib/paginaRemota";

/**
 * Nome, descrição e imagem de qualquer site, a partir do link.
 *
 * É a mesma leitura de metatags `og:` que o WhatsApp e o Slack fazem para
 * montar a prévia de um link colado — o site publica essas tags justamente
 * para isso. Sem chave e sem serviço de terceiro no meio.
 *
 * Falha em silêncio de propósito, porque parte dos sites não colabora. Medido
 * numa rodada de dez: Behance, Pinterest, Mobbin, Awwwards, Stripe, Linear,
 * Vercel e Tailwind respondem com título, descrição e imagem; o Dribbble
 * devolve 202 sem tag nenhuma, e o land-book responde 403 com a página de
 * desafio do Cloudflare. Nesses casos os campos voltam nulos, a tela pede o
 * nome e deixa subir a imagem — recusar o cadastro porque o site não
 * colaborou transformaria uma comodidade em obstáculo.
 */

/**
 * Teto de leitura menor que o padrão.
 *
 * Metatag vive no `<head>`, nos primeiros kB do documento. 300 kB é folga
 * larga para um `<head>` gordo, e evita baixar uma página inteira de um site
 * que não tenha as tags — que é justamente o caso em que a leitura falha.
 */
const TETO = 300_000;

/** Só http e https. `file:`, `data:` e afins não têm o que buscar aqui. */
function enderecoValido(cru: string): URL | null {
  try {
    const u = new URL(/^[a-z][a-z0-9+.-]*:\/\//i.test(cru) ? cru : `https://${cru}`);
    return u.protocol === "http:" || u.protocol === "https:" ? u : null;
  } catch {
    return null;
  }
}

/**
 * Títulos que não são título: a página de desafio no lugar do site.
 *
 * Medido: land-book.com responde "Just a moment..." atrás do Cloudflare. O
 * status costuma ser 403 ou 503, e aí a leitura já é descartada antes de
 * chegar aqui — mas há quem sirva o desafio com 200, e então o nome da
 * referência seria salvo como "Just a moment...".
 */
const MUROS = [
  /^just a moment/i,
  /^attention required/i,
  /^access denied/i,
  /^(are you|verify you are) (a )?human/i,
  /^checking your browser/i,
  /^\s*(403|404|429|503)/,
  /cloudflare/i,
];

/** O `<title>` do documento, quando não há `og:title`. */
const tituloDoDocumento = (html: string) => {
  const m = html.match(/<title[^>]*>([\s\S]*?)<\/title>/i);
  const t = m?.[1] ? decodificarHtml(m[1]).replace(/\s+/g, " ").trim() : "";
  if (!t || MUROS.some((r) => r.test(t))) return null;
  return t;
};

/**
 * Um endereço de imagem que o navegador consiga carregar.
 *
 * `og:image` aparece relativo com frequência ("/og.png"), e gravar assim
 * deixaria a imagem quebrada na parede. Resolvido contra a página, viramos um
 * endereço absoluto.
 */
const imagemAbsoluta = (valor: string | null, pagina: URL) => {
  if (!valor) return null;
  try {
    const u = new URL(valor, pagina);
    return u.protocol === "http:" || u.protocol === "https:" ? u.toString() : null;
  } catch {
    return null;
  }
};

/** Sem descrição quilométrica no cartão: duas linhas bastam. */
const encurtar = (v: string | null, max = 220) => {
  if (!v) return null;
  const t = v.replace(/\s+/g, " ").trim();
  if (!t) return null;
  return t.length > max ? `${t.slice(0, max - 1).trimEnd()}…` : t;
};

export async function GET(req: Request) {
  const cru = (new URL(req.url).searchParams.get("url") ?? "").trim();
  if (!cru) return NextResponse.json({ erro: "sem url" }, { status: 400 });

  const alvo = enderecoValido(cru);
  if (!alvo)
    return NextResponse.json({
      erro: "endereco-invalido",
      recado: "Esse endereço não parece um site. Confira o link.",
    });

  const html = await htmlAte(
    alvo.toString(),
    /* Para quando as três tags já apareceram: o resto do `<head>` não muda a
       resposta, e o corpo do documento muito menos. */
    (t) =>
      /property="og:title"/i.test(t) &&
      /property="og:image"/i.test(t) &&
      /property="og:description"/i.test(t),
    { teto: TETO }
  );

  if (!html)
    return NextResponse.json({
      /* `url` normalizado volta mesmo sem leitura: é o que a tela grava, e
         "youtube.com" precisa virar "https://youtube.com" de todo jeito. */
      url: alvo.toString(),
      nome: null,
      descricao: null,
      image_url: null,
      site: alvo.hostname.replace(/^www\./, ""),
      leu: false,
    });

  /* `og:title` também passa pelo filtro de muro: página de desafio às vezes
     publica a própria tag. */
  const doOg = metatag(html, "og:title") ?? metatag(html, "twitter:title");
  const nome =
    (doOg && !MUROS.some((r) => r.test(doOg)) ? doOg : null) ??
    tituloDoDocumento(html);

  const descricao =
    metatag(html, "og:description") ??
    metatag(html, "twitter:description") ??
    metatag(html, "description");

  const imagem =
    metatag(html, "og:image") ??
    metatag(html, "og:image:url") ??
    metatag(html, "twitter:image");

  return NextResponse.json({
    url: metatag(html, "og:url") ?? alvo.toString(),
    nome: nome ?? null,
    descricao: encurtar(descricao),
    image_url: imagemAbsoluta(imagem, alvo),
    /* O domínio sempre volta: serve de nome de reserva e de rótulo no cartão,
       e não depende de o site publicar tag nenhuma. */
    site: (metatag(html, "og:site_name") ?? alvo.hostname.replace(/^www\./, "")),
    leu: !!(nome || descricao || imagem),
  });
}
