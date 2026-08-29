"use client";

import { X } from "lucide-react";
import * as React from "react";
import { createPortal } from "react-dom";

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

export function CardHead({
  title,
  sub,
  right,
}: {
  title: React.ReactNode;
  sub?: React.ReactNode;
  right?: React.ReactNode;
}) {
  return (
    <div className="flex items-start justify-between gap-4 px-5 pt-5 pb-4">
      <div className="min-w-0">
        <h2 className="text-[15px] font-semibold tracking-tight text-fg">
          {title}
        </h2>
        {sub && <p className="mt-0.5 text-xs text-fg-mute">{sub}</p>}
      </div>
      {right && <div className="shrink-0">{right}</div>}
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
  const base =
    "inline-flex items-center justify-center gap-2 rounded-xl font-medium transition-colors duration-150 disabled:opacity-45 disabled:pointer-events-none select-none";
  const sizes = {
    sm: "h-8 px-3 text-xs",
    md: "h-10 px-4 text-sm",
    icon: "h-9 w-9 text-sm",
  }[size];
  const variants = {
    primary: "bg-brand-500 text-on-brand hover:bg-brand-600",
    outline: "bg-white text-fg-dim shadow-[0_1px_2px_rgb(20_24_26/0.05)] hover:text-fg hover:shadow-[0_6px_20px_-8px_rgb(20_24_26/0.16)]",
    ghost: "text-fg-mute hover:text-fg hover:bg-ink-800",
    subtle: "bg-ink-800 text-fg-dim hover:bg-brand-500/12 hover:text-brand-400",
    danger: "bg-neg/10 text-neg hover:bg-neg/20",
  }[variant];
  return <button className={cx(base, sizes, variants, className)} {...rest} />;
}

/* ------------------------------ Inputs ------------------------------ */

const fieldBase =
  "w-full rounded-[14px] border border-transparent bg-ink-800 px-3.5 text-sm text-fg placeholder:text-fg-mute transition-colors focus:border-brand-500 focus:bg-white focus:outline-none";

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

export function Select(props: React.SelectHTMLAttributes<HTMLSelectElement>) {
  const { className, children, ...rest } = props;
  return (
    <select className={cx(fieldBase, "h-10 pr-8", className)} {...rest}>
      {children}
    </select>
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
  tone?: "neutral" | "brand" | "pos" | "neg" | "warn" | "violet";
  className?: string;
  children: React.ReactNode;
}) {
  const tones = {
    neutral: "bg-ink-800 text-fg-dim border-transparent",
    brand: "bg-brand-500/12 text-brand-400 border-transparent",
    pos: "bg-pos/12 text-pos border-transparent",
    neg: "bg-neg/12 text-neg border-transparent",
    warn: "bg-warn/12 text-warn border-transparent",
    violet: "bg-violet-500/12 text-violet-700 border-transparent",
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
              ? "bg-white text-brand-400 shadow-[0_1px_2px_rgb(20_24_26/0.05)]"
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
  wide,
}: {
  open: boolean;
  onClose: () => void;
  title: string;
  sub?: string;
  children: React.ReactNode;
  footer?: React.ReactNode;
  wide?: boolean;
}) {
  const caixa = React.useRef<HTMLDivElement>(null);

  /* Portal só depois de montar, para o HTML do servidor bater com o do cliente. */
  const [mounted, setMounted] = React.useState(false);
  React.useEffect(() => setMounted(true), []);

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

  if (!open || !mounted) return null;

  return createPortal(
    <div className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto p-4 sm:p-6">
      <div className="fixed inset-0 bg-fg/35 fade" onClick={onClose} />
      <div
        ref={caixa}
        role="dialog"
        aria-modal="true"
        aria-label={title}
        /* -1: focável por script, fora da ordem natural do Tab */
        tabIndex={-1}
        className={cx(
          "relative z-10 my-auto w-full rounded-[20px] bg-white shadow-[0_24px_60px_-20px_rgb(20_24_26/0.3)] pop",
          wide ? "max-w-3xl" : "max-w-lg"
        )}
      >
        <div className="flex items-start justify-between gap-4 border-b border-line-soft px-6 py-5">
          <div>
            <h3 className="text-base font-semibold tracking-tight">{title}</h3>
            {sub && <p className="mt-0.5 text-xs text-fg-mute">{sub}</p>}
          </div>
          <button
            onClick={onClose}
            aria-label="Fechar"
            className="rounded-lg p-1.5 text-fg-mute transition-colors hover:bg-ink-750 hover:text-fg"
          >
            <X size={16} />
          </button>
        </div>
        <div className="px-6 py-5">{children}</div>
        {footer && (
          <div className="flex items-center justify-end gap-2 border-t border-line-soft px-6 py-4">
            {footer}
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
  return <div className={cx("animate-pulse rounded-lg bg-black/[0.06]", className)} />;
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

  const show = (m: string) => setMsg(m);

  /** Passa o erro do Supabase; devolve true quando houve falha. */
  const check = (error: { message: string } | null, quando: string) => {
    if (!error) return false;
    show(`Não foi possível ${quando}: ${error.message}`);
    return true;
  };

  const [mounted, setMounted] = React.useState(false);
  React.useEffect(() => setMounted(true), []);

  // portal pelo mesmo motivo do Modal: o `fixed` seria capturado pelo
  // containing block que a animação `rise` cria no wrapper da página.
  const node =
    msg && mounted
      ? createPortal(
          <div
            role="status"
            className="fixed bottom-5 left-1/2 z-[90] max-w-[92vw] -translate-x-1/2 rounded-full bg-neg px-4 py-3 text-center text-xs font-medium text-white shadow-[0_6px_20px_-8px_rgb(20_24_26/0.4)] pop"
          >
            {msg}
          </div>,
          document.body
        )
      : null;

  return { show, check, node };
}
