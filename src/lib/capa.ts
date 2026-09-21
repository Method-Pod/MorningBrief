/**
 * A cor de fundo de uma capa que não tem imagem.
 *
 * O quadro vazio da referência sem prévia era sempre o mesmo cinza com o
 * mesmo ícone no meio: três cartões lado a lado viravam três buracos iguais.
 * Dando a cada domínio um matiz próprio, o mesmo quadro passa a identificar
 * o site — "o verde é o salo.uk" — mesmo antes de ler o nome.
 *
 * Só o MATIZ sai daqui. Saturação e claridade ficam no CSS, em
 * `--capa-s` e `--capa-l`, porque elas mudam com o tema: no claro a capa é
 * um pastel, no escuro é um tom fundo. Se a cor inteira viesse pronta daqui,
 * ou ela estouraria no claro ou sumiria no escuro.
 */

/**
 * Um matiz de 0 a 359, sempre o mesmo para o mesmo texto.
 *
 * FNV-1a de 32 bits com embaralhamento final. São 360 casas, então dois
 * domínios podem cair na mesma por sorte — é enfeite, não identificador, e
 * uma repetição de vez em quando não atrapalha. O que não pode é o hash
 * AGRUPAR nomes parecidos, e é isso que o embaralhamento abaixo resolve.
 */
export function matizDeTexto(texto: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < texto.length; i++) {
    h = Math.imul(h ^ texto.charCodeAt(i), 16777619) >>> 0;
  }

  /*
   * O embaralhamento final (o finalizador lowbias32), e o tamanho honesto do
   * que ele resolve.
   *
   * `% 360` só olha os bits de baixo do hash, e o último passo do FNV mexe
   * pouco neles — então duas entradas parecidas às vezes caem coladas.
   * Aconteceu logo no primeiro par que testei: "salo.uk" e "salo.com" a
   * **1 grau** um do outro.
   *
   * Medido em 200 pares parecidos, porém, a diferença é modesta: a média
   * das distâncias vai de 82,6 para 90,6 graus, e 90 é o valor de duas
   * casas sorteadas ao acaso. Ou seja, ele encosta a distribuição no ideal
   * em vez de consertar um defeito grosso — e não reduz os encontros por
   * sorte, que são inevitáveis com 360 casas. Fica porque é de graça e
   * porque o par acima existe; não fica porque salva a tela.
   */
  h ^= h >>> 16;
  h = Math.imul(h, 0x21f0aaad) >>> 0;
  h ^= h >>> 15;
  h = Math.imul(h, 0xd35a2d97) >>> 0;
  /* `>>> 0` de novo no fim: `^` devolve inteiro COM sinal, e um h negativo
     faz o resto sair negativo — matiz -45 nao existe, e o CSS ignora a
     regra inteira. O teste da faixa 0..359 pegou isto. */
  h = (h ^ (h >>> 15)) >>> 0;

  return h % 360;
}

/**
 * A inicial que vai na capa quando não há nem logo.
 *
 * Do domínio, e não do nome: o nome é o título da página, que muda quando o
 * site troca a manchete — "Agencia de Comunicación y Eventos" hoje pode ser
 * outra coisa amanhã, e a capa mudaria de letra sozinha. O domínio é o que
 * não muda.
 */
/**
 * Prefixos que não são o nome do site.
 *
 * Sem esta lista, `lp.gaiaone.com.br` vira "L" — foi o que apareceu na tela.
 * A regra é por lista fechada, e não por tamanho do rótulo: cortar todo
 * primeiro rótulo curto transformaria `bia.com.br` em "C", de "com".
 */
const PREFIXOS = new Set([
  "www", "lp", "app", "m", "web", "site", "pages", "page", "blog",
  "go", "get", "my", "loja", "shop", "portal", "home",
]);

export function inicialDaCapa(dominio: string, nome: string): string {
  let fonte = dominio || nome;
  const partes = fonte.split(".");
  if (partes.length > 2 && PREFIXOS.has(partes[0].toLowerCase()))
    fonte = partes.slice(1).join(".");
  else if (partes.length === 2 && partes[0].toLowerCase() === "www")
    fonte = partes[1];

  const letra = fonte.match(/\p{L}|\p{N}/u);
  return (letra?.[0] ?? "?").toUpperCase();
}
