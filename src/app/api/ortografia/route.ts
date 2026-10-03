import { NextResponse } from "next/server";
import { acharClassicos } from "@/lib/regrasPt";

/**
 * Revisão do texto de uma anotação — sem o texto sair do app.
 *
 * Até outubro de 2026 quem revisava era o LanguageTool público
 * (api.languagetool.org): cada revisão mandava a anotação inteira — estudos
 * bíblicos, prompts, coisas de cliente — para um serviço de terceiro. Ele
 * pediu revisão privada, então a chamada externa saiu.
 *
 * O que fica são as regras de casa (lib/regrasPt): os erros clássicos que o
 * próprio serviço deixava passar — "dorme mau", "não sei porque", "para mim
 * fazer", "há dois anos atrás". Palavra fora do dicionário e acento faltando
 * ficam com o corretor do próprio aparelho, que já sublinha em vermelho
 * enquanto se digita (o editor declara `lang="pt-BR"` para ele acertar a
 * língua) e não manda nada para lugar nenhum.
 *
 * A rota continua no servidor para a tela não precisar mudar de contrato.
 */

/** Teto do corpo, antes de ler: uma aba enlouquecida não derruba a função. */
const TETO_CORPO = 2_000_000;

export async function POST(req: Request) {
  const tamanho = Number(req.headers.get("content-length") ?? 0);
  if (Number.isFinite(tamanho) && tamanho > TETO_CORPO)
    return NextResponse.json({ erro: "texto-grande-demais" }, { status: 413 });

  let texto = "";
  try {
    const corpo = (await req.json()) as { texto?: unknown };
    texto = typeof corpo.texto === "string" ? corpo.texto : "";
  } catch {
    return NextResponse.json({ erro: "corpo-invalido" }, { status: 400 });
  }

  if (!texto.trim())
    return NextResponse.json({ achados: [], cortou: false, total: 0 });

  const achados = acharClassicos(texto);
  return NextResponse.json({ achados, total: achados.length, cortou: false });
}
