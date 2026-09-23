"use client";

import { Check, ChevronDown, X } from "lucide-react";
import * as React from "react";
import { createPortal } from "react-dom";

import { lerOpcoes } from "@/lib/opcoes";

export const cx = (...v: (string | false | null | undefined)[]) =>
  v.filter(Boolean).join(" ");

/* ------------------------------- Card ------------------------------- */

export function Card({
  className,
  children,
  ...rest
}: React.HTMLAttributes<HTMLDivElement>) {
  return (
    <div className={cx("card", className)} {...rest}>
      {children}
    </div>
  );
}


/* ------------------------------ Button ------------------------------ */

type BtnProps = React.ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: "primary" | "ghost" | "outline" | "danger" | "subtle";
  size?: "sm" | "md" | "icon";
};

export function Button({
  variant = "outline",
  size = "md",
  className,
  ...rest
}: BtnProps) {
  /*
   * O afundar no apertar, e o motivo de ele existir.
   *
   * O botao so respondia no hover -- ou seja, so respondia a mouse, e so antes
   * do clique. No telefone nao ha hover: entre encostar o dedo e a tela mudar
   * nao havia nada, e o intervalo era preenchido pela rede. Em conexao ruim o
   * botao parecia morto e a pessoa apertava de novo.
   *
   * `:active` vale a partir do pointer-down, nao do clique -- entao o retorno
   * chega no instante do toque, antes de qualquer resposta do servidor, e diz
   * apenas "recebi", que e justamente o que falta saber ali.
   *
   * O afundar em si saiu daqui e virou regra de elemento em globals.css, para
   * valer tambem nos 156 `<button>` escritos a mao nas telas. Ficou la e nao
   * aqui porque um botao do design system e um botao solto de uma tela devem
   * responder igual ao toque -- se respondessem diferente, o app ensinaria que
   * alguns botoes "pegam" e outros nao, sem que nada na aparencia diga qual e
   * qual.
   *
   * O que continua aqui e a transicao das cores e da sombra, que e propria
   * deste componente: a variante `outline` levanta a sombra no hover, e sem
   * `box-shadow` na lista ela saltava.
   */
  const base =
    "inline-flex items-center justify-center gap-2 rounded-xl font-medium transition-[color,background-color,border-color,box-shadow] duration-150 disabled:opacity-45 disabled:pointer-events-none select-none";
  const sizes = {
    sm: "h-8 px-3 text-xs",
    md: "h-10 px-4 text-sm",
    icon: "h-9 w-9 text-sm",
  }[size];
  const variants = {
    /*
     * O halo embaixo do botao cheio.
     *
     * O botao pintado com o accent e o unico elemento saturado da tela, e sem
     * nada embaixo ele fica como adesivo colado. `--brilho` e a luz que ele
     * mesmo emitiria -- a propria cor do botao, espalhada e empurrada para
     * baixo -- e por isso acompanha as cinco cores sem nada escrito aqui.
     * Ver `--brilho` em globals.css.
     *
     * No hover ele abre um pouco em vez de a cor so escurecer: as duas coisas
     * juntas leem como "o botao veio para frente", que e o que o hover quer
     * dizer.
     */
    primary:
      "bg-brand-500 text-on-brand shadow-[var(--brilho)] hover:bg-brand-600 hover:shadow-[var(--brilho-forte)]",
    outline: "bg-ink-900 text-fg-dim shadow-[var(--elev-1)] hover:text-fg hover:shadow-[var(--elev-2)]",
    ghost: "text-fg-mute hover:text-fg hover:bg-ink-800",
    subtle: "bg-ink-800 text-fg-dim hover:bg-brand-500/12 hover:text-brand-400",
    danger: "bg-neg/10 text-neg hover:bg-neg/20",
  }[variant];
  return <button className={cx(base, sizes, variants, className)} {...rest} />;
}

/* ------------------------------ Inputs ------------------------------ */

const fieldBase =
  "w-full rounded-[14px] border border-transparent bg-ink-800 px-3.5 text-sm text-fg placeholder:text-fg-mute transition-colors focus:border-brand-500 focus:bg-ink-900 focus:outline-none";

export function Input(props: React.InputHTMLAttributes<HTMLInputElement>) {
  const { className, ...rest } = props;
  return <input className={cx(fieldBase, "h-10", className)} {...rest} />;
}

