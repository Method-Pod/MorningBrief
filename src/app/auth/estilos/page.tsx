"use client";

/*
 * BANCADA DE ESTILO — temporária, pública, dados de mentira.
 *
 * Existe porque três rodadas de ajuste no tema escuro geraram três
 * reclamações: eu escolhia os valores sem ver a tela, e "feio" não é um
 * número que eu possa medir sozinho. Aqui as opções ficam lado a lado, na
 * tela dele, e a escolha deixa de ser minha.
 *
 * Apagar depois que ele escolher.
 */

import * as React from "react";
import {
  CalendarDays,
  CheckCircle2,
  ListChecks,
  PieChart,
  Repeat2,
  StickyNote,
  Wallet,
} from "lucide-react";

import { Card, cx } from "@/components/ui";

/* ------------------------------ as paletas ------------------------------ */

type Paleta = {
  nome: string;
  nota: string;
  vars: Record<string, string>;
};

const PALETAS: Paleta[] = [
  {
    nome: "A · hoje",
    nota: "fundo L* 13,6 · cartão 18,3 · texto 11:1",
    vars: {
      "--a-bg": "#212325",
      "--sup-cartao": "#2b2d2f",
      "--a-sink": "#35373a",
      "--sup-alta": "#3a3d40",
      "--a-line": "#414347",
      "--a-line-soft": "#373a3d",
      "--borda-forte": "#565a5f",
      "--txt": "#e2e6e9",
      "--txt-dim": "#a6b0b7",
      "--txt-mute": "#97a2aa",
      "--bloco-1": "#3e454d",
      "--bloco-2": "#2f3840",
    },
  },
  {
    nome: "B · fundo baixo",
    nota: "a escada do GitHub: fundo L* 5 · borda +19 · texto 15,6:1",
    vars: {
      "--a-bg": "#101112",
      "--sup-cartao": "#191b1d",
      "--a-sink": "#222426",
      "--sup-alta": "#27292c",
      "--a-line": "#414347",
      "--a-line-soft": "#2e3034",
      "--borda-forte": "#565a5f",
      "--txt": "#eff4f7",
      "--txt-dim": "#a7b2b9",
      "--txt-mute": "#8a949c",
      "--bloco-1": "#2e3034",
      "--bloco-2": "#222426",
    },
  },
  {
    nome: "C · quase preto",
    nota: "a escada do Linear: fundo L* 2,4 · cartão 5 · texto 17:1",
    vars: {
      "--a-bg": "#08090a",
      "--sup-cartao": "#101113",
      "--a-sink": "#191b1d",
      "--sup-alta": "#1e2022",
      "--a-line": "#27292c",
      "--a-line-soft": "#1f2123",
      "--borda-forte": "#3b3e41",
      "--txt": "#eff4f7",
      "--txt-dim": "#a4aeb4",
      "--txt-mute": "#858f96",
      "--bloco-1": "#1f2123",
      "--bloco-2": "#191b1d",
    },
  },
];

/* ------------------------------ dados falsos ------------------------------ */

const HOJE = [
  { t: "Story orgânico | campanha", c: "Cliente A · Projeto 1", feita: true },
  { t: "Banners do curso | materiais", c: "Cliente A · Projeto 2", feita: true },
  { t: "Agenda da semana", c: "Cliente B · Podcast", feita: false },
];

const SECUNDARIOS = [
  { icone: <StickyNote size={14} />, titulo: "Anotações", linha: "Anotações avulsas" },
  { icone: <Repeat2 size={14} />, titulo: "Recorrentes", linha: "2 rodaram hoje" },
  { icone: <CalendarDays size={14} />, titulo: "Agenda", linha: "Reunião · 19h" },
];

const NUMEROS: [string, string, string | null][] = [
  ["Contas do mês", "R$ 3.180,00", null],
  ["Vencido", "R$ 320,00", "bg-neg"],
  ["A vencer", "R$ 920,00", "bg-[var(--cor-barra)]"],
  ["Hábitos hoje", "2/3", "bg-pos"],
];

/* ------------------------------ peças ------------------------------ */

function Cabeca({ icone, titulo }: { icone: React.ReactNode; titulo: string }) {
  return (
    <div className="flex items-center justify-between gap-3 px-[18px] pt-[17px]">
      <span className="flex items-center gap-2 text-[11px] font-semibold uppercase tracking-[0.1em] text-fg-mute">
        <span className="grid h-[22px] w-[22px] shrink-0 place-items-center rounded-[7px] bg-brand-500/12 text-brand-400">
          {icone}
        </span>
        {titulo}
      </span>
      <span className="text-xs text-fg-mute">ver todas</span>
    </div>
  );
}

