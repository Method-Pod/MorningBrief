import { NextResponse } from "next/server";
import { idDoVideo, segundosDaDuracao } from "@/lib/aulas";
import { htmlAte, metatag } from "@/lib/paginaYoutube";

/**
 * Duração de um vídeo do YouTube, a partir do link.
 *
 * O oEmbed que a tela já usa entrega título, canal e capa, mas não a duração —
 * e sem ela a barra de "onde parei" não tem fim, e a meta semanal não sabe
 * quanto tempo cada aula custa. Digitar à mão era a alternativa, e era ela que
 * emperrava: o campo pedia minutos, então uma aula de 1h23m45s exigia fazer a
 * conta antes de cadastrar — e o minuto arredondado ainda jogava os 45
 * segundos fora. A resposta daqui é em segundos, exata.
 *
 * Dois caminhos, na ordem de confiança:
 *
 * 1. YouTube Data API, se `YOUTUBE_API_KEY` estiver configurada. É contrato
 *    publicado, responde em poucos kB e não muda de forma.
 * 2. A própria página do vídeo, sem chave. Traz o número em `lengthSeconds`.
 *    Não é API, é o HTML do navegador — pode mudar sem aviso, e por isso a
 *    tela trata a falha como "digite" em vez de barrar o cadastro.
 *
 * O segundo caminho existe porque ele funciona hoje, sem configurar nada. Com
 * a chave no ambiente, o primeiro passa a atender e este vira reserva.
 */

const CHAVE = process.env.YOUTUBE_API_KEY;

/** Pela Data API: exato, e o corpo da resposta é pequeno. */
async function pelaApi(id: string) {
  if (!CHAVE) return null;
  try {
    const r = await fetch(
      "https://www.googleapis.com/youtube/v3/videos?part=contentDetails" +
        `&id=${id}&key=${encodeURIComponent(CHAVE)}`,
      { next: { revalidate: 86_400 } }
    );
    if (!r.ok) return null;
    const d = await r.json();
    const iso = d?.items?.[0]?.contentDetails?.duration;
    const segundos = segundosDaDuracao(iso);
    return segundos ? { segundos, fonte: "api" as const } : null;
  } catch {
    return null;
  }
}

/**
 * Pela página do vídeo.
 *
 * `lengthSeconds` é o valor exato em segundos. A metatag `itemprop="duration"`
 * vem antes no documento mas arredonda para o segundo de cima, então ela fica
 * como segunda opção — serve quando o formato do primeiro mudar.
 */
async function pelaPagina(id: string) {
  const html = await htmlAte(
    `https://m.youtube.com/watch?v=${id}`,
    (t) => /"lengthSeconds":"\d+"/.test(t)
  );
  if (!html) return null;

  const exato = html.match(/"lengthSeconds":"(\d+)"/);
  if (exato) {
    const segundos = Number(exato[1]);
    if (segundos > 0) return { segundos, fonte: "pagina" as const };
  }

  /* A metatag arredonda para o segundo de cima — 213s aparece como PT3M34S.
     Fica como reserva, para quando o formato do primeiro mudar. */
  const segundos = segundosDaDuracao(metatag(html, "duration"));
  return segundos ? { segundos, fonte: "meta" as const } : null;
}

export async function GET(req: Request) {
  const url = (new URL(req.url).searchParams.get("url") ?? "").trim();
  if (!url) return NextResponse.json({ erro: "sem url" }, { status: 400 });

  const id = idDoVideo(url);
  /*
   * Link que não é vídeo do YouTube não é erro: aula de Telegram, Drive ou PDF
   * entra do mesmo jeito, só sem duração automática. Devolver 200 com
   * `segundos: null` deixa a tela seguir sem tratar isto como falha.
   */
  if (!id) return NextResponse.json({ segundos: null, fonte: "nao-youtube" });

  const achado = (await pelaApi(id)) ?? (await pelaPagina(id));
  if (!achado) return NextResponse.json({ segundos: null, fonte: "nao-achou" });

  return NextResponse.json(achado);
}