export function Textarea(
  props: React.TextareaHTMLAttributes<HTMLTextAreaElement>
) {
  const { className, ...rest } = props;
  return (
    <textarea
      className={cx(fieldBase, "py-2.5 leading-relaxed", className)}
      {...rest}
    />
  );
}

/* ------------------------------ Select ------------------------------ */

/**
 * O seletor, desenhado por nós e não pelo sistema operacional.
 *
 * O `<select>` nativo tem um problema que nenhum CSS resolve: a caixa fechada
 * é um elemento da página e aceita estilo, mas **a lista que abre é desenhada
 * pelo sistema**. Ela ignora o tema, a fonte, o arredondamento e a cor de
 * destaque — no escuro abria um retângulo branco com realce azul do Windows
 * no meio de uma tela escura. Estilizar `<option>` não resolve: os navegadores
 * ignoram quase tudo ali, e o pouco que aceitam muda de sistema para sistema.
 *
 * Então a lista passa a ser nossa. O que isso custa está pago abaixo: teclado
 * (setas, Home/End, Enter, Esc e busca por letra), papéis de acessibilidade,
 * posicionamento e as regras de fechar.
 *
 * **A API é a mesma de antes, de propósito.** São 22 pontos de uso em 8 telas,
 * todos escrevendo `<Select value={x} onChange={(e) => ... e.target.value}>`
 * com `<option>` dentro. Trocar a assinatura obrigaria a mexer nos 22;
 * mantendo-a, nenhum precisou ser tocado — inclusive o que usa `<optgroup>`.
 */

const FOLGA_SELETOR = 6;
const ALTURA_MAXIMA = 288;

