import { Node, mergeAttributes } from "@tiptap/core";

/**
 * Caixa de destaque: o "callout" do Notion.
 *
 * É um bloco que contém blocos, e não um parágrafo enfeitado — dentro dele
 * cabem lista, subtítulo e mais de um parágrafo, que é o que se quer de uma
 * caixa de aviso com três linhas de explicação.
 *
 * O tom vem escolhido do menu (`/destaque`, `/atenção`, `/tudo certo`) em vez
 * de ter um seletor de cor dentro da caixa: são três, cada um com um sentido, e
 * escolher no momento de inserir é um passo em vez de dois.
 */

export const TONS = ["nota", "atencao", "bom"] as const;
export type TomDestaque = (typeof TONS)[number];

const ehTom = (v: unknown): v is TomDestaque =>
  typeof v === "string" && (TONS as readonly string[]).includes(v);

export interface OpcoesDestaque {
  HTMLAttributes: Record<string, unknown>;
}

declare module "@tiptap/core" {
  interface Commands<ReturnType> {
    destaque: {
      inserirDestaque: (tom?: TomDestaque) => ReturnType;
      alternarDestaque: (tom?: TomDestaque) => ReturnType;
    };
  }
}

export const Destaque = Node.create<OpcoesDestaque>({
  name: "destaque",
  group: "block",
  /* `block+`: um ou mais blocos dentro. Com `block*` a caixa poderia existir
     vazia e sem lugar para o cursor, e não haveria como sair dela. */
  content: "block+",
  defining: true,

  addOptions() {
    return { HTMLAttributes: {} };
  },

  addAttributes() {
    return {
      tom: {
        default: "nota" as TomDestaque,
        parseHTML: (el) => {
          const v = el.getAttribute("data-tom");
          return ehTom(v) ? v : "nota";
        },
        renderHTML: (attrs) => ({ "data-tom": attrs.tom }),
      },
    };
  },

  parseHTML() {
    /* Casa pelo atributo, e não pela tag: `div` sozinho pegaria qualquer div
       colada de fora e transformaria em caixa de destaque. */
    return [{ tag: "div[data-destaque]" }];
  },

  renderHTML({ HTMLAttributes }) {
    return [
      "div",
      mergeAttributes(this.options.HTMLAttributes, HTMLAttributes, {
        "data-destaque": "",
      }),
      0,
    ];
  },

  addCommands() {
    return {
      inserirDestaque:
        (tom = "nota") =>
        ({ commands }) =>
          commands.insertContent({
            type: this.name,
            attrs: { tom },
            content: [{ type: "paragraph" }],
          }),

      alternarDestaque:
        (tom = "nota") =>
        ({ commands }) =>
          commands.toggleWrap(this.name, { tom }),
    };
  },

  addKeyboardShortcuts() {
    return {
      /*
       * Enter duas vezes no fim sai da caixa.
       *
       * Sem isso, a caixa vira uma armadilha: o cursor entra e o único jeito de
       * escrever depois dela é com a seta para baixo num parágrafo que ainda não
       * existe. É o mesmo gesto que sai de uma citação.
       */
      Enter: ({ editor }) => {
        const { state } = editor;
        const { $from, empty } = state.selection;
        if (!empty) return false;

        const pai = $from.node(-1);
        if (pai?.type.name !== this.name) return false;
        /* Só quando o parágrafo atual está vazio e é o último da caixa. */
        if ($from.parent.content.size > 0) return false;
        if ($from.index(-1) !== pai.childCount - 1) return false;

        return editor
          .chain()
          .deleteRange({ from: $from.before(), to: $from.after() })
          .insertContentAt($from.after(-1) - 2, { type: "paragraph" })
          .focus()
          .run();
      },
    };
  },
});