function Linha({ t, c, feita }: { t: string; c: string; feita: boolean }) {
  return (
    <div className="flex items-start gap-2.5 border-b border-line-soft py-2.5 last:border-0">
      <span
        className={cx(
          "mt-[2px] grid h-[18px] w-[18px] shrink-0 place-items-center rounded-full border",
          feita ? "border-transparent bg-brand-500 text-on-brand" : "border-ink-600"
        )}
      >
        {feita && <CheckCircle2 size={12} />}
      </span>
      <span className="min-w-0 flex-1">
        <span className={cx("block truncate text-[13px]", feita && "text-fg-mute line-through")}>
          {t}
        </span>
        <span className="mt-0.5 block truncate text-[11px] text-fg-mute">{c}</span>
      </span>
    </div>
  );
}

function Anel({ pct }: { pct: number }) {
  const R = 34;
  const C = 2 * Math.PI * R;
  return (
    <div className="relative shrink-0">
      <svg width="82" height="82" viewBox="0 0 82 82" className="-rotate-90">
        <circle cx="41" cy="41" r={R} fill="none" stroke="rgb(255 255 255 / 0.16)" strokeWidth="7" />
        <circle
          cx="41"
          cy="41"
          r={R}
          fill="none"
          stroke="var(--a)"
          strokeWidth="7"
          strokeLinecap="round"
          strokeDasharray={C.toFixed(1)}
          strokeDashoffset={(C * (1 - pct / 100)).toFixed(1)}
        />
      </svg>
      <span className="absolute inset-0 grid place-items-center text-[14px] font-bold">
        {pct}%
      </span>
    </div>
  );
}

/* --------------------------- estrutura A: a de hoje --------------------------- */

function EstruturaAtual() {
  return (
    <>
      <div className="grid grid-cols-1 gap-4 xl:grid-cols-[300px_minmax(0,1fr)]">
        <div className="flex flex-col rounded-[22px] bg-gradient-to-br from-[var(--bloco-1)] to-[var(--bloco-2)] p-[22px] text-white">
          <div className="flex items-start justify-between gap-4">
            <div>
              <p className="text-[10.5px] font-bold uppercase tracking-[0.14em] text-white/60">
                Seu dia
              </p>
              <p className="mt-2 text-[40px] font-bold leading-none tracking-[-0.04em]">
                2<span className="text-[0.5em] font-semibold opacity-60">/3</span>
              </p>
              <p className="mt-1.5 text-[13px] text-white/70">tarefas concluídas hoje</p>
            </div>
            <Anel pct={67} />
          </div>
          <div className="mt-auto grid grid-cols-3 gap-2 pt-[22px] text-center">
            {[["2", "feitas"], ["2", "recorrentes"], ["1", "na agenda"]].map(([v, l]) => (
              <div key={l} className="rounded-[14px] bg-white/10 py-2">
                <p className="text-[15px] font-bold">{v}</p>
                <p className="text-[10px] text-white/60">{l}</p>
              </div>
            ))}
          </div>
        </div>

        <Card className="flex flex-col">
          <Cabeca icone={<ListChecks size={14} />} titulo="Hoje" />
          <div className="flex-1 px-[18px] pb-[18px] pt-2">
            {HOJE.map((x) => (
              <Linha key={x.t} {...x} />
            ))}
          </div>
        </Card>
      </div>

      <div className="mt-4 grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-4">
        {SECUNDARIOS.map((s) => (
          <Card key={s.titulo}>
            <Cabeca icone={s.icone} titulo={s.titulo} />
            <div className="px-[18px] pb-[18px] pt-3 text-[13px] text-fg-dim">{s.linha}</div>
          </Card>
        ))}
        <Card>
          <Cabeca icone={<PieChart size={14} />} titulo="Resumo de outubro" />
          <div className="px-[18px] pb-[18px] pt-3">
            <div className="grid grid-cols-2 gap-x-4 gap-y-3">
              {NUMEROS.slice(0, 4).map(([r, v, p]) => (
                <div key={r}>
                  <span className="flex items-center gap-1.5 text-[11.5px] text-fg-mute">
                    {p && <span className={cx("h-[7px] w-[7px] rounded-full", p)} />}
                    {r}
                  </span>
                  <span className="mt-0.5 block text-[17px] font-bold tracking-[-0.03em] tnum">
                    {v}
                  </span>
                </div>
              ))}
            </div>
          </div>
        </Card>
      </div>
    </>
  );
}

/* --------------------------- estrutura B: hierarquia --------------------------- */

