/**
 * Ponte entre as anotações antigas e o editor de blocos.
 *
 * O campo `content` era texto puro digitado num `textarea`, e passa a guardar
 * HTML. Nenhuma migração de banco: a mesma coluna serve aos dois, e a diferença
 * é reconhecida pelo próprio conteúdo. Assim as notas que já existem abrem no
 * editor novo sem passo intermediário, e sem risco de uma conversão em massa
 * estragar o que estava certo.
 */

/**
 * O conteúdo já é HTML do editor?
 *
 * Procura uma tag de bloco no começo, e não qualquer "<": uma nota antiga podia
 * conter "<" em "3 < 5" ou num pedaço de código copiado, e tratar isso como
 * HTML jogaria o texto todo dentro de uma tag inventada.
 */
const ehHtml = (v: string) =>
  /^\s*<(p|h[1-6]|ul|ol|li|blockquote|pre|hr|div|figure|table)\b/i.test(v);

const escapar = (v: string) =>
  v
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");

/**
 * O que entra no editor.
 *
 * Texto puro vira um parágrafo por linha. Linha vazia vira parágrafo vazio em
 * vez de desaparecer: no texto original ela era a separação entre dois
 * assuntos, e engolir isso mudaria o que a pessoa escreveu.
 */
export function paraEditor(content: string): string {
  const v = content ?? "";
  if (!v.trim()) return "";
  if (ehHtml(v)) return v;

  return v
    .split(/\r?\n/)
    .map((linha) => (linha.trim() ? `<p>${escapar(linha)}</p>` : "<p></p>"))
    .join("");
}

/**
 * O texto por trás do HTML, para busca e para o resumo da lista.
 *
 * A busca comparava `content` cru; com HTML, procurar "div" acharia toda nota
 * que tivesse uma. Aqui as tags saem e as entidades voltam a ser caractere.
 */
