import type { Node as NoPM } from "@tiptap/pm/model";
import type { Editor as TEditor } from "@tiptap/react";

/**
 * A ponte entre o texto que o corretor lê e o documento que o editor edita.
 *
 * O corretor recebe texto puro e devolve posições contadas em caracteres —
 * "erro nos caracteres 128 a 136". O editor não trabalha em caracteres de
 * texto puro: ele trabalha em posições do ProseMirror, que contam também a
 * abertura e o fechamento de cada bloco. Os dois números nunca batem, e usar
 * um no lugar do outro corrige a palavra errada.
 *
 * O que resolve isso é montar o texto e o mapa na mesma passada: para cada
 * pedaço de texto do documento, onde ele começa no texto puro e onde ele
 * começa no documento. Mapa e texto saem consistentes por construção.
 */

/** Um pedaço de texto do documento, com os dois endereços. */
export type Pedaco = {
  /** Onde começa no texto puro enviado ao corretor. */
  inicio: number;
  /** Onde começa no documento do ProseMirror. */
  pos: number;
  tamanho: number;
};

/** Um erro apontado pelo corretor, já traduzido para a tela. */
export type Achado = {
  id: string;
  inicio: number;
  tamanho: number;
  errado: string;
  trocas: string[];
  motivo: string;
  /* O texto em volta, copiado na hora da revisão e nunca mais mexido: serve
     para você reconhecer o trecho na lista, e como é só para ler, não faz
     mal que envelheça enquanto você corrige os outros. */
  antes: string;
  depois: string;
};

/**
 * O texto puro do documento, e o mapa para voltar.
 *
 * A quebra de linha entre blocos não é enfeite: sem ela o fim de um parágrafo
 * cola no começo do seguinte, e o corretor lê "batalhaHá" como uma palavra
 * que não existe. Ela entra antes de cada bloco de texto menos o primeiro,
 * para o texto não começar com uma linha vazia.
 */
export function textoDoDoc(doc: NoPM): { texto: string; pedacos: Pedaco[] } {
  let texto = "";
  const pedacos: Pedaco[] = [];
  let primeiro = true;

  doc.descendants((no, pos) => {
    if (no.isText && no.text) {
      pedacos.push({ inicio: texto.length, pos, tamanho: no.text.length });
      texto += no.text;
      return false;
    }
    if (no.isTextblock) {
      if (!primeiro) texto += "\n";
      primeiro = false;
    }
    return true;
  });

  return { texto, pedacos };
}

/**
 * De um caractere do texto puro para a posição dele no documento.
 *
 * Devolve `null` quando o caractere cai num separador de bloco, que existe no
 * texto puro e não existe no documento. Quem chama trata o `null` desistindo
 * do achado — é melhor deixar de corrigir um item do que corrigir no lugar
 * errado.
 */
function posDoOffset(pedacos: Pedaco[], offset: number): number | null {
  for (const p of pedacos) {
    if (offset < p.inicio) return null;
    if (offset < p.inicio + p.tamanho) return p.pos + (offset - p.inicio);
  }
  return null;
}

/**
 * A faixa do documento que corresponde a um achado — se ainda corresponder.
 *
 * O fim é calculado a partir do último caractere, e não do primeiro mais o
 * tamanho: o trecho pode atravessar dois pedaços de texto, como em "de
 * início" com "início" em negrito, e aí somar o tamanho passaria por cima da
 * fronteira.
 *
 * A conferência do texto no fim é a trava que importa. Entre a revisão e o
 * clique em "aplicar" pode ter sido digitada uma letra antes do erro, e todas
 * as posições andaram. Se o que está na faixa não é mais o que o corretor
 * viu, o achado é descartado em vez de aplicado às cegas.
 *
 * **O mapa tem que ser recém-construído.** Aplicar uma correção muda as
 * posições do documento, então o `pedacos` de antes da correção aponta para
 * onde o texto estava, não para onde está. Quem chama monta o mapa com
 * `textoDoDoc(editor.state.doc)` na hora — é uma passada pelo documento, não
 * vale guardar. Guardar o mapa faria o segundo "aplicar" da lista cair fora
 * do lugar, ser barrado pela conferência acima, e parecer um botão quebrado.
 */
export function faixaDoAchado(
  editor: TEditor,
  pedacos: Pedaco[],
  achado: Achado
): { de: number; ate: number } | null {
  const de = posDoOffset(pedacos, achado.inicio);
  const ultimo = posDoOffset(pedacos, achado.inicio + achado.tamanho - 1);
  if (de === null || ultimo === null) return null;

  const ate = ultimo + 1;
  if (ate <= de) return null;

  const naTela = editor.state.doc.textBetween(de, ate, "\n");
  return naTela === achado.errado ? { de, ate } : null;
}

/**
 * Troca o trecho pela correção, mantendo a formatação que estava nele.
 *
 * `insertText` e não `insertContent`: o segundo insere conteúdo novo e a
 * palavra corrigida sairia sem o negrito ou o marca-texto que a errada tinha.
 * `insertText` herda as marcas da posição, então "POSICIONAI-VOS" marcado de
 * azul continua marcado de azul depois da correção.
 */
export function aplicarTroca(
  editor: TEditor,
  faixa: { de: number; ate: number },
  troca: string
): void {
  const tr = editor.state.tr.insertText(troca, faixa.de, faixa.ate);
  editor.view.dispatch(tr);
}

/**
 * Reposiciona os achados pendentes depois de uma correção aplicada.
 *
 * Trocar "possivel" por "possível" muda o tamanho do texto, e todo achado
 * depois dele passa a estar deslocado. Sem este ajuste o segundo "aplicar"
 * cairia uma letra fora — e a conferência de texto o descartaria em silêncio,
 * o que parece um botão que não funciona.
 */
export function deslocar(
  achados: Achado[],
  apartirDe: number,
  delta: number
): Achado[] {
  if (delta === 0) return achados;
  return achados.map((a) =>
    a.inicio > apartirDe ? { ...a, inicio: a.inicio + delta } : a
  );
}