function EstruturaProposta() {
  return (
    <>
      {/*
        "Seu dia" e "Hoje" viram UM cartão.

        Hoje são dois cartões lado a lado mostrando o mesmo conjunto: o anel
        conta exatamente as linhas que a lista ao lado mostra. Separados, o
        número e a lista competem; juntos, o número vira o cabeçalho da lista.
      */}
      <Card className="overflow-hidden">
        <div className="flex items-center gap-5 bg-gradient-to-br from-[var(--bloco-1)] to-[var(--bloco-2)] p-[22px] text-white">
          <Anel pct={67} />
          <div className="min-w-0">
            <p className="text-[10.5px] font-bold uppercase tracking-[0.14em] text-white/60">
              Seu dia
            </p>
            <p className="mt-1 text-[34px] font-bold leading-none tracking-[-0.05em]">
              2<span className="text-[0.5em] font-semibold opacity-60">/3</span>
              <span className="ml-2.5 align-middle text-[13px] font-medium opacity-70">
                tarefas concluídas hoje
              </span>
            </p>
            <div className="mt-3 flex flex-wrap gap-x-4 gap-y-1 text-[11.5px] text-white/70">
              <span>2 recorrentes</span>
              <span>1 na agenda</span>
              <span>1 vence hoje</span>
            </div>
          </div>
        </div>
        <div className="px-[18px] pb-[18px] pt-2">
          {HOJE.map((x) => (
            <Linha key={x.t} {...x} />
          ))}
        </div>
      </Card>

      {/*
        Faixa de números: uma linha, sem cartão por valor.

        Quatro cartões de mesmo tamanho para quatro números curtos gastam a
        tela toda para dizer quatro frases. Em faixa, eles se leem de uma vez
        e devolvem o espaço para o que tem conteúdo.
      */}
      <div className="mt-4 grid grid-cols-2 gap-px overflow-hidden rounded-[18px] border border-line bg-line sm:grid-cols-4">
        {NUMEROS.map(([r, v, p]) => (
          <div key={r} className="bg-ink-900 px-4 py-3.5">
            <span className="flex items-center gap-1.5 text-[11px] text-fg-mute">
              {p && <span className={cx("h-[6px] w-[6px] rounded-full", p)} />}
              {r}
            </span>
            <span className="mt-1 block text-[19px] font-bold tracking-[-0.04em] tnum">{v}</span>
          </div>
        ))}
      </div>

      <div className="mt-4 grid grid-cols-1 gap-4 md:grid-cols-3">
        {SECUNDARIOS.map((s) => (
          <Card key={s.titulo}>
            <Cabeca icone={s.icone} titulo={s.titulo} />
            <div className="px-[18px] pb-[18px] pt-3 text-[13px] text-fg-dim">{s.linha}</div>
          </Card>
        ))}
      </div>
    </>
  );
}

/* ------------------------------ quadro ------------------------------ */

