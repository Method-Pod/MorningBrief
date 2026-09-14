/**
 * Deixa o Node importar o codigo do app como ele esta escrito.
 *
 * O Node 24 le TypeScript direto — apaga os tipos e roda —, mas exige a
 * extensao no import e nao conhece o atalho `@/`. O app usa os dois, porque e
 * assim que o Next resolve. Este gancho faz a mesma resolucao, e so para os
 * testes: nada no app depende dele.
 *
 * A alternativa seria compilar antes de testar. Testar o arquivo que vai para
 * producao, sem passo no meio, e mais barato e nao tem como divergir.
 */
import { pathToFileURL } from "node:url";
import { existsSync } from "node:fs";
import path from "node:path";

const RAIZ = path.resolve(import.meta.dirname, "..", "..");
const EXTENSOES = [".ts", ".tsx", ".mjs", ".js"];

export async function resolve(especificador, contexto, proximo) {
  let alvo = especificador;

  if (alvo.startsWith("@/")) alvo = pathToFileURL(path.join(RAIZ, "src", alvo.slice(2))).href;

  if (alvo.startsWith(".") || alvo.startsWith("file:")) {
    const base = alvo.startsWith("file:")
      ? new URL(alvo)
      : new URL(alvo, contexto.parentURL);
    const caminho = decodeURIComponent(base.pathname).replace(/^\/([A-Za-z]:)/, "$1");

    if (!path.extname(caminho) || !existsSync(caminho)) {
      for (const ext of EXTENSOES) {
        if (existsSync(caminho + ext)) return proximo(pathToFileURL(caminho + ext).href, contexto);
        const indice = path.join(caminho, "index" + ext);
        if (existsSync(indice)) return proximo(pathToFileURL(indice).href, contexto);
      }
    }
    return proximo(base.href, contexto);
  }

  return proximo(especificador, contexto);
}