export function textoDaNota(content: string): string {
  const v = content ?? "";
  if (!v) return "";
  return (
    v
      /* Bloco que termina vira espaço, senão "fimInício" viraria uma palavra
         só e a busca por "início" não acharia. */
      .replace(/<\/(p|h[1-6]|li|blockquote|pre|div|tr)>/gi, " ")
      .replace(/<br\s*\/?>/gi, " ")
      .replace(/<[^>]*>/g, "")
      .replace(/&nbsp;/gi, " ")
      .replace(/&amp;/gi, "&")
      .replace(/&lt;/gi, "<")
      .replace(/&gt;/gi, ">")
      .replace(/&quot;/gi, '"')
      .replace(/&#39;/gi, "'")
      .replace(/\s+/g, " ")
      .trim()
  );
}

/** Vazia é vazia mesmo: o editor deixa `<p></p>` quando se apaga tudo. */
export const notaVazia = (content: string) => !textoDaNota(content);

/* ------------------------------ links ------------------------------ */

/**
 * Endereço em forma curta, para ler.
 *
 * O endereço inteiro é preciso mas ilegível no meio de um texto:
 * "https://draanabeatrizbarbosa.vercel.app/sites/tdah" ocupa meia linha para
 * dizer "tdah". Aqui sai o esquema e o "www.", e o que sobra é o domínio com o
 * último pedaço do caminho — que é o que identifica a página.
 *
 * O endereço completo não se perde: fica no `href` e no `title`.
 */
export function urlCurta(href: string): string {
  let u: URL;
  try {
    u = new URL(href);
  } catch {
    return href;
  }

  const host = u.hostname.replace(/^www\./, "");
  const pedacos = u.pathname.split("/").filter(Boolean);
  const ultimo = decodeURIComponent(pedacos[pedacos.length - 1] ?? "").replace(
    /\.(html?|php|aspx?)$/i,
    ""
  );

  /* Sem caminho, o domínio é tudo o que existe para mostrar. */
  if (!ultimo) return host;

  /*
   * Pedaço genérico não identifica nada.
   *
   * "youtube.com/watch?v=abc" tem "watch" como último pedaço, e mostrar
   * "watch" seria trocar um endereço comprido por uma palavra inútil. Nesses
   * casos o domínio diz mais.
   */
  const GENERICOS = /^(watch|index|home|p|d|s|view|post|posts|page|pt|br|en)$/i;
  if (GENERICOS.test(ultimo) || ultimo.length < 3) return host;

  return ultimo.length > 28 ? `${ultimo.slice(0, 27)}…` : ultimo;
}

/** Um endereço solto no texto, incluindo o que foi escrito sem "https://". */
const PADRAO_URL =
  /\b(?:https?:\/\/|www\.)[^\s<>"'()[\]{}]+[^\s<>"'()[\]{}.,;:!?]/gi;

/*
 * A mesma coisa sem o `g`, só para perguntar "tem endereço aqui?".
 *
 * Um padrão global guarda `lastIndex` entre chamadas, inclusive em `test`: usar
 * o mesmo objeto para testar cada nó de texto faria o segundo teste começar no
 * meio do texto e perder endereços que estão no começo.
 */
const TEM_URL = new RegExp(PADRAO_URL.source, "i");

/**
 * Transforma endereço solto em link clicável e curto.
 *
 * As anotações antigas eram texto puro, então os endereços dentro delas nunca
 * foram links: o `autolink` do editor só marca o que se digita, não o que já
 * estava gravado. Esta passada é o que faz o que já existe virar clicável.
 *
 * Feita no DOM e não com expressão regular sobre o HTML: assim um endereço
 * dentro de um `href` ou de um bloco de código não é reescrito por acidente —
 * o passeio olha só nós de texto, e ignora os que já estão dentro de um link.
 */
export function linkificar(html: string): string {
  if (typeof window === "undefined" || !html) return html;

  const doc = new DOMParser().parseFromString(
    `<div id="raiz">${html}</div>`,
    "text/html"
  );
  const raiz = doc.getElementById("raiz");
  if (!raiz) return html;

  const passeio = doc.createTreeWalker(raiz, NodeFilter.SHOW_TEXT, {
    acceptNode: (no) => {
      /* Dentro de link já existente, ou de código, não se mexe: no primeiro
         caso já é clicável, no segundo o endereço é o próprio conteúdo. */
      const dentro = (no.parentElement?.closest("a, code, pre")) ?? null;
      if (dentro) return NodeFilter.FILTER_REJECT;
      return TEM_URL.test(no.nodeValue ?? "")
        ? NodeFilter.FILTER_ACCEPT
        : NodeFilter.FILTER_REJECT;
    },
  });

  const achados: Text[] = [];
  for (let n = passeio.nextNode(); n; n = passeio.nextNode())
    achados.push(n as Text);

  for (const no of achados) {
    const texto = no.nodeValue ?? "";
    const pedaco = doc.createDocumentFragment();
    let fim = 0;
    /* `lastIndex` zerado porque o padrão é global e foi usado no filtro. */
    PADRAO_URL.lastIndex = 0;
    for (let m = PADRAO_URL.exec(texto); m; m = PADRAO_URL.exec(texto)) {
      const bruto = m[0];
      const href = /^www\./i.test(bruto) ? `https://${bruto}` : bruto;
      if (m.index > fim)
        pedaco.appendChild(doc.createTextNode(texto.slice(fim, m.index)));
      const a = doc.createElement("a");
      a.setAttribute("href", href);
      a.setAttribute("target", "_blank");
      a.setAttribute("rel", "noopener noreferrer");
      a.setAttribute("title", href);
      a.textContent = urlCurta(href);
      pedaco.appendChild(a);
      fim = m.index + bruto.length;
    }
    if (fim < texto.length)
      pedaco.appendChild(doc.createTextNode(texto.slice(fim)));
    no.parentNode?.replaceChild(pedaco, no);
  }

  return raiz.innerHTML;
}
