import { NextResponse } from "next/server";
import { acharClassicos, juntar } from "@/lib/regrasPt";

/**
 * Revisão de ortografia e acentuação do texto de uma anotação.
 *
 * Quem corrige é o LanguageTool, um corretor de código aberto com dicionário
 * e regras de português do Brasil. Não é um modelo de linguagem: ele não
 * reescreve frase, não inventa e não interpreta o que você quis dizer — acha
 * palavra fora do dicionário, acento faltando e concordância quebrada, e
 * propõe a troca. É o que foi pedido, e é o que dá para revisar item a item.
 *
 * **O texto sai daqui.** Ele vai para api.languagetool.org, que é serviço de
 * terceiro. Esta rota existe justamente para a chamada sair do servidor e não
 * do navegador: assim o endereço de casa de quem escreve não vai junto, e a
 * regra de quantas chamadas cabem por minuto vale para o app inteiro em vez
 * de para cada aparelho. Ainda assim, o texto sai — e a tela avisa isso antes
 * da primeira revisão.
 *
 * Sem chave: o serviço público aceita chamada anônima dentro de um limite de
 * tamanho e de frequência. Os dois estão tratados abaixo.
 */

const SERVICO = "https://api.languagetool.org/v2/check";

/**
 * Teto de texto por chamada.
 *
 * O serviço público recusa acima de 20 000 caracteres, e uma recusa devolve
 * erro cru em inglês no meio da tela. Cortar antes e avisar que cortou é mais
 * honesto do que falhar — e 20 000 caracteres são umas dez páginas, que é
 * mais do que qualquer anotação daqui tem.
 */
const TETO = 20_000;

/** Desiste antes de a tela ficar pendurada esperando. */
const TEMPO_LIMITE_MS = 12_000;

type MatchLT = {
  message?: string;
  shortMessage?: string;
  offset: number;
  length: number;
  replacements?: { value?: string }[];
  rule?: {
    id?: string;
    issueType?: string;
    category?: { id?: string; name?: string };
  };
};

/**
 * O que entra na lista e o que é descartado.
 *
 * O pedido foi "não precisa ser rigoroso, mas corrigir palavras, acentuações
 * e pequenos detalhes". Duas famílias ficam de fora por isso:
 *
 * - `FORMAL`: é a categoria que marca "pra" pedindo "para". Opinião sobre
 *   registro, não erro — e quem escreve anotação para si escreve como fala.
 * - `TYPOGRAPHY`: aqui ele quer trocar "20.17" por "20,17", porque em
 *   português a vírgula separa decimal. Medido no texto dele, e "20.17" era
 *   uma referência bíblica. Uma sugestão que estraga o texto certo gasta mais
 *   confiança do que ganha.
 *
 * O corte é por categoria e não por `issueType: "style"`, que era o filtro
 * de antes e levava junto coisa boa: medido, "Há dois anos atrás" sai como
 * `CLARITY`/`style`, e é erro clássico de verdade — o tipo que se pediu para
 * pegar. Filtrar pelas duas categorias acima tira o que incomoda e deixa
 * passar o que interessa.
 *
 * Sugestão sem troca proposta também sai: uma linha que aponta o problema e
 * não oferece o conserto não tem botão de aplicar, e vira só barulho.
 */
function vale(m: MatchLT): boolean {
  if (!m.replacements?.length) return false;
  const cat = m.rule?.category?.id;
  if (cat === "FORMAL" || cat === "TYPOGRAPHY") return false;
  return true;
}

export async function POST(req: Request) {
  let texto = "";
  try {
    const corpo = (await req.json()) as { texto?: unknown };
    texto = typeof corpo.texto === "string" ? corpo.texto : "";
  } catch {
    return NextResponse.json({ erro: "corpo-invalido" }, { status: 400 });
  }

  if (!texto.trim())
    return NextResponse.json({ achados: [], cortou: false, total: 0 });

  const cortou = texto.length > TETO;
  const enviar = cortou ? texto.slice(0, TETO) : texto;

  const desistir = new AbortController();
  const relogio = setTimeout(() => desistir.abort(), TEMPO_LIMITE_MS);

  let resposta: Response;
  try {
    resposta = await fetch(SERVICO, {
      method: "POST",
      headers: { "content-type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        text: enviar,
        language: "pt-BR",
        /* Sem isto o serviço devolve também as regras de "picky", que são as
           de estilo — e elas seriam filtradas aqui do mesmo jeito, depois de
           terem viajado. */
        level: "default",
      }),
      signal: desistir.signal,
    });
  } catch {
    clearTimeout(relogio);
    return NextResponse.json(
      {
        erro: "sem-resposta",
        recado: "O corretor não respondeu. Tente de novo em instantes.",
      },
      { status: 502 }
    );
  }
  clearTimeout(relogio);

  if (resposta.status === 429)
    return NextResponse.json(
      {
        erro: "muitas-chamadas",
        recado: "Muitas revisões seguidas. Espere um minuto e tente de novo.",
      },
      { status: 429 }
    );

  if (!resposta.ok)
    return NextResponse.json(
      {
        erro: "servico-recusou",
        recado: "O corretor recusou a revisão agora. Tente mais tarde.",
      },
      { status: 502 }
    );

  let dados: { matches?: MatchLT[] };
  try {
    dados = (await resposta.json()) as { matches?: MatchLT[] };
  } catch {
    return NextResponse.json(
      { erro: "resposta-ilegivel", recado: "O corretor respondeu torto." },
      { status: 502 }
    );
  }

  const todos = dados.matches ?? [];
  const doServico = todos.filter(vale).map((m) => ({
    inicio: m.offset,
    tamanho: m.length,
    /* O trecho errado vem daqui e não do serviço: é ele que a tela confere
       antes de trocar, para não aplicar a correção em cima de um texto que
       mudou depois da revisão. */
    errado: enviar.slice(m.offset, m.offset + m.length),
    /* Três opções bastam para escolher; a lista cheia chega a dez e vira um
       menu dentro de um cartão. */
    trocas: (m.replacements ?? [])
      .map((r) => r.value)
      .filter((v): v is string => typeof v === "string" && v.length > 0)
      .slice(0, 3),
    motivo: m.shortMessage?.trim() || m.message?.trim() || "Possível erro",
  }));

  /*
   * As regras de casa entram por cima.
   *
   * Elas cobrem o que o serviço não cobre — medido: ele passa batido em
   * "dorme mau", em "não sei porque ele fez" e em "para mim fazer". Onde os
   * dois apontam o mesmo trecho, o do serviço fica, porque traz mais de uma
   * alternativa.
   */
  const achados = juntar(doServico, acharClassicos(enviar));

  return NextResponse.json({
    achados,
    /* Quantos o serviço viu antes do filtro: a tela usa para dizer "só de
       estilo" quando achou coisa mas nada do que interessa. */
    total: todos.length,
    cortou,
  });
}
