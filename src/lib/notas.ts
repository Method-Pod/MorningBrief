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
