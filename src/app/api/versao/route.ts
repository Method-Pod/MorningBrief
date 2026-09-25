import { NextResponse } from "next/server";

/**
 * Qual versão está publicada AGORA.
 *
 * Existe por um defeito de fluxo, não de código: quando eu publico uma
 * correção, a aba que já estava aberta continua com o JavaScript antigo até
 * alguém recarregar na mão. Duas vezes no mesmo dia a resposta foi "não mudou
 * nada" para uma correção que estava no ar.
 *
 * O service worker não resolve isso: ele só guarda arquivos de `/_next/static`,
 * que mudam de nome a cada build, e o `sw.js` em si é idêntico entre deploys —
 * então o mecanismo de atualização dele nunca dispara.
 *
 * A comparação é entre dois valores do MESMO nome: `NEXT_PUBLIC_VERSAO`
 * congelado no pacote que o navegador baixou, e este aqui, que responde do
 * servidor e portanto é sempre o da implantação mais nova.
 */

/* Sem cache em lugar nenhum: uma resposta guardada diria a versão de ontem,
   que é exatamente o que esta rota existe para detectar. */
export const dynamic = "force-dynamic";
export const revalidate = 0;

export async function GET() {
  /*
   * Duas fontes, nesta ordem, e as duas dizem a mesma coisa na Vercel.
   *
   * A variavel de sistema lida em TEMPO DE EXECUCAO e a fonte honesta: ela
   * descreve a implantacao que esta atendendo este pedido. Se a Vercel nao a
   * expuser no runtime, cai no valor congelado no build — que, como esta rota
   * roda sempre na implantacao mais nova, diz a mesma coisa.
   *
   * A primeira tambem e o que torna isto testavel fora da Vercel: da para
   * subir o servidor com um valor diferente do que foi compilado e ver o
   * aviso aparecer.
   */
  const versao =
    process.env.VERCEL_GIT_COMMIT_SHA?.slice(0, 12) ??
    process.env.NEXT_PUBLIC_VERSAO ??
    "dev";
  return NextResponse.json(
    { versao },
    { headers: { "cache-control": "no-store" } }
  );
}