function Quadro() {
  const colunas: [string, string, { t: string; p: string }[]][] = [
    ["A fazer", "bg-ink-600", [{ t: "Linktree do cliente", p: "Média" }, { t: "Rebranding das thumbs", p: "Média" }]],
    ["Em andamento", "bg-brand-400", [{ t: "Agenda do mês", p: "Alta" }]],
    ["Concluída", "bg-pos", [{ t: "Corte para o canal", p: "Média" }]],
  ];
  return (
    <div className="grid gap-3 md:grid-cols-3">
      {colunas.map(([nome, cor, itens]) => (
        <div key={nome} className="flex min-h-[150px] flex-col rounded-2xl border border-line bg-ink-900/40 p-2.5">
          <div className="flex items-center gap-2 px-2 py-2">
            <span className={cx("h-2 w-2 rounded-full", cor)} />
            <span className="text-[13px] font-medium">{nome}</span>
            <span className="text-[11px] text-fg-mute tnum">{itens.length}</span>
          </div>
          <div className="flex flex-col gap-2">
            {itens.map((i) => (
              <div key={i.t} className="rounded-xl border border-line bg-ink-850 p-3">
                <p className="text-[13px] font-medium leading-snug">{i.t}</p>
                <div className="mt-2.5 flex items-center gap-1.5">
                  <span className="rounded-full bg-ink-800 px-2 py-0.5 text-[11px] text-fg-dim">
                    {i.p}
                  </span>
                  <span className="text-[10px] text-fg-mute">Cliente A · Canal</span>
                </div>
              </div>
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}

/* ------------------------------ a página ------------------------------ */

export default function Estilos() {
  const [paleta, setPaleta] = React.useState(1);
  const [estrutura, setEstrutura] = React.useState(1);
  const [degrade, setDegrade] = React.useState(true);

  React.useEffect(() => {
    document.documentElement.dataset.tema = "escuro";
    return () => {
      delete document.documentElement.dataset.tema;
    };
  }, []);

  const p = PALETAS[paleta];

  return (
    <div
      style={p.vars as React.CSSProperties}
      className="min-h-dvh bg-ink-950 text-fg"
    >
      <div className="mx-auto max-w-[1080px] px-4 py-6">
        <p className="text-[11px] font-bold uppercase tracking-[0.1em] text-fg-mute">
          Bancada de estilo · dados de mentira
        </p>

        <div className="mt-3 flex flex-col gap-3 sm:flex-row sm:items-start sm:gap-8">
          <div>
            <p className="mb-1.5 text-[11px] font-semibold text-fg-dim">Fundo</p>
            <div className="flex flex-wrap gap-1.5">
              {PALETAS.map((x, i) => (
                <button
                  key={x.nome}
                  type="button"
                  onClick={() => setPaleta(i)}
                  className={cx(
                    "rounded-full px-3 py-1.5 text-[12px] font-semibold transition-colors",
                    i === paleta
                      ? "bg-brand-500 text-on-brand"
                      : "bg-ink-800 text-fg-dim hover:text-fg"
                  )}
                >
                  {x.nome}
                </button>
              ))}
            </div>
          </div>

          <div>
            <p className="mb-1.5 text-[11px] font-semibold text-fg-dim">Estrutura do Início</p>
            <div className="flex flex-wrap gap-1.5">
              {["1 · como está hoje", "2 · com hierarquia"].map((n, i) => (
                <button
                  key={n}
                  type="button"
                  onClick={() => setEstrutura(i)}
                  className={cx(
                    "rounded-full px-3 py-1.5 text-[12px] font-semibold transition-colors",
                    i === estrutura
                      ? "bg-brand-500 text-on-brand"
                      : "bg-ink-800 text-fg-dim hover:text-fg"
                  )}
                >
                  {n}
                </button>
              ))}
            </div>
          </div>
          <div>
            <p className="mb-1.5 text-[11px] font-semibold text-fg-dim">Degradê no accent</p>
            <div className="flex flex-wrap gap-1.5">
              {["chapado", "degradê"].map((n, i) => (
                <button
                  key={n}
                  type="button"
                  onClick={() => setDegrade(i === 1)}
                  className={cx(
                    "rounded-full px-3 py-1.5 text-[12px] font-semibold transition-colors",
                    (i === 1) === degrade
                      ? "bg-brand-500 text-on-brand"
                      : "bg-ink-800 text-fg-dim hover:text-fg"
                  )}
                >
                  {n}
                </button>
              ))}
            </div>
          </div>
        </div>

        <p className="mt-2.5 text-[11.5px] text-fg-mute">{p.nota}</p>

        {/*
          O degrade e `--a` para `--a-2`, que ja existem: sao a cor do accent e
          o tom mais escuro dela, um por accent. Nao e cor nova, e a mesma cor
          com profundidade — e por isso ela acompanha a troca de accent sem
          nenhum valor novo.
        */}
        <div className="mt-5 flex flex-wrap items-center gap-2.5">
          <button
            type="button"
            style={
              degrade
                ? { backgroundImage: "linear-gradient(180deg, var(--a), var(--a-2))" }
                : undefined
            }
            className={cx(
              "h-10 rounded-[14px] px-4 text-[13px] font-semibold text-on-brand",
              !degrade && "bg-brand-500"
            )}
          >
            Nova demanda
          </button>
          <span
            style={
              degrade
                ? { backgroundImage: "linear-gradient(180deg, var(--a), var(--a-2))" }
                : undefined
            }
            className={cx(
              "inline-flex items-center gap-2 rounded-[12px] px-3 py-2 text-[13px] font-semibold text-on-brand",
              !degrade && "bg-brand-500"
            )}
          >
            <ListChecks size={15} />
            Item ativo da barra
          </span>
          <span className="text-[11.5px] text-fg-mute">
            {degrade ? "var(--a) → var(--a-2)" : "var(--a) chapado"}
          </span>
        </div>

        <div className="mt-6">
          <p className="mb-3 text-[22px] font-bold tracking-[-0.03em]">Boa tarde!</p>
          {estrutura === 0 ? <EstruturaAtual /> : <EstruturaProposta />}
        </div>

        <p className="mb-3 mt-10 text-[11px] font-bold uppercase tracking-[0.1em] text-fg-mute">
          O quadro de demandas, no mesmo fundo
        </p>
        <Quadro />

        <div className="h-16" />
      </div>
    </div>
  );
}