export function Select({
  className,
  children,
  value,
  onChange,
  disabled,
  ...rest
}: React.SelectHTMLAttributes<HTMLSelectElement>) {
  const opcoes = React.useMemo(() => lerOpcoes(children), [children]);
  const atual = String(value ?? "");
  const iSelecionado = opcoes.findIndex((o) => o.valor === atual);

  const [aberto, setAberto] = React.useState(false);
  const [emFoco, setEmFoco] = React.useState(0);
  const [lugar, setLugar] = React.useState<React.CSSProperties>({});
  const [teto, setTeto] = React.useState(ALTURA_MAXIMA);
  const [montado, setMontado] = React.useState(false);
  const botao = React.useRef<HTMLButtonElement>(null);
  const caixa = React.useRef<HTMLDivElement>(null);
  /* Busca por letra: junta as teclas digitadas em sequência, como o nativo. */
  const digitado = React.useRef({ texto: "", quando: 0 });
  const idLista = React.useId();

  React.useEffect(() => setMontado(true), []);

  const escolher = (valor: string) => {
    setAberto(false);
    botao.current?.focus();
    if (valor === atual) return;
    /*
     * O evento é montado à mão, porque não há `<select>` para emiti-lo.
     *
     * Os 22 pontos de uso leem `e.target.value` e nada mais; entregar isso
     * mantém todos funcionando sem alteração. Um evento completo do React não
     * existe aqui, e fingir um inteiro seria pior que este recorte declarado.
     */
    onChange?.({
      target: { value: valor },
      currentTarget: { value: valor },
    } as React.ChangeEvent<HTMLSelectElement>);
  };

  const abrir = () => {
    const b = botao.current;
    if (!b || disabled) return;
    const r = b.getBoundingClientRect();
    const desejada = Math.min(ALTURA_MAXIMA, opcoes.length * 34 + 12);

    /*
     * Escolhe o lado E limita a altura ao que existe de espaço.
     *
     * Só escolher o lado não basta: numa janela baixa a lista de 24 meses não
     * cabe nem abaixo nem acima, e a caixa saía pela borda da tela com as
     * últimas opções inalcançáveis — medido, `bottom` passava de
     * `innerHeight`. Agora, quando nenhum lado comporta a lista inteira, ela
     * vai para o lado mais folgado e encolhe até caber; o teto de rolagem
     * dentro dela dá conta do resto.
     */
    const abaixo = window.innerHeight - r.bottom - FOLGA_SELETOR * 2;
    const acima = r.top - FOLGA_SELETOR * 2;
    const cabeAbaixo = abaixo >= desejada || abaixo >= acima;
    const disponivel = Math.max(120, cabeAbaixo ? abaixo : acima);

    setTeto(Math.min(desejada, disponivel));
    setLugar({
      left: r.left,
      width: r.width,
      ...(cabeAbaixo
        ? { top: r.bottom + FOLGA_SELETOR }
        : { bottom: window.innerHeight - r.top + FOLGA_SELETOR }),
      transformOrigin: cabeAbaixo ? "50% 0" : "50% 100%",
    });
    setEmFoco(iSelecionado >= 0 ? iSelecionado : 0);
    setAberto(true);
  };

  /* Mesmas regras de dispensa do MenuSuspenso: clique fora, Escape e rolagem.
     A rolagem entra porque a caixa é `fixed` — sem isso ela ficaria parada no
     ar enquanto o campo vai embora. */
  React.useEffect(() => {
    if (!aberto) return;
    const foraDaqui = (e: PointerEvent) => {
      const alvo = e.target as Node;
      if (caixa.current?.contains(alvo) || botao.current?.contains(alvo)) return;
      setAberto(false);
    };
    /*
     * Fechar ao rolar vale para a PÁGINA, não para a lista.
     *
     * O ouvinte é de captura, então ele também recebe a rolagem de dentro da
     * própria caixa — e era isso que fazia a lista sumir no meio do arrasto da
     * barra de rolagem. O mesmo acontecia com as setas do teclado, que descem
     * mexendo no `scrollTop`: passar da última opção visível fechava o menu.
     * Rolagem que nasce dentro da caixa é ela fazendo o trabalho dela.
     */
    const aoRolar = (e: Event) => {
      const alvo = e.target;
      if (alvo instanceof Node && caixa.current?.contains(alvo)) return;
      setAberto(false);
    };
    document.addEventListener("pointerdown", foraDaqui);
    window.addEventListener("scroll", aoRolar, true);
    window.addEventListener("resize", aoRolar);
    return () => {
      document.removeEventListener("pointerdown", foraDaqui);
      window.removeEventListener("scroll", aoRolar, true);
      window.removeEventListener("resize", aoRolar);
    };
  }, [aberto]);

  /*
   * Rola a lista até a opção em foco mexendo no `scrollTop` da caixa, e não
   * com `scrollIntoView`.
   *
   * `scrollIntoView` rola o ancestral rolável mais próximo, e num portal no
   * body isso é a PÁGINA: abrir o seletor dava um salto na tela atrás dele.
   * Já aconteceu no menu do "/", e o conserto é o mesmo.
   */
  React.useEffect(() => {
    if (!aberto) return;
    const c = caixa.current;
    const alvo = c?.querySelector<HTMLElement>(`[data-i="${emFoco}"]`);
    if (!c || !alvo) return;
    const topo = alvo.offsetTop;
    const base = topo + alvo.offsetHeight;
    if (topo < c.scrollTop) c.scrollTop = topo;
    else if (base > c.scrollTop + c.clientHeight)
      c.scrollTop = base - c.clientHeight;
  }, [aberto, emFoco]);

  const naTecla = (e: React.KeyboardEvent) => {
    if (disabled) return;

    if (!aberto) {
      if (["Enter", " ", "ArrowDown", "ArrowUp"].includes(e.key)) {
        e.preventDefault();
        abrir();
      }
      return;
    }

    if (e.key === "Escape") {
      e.preventDefault();
      setAberto(false);
      botao.current?.focus();
      return;
    }
    if (e.key === "Enter" || e.key === " ") {
      e.preventDefault();
      escolher(opcoes[emFoco]?.valor ?? atual);
      return;
    }
    if (e.key === "Tab") {
      setAberto(false);
      return;
    }
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setEmFoco((i) => Math.min(i + 1, opcoes.length - 1));
      return;
    }
    if (e.key === "ArrowUp") {
      e.preventDefault();
      setEmFoco((i) => Math.max(i - 1, 0));
      return;
    }
    if (e.key === "Home") {
      e.preventDefault();
      setEmFoco(0);
      return;
    }
    if (e.key === "End") {
      e.preventDefault();
      setEmFoco(opcoes.length - 1);
      return;
    }

    /* Busca por letra, como no nativo: "ur" salta para "Urgente". Um segundo
       de pausa recomeça a palavra. */
    if (e.key.length === 1 && !e.metaKey && !e.ctrlKey && !e.altKey) {
      const agora = Date.now();
      const d = digitado.current;
      d.texto = agora - d.quando > 1000 ? e.key : d.texto + e.key;
      d.quando = agora;
      const procurado = d.texto.toLowerCase();
      const i = opcoes.findIndex((o) =>
        o.rotulo.toLowerCase().startsWith(procurado)
      );
      if (i >= 0) setEmFoco(i);
    }
  };

  const rotuloAtual = iSelecionado >= 0 ? opcoes[iSelecionado].rotulo : "";

  return (
    <>
      <button
        ref={botao}
        type="button"
        role="combobox"
        aria-haspopup="listbox"
        aria-expanded={aberto}
        aria-controls={aberto ? idLista : undefined}
        aria-label={rest["aria-label"]}
        disabled={disabled}
        /*
         * O `<label>` do `Field` embrulha este botão, e `<button>` é um
         * elemento rotulável — então clicar no texto "Prioridade" também
         * abre a lista, como acontecia com o `<select>` nativo. Medido:
         * chega exatamente uma ativação aqui, venha do botão ou do rótulo.
         */
        onClick={() => (aberto ? setAberto(false) : abrir())}
        onKeyDown={naTecla}
        className={cx(
          fieldBase,
          "flex h-10 items-center gap-2 pr-3 text-left",
          aberto && "border-brand-500 bg-ink-900",
          disabled && "cursor-not-allowed opacity-45",
          className
        )}
      >
        <span
          className={cx("min-w-0 flex-1 truncate", !rotuloAtual && "text-fg-mute")}
        >
          {rotuloAtual || "Selecione"}
        </span>
        <ChevronDown
          size={15}
          className={cx(
            "shrink-0 text-fg-mute transition-transform",
            aberto && "rotate-180"
          )}
        />
      </button>

      {aberto &&
        montado &&
        createPortal(
          <div
            ref={caixa}
            id={idLista}
            role="listbox"
            tabIndex={-1}
            aria-activedescendant={`${idLista}-${emFoco}`}
            style={{ ...lugar, maxHeight: teto }}
            className="brota fixed z-[70] overflow-y-auto overscroll-contain rounded-[14px] border border-line bg-ink-900 p-1.5 shadow-[var(--elev-3)]"
          >
            {opcoes.map((o, i) => {
              /* O rótulo do grupo entra antes da primeira opção dele. */
              const abreGrupo = o.grupo && o.grupo !== opcoes[i - 1]?.grupo;
              const escolhida = o.valor === atual;
              return (
                <React.Fragment key={`${o.grupo ?? ""}-${o.valor}-${i}`}>
                  {abreGrupo && (
                    <div
                      role="presentation"
                      className="px-2.5 pb-1 pt-2 text-[10.5px] font-bold uppercase tracking-[0.07em] text-fg-mute"
                    >
                      {o.grupo}
                    </div>
                  )}
                  <div
                    id={`${idLista}-${i}`}
                    data-i={i}
                    role="option"
                    aria-selected={escolhida}
                    onPointerEnter={() => setEmFoco(i)}
                    onClick={() => escolher(o.valor)}
                    className={cx(
                      /* Linha alta no telefone e baixa no ponteiro: 40px é o
                         alvo confortável para o dedo, e no mouse essa altura
                         faria uma lista de dez opções passar da tela. */
                      "flex cursor-pointer items-center gap-2 rounded-[10px] px-2.5 py-2.5 text-[13.5px] transition-colors sm:py-1.5",
                      escolhida ? "font-semibold text-brand-400" : "text-fg-dim",
                      i === emFoco && "bg-ink-800"
                    )}
                  >
                    <span className="min-w-0 flex-1 truncate">{o.rotulo}</span>
                    {escolhida && <Check size={14} className="shrink-0" />}
                  </div>
                </React.Fragment>
              );
            })}
          </div>,
          document.body
        )}
    </>
  );
}

