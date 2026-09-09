"use client";

import * as React from "react";
import { createPortal } from "react-dom";
import { EditorContent, useEditor, type Editor as TEditor } from "@tiptap/react";
import { BubbleMenu } from "@tiptap/react/menus";
import StarterKit from "@tiptap/starter-kit";
import { TaskItem, TaskList } from "@tiptap/extension-list";
import { Placeholder } from "@tiptap/extensions";
import { Highlight } from "@tiptap/extension-highlight";
import { NodeSelection } from "@tiptap/pm/state";
import type { Range } from "@tiptap/core";
import {
  AlertTriangle,
  Bold,
  Check,
  ChevronsUpDown,
  Code,
  Heading1,
  Heading2,
  Heading3,
  Highlighter,
  Italic,
  Lightbulb,
  List,
  ListOrdered,
  ListTodo,
  Minus,
  Quote,
  Strikethrough,
  Type,
} from "lucide-react";
import { Destaque, type TomDestaque } from "./Destaque";
import { MenuBarra, type EstadoMenu, type ItemMenu } from "./MenuBarra";
import { cx } from "../ui";

/**
 * O editor das anotações: blocos, "/" e arrastar para reordenar.
 *
 * Sobre Tiptap (ProseMirror). Escrever isto em `contenteditable` cru é a
 * armadilha clássica: seleção entre blocos, colar de fora, desfazer e o que o
 * navegador inventa em cada caso somam mais código do que a biblioteca inteira,
 * e cada navegador inventa diferente.
 *
 * O que é feito à mão aqui é a alça de arrastar. A oficial do Tiptap é paga
 * (Tiptap Pro); esta usa a API de arraste do próprio ProseMirror, que já sabe
 * mover um nó de um lugar para outro — o que falta é a alça e a decisão de qual
 * bloco ela está segurando.
 */

/**
 * As cores do marca-texto.
 *
 * Cinco, e não uma paleta inteira: marca-texto serve para separar o que
 * importa do resto, e com doze cores a separação se perde — tudo fica
 * marcado de alguma coisa. São as mesmas famílias que o app já usa nos outros
 * lugares, para a nota não parecer de outro programa.
 *
 * O valor gravado é a cor final, e não um nome: o `data-color` do Highlight
 * vira `background-color` direto no HTML, e um nome exigiria uma tabela de
 * tradução em qualquer lugar que fosse mostrar a nota.
 */
const CANETAS = [
  { chave: "amarelo", cor: "#fef08a", rotulo: "Amarelo" },
  { chave: "verde", cor: "#bbf7d0", rotulo: "Verde" },
  { chave: "azul", cor: "#bfdbfe", rotulo: "Azul" },
  { chave: "rosa", cor: "#fbcfe8", rotulo: "Rosa" },
  { chave: "laranja", cor: "#fed7aa", rotulo: "Laranja" },
] as const;

/** Espera antes de gravar, para não escrever no banco a cada tecla. */
const ESPERA_MS = 900;

/* ------------------------------ itens do "/" ------------------------------ */

/** Apaga o "/" e o que foi digitado depois dele, antes de inserir o bloco. */
const limpar = (editor: TEditor, faixa: Range) =>
  editor.chain().focus().deleteRange(faixa);

