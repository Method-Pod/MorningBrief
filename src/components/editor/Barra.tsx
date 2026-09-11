"use client";

import * as React from "react";
import { createPortal } from "react-dom";
import type { Editor as TEditor } from "@tiptap/react";
import {
  AlignCenter,
  AlignJustify,
  AlignLeft,
  AlignRight,
  Baseline,
  Bold,
  Check,
  ChevronDown,
  Code,
  Italic,
  Lightbulb,
  List,
  ListOrdered,
  ListTodo,
  Minus,
  Plus,
  SpellCheck2,
  Strikethrough,
} from "lucide-react";
import { cx } from "../ui";

/**
 * A barra de formatação da nota, fixa no topo.
 *
 * Antes isto era uma barra flutuante que só nascia com texto selecionado. O
 * argumento era poupar espaço, e ele não sobreviveu ao uso: quem nunca
 * selecionou um trecho nunca soube que existiam negrito, título ou
 * marca-texto. Controle que só aparece depois de você adivinhar o gesto não é
 * controle, é segredo.
 *
 * `sticky` e não `fixed`: ela acompanha a rolagem da nota mas continua dentro
 * da coluna de texto, então não cobre a barra lateral nem o cabeçalho.
 */

/* --------------------------------- cores --------------------------------- */

/**
 * Cor da letra.
 *
 * Sete, todas escolhidas para ter contraste suficiente sobre fundo branco —
 * um amarelo de letra seria ilegível, e por isso amarelo só existe no
 * marca-texto, onde é fundo e não tinta.
 */
const TINTAS = [
  { chave: "padrao", cor: null, rotulo: "Padrão" },
  { chave: "cinza", cor: "#6b7280", rotulo: "Cinza" },
  { chave: "vermelho", cor: "#c2410c", rotulo: "Vermelho" },
  { chave: "ambar", cor: "#a16207", rotulo: "Âmbar" },
  { chave: "verde", cor: "#15803d", rotulo: "Verde" },
  { chave: "azul", cor: "#1d4ed8", rotulo: "Azul" },
  { chave: "roxo", cor: "#6d28d9", rotulo: "Roxo" },
] as const;

/**
 * As cores do marca-texto.
 *
 * Cinco, e não uma paleta inteira: marca-texto serve para separar o que
 * importa do resto, e com doze cores a separação se perde — tudo fica marcado
 * de alguma coisa.
 */
export const CANETAS = [
  { chave: "amarelo", cor: "#fef08a", rotulo: "Amarelo" },
  { chave: "verde", cor: "#bbf7d0", rotulo: "Verde" },
  { chave: "azul", cor: "#bfdbfe", rotulo: "Azul" },
  { chave: "rosa", cor: "#fbcfe8", rotulo: "Rosa" },
  { chave: "laranja", cor: "#fed7aa", rotulo: "Laranja" },
] as const;

/**
 * Os tamanhos de letra sugeridos.
 *
 * Uma lista curta com um campo ao lado, e não uma coisa ou outra: quase toda
 * escolha é um dos seis, e esses custam um clique; quando nenhum serve, o
 * campo aceita qualquer número. 15 é o tamanho do corpo e por isso é o
 * "normal" — escolhê-lo tira o tamanho em vez de gravar 15px, senão a nota
 * ficaria cheia de marcação que não muda nada.
 */
const TAMANHOS = [
  { px: 12, rotulo: "12" },
  { px: 13, rotulo: "13" },
  { px: null, rotulo: "15" },
  { px: 18, rotulo: "18" },
  { px: 22, rotulo: "22" },
  { px: 28, rotulo: "28" },
] as const;

/**
 * Os limites do campo de tamanho livre.
 *
 * 8px é o menor tamanho que ainda se lê numa tela; abaixo disso o texto vira
 * textura. 96px já é maior que o Título 1 e ocupa duas linhas no telefone —
 * passando daí não é mais tamanho de letra, é cartaz. Quem digitar fora é
 * trazido para dentro em vez de ver um erro.
 */
const MENOR = 8;
const MAIOR = 96;