export function Field({
  label,
  hint,
  children,
  className,
}: {
  label: string;
  hint?: string;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <label className={cx("block", className)}>
      <span className="mb-1.5 block text-[11px] font-medium uppercase tracking-wider text-fg-mute">
        {label}
      </span>
      {children}
      {hint && (
        <span className="mt-1 block text-[11px] text-fg-mute">{hint}</span>
      )}
    </label>
  );
}

/* ------------------------------ Badge ------------------------------ */

export function Badge({
  tone = "neutral",
  className,
  children,
}: {
  tone?:
    | "neutral"
    | "brand"
    | "pos"
    | "neg"
    | "warn"
    | "violet"
    /* Estes dois nao sao cores, sao PAPEIS: eles mudam de cor com o tema.
       No claro sao o accent e o roxo; no escuro sao cinza, porque la cinco
       cores na mesma linha de cartao viram um semaforo. Os valores estao em
       `--pri-media-*` e `--recorrente-*`, no globals.css. */
    | "media"
    | "recorrente";
  className?: string;
  children: React.ReactNode;
}) {
  const tones = {
    neutral: "bg-ink-800 text-fg-dim border-transparent",
    brand: "bg-brand-500/12 text-brand-400 border-transparent",
    pos: "bg-pos/12 text-pos border-transparent",
    neg: "bg-neg/12 text-neg border-transparent",
    warn: "bg-warn/12 text-warn border-transparent",
    /* `violeta` é token do app, e não o violet do Tailwind: o built-in tem um
       valor só, e um tom escolhido para fundo branco fica ilegível no escuro. */
    violet: "bg-violeta/12 text-violeta border-transparent",
    media:
      "border-transparent bg-[var(--pri-media-bg)] text-[var(--pri-media-txt)]",
    recorrente:
      "border-transparent bg-[var(--recorrente-bg)] text-[var(--recorrente-txt)]",
  }[tone];
  return (
    <span
      className={cx(
        "inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[11px] font-medium whitespace-nowrap",
        tones,
        className
      )}
    >
      {children}
    </span>
  );
}

