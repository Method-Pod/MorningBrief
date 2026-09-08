/**
 * Leitura da própria página do YouTube, do lado do servidor.
 *
 * Existe porque o oEmbed público entrega título, canal e capa mas **não
 * entrega a duração** — e a duração é o único jeito de a barra de "onde parei"
 * ter um fim. A YouTube Data API entrega, mas exige chave, e ficar sem o
 * recurso enquanto não há chave configurada seria deixar de fazer o que dá
 * para fazer.
 *
 * A página do vídeo traz o número em `"lengthSeconds"`, e a do canal traz nome
 * e foto nas metatags `og:`. Nada disso é API publicada: é a página que o
 * navegador recebe. Se o YouTube mudar o formato, quem chama trata como "não
 * consegui" e a pessoa digita — nenhum cadastro depende disto para acontecer.
 *
 * Só roda no servidor: o navegador não consegue ler outro domínio (CORS), e
 * mesmo que conseguisse, baixar a página inteira no aparelho de alguém para
 * pegar um número seria pior que perguntar.
 */

/* Chrome de Android: a página móvel do YouTube tem o mesmo dado em pouco mais
   da metade dos bytes da página de desktop (medido: 736 kB contra 1,29 MB). */
const UA =
  "Mozilla/5.0 (Linux; Android 13) AppleWebKit/537.36 (KHTML, like Gecko) " +
  "Chrome/125.0.0.0 Mobile Safari/537.36";

/**
 * Teto de leitura.
 *
 * O que interessa aparece por volta dos 600–700 kB, e a página toda tem cerca
 * de 740 kB. O teto está aí para um endereço que responda um fluxo sem fim não
 * virar uma leitura sem fim.
 */
const TETO_BYTES = 1_600_000;

/** Desiste em 8s: isto acontece enquanto alguém espera num formulário. */
const TEMPO_LIMITE_MS = 8_000;

/**
 * Baixa a página até `pronto` dizer que já tem o que precisa, e para.
 *
 * Ler em pedaços e cortar no meio economiza a cauda do documento — a duração
 * está a uns 600 kB do começo, e o resto são scripts que não interessam. O
 * texto acumulado não é aparado entre pedaços de propósito: o trecho procurado
 * pode cair na junção de dois, e uma janela deslizante o perderia sem aviso.
 *
 * Devolve o texto lido, ou null se falhou.
 */
export async function htmlAte(
  url: string,
  pronto: (html: string) => boolean
): Promise<string | null> {
  const corte = new AbortController();
  const relogio = setTimeout(() => corte.abort(), TEMPO_LIMITE_MS);

  try {
    const r = await fetch(url, {
      signal: corte.signal,
      headers: {
        "user-agent": UA,
        "accept-language": "pt-BR,pt;q=0.9,en;q=0.8",
      },
      /* A duração de um vídeo não muda, e o nome de um canal quase nunca. Um
         dia de cache poupa a releitura de centenas de kB quando o mesmo link
         é colado de novo. */
      next: { revalidate: 86_400 },
    });
    if (!r.ok || !r.body) return null;

    const leitor = r.body.getReader();
    const decodificador = new TextDecoder();
    let html = "";
    let bytes = 0;

    try {
      for (;;) {
        const { done, value } = await leitor.read();
        if (done) break;
        bytes += value.byteLength;
        html += decodificador.decode(value, { stream: true });
        if (pronto(html)) break;
        if (bytes > TETO_BYTES) break;
      }
    } finally {
      /* Cancela o resto do fluxo. Sem isto a conexão ficaria aberta baixando
         a metade do documento que já foi dispensada. */
      leitor.cancel().catch(() => {});
    }

    return html;
  } catch {
    return null;
  } finally {
    clearTimeout(relogio);
  }
}

/** O conteúdo de uma metatag `og:` ou `itemprop`, se estiver no texto. */
export const metatag = (html: string, nome: string) => {
  const escapado = nome.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const m =
    html.match(
      new RegExp(
        `<meta[^>]+(?:property|itemprop|name)="${escapado}"[^>]+content="([^"]*)"`,
        "i"
      )
    ) ??
    html.match(
      new RegExp(
        `<meta[^>]+content="([^"]*)"[^>]+(?:property|itemprop|name)="${escapado}"`,
        "i"
      )
    );
  return m?.[1] ? decodificarHtml(m[1]) : null;
};

/**
 * Desfaz as entidades que aparecem em metatag.
 *
 * Nome de canal com "&" chega como `&amp;`, e apóstrofo como `&#39;`. Gravar
 * assim deixaria "Papo &amp; Elite" escrito na tela.
 */
export function decodificarHtml(v: string) {
  return v
    .replace(/&#(\d+);/g, (_, n) => String.fromCharCode(Number(n)))
    .replace(/&#x([0-9a-f]+);/gi, (_, n) => String.fromCharCode(parseInt(n, 16)))
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    /* `&amp;` fica para o fim, senão `&amp;lt;` viraria "<". */
    .replace(/&amp;/g, "&");
}
