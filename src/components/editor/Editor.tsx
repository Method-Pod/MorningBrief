"use client";

import * as React from "react";
import { createPortal } from "react-dom";
import { EditorContent, useEditor, type Editor as TEditor } from "@tiptap/react";
import StarterKit from "@tiptap/starter-kit";
import { TaskItem, TaskList } from "@tiptap/extension-list";
import { Placeholder } from "@tiptap/extensions";
import { Highlight } from "@tiptap/extension-highlight";
import { Color, FontSize, TextStyle } from "@tiptap/extension-text-style";
import { TextAlign } from "@tiptap/extension-text-align";
import { NodeSelection } from "@tiptap/pm/state";
import type { Range } from "@tiptap/core";
import {
  AlertTriangle,
  Check,
  Code,
  GripVertical,
  Heading1,
  Heading2,
  Heading3,
  Lightbulb,
  List,
  ListOrdered,
  ListTodo,
  Minus,
  Quote,
  Type,
} from "lucide-react";
import { Destaque, type TomDestaque } from "./Destaque";
import { MenuBarra, type EstadoMenu, type ItemMenu } from "./MenuBarra";
import { Barra, useBarraAberta } from "./Barra";
import { PainelRevisao } from "./PainelRevisao";
import {
  aplicarTroca,
  deslocar,
  faixaDoAchado,
  textoDoDoc,
  type Achado,
} from "./revisao";
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
  barraEm,
}: {
  /** Conteúdo inicial. Só é lido na montagem — depois o editor é a verdade. */
  html: string;
  onMudar: (html: string) => void;
  /** Avisa a página que há mudança pendente, para ela mostrar "salvando...". */
  onGravando?: (pendente: boolean) => void;
  /**
   * Onde desenhar a barra de formatação, quando não for aqui dentro.
   *
   * A barra pertence ao editor — ela precisa do estado dele para acender o
   * negrito e saber em que bloco o cursor está —, mas na tela ela fica acima
   * do título da nota, que é da página. Em vez de subir todo o estado do
   * editor para a página, a página empresta um lugar e a barra é desenhada
   * lá, por portal. O estado continua onde nasceu.
   *
   * Sem isto, a barra aparece no lugar de sempre, logo acima do texto.
   */
  barraEm?: HTMLElement | null;
}) {
  const [menu, setMenu] = React.useState<EstadoMenu>(null);

  /* Aberta ou fechada. Mora aqui e não dentro da `Barra` porque o efeito
     abaixo precisa do valor para grudar o lugar dela no topo. */
  const { aberta: barraAberta, alternar: alternarBarra } = useBarraAberta();

  /*
   * Quem gruda no topo é o lugar da barra, não a barra.
   *
   * `position: sticky` só desliza dentro do próprio pai. O pai aqui é o
   * `<div>` que a página empresta, e ele tem exatamente a altura da barra —
   * sem folga nenhuma para deslizar, então a barra subia e ia embora junto
   * com o resto. Grudar esse `<div>`, que é filho direto do container alto da
   * anotação, dá a ele a coluna inteira para deslizar.
   *
   * Classe aplicada no elemento emprestado, e não por `className`, porque
   * quem o desenha é a página e quem sabe se a barra está aberta é o editor.
   * Só duas classes, postas e tiradas juntas.
   *
   * Fechada não gruda, de propósito: fechada ela é um botão pequeno, e um
   * botão pequeno pendurado no alto da tela o tempo todo atrapalha mais do
   * que serve. Aberta é que ela precisa estar à mão enquanto se rola.
   */
  React.useEffect(() => {
    if (!barraEm) return;
    /* `top-4` e não `top-0`: colada no teto da janela a barra encosta no
       texto que passa por baixo e fica sem ar em volta. 16px de folga a
       deixam flutuando sobre a anotação, que é o que ela é. */
    const classes = ["sticky", "top-4", "z-30"];
    if (barraAberta) barraEm.classList.add(...classes);
    else barraEm.classList.remove(...classes);
    return () => barraEm.classList.remove(...classes);
  }, [barraEm, barraAberta]);

  /* A caixa do menu do "/" e o item selecionado dentro dela. */
  const caixaMenu = React.useRef<HTMLDivElement>(null);
  const itemSelecionado = React.useRef<HTMLButtonElement>(null);
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
      /*
       * Cor e tamanho da letra.
       *
       * `TextStyle` é o `<span style="...">` onde as duas moram; `Color` e
       * `FontSize` só sabem escrever dentro dele, e sem ele não funcionam —
       * daí os três juntos e nesta ordem.
       */
      TextStyle,
      Color,
      FontSize,
      /*
       * Alinhamento.
       *
       * Só em parágrafo e título. Item de lista alinhado à direita separa o
       * texto do marcador, que fica sozinho do outro lado da linha — e a
       * caixa de destaque tem alinhamento próprio do bloco de dentro.
       */
      TextAlign.configure({ types: ["heading", "paragraph"] }),
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

  /*
   * O menu do "/" acompanha o texto quando a página rola.
   *
   * Ele é `position: fixed` e a âncora era calculada uma vez, na abertura.
   * Rolar a página com o ponteiro fora da lista movia o texto e deixava o
   * menu parado no ar — medido: com 200px de rolagem, a distância entre o
   * cursor e o menu passava de 6px para 204px, e ele ficava boiando no meio
   * da tela, longe do "/" a que pertence.
   *
   * `capture` no ouvinte porque quem rola pode ser um elemento no meio do
   * caminho, e não a janela; eventos de rolagem não sobem, então sem a fase
   * de captura este ouvinte não veria.
   */
  const faixaAberta = React.useRef<number | null>(null);
  faixaAberta.current = menu ? menu.faixa.from : null;
  const menuAberto = !!menu;

  React.useEffect(() => {
    if (!menuAberto || !editor) return;

    const recolocar = () => {
      const de = faixaAberta.current;
      if (de === null) return;
      try {
        const c = editor.view.coordsAtPos(de);
        setMenu((m) =>
          m && (m.x !== c.left || m.y !== c.bottom)
            ? { ...m, x: c.left, y: c.bottom, yTopo: c.top }
            : m
        );
      } catch {
        /* A posição deixou de existir (o texto mudou por baixo): deixa o
           menu onde está; a próxima tecla o recoloca de todo jeito. */
      }
    };

    window.addEventListener("scroll", recolocar, true);
    window.addEventListener("resize", recolocar);
    return () => {
      window.removeEventListener("scroll", recolocar, true);
      window.removeEventListener("resize", recolocar);
    };
  }, [menuAberto, editor]);

  /*
   * Traz o item escolhido para dentro da vista — e só ele, e só quando muda.
   *
   * Era um `scrollIntoView` pendurado no `ref` do item selecionado. Dois
   * problemas nisso. O `ref` era uma função criada a cada renderização, então
   * o React a chamava de novo a cada renderização, não só quando a seleção
   * mudava. E `scrollIntoView`, mesmo com `block: "nearest"`, rola **todos**
   * os ancestrais roláveis até a janela: com o menu aberto e a lista rolada,
   * ele puxava a página junto, brigando com quem estivesse rolando.
   *
   * Aqui a conta é na mão, e só no `scrollTop` da própria caixa do menu:
   * nada fora dela se mexe, por construção.
   */
  React.useEffect(() => {
    const item = itemSelecionado.current;
    const caixa = caixaMenu.current;
    if (!item || !caixa) return;

    const topo = item.offsetTop;
    const base = topo + item.offsetHeight;
    if (topo < caixa.scrollTop) caixa.scrollTop = topo;
    else if (base > caixa.scrollTop + caixa.clientHeight)
      caixa.scrollTop = base - caixa.clientHeight;
  }, [menu?.indice, menu?.itens]);

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

  /* ------------------------------ revisão ------------------------------ */

  const [revisao, setRevisao] = React.useState<{
    achados: Achado[];
    aviso: string | null;
  } | null>(null);
  const [revisando, setRevisando] = React.useState(false);

  /**
   * Manda o texto ao corretor e monta a lista.
   *
   * O texto vai como texto puro, sem nada da formatação: o corretor não tem o
   * que fazer com negrito, e mandar HTML faria ele apontar erro dentro de
   * nome de etiqueta.
   */
  const revisar = React.useCallback(async () => {
    if (!editor || revisando) return;
    setRevisando(true);
    try {
      const { texto } = textoDoDoc(editor.state.doc);

      const r = await fetch("/api/ortografia", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ texto }),
      });
      const dados = await r.json();

      if (!r.ok) {
        setRevisao({
          achados: [],
          aviso: dados?.recado ?? "Não deu para revisar agora.",
        });
        return;
      }

      type Cru = {
        inicio: number;
        tamanho: number;
        errado: string;
        trocas: string[];
        motivo: string;
      };

      const achados: Achado[] = (dados.achados as Cru[]).map((a, i) => ({
        ...a,
        id: `${a.inicio}-${a.tamanho}-${i}`,
        /* O contexto sai do mesmo texto que foi enviado, então bate com as
           posições que voltaram. 34 caracteres de cada lado: dá para
           reconhecer a frase e ainda cabe numa linha da lista. */
        antes: texto.slice(Math.max(0, a.inicio - 34), a.inicio).replace(/\n/g, " "),
        depois: texto
          .slice(a.inicio + a.tamanho, a.inicio + a.tamanho + 34)
          .replace(/\n/g, " "),
      }));

      setRevisao({
        achados,
        aviso: dados.cortou
          ? "A nota é longa e só a primeira parte foi revisada."
          : achados.length === 0 && dados.total > 0
            ? "O corretor só achou questões de estilo, que esta revisão não mostra."
            : null,
      });
    } catch {
      setRevisao({ achados: [], aviso: "Não deu para falar com o corretor." });
    } finally {
      setRevisando(false);
    }
  }, [editor, revisando]);

  /**
   * Aplica uma correção e reposiciona as que sobraram.
   *
   * O mapa é remontado aqui, e não guardado da revisão: cada correção
   * aplicada muda as posições do documento, e um mapa velho faria a próxima
   * cair fora do lugar.
   */
  const aplicar = React.useCallback(
    (achado: Achado, troca: string) => {
      if (!editor) return;
      const { pedacos } = textoDoDoc(editor.state.doc);
      const faixa = faixaDoAchado(editor, pedacos, achado);

      setRevisao((atual) => {
        if (!atual) return atual;
        const restantes = atual.achados.filter((a) => a.id !== achado.id);

        /* O trecho mudou desde a revisão: some da lista sem trocar nada. Sem
           isto a correção cairia em cima de texto que ninguém revisou. */
        if (!faixa)
          return {
            achados: restantes,
            aviso: "Esse trecho mudou depois da revisão, e foi deixado de lado.",
          };

        aplicarTroca(editor, faixa, troca);
        return {
          achados: deslocar(
            restantes,
            achado.inicio,
            troca.length - achado.errado.length
          ),
          aviso: atual.aviso,
        };
      });
    },
    [editor]
  );

  /**
   * Aplica tudo de uma vez, do fim para o começo.
   *
   * De trás para frente porque uma correção só desloca o que vem depois
   * dela: começando pelo último, os anteriores continuam válidos e não
   * precisam de ajuste nenhum.
   */
  const aplicarTodas = React.useCallback(() => {
    if (!editor) return;
    const { pedacos } = textoDoDoc(editor.state.doc);

    setRevisao((atual) => {
      if (!atual) return atual;
      let feitas = 0;
      for (const a of [...atual.achados].sort((x, y) => y.inicio - x.inicio)) {
        const troca = a.trocas[0];
        if (!troca) continue;
        const faixa = faixaDoAchado(editor, pedacos, a);
        if (!faixa) continue;
        aplicarTroca(editor, faixa, troca);
        feitas++;
      }
      return {
        achados: [],
        aviso:
          feitas === atual.achados.length
            ? null
            : `${feitas} de ${atual.achados.length} aplicadas — o resto mudou desde a revisão.`,
      };
    });
  }, [editor]);

  if (!editor) return null;

  /**
   * A barra e o painel de revisão, desenhados aqui ou no lugar emprestado.
   *
   * `solta` quer dizer fora da coluna de texto: sem o recuo que compensa a
   * calha da alça de arrastar, porque acima do título não existe calha.
   */
  const comandos = ({ solta }: { solta: boolean }) => {
    const conteudo = (
      <>
        <Barra
          editor={editor}
          aoCorrigir={revisar}
          corrigindo={revisando}
          semRecuo={solta}
          aberta={barraAberta}
          alternar={alternarBarra}
        />
        {revisao && (
          <PainelRevisao
            achados={revisao.achados}
            aviso={revisao.aviso}
            aoAplicar={aplicar}
            aoIgnorar={(id: string) =>
              setRevisao((a) =>
                a ? { ...a, achados: a.achados.filter((x) => x.id !== id) } : a
              )
            }
            aoAplicarTodas={aplicarTodas}
            aoFechar={() => setRevisao(null)}
          />
        )}
      </>
    );
    return solta && barraEm ? createPortal(conteudo, barraEm) : conteudo;
  };

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
      {comandos(barraEm ? { solta: true } : { solta: false })}

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
          {/*
            Seis pontinhos, e não duas setas.
            
            Era `ChevronsUpDown` — uma seta para cima e outra para baixo —, e
            a primeira pessoa que viu perguntou o que era aquilo. Duas setas
            opostas são o desenho universal de "abre uma lista"; o de
            "segure e arraste" é a pega de pontinhos, que é o que o Notion e
            todo mundo usa para exatamente esta função.
          */}
          <GripVertical size={13} />
        </button>
      )}



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
          ref={caixaMenu}
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
                ref={i === menu.indice ? itemSelecionado : undefined}
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
