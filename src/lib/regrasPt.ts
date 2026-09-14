/**
 * As confusões clássicas do português, as que o corretor não pega.
 *
 * O LanguageTool é bom em palavra fora do dicionário e acento faltando.
 * Medido nas frases de teste: ele acerta "mais" no lugar de "mas", mas
 * **passa batido** em "dorme mau", em "não sei porque ele fez" e em "para
 * mim fazer". São justamente os erros que mais aparecem em texto escrito
 * depressa, e por isso valem regra própria.
 *
 * O critério de cada regra aqui é um só: **só entra o que quase nunca erra.**
 * Uma sugestão errada num corretor custa mais do que uma sugestão a menos —
 * quem apanha de sugestão errada três vezes para de abrir o revisor. Então
 * nada de adivinhar classe gramatical: cada regra exige uma vizinhança que
 * decide a dúvida sozinha ("passar" antes de "mau" só pode ser "mal").
 *
 * O grupo 1 de cada expressão é o pedaço que será trocado, e a posição dele
 * vem da flag `d` — contar caracteres à mão dentro do casamento erraria toda
 * vez que o trecho aparecesse duas vezes na mesma frase.
 */

export type AchadoLocal = {
  inicio: number;
  tamanho: number;
  errado: string;
  trocas: string[];
  motivo: string;
};

type Regra = {
  /** Grupo 1 marca o que troca. Precisa das flags `d` e `g`. */
  procurar: RegExp;
  /** O que entra no lugar. Recebe o texto casado no grupo 1. */
  trocar: (achado: string) => string[];
  /** A regra, em uma linha, para quem lê a lista decidir. */
  motivo: string;
};

/** Mantém a caixa do original: "Porque" no começo da frase vira "Por que". */
const comoEstava = (modelo: string, novo: string) =>
  modelo[0] === modelo[0]?.toUpperCase()
    ? novo[0].toUpperCase() + novo.slice(1)
    : novo;