/* ------------------------------ Segmented ------------------------------ */

export function Segmented<T extends string>({
  value,
  onChange,
  options,
}: {
  value: T;
  onChange: (v: T) => void;
  options: { value: T; label: string; count?: number }[];
}) {
  return (
    <div className="inline-flex items-center gap-1 rounded-[14px] bg-ink-800 p-1">
      {options.map((o) => (
        <button
          key={o.value}
          onClick={() => onChange(o.value)}
          className={cx(
            "h-7 rounded-lg px-3 text-xs font-medium transition-colors",
            value === o.value
              ? "bg-ink-900 text-brand-400 shadow-[var(--elev-1)]"
              : "text-fg-mute hover:text-fg-dim"
          )}
        >
          {o.label}
          {o.count !== undefined && (
            <span className="ml-1.5 opacity-60 tnum">{o.count}</span>
          )}
        </button>
      ))}
    </div>
  );
}

/* ------------------------------ Modal ------------------------------ */

/** Quantos modais estão abertos; a rolagem só volta quando chega a zero. */
let travas = 0;

export function Modal({
  open,
  onClose,
  title,
  sub,
  children,
  footer,
  size = "md",
}: {
  open: boolean;
  onClose: () => void;
  title: string;
  sub?: string;
  children: React.ReactNode;
  footer?: React.ReactNode;
  /* md serve para um formulário curto; lg para um com muitos campos, onde a
     coluna única de 512px empilha tudo e aperta; xl para conteúdo que é a
     própria tela, como o editor de anotação. */
  size?: "md" | "lg" | "xl";
}) {
  const caixa = React.useRef<HTMLDivElement>(null);

  /* Portal só depois de montar, para o HTML do servidor bater com o do cliente. */
  const [mounted, setMounted] = React.useState(false);
  React.useEffect(() => setMounted(true), []);

  /*
   * Fica montado durante a saída.
   *
   * Sem isto, fechar era instantâneo: `open` virava falso e o diálogo deixava
   * de existir no mesmo quadro, sem nada para animar. `saindo` mantém o portal
   * vivo pelos 130ms da animação e então desmonta de verdade.
   *
   * O tempo está aqui e no CSS, e é o tipo de duplicação que se paga: o valor
   * precisa ser conhecido pelo JavaScript para desmontar na hora certa.
   */
  const SAIDA_MS = 130;
  const [saindo, setSaindo] = React.useState(false);
  const eraAberto = React.useRef(open);

  /*
   * O último conteúdo aberto, para desenhar durante a saída.
   *
   * O pai costuma limpar o estado no mesmo gesto que fecha — `setVerId(null)`
   * junto do `onClose` — então `children` já vem vazio quando a animação
   * começa. Sem guardar, a saída animava uma caixa branca vazia, que é pior
   * que não animar nada.
   */
  const ultimo = React.useRef({ title, sub, children, footer });
  if (open) ultimo.current = { title, sub, children, footer };
  const mostrado = open ? { title, sub, children, footer } : ultimo.current;

  React.useEffect(() => {
    if (eraAberto.current && !open) {
      setSaindo(true);
      const id = setTimeout(() => setSaindo(false), SAIDA_MS);
      eraAberto.current = open;
      return () => clearTimeout(id);
    }
    eraAberto.current = open;
  }, [open]);

  /*
   * Foco e trava de rolagem: dependem de `open` e de `mounted`.
   *
   * Estavam no mesmo efeito do teclado, que depende de `onClose`. Como o pai
   * passa `onClose={() => setX(false)}`, a identidade muda a cada render, o
   * efeito refazia cleanup e setup toda vez, e o cleanup desfazia o próprio
   * trabalho: cancelava o frame que ia mover o foco para dentro e devolvia o
   * foco ao gatilho. O foco nunca entrava no diálogo.
   */
  React.useEffect(() => {
    if (!open) return;

    const anterior = document.activeElement as HTMLElement | null;

    /*
     * Foco síncrono no próprio diálogo, não num frame seguinte.
     *
     * requestAnimationFrame não funcionou aqui e o diagnóstico não fechou;
     * foco síncrono no efeito elimina a questão de tempo, e focar o container
     * em vez de um campo é o que faz o leitor de tela anunciar o diálogo em
     * vez de ler só o primeiro input solto. O Tab a partir dele entra nos
     * controles de dentro, então a armadilha continua valendo.
     *
     * Não sobrepõe quem já colocou o foco dentro via autoFocus.
     *
     * `mounted` está nas dependências porque o portal só existe no segundo
     * render. Quando o pai monta o Modal já com open=true — o caso de um modal
     * criado ao clicar, em vez de mantido montado com open alternando — o
     * primeiro render devolve null, `caixa.current` ainda é null, e sem
     * `mounted` o efeito nunca refazia: o foco ficava no body e o Esc e a
     * armadilha de Tab só passavam a valer depois de um clique dentro.
     */
    const cx = caixa.current;
    if (cx && !cx.contains(document.activeElement)) cx.focus();

    /* Contagem, não valor salvo: com dois modais em sequência, o segundo
       guardava "hidden" como estado anterior e travava o body ao fechar. */
    travas += 1;
    document.body.style.overflow = "hidden";

    return () => {
      travas = Math.max(0, travas - 1);
      if (travas === 0) document.body.style.overflow = "";
      anterior?.focus?.();
    };
  }, [open, mounted]);

  /* Teclado num efeito próprio, porque depende de onClose. */
  React.useEffect(() => {
    if (!open) return;

    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        onClose();
        return;
      }
      if (e.key !== "Tab") return;

      /*
       * Prende o Tab dentro do diálogo. O modal vive num portal no fim do
       * <body>, então sem isto o Tab saía para os controles da página atrás,
       * que seguem visíveis e clicáveis por trás do scrim.
       */
      const foco = caixa.current?.querySelectorAll<HTMLElement>(
        'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])'
      );
      if (!foco || !foco.length) return;
      const primeiro = foco[0];
      const ultimo = foco[foco.length - 1];
      if (e.shiftKey && document.activeElement === primeiro) {
        e.preventDefault();
        ultimo.focus();
      } else if (!e.shiftKey && document.activeElement === ultimo) {
        e.preventDefault();
        primeiro.focus();
      }
    };

    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  if ((!open && !saindo) || !mounted) return null;

  return createPortal(
    <div
      className={cx(
        "fixed inset-0 z-50 flex items-start justify-center overflow-y-auto p-3 sm:p-6",
        /* Durante a saída o diálogo não recebe mais clique: o conteúdo ainda
           está na tela por 130ms, e um clique aí agiria sobre algo que a pessoa
           já mandou fechar. */
        saindo && "pointer-events-none"
      )}
    >
      <div
        className={cx("fixed inset-0 bg-[var(--veu)]", saindo ? "fade-sai" : "fade")}
        onClick={onClose}
      />
      <div
        ref={caixa}
        role="dialog"
        aria-modal="true"
        aria-label={mostrado.title}
        /* -1: focável por script, fora da ordem natural do Tab */
        tabIndex={-1}
        className={cx(
          /*
           * Altura máxima com rolagem interna, em vez de deixar o diálogo
           * crescer e a página rolar por trás.
           *
           * Num formulário longo o rodapé ficava lá embaixo: a pessoa preenchia
           * e tinha que rolar procurando o Salvar. Assim cabeçalho e rodapé
           * ficam sempre à vista e só o miolo rola.
           */
          "relative z-10 my-auto flex max-h-[calc(100dvh-2rem)] w-full flex-col rounded-[20px] bg-ink-900 shadow-[var(--elev-4)] sm:max-h-[calc(100dvh-3rem)]",
          saindo ? "pop-sai" : "pop",
          size === "xl" ? "max-w-3xl" : size === "lg" ? "max-w-2xl" : "max-w-lg"
        )}
      >
        <div className="flex shrink-0 items-start justify-between gap-4 border-b border-line-soft px-5 py-4 sm:px-6 sm:py-5">
          <div>
            <h3 className="text-base font-semibold tracking-tight">
              {mostrado.title}
            </h3>
            {mostrado.sub && (
              <p className="mt-0.5 text-xs text-fg-mute">{mostrado.sub}</p>
            )}
          </div>
          <button
            onClick={onClose}
            aria-label="Fechar"
            className="rounded-lg p-1.5 text-fg-mute transition-colors hover:bg-ink-750 hover:text-fg"
          >
            <X size={16} />
          </button>
        </div>
        <div className="min-h-0 flex-1 overflow-y-auto px-5 py-5 sm:px-6">
          {mostrado.children}
        </div>
        {mostrado.footer && (
          <div className="flex shrink-0 items-center justify-end gap-2 border-t border-line-soft px-5 py-4 sm:px-6">
            {mostrado.footer}
          </div>
        )}
      </div>
    </div>,
    document.body
  );
}

