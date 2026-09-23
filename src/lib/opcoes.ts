import * as React from "react";

/**
 * Lê os `<option>` e `<optgroup>` que o seletor recebeu como filhos.
 *
 * Mora aqui, fora do componente, por causa de um defeito que deixou a tela
 * de Contas a pagar sem conseguir escolher categoria — e que um teste de
 * função pura pega, enquanto um componente de tela inteira não.
 */

export type ItemDoSeletor = { valor: string; rotulo: string; grupo?: string };

/** O texto de um nó, mesmo quando ele vem em pedaços: `{c.nome}{" (3)"}`. */
export const textoDe = (n: React.ReactNode): string => {
  if (n === null || n === undefined || typeof n === "boolean") return "";
  if (typeof n === "string" || typeof n === "number") return String(n);
  if (Array.isArray(n)) return n.map(textoDe).join("");
  if (React.isValidElement(n))
    return textoDe((n.props as { children?: React.ReactNode }).children);
  return "";
};

export function lerOpcoes(children: React.ReactNode): ItemDoSeletor[] {
  const saida: ItemDoSeletor[] = [];

  const visitar = (nos: React.ReactNode, grupo?: string) => {
    React.Children.forEach(nos, (no) => {
      if (!React.isValidElement(no)) return;
      /* Fragmentos aparecem quando a tela monta os grupos numa função. */
      if (no.type === React.Fragment)
        return visitar(
          (no.props as { children?: React.ReactNode }).children,
          grupo
        );
      if (no.type === "optgroup") {
        const p = no.props as { label?: string; children?: React.ReactNode };
        return visitar(p.children, p.label);
      }
      if (no.type === "option") {
        const p = no.props as {
          value?: string | number;
          children?: React.ReactNode;
        };
        const rotulo = textoDe(p.children);
        saida.push({
          /*
           * Sem `value`, o valor é o PRÓPRIO TEXTO — como no HTML.
           *
           * Isto não é detalhe: `<option>{c}</option>`, sem value, é HTML
           * válido e o navegador usa o texto. O seletor de antes era um
           * `<select>` nativo, então as telas puderam escrever assim — e três
           * escrevem, todas as de categoria.
           *
           * Com `p.value ?? ""`, TODAS essas opções viravam valor vazio. O
           * efeito na tela: a lista de categorias abria com um certo ao lado
           * de cada linha (porque todas batiam com o valor atual, também
           * vazio) e clicar em qualquer uma não fazia nada — `escolher` vê
           * que o valor não mudou e sai. Não dava para escolher categoria em
           * Contas a pagar.
           */
          valor:
            p.value === undefined || p.value === null
              ? rotulo
              : String(p.value),
          rotulo,
          grupo,
        });
      }
    });
  };

  visitar(children);
  return saida;
}