const REGRAS: Regra[] = [
  /* ---------------------------- mal e mau ---------------------------- */

  {
    /*
     * Verbo antes de "mau". "Mau" é adjetivo — qualifica alguém, como em "um
     * mau motorista". Depois de verbo o que cabe é o advérbio "mal": quem
     * passa, passa mal; quem dorme, dorme mal. A lista de verbos é o que
     * torna a regra segura: sem ela, "é mau" seria corrigido por engano, e
     * "ele é mau" está certo.
     */
    procurar:
      /\b(?:passar|passei|passou|passa|passando|passamos|dormir|durmo|dorme|dormi|dormiu|sentir|sinto|sente|senti|ficar|fico|fica|fiquei|ficou|ir|vai|foi|indo|sair|saiu|saí|acabar|acabou|cheirar|cheira|comer|comi|come|ouvir|ouço|ouve|ouvi|ver|vejo|vê|vi|falar|falo|fala|falei|escrever|escrevo|escreve|escrevi|cantar|canta|dirigir|dirige|jogar|joga|começar|começou|terminar|terminou|entender|entendi|entende|lembrar|lembro|lembra|lembrei|acordar|acordo|acorda|acordei|acordou|dormia|dormiam|andar|ando|anda|andei)\s+(mau)\b/dgiu,
    trocar: () => ["mal"],
    motivo: "Depois de verbo é «mal» (advérbio). «Mau» só qualifica alguém.",
  },
  {
    /* "de mal humor" — humor é substantivo, e o que o qualifica é o adjetivo
       "mau". Cuidado para não pegar "mal-humorado", que é com "mal" mesmo. */
    procurar: /\bde\s+(mal)\s+humor\b/dgiu,
    trocar: () => ["mau"],
    motivo: "«de mau humor»: aqui «mau» qualifica o substantivo «humor».",
  },
  {
    /* "mau educado", "mau criado", "mau humorado". São advérbio + particípio,
       e advérbio é "mal" — e todos os três são palavras compostas com hífen. */
    procurar: /\b(mau)[\s-](?=educad|cri[ae]d|humorad|intencionad|agradecid)/dgiu,
    trocar: () => ["mal"],
    motivo: "«mal-educado», «mal-humorado»: advérbio é «mal», e leva hífen.",
  },
  {
    /* "mau feito", "mau escrito": particípio pede advérbio. */
    procurar:
      /\b(mau)\s+(?=feit|escrit|falad|dit|vist|resolvid|acabad|cuidad|pag|trat|inform|entendid)/dgiu,
    trocar: () => ["mal"],
    motivo: "Antes de particípio é «mal» (advérbio).",
  },

  /* ---------------------------- mas e mais ---------------------------- */

  {
    /*
     * "mais" seguido de pronome que abre oração. "Mais eu não sei" quer
     * dizer "mas eu não sei" — "mais" com sentido de quantidade não vem
     * antes de sujeito. O LanguageTool pega este caso em texto limpo e
     * escapa quando a frase tem outros erros em volta, que é justamente
     * quando mais falta; a regra cobre a folga.
     */
    procurar:
      /\b(mais)\s+(?=(?:eu|tu|ele|ela|eles|elas|nós|n[óo]s|voc[êe]s?|a gente|agente|isso|isto|aquilo|n[ãa]o|nunca|agora|hoje|ontem|amanh[ãa]|depois|quando|como|se)\b)/dgiu,
    trocar: () => ["mas"],
    motivo: "«mas» é oposição; «mais» é quantidade.",
  },
  {
    /* O caminho contrário: "mas ou menos" é sempre "mais ou menos". */
    procurar: /\b(mas)\s+ou\s+menos\b/dgiu,
    trocar: () => ["mais"],
    motivo: "A expressão é «mais ou menos».",
  },

  /* ----------------------------- os porquês ----------------------------- */

  {
    /*
     * No fim da frase, antes de "?" ou ".", é a forma tônica: "por quê".
     *
     * Com artigo antes, não: aí é o substantivo, e quem manda é a regra
     * seguinte — «Quero saber o porquê.», não «o por quê». As duas casavam
     * o mesmo trecho e a lista mostrava duas correções brigando pela mesma
     * palavra, com a errada por cima. Este olhar para trás resolve na
     * origem, e o corte de sobreposição no fim do arquivo é a rede.
     */
    procurar:
      /(?<!\b(?:o|um|do|no|ao|esse|este|aquele|seu|meu|nosso)\s)\b(por\s+que|porque)(?=\s*[?.!]|\s*$)/dgiu,
    trocar: () => ["por quê"],
    motivo: "No fim da frase é «por quê», com acento.",
  },
  {
    /*
     * Com artigo antes, virou substantivo: "o porquê".
     *
     * O que vem DEPOIS é o que decide, e a primeira versão não olhava para
     * isso — media só o artigo antes. Medido, ela estragava texto certo:
     * «Escolhi aquele porque eu gosto dele» virava «aquele porquê», e
     * «Peguei o porque estava barato» virava «o porquê». Nos dois, o artigo
     * pertence à frase anterior ("escolhi aquele", "peguei o") e o "porque"
     * é conjunção — o contrário do que a regra concluía.
     *
     * Agora o substantivo tem de se comportar como substantivo: ou a frase
     * acaba ali («não sei o porquê.»), ou vem a preposição que ele pede
     * («o porquê disso», «o porquê da briga»). Conjunção não aparece em
     * nenhuma das duas posições, então o que passa é só o caso certo.
     *
     * Só determinante no singular: sem plural na lista, não há como sugerir
     * "porquê" onde cabia "porquês".
     */
    procurar:
      /\b(?:o|um|do|no|ao|esse|este|aquele|seu|meu|nosso)\s+(por\s*que|porque)(?=\s*[.,;:!?]|\s*$|\s+(?:de|do|da|dos|das|disso|disto|daquilo|dele|dela|deles|delas)\b)/dgiu,
    trocar: () => ["porquê"],
    motivo: "Com artigo antes é substantivo: «o porquê».",
  },
  {
    /*
     * Pergunta indireta: "não sei porque ele fez" quer "por que ele fez".
     * A lista de verbos é o que dá segurança — todos introduzem pergunta, e
     * depois deles "porque" junto seria resposta a uma pergunta que ninguém
     * fez.
     */
    /*
     * `dizer` e `contar` saíram da lista, e por medição: «Ele disse porque
     * estava cansado» e «Ela contou porque não veio» são frases corretas —
     * ali o "porque" é a causa do que foi dito, não uma pergunta indireta.
     * Os dois verbos aceitam as duas leituras, e regra que não consegue
     * escolher não deve escolher. Os que ficaram só aceitam pergunta.
     */
    procurar:
      /\b(?:sei|sabe|sabem|sabia|saber|entendo|entende|entendi|entender|explicar|explica|explique|expliquei|pergunto|perguntar|perguntou|imagino|imagina|descobrir|descobri|descobriu)\s+(porque)\b/dgiu,
    trocar: () => ["por que"],
    motivo: "Pergunta indireta pede «por que», separado.",
  },

  /* --------------------------- outros clássicos --------------------------- */

  {
    /* "agente" é quem agencia; o sujeito é "a gente". O verbo ao lado decide. */
    procurar:
      /\b(agente)\s+(?=(?:vamos|vai|v[ãa]o|fomos|foi|somos|[ée]|era|[ée]ramos|estamos|est[áa]|t[áa]|temos|tem|tinha|t[íi]nhamos|precisa|precisamos|pode|podemos|quer|queremos|fez|faz|fizemos|deve|devemos|vamo)\b)/dgiu,
    trocar: () => ["a gente"],
    motivo: "«a gente» é o sujeito; «agente» é quem agencia.",
  },
  {
    /*
     * "para mim fazer". "Mim" não faz nada — não é sujeito de verbo. Quando
     * vem um infinitivo logo depois, quem cabe ali é "eu". O infinitivo é
     * detectado pela terminação, e a exclusão de "ir/vir" evita casar com
     * palavras curtas que só parecem verbo.
     */
    procurar:
      /\b(?:para|pra|pro)\s+(mim)\s+(?=[a-zà-ú]{3,}(?:ar|er|ir)\b)/dgiu,
    trocar: () => ["eu"],
    motivo: "Antes de verbo no infinitivo é «para eu», não «para mim».",
  },
  {
    /*
     * "onde" é lugar parado; com verbo de movimento é "aonde".
     *
     * Duas correções de medição aqui.
     *
     * A primeira é o sujeito no meio: «Onde você vai?» é a forma que se
     * escreve de verdade, e a regra antiga, que exigia o verbo colado,
     * passava batido nela. Agora um pronome cabe entre os dois.
     *
     * A segunda é o oposto — a regra antiga marcava o que estava certo.
     * «Onde vou guardar as chaves?» está correto com "onde": ali "vou" não
     * é ir a lugar nenhum, é auxiliar de "guardar". Trocar por "aonde"
     * estragava a frase. O infinitivo logo depois é o sinal disso, e diante
     * dele a regra se cala.
     */
    procurar:
      /\b(onde)\s+(?:(?:eu|tu|voc[êe]s?|ele|ela|eles|elas|n[óo]s|a gente)\s+)?(?=(?:vai|vou|vamos|v[ãa]o|foi|fui|fomos|ir|irei|iremos|chegar|chega|cheguei|chegou|levar|leva|levou)\b(?!\s+(?:a|ao|à|para|pra|no|na|em)?\s*[a-zà-ú]{3,}(?:ar|er|ir)\b))/dgiu,
    trocar: () => ["aonde"],
    motivo: "Com verbo de movimento é «aonde» (a + onde).",
  },
  {
    /* "a" de tempo passado é o verbo "haver": "há dois anos". */
    procurar:
      /\b(a)\s+(?=(?:\d+|dois|duas|tr[êe]s|quatro|cinco|seis|sete|oito|nove|dez|muitos?|poucos?|alguns?)\s+(?:ano|anos|m[êe]s|meses|dia|dias|semana|semanas|hora|horas|minuto|minutos)\s+atr[áa]s\b)/dgiu,
    trocar: () => ["há"],
    motivo: "Tempo passado é «há», do verbo haver.",
  },
];

