import { NextResponse } from "next/server";
import { idDoVideo, normalizarUrl } from "@/lib/aulas";
import { htmlAte, metatag } from "@/lib/paginaYoutube";

/**
 * Nome e foto de um canal do YouTube, a partir do link.
 *
 * Sem chave: nome e foto estão nas metatags `og:` da página do canal, que é o
 * mesmo par que qualquer aplicativo de mensagem lê para montar a prévia de um
 * link. Não é API publicada — se o formato mudar, a tela cai no nome digitado
 * à mão, e nada deixa de funcionar por causa disso.
 *
 * Aceita link de vídeo também, e é de propósito: o jeito natural de guardar um
 * canal é estando num vídeo dele. Nesse caso o oEmbed diz de quem é o vídeo
 * (`author_url`), e a busca segue dali.
 */

/** O endereço canônico do canal, se o link for de canal. */
function urlDeCanal(cru: string): string | null {
  try {
    const u = new URL(normalizarUrl(cru));
    const host = u.hostname.replace(/^www\.|^m\./, "").toLowerCase();
    if (!/(^|\.)youtube\.com$/.test(host)) return null;

    /* As quatro formas que o YouTube usa: @apelido (atual), /c/ e /user/
       (antigas, ainda copiadas de links velhos) e /channel/UC... (o id). */
    const m = u.pathname.match(
      /^\/(?:(@[^/?]+)|c\/([^/?]+)|user\/([^/?]+)|channel\/(UC[\w-]{22}))/
    );
    if (!m) return null;
    if (m[1]) return `https://www.youtube.com/${m[1]}`;
    if (m[2]) return `https://www.youtube.com/c/${m[2]}`;
    if (m[3]) return `https://www.youtube.com/user/${m[3]}`;
    return `https://www.youtube.com/channel/${m[4]}`;
  } catch {
    return null;
  }
}

/** De um link de vídeo para o canal dele, pelo oEmbed. */
async function canalDoVideo(url: string) {
  try {
    const r = await fetch(
      "https://www.youtube.com/oembed?format=json&url=" +
        encodeURIComponent(normalizarUrl(url)),
      { next: { revalidate: 86_400 } }
    );
    if (!r.ok) return null;
    const d = await r.json();
    const autor = typeof d?.author_url === "string" ? d.author_url : null;
    return autor
      ? {
          url: autor,
          nome: typeof d?.author_name === "string" ? d.author_name : null,
        }
      : null;
  } catch {
    return null;
  }
}

export async function GET(req: Request) {
  const cru = (new URL(req.url).searchParams.get("url") ?? "").trim();
  if (!cru) return NextResponse.json({ erro: "sem url" }, { status: 400 });

  /* Canal direto; senão, o canal do vídeo colado. */
  let alvo = urlDeCanal(cru);
  let nome: string | null = null;

  if (!alvo && idDoVideo(cru)) {
    const doVideo = await canalDoVideo(cru);
    if (doVideo) {
      alvo = urlDeCanal(doVideo.url) ?? doVideo.url;
      nome = doVideo.nome;
    }
  }

  if (!alvo)
    return NextResponse.json({
      erro: "nao-e-canal",
      recado:
        "Cole o endereço de um canal do YouTube (youtube.com/@nome) ou o link de um vídeo dele.",
    });

  /* A página do canal responde nome, foto e o endereço canônico — que é o que
     vai gravado, para o mesmo canal colado de duas formas não virar duas
     linhas. */
  const html = await htmlAte(alvo, (t) =>
    /property="og:image"/.test(t) && /property="og:title"/.test(t)
  );

  const canonico = html ? metatag(html, "og:url") : null;
  const titulo = html ? metatag(html, "og:title") : null;
  const foto = html ? metatag(html, "og:image") : null;

  return NextResponse.json({
    url: canonico ?? alvo,
    nome: titulo ?? nome ?? null,
    avatar_url: foto ?? null,
  });
}