const BLOCOS = [
  { chave: "p", rotulo: "Texto", classe: "text-[13px]" },
  { chave: "h1", rotulo: "Título 1", classe: "text-[17px] font-bold" },
  { chave: "h2", rotulo: "Título 2", classe: "text-[15px] font-bold" },
  { chave: "h3", rotulo: "Título 3", classe: "text-[13.5px] font-bold" },
  { chave: "cita", rotulo: "Citação", classe: "text-[13px] italic" },
] as const;

/* ------------------------------- suspensos ------------------------------- */

/**
 * Painel que abre debaixo de um botão.
 *
 * Num portal no fim do `body` porque a animação `rise` da página aplica um
 * `transform`, e um ancestral com transform vira o bloco de referência de
 * `position: fixed` — o mesmo tropeço que o menu do "/" já teve, medido em
 * 90px de erro. A posição é calculada na hora de abrir.
 */
function Suspenso({
  rotulo,
  titulo,
  largura = 200,
  children,
  gatilho,
}: {
  rotulo: string;
  titulo?: string;
  largura?: number;
  children: (fechar: () => void) => React.ReactNode;
  gatilho: (aberto: boolean) => React.ReactNode;
}) {
  const [aberto, setAberto] = React.useState(false);
  const [lugar, setLugar] = React.useState<React.CSSProperties>({});
  const [montado, setMontado] = React.useState(false);
  const botao = React.useRef<HTMLButtonElement>(null);
  const caixa = React.useRef<HTMLDivElement>(null);

  React.useEffect(() => setMontado(true), []);

  const abrir = () => {
    const b = botao.current;
    if (!b) return;
    const r = b.getBoundingClientRect();
    setLugar({
      left: Math.max(8, Math.min(r.left, window.innerWidth - largura - 8)),
      top: r.bottom + 6,
    });
    setAberto(true);
  };

  React.useEffect(() => {
    if (!aberto) return;
    const fora = (e: PointerEvent) => {
      const alvo = e.target as Node;
      if (caixa.current?.contains(alvo) || botao.current?.contains(alvo)) return;
      setAberto(false);
    };
    const tecla = (e: KeyboardEvent) => e.key === "Escape" && setAberto(false);
    const rolou = () => setAberto(false);
    document.addEventListener("pointerdown", fora);
    document.addEventListener("keydown", tecla);
    window.addEventListener("scroll", rolou, true);
    window.addEventListener("resize", rolou);
    return () => {
      document.removeEventListener("pointerdown", fora);
      document.removeEventListener("keydown", tecla);
      window.removeEventListener("scroll", rolou, true);
      window.removeEventListener("resize", rolou);
    };
  }, [aberto]);

  return (
    <>
      <button
        ref={botao}
        type="button"
        /*
         * `mousedown` com `preventDefault` para não roubar o cursor.
         *
         * Sem isso o clique tira o foco do editor, a seleção some, e o
         * comando escolhido no painel não tem em que trecho ser aplicado.
         */
        onMouseDown={(e) => {
          e.preventDefault();
          aberto ? setAberto(false) : abrir();
        }}
        aria-label={rotulo}
        title={titulo ?? rotulo}
        aria-haspopup="menu"
        aria-expanded={aberto}
        className={cx(
          "flex h-8 shrink-0 items-center gap-1 rounded-lg px-1.5 text-[12px] font-semibold transition-colors",
          aberto ? "bg-ink-800 text-fg" : "text-fg-mute hover:bg-ink-800 hover:text-fg"
        )}
      >
        {gatilho(aberto)}
        <ChevronDown size={12} className="opacity-60" />
      </button>

      {aberto &&
        montado &&
        createPortal(
          <div
            ref={caixa}
            role="menu"
            onMouseDown={(e) => e.preventDefault()}
            className="pop fixed z-[70] overflow-hidden rounded-[14px] border border-line bg-white p-1.5 shadow-[0_12px_32px_-8px_rgb(20_24_26/0.25)]"
            style={{ width: largura, ...lugar }}
          >
            {children(() => setAberto(false))}
          </div>,
          document.body
        )}
    </>
  );
}

