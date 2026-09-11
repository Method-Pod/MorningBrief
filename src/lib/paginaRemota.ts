/**
 * Leitura de uma página de outro site, do lado do servidor.
 *
 * Serve três coisas hoje: a duração de um vídeo do YouTube, o nome e a foto de
 * um canal, e o nome, a descrição e a imagem de qualquer site salvo como
 * referência. Nos três casos o dado está no HTML que o navegador receberia —
 * `"lengthSeconds"` no vídeo, metatags `og:` no resto —, e em nenhum deles
 * existe API pública que responda sem chave.
 *
 * Nada disso é contrato publicado. Se um site mudar o formato, quem chama
 * trata como "não consegui" e a pessoa digita: nenhum cadastro depende desta
 * leitura para acontecer.
 *
 * Só roda no servidor: o navegador não consegue ler outro domínio (CORS), e
 * mesmo que conseguisse, baixar a página inteira no aparelho de alguém para
 * pegar um número seria pior que perguntar.
 *
 * E porque roda no servidor, todo endereço passa por `enderecoSeguro` antes
 * da conexão — inclusive cada parada de um redirecionamento. O motivo está
 * escrito lá.
 */

import { enderecoPublico } from "./enderecoSeguro";

/**
 * Chrome de Android.
 *
 * Escolhido pelo YouTube, onde a página móvel traz o mesmo dado em pouco mais
 * da metade dos bytes da de desktop (medido: 736 kB contra 1,29 MB). Serve de
 * padrão para o resto: site que trata visitante de celular diferente costuma
 * mandar a versão mais leve, e as metatags `og:` são as mesmas nas duas.
 */
const UA_PADRAO =
  "Mozilla/5.0 (Linux; Android 13) AppleWebKit/537.36 (KHTML, like Gecko) " +
  "Chrome/125.0.0.0 Mobile Safari/537.36";

/**
 * Teto de leitura.
 *
 * No YouTube o que interessa aparece por volta dos 600–700 kB, e a página toda
 * tem cerca de 740 kB. Em site comum as metatags estão nos primeiros kB. O teto
 * está aí para um endereço que responda um fluxo sem fim não virar uma leitura
 * sem fim.
 */
const TETO_BYTES = 1_600_000;

/** Desiste em 8s: isto acontece enquanto alguém espera num formulário. */
const TEMPO_LIMITE_MS = 8_000;

/**
 * Quantos redirecionamentos seguir à mão.
 *
 * O `fetch` segue sozinho por padrão, e é justamente isso que não serve
 * aqui: conferir o endereço digitado e deixar o site mandar o servidor para
 * outro lugar é conferir a porta e deixar a janela aberta. Um endereço
 * público que redireciona para `http://169.254.169.254` passaria pela trava
 * sem ela ver nada.
 *
 * Então `redirect: "manual"` e cada parada é conferida como se fosse a
 * primeira. Três saltos cobrem o que existe de verdade — http→https, com
 * www, endereço canônico — e um laço de redirecionamento para sozinho.
 */
const SALTOS = 3;

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
  pronto: (html: string) => boolean,
  opcoes: { teto?: number } = {}
): Promise<string | null> {
  const corte = new AbortController();
  const relogio = setTimeout(() => corte.abort(), TEMPO_LIMITE_MS);
  const teto = opcoes.teto ?? TETO_BYTES;

  try {
    /*
     * Segue os redirecionamentos na mão, conferindo cada parada.
     *
     * Ver `enderecoSeguro`: quem digita o endereço decide para onde o
     * servidor conecta, e o servidor está dentro da rede.
     */
    let atual = url;
    let r: Response | null = null;

    for (let salto = 0; salto <= SALTOS; salto++) {
      let alvo: URL;
      try {
        alvo = new URL(atual);
      } catch {
        return null;
      }

      const veredito = await enderecoPublico(alvo);
      if (!veredito.ok) return null;

      const resposta = await fetch(alvo, {
        signal: corte.signal,
        redirect: "manual",
        headers: {
          "user-agent": UA_PADRAO,
          "accept-language": "pt-BR,pt;q=0.9,en;q=0.8",
        },
        /* A duração de um vídeo não muda, e o nome de um canal quase nunca.
           Um dia de cache poupa a releitura de centenas de kB quando o mesmo
           link é colado de novo. */
        next: { revalidate: 86_400 },
      });

      if (resposta.status >= 300 && resposta.status < 400) {
        const destino = resposta.headers.get("location");
        if (!destino) return null;
        /* Descarta o corpo do redirecionamento: sem isto a conexão fica
           pendurada até o tempo limite. */
        resposta.body?.cancel().catch(() => {});
        /* Relativo resolve contra a parada atual, como o navegador faz. */
        atual = new URL(destino, alvo).toString();
        continue;
      }

      r = resposta;
      break;
    }

    if (!r || !r.ok || !r.body) return null;

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
        if (bytes > teto) break;
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
