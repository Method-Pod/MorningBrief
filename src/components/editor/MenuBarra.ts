import { Extension, type Editor, type Range } from "@tiptap/core";
import Suggestion from "@tiptap/suggestion";

/**
 * O menu da barra: digitar "/" abre a lista de blocos.
 *
 * O estado do menu mora aqui, na extensão, e não num `useState` do React.
 * Parece invertido, mas é o que evita o defeito clássico: as setas e o Enter
 * são tratados pelo plugin do ProseMirror, e um índice guardado em estado do
 * React seria lido pelo plugin com o valor da primeira renderização. Com tudo
 * no fecho do plugin, o teclado e a tela olham o mesmo lugar.
 *
 * O React recebe um retrato pronto por `aoMudar` e só desenha.
 */

export type ItemMenu = {
  chave: string;
  titulo: string;
  dica: string;
  /** Palavras que também encontram o item, para não depender do nome exato. */
  termos: string[];
  rodar: (editor: Editor, faixa: Range) => void;
};

export type EstadoMenu = {
  itens: ItemMenu[];
  indice: number;
  /**
   * O que o "/" ocupa no documento.
   *
   * Vai no retrato porque o clique do mouse num item não passa pelo `command`
   * do plugin — que é quem sabe apagar o "/" e o que foi digitado depois. Sem
   * isto, a tela teria que recalcular a faixa lendo o texto antes do cursor:
   * a mesma conta, feita duas vezes e com mais chance de divergir.
   */
  faixa: Range;
  /** Canto de baixo do "/" na tela, para o menu nascer colado nele. */
  x: number;
  y: number;
} | null;

/** Tira acento, para "citacao" achar "citação". */
const sem = (v: string) =>
  v.toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "");

export const filtrarItens = (itens: ItemMenu[], busca: string) => {
  const q = sem(busca.trim());
  if (!q) return itens;
  return itens.filter(
    (i) => sem(i.titulo).includes(q) || i.termos.some((t) => sem(t).includes(q))
  );
};

export interface OpcoesMenuBarra {
  itens: ItemMenu[];
  aoMudar: (estado: EstadoMenu) => void;
}

export const MenuBarra = Extension.create<OpcoesMenuBarra>({
  name: "menuBarra",

  addOptions() {
    return { itens: [], aoMudar: () => {} };
  },

  addProseMirrorPlugins() {
    const opcoes = this.options;
    const editor = this.editor;

    /*
     * O que o menu sabe entre uma tecla e outra.
     *
     * Tudo no fecho deste plugin: `indice` porque as setas o mudam sem passar
     * pelo React, `faixa` porque o Enter precisa saber o que apagar (o "/" e o
     * que foi digitado depois dele), e `pos` porque um evento de teclado não
     * traz coordenada — só o `clientRect` do `onStart`/`onUpdate` traz.
     */
    let itens: ItemMenu[] = [];
    let indice = 0;
    let faixa: Range | null = null;
    let pos = { x: 0, y: 0 };

    const avisar = () =>
      opcoes.aoMudar(
        itens.length && faixa ? { itens, indice, faixa, ...pos } : null
      );

    return [
      Suggestion<ItemMenu>({
        editor,
        char: "/",
        /* Sem espaço na busca: "/lista de coisas" é texto normal, não uma
           tentativa de achar um bloco chamado "lista de coisas". */
        allowSpaces: false,
        startOfLine: false,

        items: ({ query }) => filtrarItens(opcoes.itens, query),

        command: ({ editor: ed, range, props }) => props.rodar(ed, range),

        render: () => {
          const guardar = (lista: ItemMenu[], r: Range) => {
            itens = lista;
            faixa = r;
            /* O índice volta ao começo quando a lista muda: manter o terceiro
               selecionado depois de filtrar apontaria para outro item. */
            indice = 0;
            /*
             * A âncora vem do `coordsAtPos` do próprio editor, e não do
             * `clientRect` do plugin: aquele devolve o retângulo de todo o
             * trecho casado ("/dest"), então o menu nascia deslocado para a
             * direita à medida que se digitava. Aqui é o "/" exato.
             */
            const c = editor.view.coordsAtPos(r.from);
            pos = { x: c.left, y: c.bottom };
            avisar();
          };

          return {
            onStart: (props) => guardar(props.items, props.range),

            onUpdate: (props) => guardar(props.items, props.range),

            onKeyDown: ({ event }) => {
              if (!itens.length) return false;

              if (event.key === "ArrowDown") {
                indice = (indice + 1) % itens.length;
                avisar();
                return true;
              }
              if (event.key === "ArrowUp") {
                indice = (indice - 1 + itens.length) % itens.length;
                avisar();
                return true;
              }
              if (event.key === "Enter" || event.key === "Tab") {
                const item = itens[indice];
                if (!item || !faixa) return false;
                item.rodar(editor, faixa);
                return true;
              }
              if (event.key === "Escape") {
                itens = [];
                avisar();
                return true;
              }
              return false;
            },

            onExit: () => {
              itens = [];
              faixa = null;
              avisar();
            },
          };
        },
      }),
    ];
  },
});