/** Uma linha de painel: rótulo à esquerda, tique à direita quando é a atual. */
function Linha({
  ativo,
  aoEscolher,
  children,
}: {
  ativo?: boolean;
  aoEscolher: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      role="menuitem"
      onClick={aoEscolher}
      className={cx(
        "flex w-full items-center gap-2.5 rounded-[10px] px-2.5 py-1.5 text-left text-[12.5px] transition-colors",
        ativo ? "bg-brand-500/12 text-fg" : "text-fg-dim hover:bg-ink-800 hover:text-fg"
      )}
    >
      <span className="min-w-0 flex-1 truncate">{children}</span>
      {ativo && <Check size={13} className="shrink-0 text-brand-400" />}
    </button>
  );
}

/** Título de seção dentro de um painel com mais de um assunto. */
function Secao({ children }: { children: React.ReactNode }) {
  return (
    <p className="px-2.5 pb-1 pt-1.5 text-[10px] font-bold uppercase tracking-wide text-fg-mute">
      {children}
    </p>
  );
}

/* --------------------------------- barra --------------------------------- */

export function Barra({
  editor,
  aoCorrigir,
  corrigindo,
  semRecuo,
}: {
  editor: TEditor;
  aoCorrigir: () => void;
  corrigindo: boolean;
  /** Desenhada fora da coluna de texto, onde não há calha de alça a compensar. */
  semRecuo?: boolean;
}) {
  /*
   * Redesenha a barra a cada mexida no editor.
   *
   * Os botões mostram o estado do trecho onde o cursor está — negrito aceso,
   * "Título 2" escrito no seletor de bloco. Nada disso é estado do React, e
   * sem forçar o redesenho a barra continuaria mostrando o que valia no
   * clique anterior.
   */
  const [, redesenhar] = React.useReducer((n: number) => n + 1, 0);
  React.useEffect(() => {
    editor.on("transaction", redesenhar);
    editor.on("selectionUpdate", redesenhar);
    return () => {
      editor.off("transaction", redesenhar);
      editor.off("selectionUpdate", redesenhar);
    };
  }, [editor]);

  const botao = (ativo: boolean) =>
    cx(
      "grid h-8 w-8 shrink-0 place-items-center rounded-lg transition-colors",
      ativo
        ? "bg-brand-500/15 text-brand-400"
        : "text-fg-mute hover:bg-ink-800 hover:text-fg"
    );

  const risco = <span className="mx-0.5 h-5 w-px shrink-0 bg-line" />;

  /* O bloco onde o cursor está, para escrever o nome no seletor. */
  const blocoAtual = editor.isActive("heading", { level: 1 })
    ? "h1"
    : editor.isActive("heading", { level: 2 })
      ? "h2"
      : editor.isActive("heading", { level: 3 })
        ? "h3"
        : editor.isActive("blockquote")
          ? "cita"
          : "p";

  const trocarBloco = (chave: string) => {
    const c = editor.chain().focus();
    if (chave === "p") c.setParagraph().run();
    else if (chave === "cita") c.setParagraph().toggleBlockquote().run();
    else c.setHeading({ level: Number(chave[1]) as 1 | 2 | 3 }).run();
  };

  /* A cor e o tamanho valem para o trecho onde o cursor está. */
  const tintaAtual = editor.getAttributes("textStyle").color as
    | string
    | undefined;
  const tamanhoAtual = editor.getAttributes("textStyle").fontSize as
    | string
    | undefined;

  /* O número que a barra mostra: o do trecho, ou o do corpo quando não há. */
  const emPx = tamanhoAtual ? parseInt(tamanhoAtual, 10) || 15 : 15;

  /**
   * O que está escrito no campo enquanto se digita.
   *
   * Separado do valor aplicado porque apagar para trocar de 18 para 22 passa
   * por "1", e aplicar o "1" no caminho encolheria o texto no meio da
   * digitação. O rascunho volta a acompanhar o trecho sempre que o cursor
   * muda de lugar.
   */
  const [rascunho, setRascunho] = React.useState(String(emPx));
  React.useEffect(() => setRascunho(String(emPx)), [emPx]);

  /** Aplica um tamanho digitado, trazendo para dentro dos limites. */
  const porTamanho = (n: number) => {
    if (!Number.isFinite(n)) return setRascunho(String(emPx));
    const px = Math.min(MAIOR, Math.max(MENOR, Math.round(n)));
    setRascunho(String(px));
    editor.chain().focus().setFontSize(`${px}px`).run();
  };

  return (
    <div
      /*
       * `overflow-x-auto` e nada de quebrar em duas linhas.
       *
       * No telefone a barra não cabe inteira, e uma barra de duas linhas come
       * um quinto da tela em toda nota. Rolando para o lado ela continua com
       * um dedo de altura, e o que fica escondido é o fim da fila — alinhar e
       * ortografia, que são os menos usados.
       *
       * `-ml-7` recupera a calha da alça de arrastar, quando a barra é
       * desenhada dentro da coluna de texto: a página abre 28px à esquerda
       * para a alça caber ali, e a barra não precisa desse recuo — medida,
       * ela perdia exatamente os 28px que faltavam para "Revisar" caber na
       * linha. Acima do título não há calha, e aí o recuo sai.
       *
       * `w-fit max-w-full` para a moldura terminar no último botão. Como
       * bloco, ela se esticava até o fim da coluna e sobrava uma faixa branca
       * depois de "Revisar" — vazia, mas com borda e fundo, então lia como
       * parte da barra que faltou preencher. Com `w-fit` a largura é a dos
       * controles; `max-w-full` mantém a rolagem lateral no telefone, onde os
       * controles passam da largura da tela.
       */
      className={cx(
        "sticky top-0 z-30 mb-3 flex w-fit max-w-full items-center gap-0.5 overflow-x-auto rounded-[14px] border border-line bg-white/95 px-1.5 py-1 backdrop-blur-sm [scrollbar-width:none] [&::-webkit-scrollbar]:hidden",
        semRecuo ? "" : "-ml-7 -mr-1"
      )}
    >
      {/* ---- tipo de bloco ---- */}
      <Suspenso
        rotulo="Tipo de bloco"
        largura={188}
        gatilho={() => (
          <span className="w-[52px] truncate text-left">
            {BLOCOS.find((b) => b.chave === blocoAtual)?.rotulo}
          </span>
        )}
      >
        {(fechar) =>
          BLOCOS.map((b) => (
            <Linha
              key={b.chave}
              ativo={b.chave === blocoAtual}
              aoEscolher={() => {
                trocarBloco(b.chave);
                fechar();
              }}
            >
              <span className={b.classe}>{b.rotulo}</span>
            </Linha>
          ))
        }
      </Suspenso>

      {risco}

      <button
        type="button"
        onMouseDown={(e) => e.preventDefault()}
        onClick={() => editor.chain().focus().toggleBold().run()}
        className={botao(editor.isActive("bold"))}
        aria-label="Negrito"
        title="Negrito · Ctrl+B"
      >
        <Bold size={14} />
      </button>
      <button
        type="button"
        onMouseDown={(e) => e.preventDefault()}
        onClick={() => editor.chain().focus().toggleItalic().run()}
        className={botao(editor.isActive("italic"))}
        aria-label="Itálico"
        title="Itálico · Ctrl+I"
      >
        <Italic size={14} />
      </button>
      <button
        type="button"
        onMouseDown={(e) => e.preventDefault()}
        onClick={() => editor.chain().focus().toggleStrike().run()}
        className={botao(editor.isActive("strike"))}
        aria-label="Riscado"
        title="Riscado"
      >
        <Strikethrough size={14} />
      </button>
      <button
        type="button"
        onMouseDown={(e) => e.preventDefault()}
        onClick={() => editor.chain().focus().toggleCode().run()}
        className={botao(editor.isActive("code"))}
        aria-label="Código"
        title="Código"
      >
        <Code size={14} />
      </button>

      {risco}

      {/* ---- cor da letra e marca-texto, no mesmo painel ---- */}
      {/*
        Os dois juntos porque são a mesma pergunta — "de que cor fica isto" —
        e separados custariam dois botões de 60px numa barra que já não cabe
        no telefone. O painel diz qual é qual em texto, o que dois ícones
        parecidos na barra não diriam.
      */}
      <Suspenso
        rotulo="Cores"
        titulo="Cor da letra e marca-texto"
        largura={196}
        gatilho={() => (
          <span className="grid h-5 w-5 place-items-center">
            <Baseline size={14} style={tintaAtual ? { color: tintaAtual } : undefined} />
          </span>
        )}
      >
        {(fechar) => (
          <>
            <Secao>Cor da letra</Secao>
            {TINTAS.map((t) => (
              <Linha
                key={t.chave}
                ativo={t.cor ? tintaAtual === t.cor : !tintaAtual}
                aoEscolher={() => {
                  const c = editor.chain().focus();
                  t.cor ? c.setColor(t.cor).run() : c.unsetColor().run();
                  fechar();
                }}
              >
                <span className="flex items-center gap-2.5">
                  <span
                    className="grid h-[18px] w-[18px] shrink-0 place-items-center rounded-[5px] border border-line text-[11px] font-bold"
                    style={{ color: t.cor ?? "var(--color-fg)" }}
                  >
                    A
                  </span>
                  {t.rotulo}
                </span>
              </Linha>
            ))}

            <span className="my-1 block h-px bg-line-soft" />

            <Secao>Marca-texto</Secao>
            {CANETAS.map((c) => (
              <Linha
                key={c.chave}
                ativo={editor.isActive("highlight", { color: c.cor })}
                aoEscolher={() => {
                  editor.chain().focus().toggleHighlight({ color: c.cor }).run();
                  fechar();
                }}
              >
                <span className="flex items-center gap-2.5">
                  <span
                    className="h-[18px] w-[18px] shrink-0 rounded-[5px] border border-line"
                    style={{ background: c.cor }}
                  />
                  {c.rotulo}
                </span>
              </Linha>
            ))}
            {editor.isActive("highlight") && (
              <Linha
                aoEscolher={() => {
                  editor.chain().focus().unsetHighlight().run();
                  fechar();
                }}
              >
                <span className="text-fg-mute">Tirar a marca</span>
              </Linha>
            )}
          </>
        )}
      </Suspenso>

      {/* ---- tamanho ---- */}
      <Suspenso
        rotulo="Tamanho da letra"
        largura={168}
        gatilho={() => (
          <span className="w-[18px] text-center tabular-nums">{emPx}</span>
        )}
      >
        {(fechar) => (
          <>
            {/*
              O campo primeiro, e a lista embaixo.
              
              Quem abre este painel querendo um tamanho que não está na lista
              já sabe o número que quer; quem quer um da lista acha do mesmo
              jeito logo abaixo. O contrário obrigaria a passar os olhos por
              seis linhas antes de achar onde digitar.
            */}
            <div className="flex items-center gap-1.5 px-1 pb-1.5 pt-0.5">
              <button
                type="button"
                onClick={() => porTamanho(emPx - 1)}
                aria-label="Diminuir"
                className="grid h-7 w-7 shrink-0 place-items-center rounded-lg text-fg-mute transition-colors hover:bg-ink-800 hover:text-fg"
              >
                <Minus size={13} />
              </button>
              <input
                type="number"
                min={MENOR}
                max={MAIOR}
                value={rascunho}
                onChange={(e) => setRascunho(e.target.value)}
                /* Enter aplica e fecha; sair do campo aplica e deixa aberto,
                   para dar para ajustar de novo olhando o resultado. */
                onKeyDown={(e) => {
                  if (e.key !== "Enter") return;
                  e.preventDefault();
                  porTamanho(Number(rascunho));
                  fechar();
                }}
                onBlur={() => porTamanho(Number(rascunho))}
                aria-label="Tamanho em pixels"
                className="h-7 w-full min-w-0 rounded-lg border border-line bg-white px-2 text-center text-[12.5px] font-semibold tabular-nums outline-none transition-colors focus:border-brand-500 [appearance:textfield] [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none"
              />
              <button
                type="button"
                onClick={() => porTamanho(emPx + 1)}
                aria-label="Aumentar"
                className="grid h-7 w-7 shrink-0 place-items-center rounded-lg text-fg-mute transition-colors hover:bg-ink-800 hover:text-fg"
              >
                <Plus size={13} />
              </button>
            </div>

            <span className="mb-1 block h-px bg-line-soft" />

            {TAMANHOS.map((t) => (
              <Linha
                key={t.rotulo}
                ativo={t.px ? tamanhoAtual === `${t.px}px` : !tamanhoAtual}
                aoEscolher={() => {
                  const c = editor.chain().focus();
                  t.px
                    ? c.setFontSize(`${t.px}px`).run()
                    : c.unsetFontSize().run();
                  fechar();
                }}
              >
                <span style={{ fontSize: Math.min(t.px ?? 15, 20) }}>
                  {t.rotulo}
                  {t.px === null && (
                    <span className="ml-1.5 text-[11px] text-fg-mute">
                      normal
                    </span>
                  )}
                </span>
              </Linha>
            ))}
          </>
        )}
      </Suspenso>

      {risco}

      <button
        type="button"
        onMouseDown={(e) => e.preventDefault()}
        onClick={() => editor.chain().focus().toggleBulletList().run()}
        className={botao(editor.isActive("bulletList"))}
        aria-label="Lista"
        title="Lista"
      >
        <List size={14} />
      </button>
      <button
        type="button"
        onMouseDown={(e) => e.preventDefault()}
        onClick={() => editor.chain().focus().toggleOrderedList().run()}
        className={botao(editor.isActive("orderedList"))}
        aria-label="Lista numerada"
        title="Lista numerada"
      >
        <ListOrdered size={14} />
      </button>
      <button
        type="button"
        onMouseDown={(e) => e.preventDefault()}
        onClick={() => editor.chain().focus().toggleTaskList().run()}
        className={botao(editor.isActive("taskList"))}
        aria-label="Lista de tarefas"
        title="Lista de tarefas"
      >
        <ListTodo size={14} />
      </button>
      <button
        type="button"
        onMouseDown={(e) => e.preventDefault()}
        onClick={() => editor.chain().focus().alternarDestaque("nota").run()}
        className={botao(editor.isActive("destaque"))}
        aria-label="Caixa de destaque"
        title="Caixa de destaque"
      >
        <Lightbulb size={14} />
      </button>

      {risco}

      {/* ---- alinhamento ---- */}
      {(
        [
          ["left", AlignLeft, "Alinhar à esquerda"],
          ["center", AlignCenter, "Centralizar"],
          ["right", AlignRight, "Alinhar à direita"],
          ["justify", AlignJustify, "Justificar"],
        ] as const
      ).map(([lado, Icone, rotulo]) => (
        <button
          key={lado}
          type="button"
          onMouseDown={(e) => e.preventDefault()}
          /*
           * Clicar no alinhamento que já está aceso volta ao padrão. Sem isso
           * não haveria como desfazer um "centralizar" a não ser adivinhando
           * que o padrão é "esquerda" — e num parágrafo justificado nem isso.
           */
          onClick={() =>
            editor.isActive({ textAlign: lado })
              ? editor.chain().focus().unsetTextAlign().run()
              : editor.chain().focus().setTextAlign(lado).run()
          }
          className={botao(editor.isActive({ textAlign: lado }))}
          aria-label={rotulo}
          title={rotulo}
        >
          <Icone size={14} />
        </button>
      ))}

      {risco}

      {/* ---- ortografia ---- */}
      <button
        type="button"
        onMouseDown={(e) => e.preventDefault()}
        onClick={aoCorrigir}
        disabled={corrigindo}
        className={cx(
          "flex h-8 shrink-0 items-center gap-1.5 rounded-lg px-2 text-[12px] font-semibold transition-colors",
          corrigindo
            ? "cursor-wait text-fg-mute"
            : "text-fg-mute hover:bg-ink-800 hover:text-fg"
        )}
        aria-label="Revisar ortografia"
        title="Revisar ortografia e acentuação"
      >
        <SpellCheck2 size={14} />
        {corrigindo ? "Lendo…" : "Revisar"}
      </button>
    </div>
  );
}