/** Duas faixas que se tocam. */
const encosta = (
  a: { inicio: number; tamanho: number },
  b: { inicio: number; tamanho: number }
) => a.inicio < b.inicio + b.tamanho && b.inicio < a.inicio + a.tamanho;

/**
 * Passa as regras pelo texto.
 *
 * Duas regras nunca saem daqui apontando o mesmo trecho. Elas foram escritas
 * para não competir, mas "foram escritas para" não é garantia: medido, «Quero
 * saber o porque.» casava a do fim de frase e a do substantivo ao mesmo
 * tempo, e a lista mostrava duas correções para a mesma palavra — a de cima
 * errada, e o botão da de baixo sem efeito, porque o texto já não era o que
 * ela esperava. Duas linhas brigando pela mesma palavra é sempre defeito, e
 * o corte abaixo garante que não apareça, venha de onde vier.
 *
 * Fica a primeira por posição. Regra mais específica que outra deve vir antes
 * na lista, ou excluir a vizinha por conta própria, como faz a do fim de
 * frase.
 *
 * O encontro com o LanguageTool é resolvido por `juntar`, separadamente.
 */
export function acharClassicos(texto: string): AchadoLocal[] {
  const achados: AchadoLocal[] = [];

  for (const regra of REGRAS) {
    /* Cópia da expressão a cada varredura: `g` guarda `lastIndex` no próprio
       objeto, e reusar a mesma instância entre chamadas faria a segunda
       revisão começar do meio do texto. */
    const re = new RegExp(regra.procurar.source, regra.procurar.flags);

    for (const m of texto.matchAll(re)) {
      const faixa = m.indices?.[1];
      if (!faixa) continue;
      const errado = m[1];
      achados.push({
        inicio: faixa[0],
        tamanho: errado.length,
        errado,
        trocas: regra.trocar(errado).map((t) => comoEstava(errado, t)),
        motivo: regra.motivo,
      });
    }
  }

  achados.sort((a, b) => a.inicio - b.inicio || b.tamanho - a.tamanho);

  const semChoque: AchadoLocal[] = [];
  for (const a of achados)
    if (!semChoque.some((b) => encosta(a, b))) semChoque.push(a);
  return semChoque;
}

/**
 * Junta os dois corretores, com o LanguageTool ganhando os empates.
 *
 * Quando os dois apontam o mesmo trecho, o dele fica: a mensagem vem no
 * idioma certo e as alternativas são mais de uma. Duas linhas para o mesmo
 * "mais" seriam duas correções concorrentes na lista, e aplicar uma
 * invalidaria a outra em silêncio.
 */
export function juntar<T extends { inicio: number; tamanho: number }>(
  doServico: T[],
  locais: AchadoLocal[]
): (T | AchadoLocal)[] {
  const sobra = locais.filter((l) => !doServico.some((s) => encosta(l, s)));
  return [...doServico, ...sobra].sort((a, b) => a.inicio - b.inicio);
}