/* ------------------------------ Empty ------------------------------ */

export function Empty({
  icon,
  title,
  sub,
  action,
}: {
  icon: React.ReactNode;
  title: string;
  sub?: string;
  action?: React.ReactNode;
}) {
  return (
    <div className="flex flex-col items-center justify-center px-6 py-14 text-center">
      <div className="mb-3 grid h-12 w-12 place-items-center rounded-[14px] bg-ink-800 text-fg-mute">
        {icon}
      </div>
      <p className="text-sm font-medium text-fg-dim">{title}</p>
      {sub && <p className="mt-1 max-w-sm text-xs text-fg-mute">{sub}</p>}
      {action && <div className="mt-4">{action}</div>}
    </div>
  );
}

/* ------------------------------ Skeleton ------------------------------ */

export function Skeleton({ className }: { className?: string }) {
  return <div className={cx("animate-pulse rounded-lg bg-fg/[0.07]", className)} />;
}

/*
 * O que a tela mostra enquanto os dados não chegaram.
 *
 * Nove das dez telas não mostravam nada: cinco faziam `if (loading) return
 * null`, que apaga a página inteira -- cabeçalho, título e tudo --, e quatro
 * devolviam `null` no lugar da lista. O `Skeleton` acima existia desde sempre
 * e não era usado em lugar nenhum.
 *
 * O buraco não durava pouco. Medido em Contas, no ar: o HTML fica pronto aos
 * 925ms, as consultas só disparam aos 990ms e o conteúdo aparece aos 1306ms.
 * São quase 400ms de branco depois de a página já estar montada -- e a
 * primeira abertura do dia é justamente a de manhã, que é para o que este app
 * existe. Tela vazia e tela quebrada têm a mesma aparência.
 *
 * O esqueleto não deixa nada mais rápido. Ele troca "não sei se travou" por
 * "está vindo, e vai ter esta forma" -- e, de quebra, o conteúdo real entra no
 * lugar onde o rascunho já estava, em vez de empurrar a página.
 */

