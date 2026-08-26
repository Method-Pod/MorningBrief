"use client";

import * as React from "react";
import { brl } from "@/lib/format";
import { cx } from "./ui";

/** Paleta estável por categoria: a mesma categoria mantém a cor entre telas. */
const PALETA = [
  "var(--a)",
  "#6d5bd0",
  "#1f9d63",
  "#b8820c",
  "#cf4a3f",
  "#2563a8",
  "#c2559b",
  "#0e8f8f",
  "#8a6a3b",
  "#666e74",
];

export const corCategoria = (nome: string, ordem: string[]) => {
  const i = ordem.indexOf(nome);
  return PALETA[(i < 0 ? ordem.length : i) % PALETA.length];
};

/* ==================== participação por categoria ==================== */

export function ParticipacaoCategoria({
  dados,
  total,
}: {
  dados: { categoria: string; valor: number }[];
  total: number;
}) {
  const ordem = dados.map((d) => d.categoria);
  if (!dados.length)
    return <p className="py-8 text-center text-[12.5px] text-fg-mute">Sem dados.</p>;

  return (
    <div className="flex flex-col gap-3">
      <div className="flex items-baseline justify-between">
        <span className="text-[11px] font-semibold uppercase tracking-[0.08em] text-fg-mute">
          Total
        </span>
        <span className="text-[19px] font-bold tracking-[-0.03em] tnum">
          {brl(total)}
        </span>
      </div>

      {/* barra única empilhada: dá a proporção antes de ler a lista */}
      <div className="flex h-2 overflow-hidden rounded-full bg-ink-800">
        {dados.map((d) => (
          <div
            key={d.categoria}
            style={{
              width: `${total ? (d.valor / total) * 100 : 0}%`,
              background: corCategoria(d.categoria, ordem),
            }}
            title={`${d.categoria}: ${brl(d.valor)}`}
          />
        ))}
      </div>

      <ul className="flex flex-col">
        {dados.map((d) => {
          const pct = total ? (d.valor / total) * 100 : 0;
          return (
            <li
              key={d.categoria}
              className="flex items-center gap-2.5 border-b border-line-soft py-2 last:border-0"
            >
              <span
                className="h-2.5 w-2.5 shrink-0 rounded-full"
                style={{ background: corCategoria(d.categoria, ordem) }}
              />
              <span className="min-w-0 flex-1 truncate text-[13px] font-medium">
                {d.categoria}
              </span>
              <span className="shrink-0 text-[11.5px] font-semibold text-fg-mute tnum">
                {pct.toFixed(0)}%
              </span>
              <span className="w-[92px] shrink-0 text-right text-[13px] font-semibold tnum">
                {brl(d.valor)}
              </span>
            </li>
          );
        })}
      </ul>
    </div>
  );
}

/* ==================== pago vs pendente por categoria ==================== */

export function PagoPendenteCategoria({
  dados,
}: {
  dados: { categoria: string; pago: number; pendente: number }[];
}) {
  if (!dados.length)
    return <p className="py-8 text-center text-[12.5px] text-fg-mute">Sem dados.</p>;

  const max = Math.max(...dados.map((d) => d.pago + d.pendente), 1);

  return (
    <div className="flex flex-col gap-3.5">
      <div className="flex items-center gap-4 text-[11px] text-fg-mute">
        <span className="inline-flex items-center gap-1.5">
          <i className="h-2.5 w-2.5 rounded-sm bg-pos" /> pago
        </span>
        <span className="inline-flex items-center gap-1.5">
          <i className="h-2.5 w-2.5 rounded-sm bg-warn" /> pendente
        </span>
      </div>

      {dados.map((d) => (
        <div key={d.categoria}>
          <div className="mb-1.5 flex items-baseline justify-between gap-3">
            <span className="min-w-0 truncate text-[12.5px] font-medium">
              {d.categoria}
            </span>
            <span className="shrink-0 text-[12px] font-semibold tnum">
              {brl(d.pago + d.pendente)}
            </span>
          </div>
          <div className="flex h-[7px] gap-0.5 overflow-hidden rounded-full bg-ink-800">
            {d.pago > 0 && (
              <div
                className="bg-pos"
                style={{ width: `${(d.pago / max) * 100}%` }}
                title={`pago ${brl(d.pago)}`}
              />
            )}
            {d.pendente > 0 && (
              <div
                className="bg-warn"
                style={{ width: `${(d.pendente / max) * 100}%` }}
                title={`pendente ${brl(d.pendente)}`}
              />
            )}
          </div>
        </div>
      ))}
    </div>
  );
}

/* ==================== evolução mês a mês ==================== */

export type PontoMes = { rotulo: string; valor: number; mesAtual?: boolean };

