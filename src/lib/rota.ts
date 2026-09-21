/**
 * "A tela aberta é esta?"
 *
 * Existe como função própria, e testada, por causa de um defeito que chegou
 * à tela: a barra lateral usava `path.startsWith(href)`, e prefixo cru
 * compara TEXTO. Caminho não é texto — é uma sequência de pedaços separados
 * por barra. Com o prefixo solto, `/contas` respondia que sim para `/conta`,
 * porque a palavra começa igual, e o anel roxo de "estou na minha conta"
 * acendia em volta da foto toda vez que ele abria Contas a pagar.
 *
 * A regra certa: ou o caminho É a rota, ou ele é um FILHO dela — e filho
 * tem barra. `/contas/gerenciar` acende Contas a pagar; `/contas` não
 * acende a conta.
 */
export function naRota(caminho: string, rota: string): boolean {
  /* A raiz é a única que não pode usar a regra do filho: toda rota do app
     começa com "/", então ela acenderia em todas as telas. */
  if (rota === "/") return caminho === "/";
  return caminho === rota || caminho.startsWith(`${rota}/`);
}
