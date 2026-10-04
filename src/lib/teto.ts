/**
 * Teto de linhas por tela, com aviso em vez de corte silencioso.
 *
 * As listas longas — referências, livros, aulas e anotações — eram lidas sem
 * limite nenhum: a consulta crescia junto com o acervo e não tinha onde parar.
 * Hoje não pesa (a maior resposta medida foi 23 kB), mas é uma conta que só
 * sobe, e a tela que abre lendo tudo é a que um dia abre devagar.
 *
 * Por que teto e não paginação de verdade: nestas quatro telas a BUSCA e os
 * FILTROS são feitos em memória, sobre a lista já carregada. Carregar só a
 * primeira página faria a busca parar de achar o que está fora dela — sem
 * dizer nada. Um item que existe e não aparece é pior do que uma consulta
 * grande. Então carrega-se um teto alto, e quando ele é alcançado a tela DIZ
 * que está mostrando uma parte e oferece carregar o resto.
 *
 * 300 porque é bem acima de qualquer acervo real de uma pessoa nestas telas
 * (a maior aqui tem 39 linhas) e bem abaixo do que incomoda o navegador.
 */

export const PAGINA = 300;

/** Quantas linhas pedir ao banco para `paginas` páginas. Uma a mais, que é
 *  como se descobre que ainda há coisa lá atrás sem uma segunda consulta. */
export const pedir = (paginas: number) => PAGINA * paginas + 1;

/**
 * Separa o que a tela mostra do sinal de que havia mais.
 *
 * A linha extra pedida por `pedir` é descartada aqui: ela existe só para
 * responder "tem mais?".
 */
export function cortar<T>(
  linhas: T[] | null | undefined,
  paginas: number
): { lista: T[]; temMais: boolean } {
  const teto = PAGINA * paginas;
  const todas = linhas ?? [];
  return { lista: todas.slice(0, teto), temMais: todas.length > teto };
}
