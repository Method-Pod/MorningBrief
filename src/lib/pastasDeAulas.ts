/**
 * O que a lista de Aulas mostra: pastas de playlist e aulas soltas.
 *
 * Pedido dele: importar uma playlist despejava todos os vídeos soltos na
 * lista. Agora cada playlist é UMA linha — a pasta —, que abre ali mesmo com
 * as aulas dela. Esta função decide, a partir das aulas e das pastas, o que
 * entra em cada aba e em cada filtro de assunto. Mora aqui, e não na tela,
 * para as regras serem testáveis sem subir o Next.
 */

type AulaMinima = {
  id: string;
  feita: boolean;
  subject_id: string | null;
  playlist_id?: string | null;
  posicao?: number | null;
};

type PastaMinima = { id: string; subject_id: string | null };

export type Aba = "fila" | "feitas" | "todas";

export type ItemDaLista<A, P> =
  | { tipo: "aula"; aula: A }
  | { tipo: "pasta"; pasta: P; aulas: A[]; feitas: number };

/**
 * Monta a lista, na ordem: pastas primeiro, depois as aulas soltas na ordem
 * em que vieram.
 *
 * As regras de cada aba olham a pasta como um conjunto:
 *
 * - "Para assistir": a pasta entra se tiver ALGUMA aula por assistir;
 * - "Assistidas": entra se tiver ALGUMA assistida — uma playlist pela metade
 *   aparece nas duas abas, porque tem as duas coisas;
 * - "Todas": sempre.
 *
 * Dentro da pasta vão TODAS as aulas dela, em qualquer aba: abrir uma
 * playlist e ver só metade dela esconderia onde você está.
 *
 * O filtro de assunto aceita a pasta se o assunto dela OU o de alguma aula
 * dela casar — a pasta recebe o assunto escolhido na importação, mas cada
 * aula pode ter sido trocada depois.
 *
 * Aula cuja pasta não está na lista (pasta apagada fora da tela, ou banco sem
 * a tabela) é tratada como solta: some da pasta, mas não some do app.
 */
export function montarListaDeAulas<A extends AulaMinima, P extends PastaMinima>(
  aulas: A[],
  pastas: P[],
  aba: Aba,
  filtro: string,
  semAssunto: string
): ItemDaLista<A, P>[] {
  const ids = new Set(pastas.map((p) => p.id));
  const porPasta = new Map<string, A[]>();
  const soltas: A[] = [];

  for (const a of aulas) {
    if (a.playlist_id && ids.has(a.playlist_id)) {
      const lista = porPasta.get(a.playlist_id) ?? [];
      lista.push(a);
      porPasta.set(a.playlist_id, lista);
    } else {
      soltas.push(a);
    }
  }

  const casaAssunto = (sid: string | null) =>
    filtro === "all" || (sid || semAssunto) === filtro;
  const passaAba = (a: AulaMinima) =>
    aba === "todas" ? true : aba === "feitas" ? a.feita : !a.feita;

  const itensPasta: ItemDaLista<A, P>[] = [];
  for (const p of pastas) {
    const dela = [...(porPasta.get(p.id) ?? [])].sort(
      (x, y) => (x.posicao ?? 0) - (y.posicao ?? 0)
    );
    if (!dela.length) continue;
    if (!dela.some(passaAba)) continue;
    if (!casaAssunto(p.subject_id) && !dela.some((a) => casaAssunto(a.subject_id)))
      continue;
    itensPasta.push({
      tipo: "pasta",
      pasta: p,
      aulas: dela,
      feitas: dela.filter((a) => a.feita).length,
    });
  }

  const itensSoltos: ItemDaLista<A, P>[] = soltas
    .filter(passaAba)
    .filter((a) => casaAssunto(a.subject_id))
    .map((aula) => ({ tipo: "aula", aula }));

  return [...itensPasta, ...itensSoltos];
}
