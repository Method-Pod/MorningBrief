"use client";

import * as React from "react";
import { createPortal } from "react-dom";
import { CalendarDays, ChevronLeft, ChevronRight } from "lucide-react";

import { cx, Input } from "./ui";
import {
  doMes,
  gradeDoMes,
  mesAdianteNoDia,
  mesDe,
  somarDias,
} from "@/lib/calendario";
import { todayISO } from "@/lib/format";
import { WEEKDAYS_SIGLA } from "@/lib/types";

/**
 * O calendário de escolher data, desenhado por nós — no computador.
 *
 * O que aparecia era o seletor do Chrome no Windows: fundo branco fixo,
 * tipografia do sistema, "Limpar/Hoje" em azul. Nenhum CSS do app chega nele,
 * então não havia como melhorá-lo: só havia como substituí-lo.
 *
 * NO CELULAR NÃO. Ali o `input[type=date]` abre a roda do sistema, que é
 * maior, rola com o dedo e a pessoa já conhece — um calendário meu num espaço
 * de 375px seria pior. A escolha é dele, perguntada. A detecção é
 * `pointer: coarse`, e até o componente montar ele se comporta como o nativo,
 * que é o padrão seguro: na dúvida, o do sistema.
 *
 * O campo continua sendo um `input[type=date]` de verdade, e não um botão com
 * cara de campo: digitar a data pelo teclado precisa continuar funcionando, e
 * o formulário precisa continuar tendo um campo de data. O que muda é quem
 * abre o calendário — o ícone nativo é escondido e o nosso botão abre o
 * popover.
 */

const LARGURA = 268;
const FOLGA = 6;
/** Altura estimada do popover, só para decidir se abre para baixo. */
const ALTURA = 332;

const nomeDoMes = (ym: string) => {
  const d = new Date(Number(ym.slice(0, 4)), Number(ym.slice(5, 7)) - 1, 1);
  const s = d.toLocaleDateString("pt-BR", { month: "long", year: "numeric" });
  return s.charAt(0).toUpperCase() + s.slice(1);
};