const ITENS: ItemMenu[] = [
  {
    chave: "texto",
    titulo: "Texto",
    dica: "Parágrafo comum",
    termos: ["paragrafo", "normal", "p"],
    rodar: (e, f) => limpar(e, f).setParagraph().run(),
  },
  {
    chave: "h1",
    titulo: "Título 1",
    dica: "Seção grande",
    termos: ["titulo", "h1", "cabecalho"],
    rodar: (e, f) => limpar(e, f).setHeading({ level: 1 }).run(),
  },
  {
    chave: "h2",
    titulo: "Título 2",
    dica: "Subseção",
    termos: ["subtitulo", "h2"],
    rodar: (e, f) => limpar(e, f).setHeading({ level: 2 }).run(),
  },
  {
    chave: "h3",
    titulo: "Título 3",
    dica: "Subseção menor",
    termos: ["h3"],
    rodar: (e, f) => limpar(e, f).setHeading({ level: 3 }).run(),
  },
  {
    chave: "lista",
    titulo: "Lista",
    dica: "Com marcadores",
    termos: ["bullet", "marcador", "ul"],
    rodar: (e, f) => limpar(e, f).toggleBulletList().run(),
  },
  {
    chave: "numerada",
    titulo: "Lista numerada",
    dica: "1, 2, 3...",
    termos: ["numero", "ordenada", "ol"],
    rodar: (e, f) => limpar(e, f).toggleOrderedList().run(),
  },
  {
    chave: "tarefas",
    titulo: "Lista de tarefas",
    dica: "Com caixa de marcar",
    termos: ["checkbox", "todo", "tarefa", "caixa"],
    rodar: (e, f) => limpar(e, f).toggleTaskList().run(),
  },
  {
    chave: "destaque",
    titulo: "Destaque",
    dica: "Caixa para o que não pode passar batido",
    termos: ["callout", "caixa", "aviso", "nota"],
    rodar: (e, f) => limpar(e, f).inserirDestaque("nota").run(),
  },
  {
    chave: "atencao",
    titulo: "Atenção",
    dica: "Caixa de alerta",
    termos: ["callout", "alerta", "cuidado", "aviso"],
    rodar: (e, f) => limpar(e, f).inserirDestaque("atencao").run(),
  },
  {
    chave: "bom",
    titulo: "Tudo certo",
    dica: "Caixa de confirmação",
    termos: ["callout", "ok", "positivo", "feito"],
    rodar: (e, f) => limpar(e, f).inserirDestaque("bom").run(),
  },
  {
    chave: "citacao",
    titulo: "Citação",
    dica: "Trecho de outra pessoa",
    termos: ["quote", "blockquote"],
    rodar: (e, f) => limpar(e, f).toggleBlockquote().run(),
  },
  {
    chave: "codigo",
    titulo: "Código",
    dica: "Bloco monoespaçado",
    termos: ["code", "pre", "programa"],
    rodar: (e, f) => limpar(e, f).toggleCodeBlock().run(),
  },
  {
    chave: "divisoria",
    titulo: "Divisória",
    dica: "Linha entre assuntos",
    termos: ["hr", "linha", "separador"],
    rodar: (e, f) => limpar(e, f).setHorizontalRule().run(),
  },
];

const ICONE_ITEM: Record<string, React.ElementType> = {
  texto: Type,
  h1: Heading1,
  h2: Heading2,
  h3: Heading3,
  lista: List,
  numerada: ListOrdered,
  tarefas: ListTodo,
  destaque: Lightbulb,
  atencao: AlertTriangle,
  bom: Check,
  citacao: Quote,
  codigo: Code,
  divisoria: Minus,
};

/* ------------------------------ editor ------------------------------ */