/** Uma página inteira, para quem apagava tudo enquanto carregava. */
export function EsqueletoPagina({ blocos = 3 }: { blocos?: number }) {
  return (
    <div className="space-y-5" aria-busy="true" aria-label="Carregando">
      <div className="space-y-2">
        <Skeleton className="h-7 w-44" />
        <Skeleton className="h-3.5 w-60" />
      </div>
      <div className="space-y-4">
        {Array.from({ length: blocos }).map((_, i) => (
          <div key={i} className="card p-4">
            <EsqueletoLista linhas={3} />
          </div>
        ))}
      </div>
    </div>
  );
}

/**
 * Algumas linhas de lista.
 *
 * As larguras variam de propósito e não são aleatórias: linha de tamanho
 * idêntico lê como tabela vazia, e sorteada a cada render pisca a cada
 * atualização. O ciclo de quatro dá irregularidade de texto e fica estável.
 */
export function EsqueletoLista({ linhas = 4 }: { linhas?: number }) {
  const larguras = ["w-3/4", "w-1/2", "w-5/6", "w-2/3"];
  return (
    <div className="space-y-3" aria-busy="true" aria-label="Carregando">
      {Array.from({ length: linhas }).map((_, i) => (
        <div key={i} className="flex items-center gap-3">
          <Skeleton className="h-9 w-9 shrink-0 rounded-[10px]" />
          <div className="flex-1 space-y-1.5">
            <Skeleton className={cx("h-3", larguras[i % larguras.length])} />
            <Skeleton className="h-2.5 w-1/4" />
          </div>
        </div>
      ))}
    </div>
  );
}