export function SeletorDeData({
  value,
  onChange,
  disabled,
  className,
  ...rest
}: Omit<React.InputHTMLAttributes<HTMLInputElement>, "value" | "onChange"> & {
  value: string;
  onChange: (valor: string) => void;
}) {
  const [nosso, setNosso] = React.useState(false);
  const [aberto, setAberto] = React.useState(false);
  const [lugar, setLugar] = React.useState<React.CSSProperties>({});
  /*
   * UM estado só, e o mês sai dele.
   *
   * Eram dois — `mes` e `foco` — que precisavam concordar, e cada tecla
   * escrevia nos dois. Segurando a seta, o React agrupa os eventos e todos os
   * manipuladores leem o MESMO `foco` antigo: a última tecla vencia e a data
   * pulava errado (de 22, uma seta para a direita e uma para baixo davam 29 em
   * vez de 30). Com o mês derivado e a atualização em forma de função, não há
   * dois valores para divergir nem leitura velha para agrupar.
   */
  const [foco, setFoco] = React.useState(() => value || todayISO());
  const mes = mesDe(foco);
  const campo = React.useRef<HTMLDivElement>(null);
  const caixa = React.useRef<HTMLDivElement>(null);

  /* Só depois de montar, e só onde o ponteiro é fino. Antes disso o campo é o
     nativo — certo no celular, e aceitável por um quadro no computador. */
  React.useEffect(() => {
    setNosso(!window.matchMedia("(pointer: coarse)").matches);
  }, []);

  /* O mês segue o valor quando ele muda de fora, como ao abrir para editar. */
  React.useEffect(() => {
    if (value) setFoco(value);
  }, [value]);

  const abrir = () => {
    const r = campo.current?.getBoundingClientRect();
    if (!r) return;
    const cabeAbaixo = window.innerHeight - r.bottom - FOLGA > ALTURA;
    setLugar({
      left: Math.min(
        Math.max(FOLGA, r.left),
        window.innerWidth - LARGURA - FOLGA
      ),
      width: LARGURA,
      ...(cabeAbaixo
        ? { top: r.bottom + FOLGA }
        : { bottom: window.innerHeight - r.top + FOLGA }),
    });
    setFoco(value || todayISO());
    setAberto(true);
  };

  React.useEffect(() => {
    if (!aberto) return;
    const fora = (e: PointerEvent) => {
      const alvo = e.target as Node;
      if (caixa.current?.contains(alvo) || campo.current?.contains(alvo)) return;
      setAberto(false);
    };
    const sair = () => setAberto(false);
    document.addEventListener("pointerdown", fora);
    window.addEventListener("resize", sair);
    /* Captura: o popover é `fixed` e ficaria parado no ar enquanto o campo
       sobe com o conteúdo rolando — mesma regra do Explicacao. */
    window.addEventListener("scroll", sair, true);
    return () => {
      document.removeEventListener("pointerdown", fora);
      window.removeEventListener("resize", sair);
      window.removeEventListener("scroll", sair, true);
    };
  }, [aberto]);

  const escolher = (iso: string) => {
    onChange(iso);
    setAberto(false);
  };

  /*
   * As setas andam pelo calendário, como no seletor do sistema.
   *
   * Sem teclado seria regressão: no nativo dá para chegar na data sem tirar a
   * mão do teclado, e trocar por um que só aceita clique seria ganhar desenho
   * e perder uso.
   */
  const naTecla = (e: React.KeyboardEvent) => {
    const passo: Record<string, number> = {
      ArrowLeft: -1,
      ArrowRight: 1,
      ArrowUp: -7,
      ArrowDown: 7,
    };
    if (e.key === "Escape") return setAberto(false);
    if (e.key === "Enter" || e.key === " ") {
      e.preventDefault();
      return escolher(foco);
    }
    if (e.key === "PageUp" || e.key === "PageDown") {
      e.preventDefault();
      const passoMes = e.key === "PageUp" ? -1 : 1;
      return setFoco((f) => mesAdianteNoDia(f, passoMes));
    }
    const n = passo[e.key];
    if (n === undefined) return;
    e.preventDefault();
    setFoco((f) => somarDias(f, n));
  };

  const hoje = todayISO();
  const dias = React.useMemo(() => gradeDoMes(mes), [mes]);

  return (
    <div ref={campo} className="relative">
      <Input
        {...rest}
        type="date"
        value={value}
        disabled={disabled}
        onChange={(e) => onChange(e.target.value)}
        className={cx(
          nosso && "pr-10 [&::-webkit-calendar-picker-indicator]:hidden",
          className
        )}
      />
      {nosso && (
        <button
          type="button"
          tabIndex={-1}
          aria-label="Abrir calendário"
          disabled={disabled}
          onClick={() => (aberto ? setAberto(false) : abrir())}
          className="absolute right-1 top-1/2 grid h-8 w-8 -translate-y-1/2 place-items-center rounded-[10px] text-fg-mute transition-colors hover:bg-ink-800 hover:text-fg disabled:opacity-40"
        >
          <CalendarDays size={15} />
        </button>
      )}

      {aberto &&
        createPortal(
          <div
            ref={caixa}
            role="dialog"
            aria-label="Escolher data"
            tabIndex={-1}
            autoFocus
            onKeyDown={naTecla}
            style={lugar}
            className="brota fixed z-[90] rounded-[18px] border border-line bg-ink-900 p-3 shadow-[var(--elev-3)] outline-none"
          >
            <div className="flex items-center justify-between gap-1">
              <button
                type="button"
                aria-label="Mês anterior"
                onClick={() => setFoco((f) => mesAdianteNoDia(f, -1))}
                className="grid h-7 w-7 place-items-center rounded-lg text-fg-mute transition-colors hover:bg-ink-800 hover:text-fg"
              >
                <ChevronLeft size={15} />
              </button>
              <span className="text-[12.5px] font-semibold text-fg">
                {nomeDoMes(mes)}
              </span>
              <button
                type="button"
                aria-label="Próximo mês"
                onClick={() => setFoco((f) => mesAdianteNoDia(f, 1))}
                className="grid h-7 w-7 place-items-center rounded-lg text-fg-mute transition-colors hover:bg-ink-800 hover:text-fg"
              >
                <ChevronRight size={15} />
              </button>
            </div>

            <div className="mt-2 grid grid-cols-7 gap-0.5">
              {WEEKDAYS_SIGLA.map((d, i) => (
                <span
                  key={i}
                  className="grid h-6 place-items-center text-[10px] font-semibold uppercase tracking-wider text-fg-mute"
                >
                  {d}
                </span>
              ))}
              {dias.map((iso) => {
                const deFora = !doMes(iso, mes);
                const escolhido = iso === value;
                return (
                  <button
                    key={iso}
                    type="button"
                    tabIndex={-1}
                    aria-current={iso === hoje ? "date" : undefined}
                    aria-pressed={escolhido}
                    onClick={() => escolher(iso)}
                    className={cx(
                      "grid h-8 place-items-center rounded-[10px] text-[12px] tnum transition-colors",
                      escolhido
                        ? "bg-brand-500 bg-[image:var(--a-degrade)] font-semibold text-on-brand shadow-[var(--brilho)]"
                        : iso === hoje
                          ? "font-semibold text-brand-400 ring-1 ring-inset ring-brand-500/40 hover:bg-ink-800"
                          : deFora
                            ? "text-fg-mute/45 hover:bg-ink-800"
                            : "text-fg-dim hover:bg-ink-800 hover:text-fg",
                      /* O foco do teclado é um anel fino, e não a cor de
                         escolhido: andar com a seta não é escolher. */
                      iso === foco && !escolhido && "ring-1 ring-inset ring-line"
                    )}
                  >
                    {Number(iso.slice(8, 10))}
                  </button>
                );
              })}
            </div>

            <div className="mt-2 flex items-center justify-between border-t border-line-soft pt-2">
              <button
                type="button"
                onClick={() => {
                  onChange("");
                  setAberto(false);
                }}
                className="rounded-lg px-2 py-1 text-[11.5px] font-medium text-fg-mute transition-colors hover:bg-ink-800 hover:text-fg"
              >
                Limpar
              </button>
              <button
                type="button"
                onClick={() => escolher(hoje)}
                className="rounded-lg px-2 py-1 text-[11.5px] font-semibold text-brand-400 transition-colors hover:bg-brand-500/12"
              >
                Hoje
              </button>
            </div>
          </div>,
          document.body
        )}
    </div>
  );
}