export function EvolucaoMensal({ dados }: { dados: PontoMes[] }) {
  const [ativo, setAtivo] = React.useState<number | null>(null);

  if (!dados.length || dados.every((d) => d.valor === 0))
    return (
      <p className="py-10 text-center text-[12.5px] text-fg-mute">
        Sem lançamentos para comparar.
      </p>
    );

  const L = 1000;
  const A = 200;
  const pt = 14;
  const pb = 26;
  const pl = 46;
  const pr = 8;
  const li = L - pl - pr;
  const ai = A - pt - pb;

  const bruto = Math.max(...dados.map((d) => d.valor), 1);
  const mag = 10 ** Math.floor(Math.log10(bruto));
  const n = bruto / mag;
  const teto = (n <= 1 ? 1 : n <= 2 ? 2 : n <= 2.5 ? 2.5 : n <= 5 ? 5 : 10) * mag;

  const X = (i: number) =>
    pl + (dados.length <= 1 ? li / 2 : (i * li) / (dados.length - 1));
  const Y = (v: number) => pt + ai - (v / teto) * ai;

  const pts = dados.map((d, i) => [X(i), Y(d.valor)] as const);

  /* Catmull-Rom em Bézier: suaviza sem estourar acima do máximo. */
  let linha = `M ${pts[0][0]} ${pts[0][1]}`;
  for (let i = 0; i < pts.length - 1; i++) {
    const p0 = pts[i - 1] ?? pts[i];
    const p1 = pts[i];
    const p2 = pts[i + 1];
    const p3 = pts[i + 2] ?? p2;
    const t = 0.18;
    linha += ` C ${p1[0] + (p2[0] - p0[0]) * t} ${p1[1] + (p2[1] - p0[1]) * t}, ${
      p2[0] - (p3[0] - p1[0]) * t
    } ${p2[1] - (p3[1] - p1[1]) * t}, ${p2[0]} ${p2[1]}`;
  }
  const area = `${linha} L ${pts[pts.length - 1][0]} ${pt + ai} L ${pts[0][0]} ${
    pt + ai
  } Z`;

  const grade = [0, 0.5, 1].map((f) => teto * f);
  const compacto = (v: number) =>
    v >= 1000 ? `${(v / 1000).toFixed(v >= 10000 ? 0 : 1).replace(".", ",")}k` : String(Math.round(v));

  const mover = (e: React.MouseEvent<SVGSVGElement>) => {
    const r = e.currentTarget.getBoundingClientRect();
    const px = ((e.clientX - r.left) / r.width) * L;
    let melhor = 0;
    let dist = Infinity;
    pts.forEach(([x], i) => {
      const d = Math.abs(x - px);
      if (d < dist) {
        dist = d;
        melhor = i;
      }
    });
    setAtivo(melhor);
  };

  return (
    <div className="relative">
      <svg
        viewBox={`0 0 ${L} ${A}`}
        className="block h-[200px] w-full"
        preserveAspectRatio="none"
        onMouseMove={mover}
        onMouseLeave={() => setAtivo(null)}
        role="img"
        aria-label={`Evolução dos gastos. ${dados
          .map((d) => `${d.rotulo}: ${brl(d.valor)}`)
          .join(". ")}`}
      >
        <defs>
          <linearGradient id="mb-evo" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="var(--a)" stopOpacity="0.28" />
            <stop offset="100%" stopColor="var(--a)" stopOpacity="0" />
          </linearGradient>
        </defs>

        {grade.map((v, i) => (
          <g key={i}>
            <line
              x1={pl}
              x2={L - pr}
              y1={Y(v)}
              y2={Y(v)}
              stroke="var(--a-line)"
              strokeWidth="1"
              vectorEffect="non-scaling-stroke"
            />
            <text
              x={pl - 8}
              y={Y(v) + 4}
              textAnchor="end"
              fontSize="17"
              fill="var(--color-fg-mute)"
            >
              {v === 0 ? "0" : compacto(v)}
            </text>
          </g>
        ))}

        <path d={area} fill="url(#mb-evo)" />
        <path
          d={linha}
          fill="none"
          stroke="var(--a)"
          strokeWidth="2.5"
          strokeLinecap="round"
          vectorEffect="non-scaling-stroke"
        />

        {dados.map((d, i) => (
          <text
            key={d.rotulo + i}
            x={X(i)}
            y={A - 7}
            textAnchor="middle"
            fontSize="17"
            fontWeight={d.mesAtual ? 700 : 400}
            fill={d.mesAtual ? "var(--a-text)" : "var(--color-fg-mute)"}
          >
            {d.rotulo}
          </text>
        ))}

        {ativo !== null && (
          <g>
            <line
              x1={X(ativo)}
              x2={X(ativo)}
              y1={pt}
              y2={pt + ai}
              stroke="var(--a)"
              strokeWidth="1"
              strokeDasharray="3 4"
              vectorEffect="non-scaling-stroke"
            />
            <circle
              cx={X(ativo)}
              cy={Y(dados[ativo].valor)}
              r="5"
              fill="var(--a)"
              stroke="#fff"
              strokeWidth="2"
              vectorEffect="non-scaling-stroke"
            />
          </g>
        )}
      </svg>

      {ativo !== null && (
        <div
          className={cx(
            "pointer-events-none absolute -translate-x-1/2 -translate-y-full rounded-[12px] bg-fg px-3 py-2 text-white shadow-[0_6px_20px_-8px_rgb(20_24_26/0.4)]"
          )}
          style={{
            left: `${(X(ativo) / L) * 100}%`,
            top: `${(Y(dados[ativo].valor) / A) * 100}%`,
            marginTop: -8,
          }}
        >
          <p className="text-[9.5px] uppercase tracking-[0.1em] opacity-70">
            {dados[ativo].rotulo}
          </p>
          <p className="text-[13px] font-bold tnum">{brl(dados[ativo].valor)}</p>
        </div>
      )}
    </div>
  );
}