export function Editor({
  html,
  onMudar,
  onGravando,
}: {
  /** Conteúdo inicial. Só é lido na montagem — depois o editor é a verdade. */
  html: string;
  onMudar: (html: string) => void;
  /** Avisa a página que há mudança pendente, para ela mostrar "salvando...". */
  onGravando?: (pendente: boolean) => void;
}) {
  const [menu, setMenu] = React.useState<EstadoMenu>(null);
  /* Portal só depois de montar: `document` não existe na renderização do
     servidor. Mesmo cuidado do Modal e do aviso em ui.tsx. */
  const [montado, setMontado] = React.useState(false);
  React.useEffect(() => setMontado(true), []);
  const relogio = React.useRef<ReturnType<typeof setTimeout> | null>(null);

  /*
   * `onMudar` e `onGravando` num ref.
   *
   * O editor é criado uma vez; se as funções entrassem direto no `onUpdate`,
   * ele guardaria a versão da primeira renderização e gravaria por cima de um
   * estado velho. O ref é sempre a atual.
   */
  const aoMudar = React.useRef(onMudar);
  const aoGravando = React.useRef(onGravando);
  aoMudar.current = onMudar;
  aoGravando.current = onGravando;

  const editor = useEditor({
    /* Sem renderização no servidor: o editor mexe no DOM na montagem, e o
       Next avisa de descompasso entre servidor e cliente sem isso. */
    immediatelyRender: false,
    extensions: [
      StarterKit.configure({
        /*
         * Clicar no link abre o link.
         *
         * Estava `openOnClick: false`, com o argumento de que dentro de um
         * editor o clique serve para pôr o cursor. Na prática o link ficava
         * inerte e o cursor de texto no hover prometia edição que também não
         * acontecia — o pior dos dois. Abrir é o que se espera de um link.
         *
         * Para editar o texto de um link, o jeito é clicar do lado dele e
         * andar com as setas, ou selecionar por cima com o mouse.
         */
        link: {
          openOnClick: true,
          autolink: true,
          defaultProtocol: "https",
          HTMLAttributes: { target: "_blank", rel: "noopener noreferrer" },
        },
      }),
      TaskList,
      /* `nested`: tarefa dentro de tarefa, que é o que o Tab faz numa lista. */
      TaskItem.configure({ nested: true }),
      Placeholder.configure({
        placeholder: ({ node }) =>
          node.type.name === "heading"
            ? "Título"
            : "Escreva, ou digite / para inserir um bloco",
        /* Só na linha onde está o cursor: a dica em toda linha vazia de uma
           nota comprida vira poluição. */
        showOnlyCurrent: true,
      }),
      /* `multicolor`: sem isso o Highlight é uma cor só, e o pedido era
         escolher a cor como num marca-texto de verdade. */
      Highlight.configure({ multicolor: true }),
      Destaque,
      MenuBarra.configure({ itens: ITENS, aoMudar: setMenu }),
    ],
    content: html,
    editorProps: {
      attributes: {
        class: "nota-corpo",
        /* Português para o corretor do navegador acertar. */
        lang: "pt-BR",
      },
    },
    onUpdate: ({ editor: ed }) => {
      /*
       * Compara com o que entrou antes de chamar de mudança.
       *
       * Abrir uma nota e sair não pode gravar nada, e há mais de um jeito de o
       * editor emitir `onUpdate` sem ninguém ter digitado: uma extensão que
       * normaliza o documento na montagem, ou o próprio ProseMirror ajustando o
       * que veio de um HTML que ele escreveria diferente. Sem esta comparação,
       * cada abertura de nota gravaria por cima dela.
       */
      const agora = ed.getHTML();
      if (agora === inicial.current) return;

      aoGravando.current?.(true);
      if (relogio.current) clearTimeout(relogio.current);
      relogio.current = setTimeout(() => {
        aoMudar.current(agora);
        /* O que foi gravado passa a ser a referência: sem isso, desfazer até o
           conteúdo original não seria reconhecido como mudança. */
        inicial.current = agora;
        relogio.current = null;
      }, ESPERA_MS);
    },
  });

  /* O conteúdo como o editor o entende, não como veio da página: o mesmo HTML
     pode ser escrito de duas formas, e comparar texto cru daria mudança falsa
     na primeira renderização. Preenchido na montagem, abaixo. */
  const inicial = React.useRef<string | null>(null);

  React.useEffect(() => {
    if (editor && inicial.current === null) inicial.current = editor.getHTML();
  }, [editor]);

  /*
   * Grava o que estiver pendente ao sair.
   *
   * Sem isto, fechar a página menos de um segundo depois da última tecla
   * perderia a última frase — e é justamente o que acontece quando se termina
   * de escrever e se clica em voltar.
   */
  React.useEffect(() => {
    if (!editor) return;
    return () => {
      /* Só grava se havia escrita pendente de verdade — `relogio` só existe
         depois de uma mudança que passou pela comparação acima. */
      if (!relogio.current) return;
      clearTimeout(relogio.current);
      relogio.current = null;
      const agora = editor.getHTML();
      if (agora !== inicial.current) aoMudar.current(agora);
    };
  }, [editor]);

  /* ------------------------------ alça ------------------------------ */

  const caixa = React.useRef<HTMLDivElement>(null);
  const [alca, setAlca] = React.useState<{ topo: number; pos: number } | null>(
    null
  );

  /**
   * Descobre qual bloco de primeiro nível o ponteiro está sobrevoando.
   *
   * `posAtCoords` devolve a posição mais funda — dentro do item de lista,
   * dentro da caixa de destaque. `$pos.before(1)` sobe até o bloco de fora, que
   * é o que faz sentido arrastar: mover meia lista para outro lugar deixaria as
   * duas metades erradas.
   */
  const acharBloco = React.useCallback(
    (x: number, y: number) => {
      if (!editor || !caixa.current) return null;
      const achado = editor.view.posAtCoords({ left: x, top: y });
      if (!achado) return null;
      const $pos = editor.state.doc.resolve(achado.pos);
      if ($pos.depth === 0) return null;
      const pos = $pos.before(1);
      const dom = editor.view.nodeDOM(pos);
      if (!(dom instanceof HTMLElement)) return null;
      const r = dom.getBoundingClientRect();
      const base = caixa.current.getBoundingClientRect();
      return { topo: r.top - base.top, pos };
    },
    [editor]
  );

  const aoMover = (e: React.MouseEvent) => {
    if (arrastando.current) return;
    setAlca(acharBloco(e.clientX, e.clientY));
  };

  const arrastando = React.useRef(false);

  /**
   * Começa o arraste.
   *
   * Seleciona o nó e entrega a fatia ao `view.dragging` — dali em diante quem
   * decide onde soltar é o ProseMirror, que já sabe calcular a posição pelo
   * ponteiro e mover o nó numa transação só. A imagem que segue o cursor é o
   * próprio bloco, pelo `setDragImage`.
   */
  const aoArrastar = (e: React.DragEvent) => {
    if (!editor || !alca) return;
    arrastando.current = true;
    const view = editor.view;
    const sel = NodeSelection.create(view.state.doc, alca.pos);
    view.dispatch(view.state.tr.setSelection(sel));

    /* `text/html` vazio, mas presente: sem nenhum dado o Firefox cancela o
       arraste antes de começar. */
    e.dataTransfer.effectAllowed = "move";
    e.dataTransfer.setData("text/html", "");

    const dom = view.nodeDOM(alca.pos);
    if (dom instanceof HTMLElement) e.dataTransfer.setDragImage(dom, 12, 12);

    view.dragging = { slice: sel.content(), move: true };
  };

  const aoSoltar = () => {
    arrastando.current = false;
    setAlca(null);
  };

  if (!editor) return null;

  const botao = (ativo: boolean) =>
    cx(
      "grid h-8 w-8 place-items-center rounded-lg transition-colors",
      ativo
        ? "bg-brand-500/15 text-brand-400"
        : "text-fg-mute hover:bg-ink-800 hover:text-fg"
    );

  return (
    <div
      ref={caixa}
      className="relative"
      onMouseMove={aoMover}
      onMouseLeave={() => !arrastando.current && setAlca(null)}
    >
      {/*
        A alça vive fora da coluna de texto, à esquerda.

        Uma alça por bloco, renderizada dentro do bloco, exigiria um NodeView
        para cada tipo de nó — e passaria a existir no HTML gravado. Uma só,
        movida para o bloco sobrevoado, não toca no documento.
      */}
      {alca && (
        <button
          type="button"
          draggable
          onDragStart={aoArrastar}
          onDragEnd={aoSoltar}
          aria-label="Arrastar bloco"
          title="Arraste para mover este bloco"
          className="absolute -left-7 z-10 grid h-6 w-6 cursor-grab place-items-center rounded-md text-fg-mute/70 transition-colors hover:bg-ink-800 hover:text-fg active:cursor-grabbing"
          style={{ top: alca.topo }}
        >
          <ChevronsUpDown size={13} />
        </button>
      )}

      {/*
        Barra que aparece com texto selecionado.

        Flutuante, e não fixa no topo: a barra fixa rouba uma faixa da tela em
        toda nota, inclusive nas que só têm três linhas de texto corrido.
      */}
      <BubbleMenu
        editor={editor}
        options={{ placement: "top" }}
        className="flex items-center gap-0.5 rounded-[14px] border border-line bg-white p-1 shadow-[0_8px_24px_-8px_rgb(20_24_26/0.25)]"
      >
        <button
          type="button"
          onClick={() => editor.chain().focus().toggleBold().run()}
          className={botao(editor.isActive("bold"))}
          aria-label="Negrito"
        >
          <Bold size={14} />
        </button>
        <button
          type="button"
          onClick={() => editor.chain().focus().toggleItalic().run()}
          className={botao(editor.isActive("italic"))}
          aria-label="Itálico"
        >
          <Italic size={14} />
        </button>
        <button
          type="button"
          onClick={() => editor.chain().focus().toggleStrike().run()}
          className={botao(editor.isActive("strike"))}
          aria-label="Riscado"
        >
          <Strikethrough size={14} />
        </button>
        <button
          type="button"
          onClick={() => editor.chain().focus().toggleCode().run()}
          className={botao(editor.isActive("code"))}
          aria-label="Código"
        >
          <Code size={14} />
        </button>

        <span className="mx-0.5 h-5 w-px bg-line" />

        <button
          type="button"
          onClick={() =>
            editor.chain().focus().toggleHeading({ level: 1 }).run()
          }
          className={botao(editor.isActive("heading", { level: 1 }))}
          aria-label="Título 1"
        >
          <Heading1 size={14} />
        </button>
        <button
          type="button"
          onClick={() =>
            editor.chain().focus().toggleHeading({ level: 2 }).run()
          }
          className={botao(editor.isActive("heading", { level: 2 }))}
          aria-label="Título 2"
        >
          <Heading2 size={14} />
        </button>
        <button
          type="button"
          onClick={() => editor.chain().focus().toggleBulletList().run()}
          className={botao(editor.isActive("bulletList"))}
          aria-label="Lista"
        >
          <List size={14} />
        </button>
        <button
          type="button"
          onClick={() => editor.chain().focus().toggleTaskList().run()}
          className={botao(editor.isActive("taskList"))}
          aria-label="Lista de tarefas"
        >
          <ListTodo size={14} />
        </button>
        <button
          type="button"
          onClick={() => editor.chain().focus().alternarDestaque("nota").run()}
          className={botao(editor.isActive("destaque"))}
          aria-label="Caixa de destaque"
        >
          <Lightbulb size={14} />
        </button>

        <span className="mx-0.5 h-5 w-px bg-line" />

        {/*
          As cinco canetas, como bolinhas.
          
          Direto na barra em vez de dentro de um submenu: marcar é um gesto de
          um toque, e esconder a cor atrás de um segundo clique dobraria o
          trabalho do gesto mais comum do marca-texto.
        */}
        {CANETAS.map((c) => (
          <button
            key={c.chave}
            type="button"
            onClick={() =>
              editor.chain().focus().toggleHighlight({ color: c.cor }).run()
            }
            aria-label={`Marcar de ${c.rotulo.toLowerCase()}`}
            title={c.rotulo}
            aria-pressed={editor.isActive("highlight", { color: c.cor })}
            className={cx(
              "grid h-8 w-6 place-items-center rounded-lg transition-colors hover:bg-ink-800"
            )}
          >
            <span
              className={cx(
                "h-4 w-4 rounded-full border transition-transform",
                editor.isActive("highlight", { color: c.cor })
                  ? "border-fg/35 scale-110"
                  : "border-line"
              )}
              style={{ background: c.cor }}
            />
          </button>
        ))}

        {/* Tirar a marca. Só aparece quando há marca para tirar — um botão
            que não faz nada é pior que a ausência dele. */}
        {editor.isActive("highlight") && (
          <button
            type="button"
            onClick={() => editor.chain().focus().unsetHighlight().run()}
            aria-label="Tirar a marca"
            title="Tirar a marca"
            className={botao(false)}
          >
            <Highlighter size={14} />
          </button>
        )}
      </BubbleMenu>

      <EditorContent editor={editor} />

      {/* ------------------------------ menu do "/" ------------------------------ */}
      {/*
        Num portal no fim do `body`, pelo mesmo motivo do Modal e do aviso: a
        animação `rise` da página aplica um `transform`, e um ancestral com
        transform vira o bloco de referência de `position: fixed`. Medido antes
        do portal: pedi `top: 253px` e o navegador pôs em 343px.
      */}
      {menu &&
        montado &&
        createPortal(
        <div
          /* `fixed` porque a coordenada vem do `coordsAtPos`, que é relativa à
             janela — e a caixa do editor rola. */
          className="fixed z-50 w-[248px] overflow-y-auto overscroll-contain rounded-[16px] border border-line bg-white p-1.5 shadow-[0_12px_32px_-8px_rgb(20_24_26/0.25)]"
          style={lugarDoMenu(menu)}
        >
          {menu.itens.map((item, i) => {
            const Icone = ICONE_ITEM[item.chave] ?? Type;
            return (
              <button
                key={item.chave}
                type="button"
                /* `mousedown` e não `click`: o clique tiraria o foco do editor
                   antes de rodar, e o bloco entraria sem cursor dentro. */
                onMouseDown={(e) => {
                  e.preventDefault();
                  item.rodar(editor, menu.faixa);
                }}
                /* Traz o item escolhido para dentro da vista: com a lista
                   rolando, as setas passavam a selecionar item que ninguém
                   estava vendo. */
                ref={
                  i === menu.indice
                    ? (el) =>
                        el?.scrollIntoView({ block: "nearest" })
                    : undefined
                }
                className={cx(
                  "flex w-full items-center gap-2.5 rounded-[10px] px-2.5 py-2 text-left transition-colors",
                  i === menu.indice ? "bg-brand-500/12" : "hover:bg-ink-800"
                )}
              >
                <span
                  className={cx(
                    "grid h-7 w-7 shrink-0 place-items-center rounded-md",
                    i === menu.indice
                      ? "bg-brand-500 text-on-brand"
                      : "bg-ink-800 text-fg-mute"
                  )}
                >
                  <Icone size={14} />
                </span>
                <span className="min-w-0">
                  <span className="block truncate text-[12.5px] font-semibold">
                    {item.titulo}
                  </span>
                  <span className="block truncate text-[10.5px] text-fg-mute">
                    {item.dica}
                  </span>
                </span>
              </button>
            );
          })}
        </div>,
          document.body
        )}
    </div>
  );
}

/**
 * Para onde o menu abre, e de que altura.
 *
 * Abre para baixo quando cabe; quando não cabe, abre para cima. E a altura
 * nunca passa do espaço disponível, porque um menu que estoura a janela deixa
 * itens inalcançáveis — não há para onde rolar a página com o menu preso ao
 * caractere.
 */
const FOLGA = 10;
const ALTURA_MINIMA = 150;

function lugarDoMenu(menu: NonNullable<EstadoMenu>): React.CSSProperties {
  const janela = typeof window === "undefined" ? 800 : window.innerHeight;
  const abaixo = janela - menu.y - FOLGA;
  const acima = menu.yTopo - FOLGA;

  /* Só sobe quando embaixo não cabe o mínimo e em cima cabe mais. */
  const paraCima = abaixo < ALTURA_MINIMA && acima > abaixo;

  return paraCima
    ? {
        left: menu.x,
        bottom: janela - menu.yTopo + 6,
        maxHeight: Math.min(300, acima),
      }
    : { left: menu.x, top: menu.y + 6, maxHeight: Math.min(300, abaixo) };
}

export type { TomDestaque };