/* ------------------------------ Confirm ------------------------------ */

/**
 * Confirmação. O texto do título e do botão são opcionais.
 *
 * Nasceu só para exclusão, com "Confirmar exclusão" e "Excluir" fixos. Quando
 * a regra do checklist passou a usar a mesma caixa para CONCLUIR, o aviso dizia
 * "Confirmar exclusão / Excluir" numa ação que não apaga nada — alarme falso na
 * hora errada. Os rótulos agora acompanham a ação.
 */
export function useConfirm() {
  const [state, setState] = React.useState<{
    open: boolean;
    text: string;
    titulo: string;
    rotulo: string;
    variante: "danger" | "primary";
    onYes: () => void;
  }>({
    open: false,
    text: "",
    titulo: "Confirmar exclusão",
    rotulo: "Excluir",
    variante: "danger",
    onYes: () => {},
  });

  const ask = (
    text: string,
    onYes: () => void,
    opcoes?: { titulo?: string; rotulo?: string; variante?: "danger" | "primary" }
  ) =>
    setState({
      open: true,
      text,
      titulo: opcoes?.titulo ?? "Confirmar exclusão",
      rotulo: opcoes?.rotulo ?? "Excluir",
      variante: opcoes?.variante ?? "danger",
      onYes,
    });

  const close = () => setState((s) => ({ ...s, open: false }));

  const node = (
    <Modal
      open={state.open}
      onClose={close}
      title={state.titulo}
      footer={
        <>
          <Button onClick={close}>Cancelar</Button>
          <Button
            variant={state.variante}
            onClick={() => {
              state.onYes();
              close();
            }}
          >
            {state.rotulo}
          </Button>
        </>
      }
    >
      <p className="text-sm text-fg-dim">{state.text}</p>
    </Modal>
  );

  return { ask, node };
}

/* ------------------------------ Notice ------------------------------ */

/**
 * Aviso flutuante para falha de banco.
 *
 * Antes, exclusões e atualizações descartavam o `error` devolvido pelo
 * Supabase: se o RLS ou a rede recusasse, a lista recarregava igual e a pessoa
 * achava que tinha dado certo. Agora a falha aparece.
 */
export function useNotice() {
  const [msg, setMsg] = React.useState("");

  React.useEffect(() => {
    if (!msg) return;
    const id = setTimeout(() => setMsg(""), 5000);
    return () => clearTimeout(id);
  }, [msg]);

  /*
   * `useCallback` porque estas funções entram em `load` e outros callbacks das
   * páginas. Recriadas a cada render, elas mudariam a identidade de quem as
   * usa; um `load` com `notice` nas dependências viraria um laço de releituras
   * sem fim. Estáveis, o laço não tem como nascer.
   */
  const show = React.useCallback((m: string) => setMsg(m), []);

  /** Passa o erro do Supabase; devolve true quando houve falha. */
  const check = React.useCallback(
    (error: { message: string } | null, quando: string) => {
      if (!error) return false;
      show(`Não foi possível ${quando}: ${error.message}`);
      return true;
    },
    [show]
  );

  const [mounted, setMounted] = React.useState(false);
  React.useEffect(() => setMounted(true), []);

  // portal pelo mesmo motivo do Modal: o `fixed` seria capturado pelo
  // containing block que a animação `rise` cria no wrapper da página.
  const node =
    msg && mounted
      ? createPortal(
          <div
            role="status"
            className="fixed bottom-5 left-1/2 z-[90] max-w-[92vw] -translate-x-1/2 rounded-full bg-neg px-4 py-3 text-center text-xs font-medium text-white shadow-[var(--elev-3)] pop"
          >
            {msg}
          </div>,
          document.body
        )
      : null;

  return React.useMemo(() => ({ show, check, node }), [show, check, node]);
}
