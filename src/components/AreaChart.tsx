"use client";

import * as React from "react";
import { brl, brlCompact } from "@/lib/format";

export type Point = { label: string; value: number };

/**
 * Área com gradiente + hover crosshair. SVG puro, sem lib de gráfico:
 * o dataset é sempre pequeno (12 pontos no máximo) e assim não carregamos
 * ~100kb de runtime só para desenhar uma curva.
 */
export function AreaChart({
  data,
  height = 240,
}: {
  data: Point[];
  height?: number;
}) {
  const [hover, setHover] = React.useState<number | null>(null);
  const W = 1000;
  const H = height;
  const padT = 16;
  const padB = 28;
  const padL = 44;
  const padR = 10;

  const max = Math.max(...data.map((d) => d.value), 1);
  const niceMax = niceCeil(max);
  const innerW = W - padL - padR;
  const innerH = H - padT - padB;

  const x = (i: number) =>
    padL + (data.length <= 1 ? innerW / 2 : (i * innerW) / (data.length - 1));
  const y = (v: number) => padT + innerH - (v / niceMax) * innerH;

  const pts = data.map((d, i) => [x(i), y(d.value)] as const);
  const line = smoothPath(pts);
  const area = `${line} L ${pts[pts.length - 1][0]} ${padT + innerH} L ${pts[0][0]} ${padT + innerH} Z`;

  const gridVals = [0, 0.25, 0.5, 0.75, 1].map((f) => niceMax * f);

  const onMove = (e: React.MouseEvent<SVGSVGElement>) => {
    const rect = e.currentTarget.getBoundingClientRect();
    const px = ((e.clientX - rect.left) / rect.width) * W;
    let best = 0;
    let bestD = Infinity;
    pts.forEach(([cx], i) => {
      const d = Math.abs(cx - px);
      if (d < bestD) {
        bestD = d;
        best = i;
      }
    });
    setHover(best);
  };

  if (!data.length) return null;

  return (
    <div className="relative w-full">
      <svg
        viewBox={`0 0 ${W} ${H}`}
        className="w-full"
        style={{ height }}
        preserveAspectRatio="none"
        onMouseMove={onMove}
        onMouseLeave={() => setHover(null)}
      >
        <defs>
          <linearGradient id="mb-area" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="#2f7bff" stopOpacity="0.42" />
            <stop offset="55%" stopColor="#2f7bff" stopOpacity="0.10" />
            <stop offset="100%" stopColor="#2f7bff" stopOpacity="0" />
          </linearGradient>
        </defs>

        {gridVals.map((v, i) => (
          <g key={i}>
            <line
              x1={padL}
              x2={W - padR}
              y1={y(v)}
              y2={y(v)}
              stroke="#151c2b"
              strokeWidth="1"
              vectorEffect="non-scaling-stroke"
            />
            <text
              x={padL - 8}
              y={y(v) + 3}
              textAnchor="end"
              fontSize="19"
              fill="#4d5a72"
            >
              {v === 0 ? "0" : brlCompact(v).replace("R$", "").trim()}
            </text>
          </g>
        ))}

        <path d={area} fill="url(#mb-area)" />
        <path
          d={line}
          fill="none"
          stroke="#5b9bff"
          strokeWidth="2.5"
          vectorEffect="non-scaling-stroke"
          strokeLinecap="round"
        />

        {data.map((d, i) => (
          <text
            key={d.label + i}
            x={x(i)}
            y={H - 8}
            textAnchor="middle"
            fontSize="19"
            fill={hover === i ? "#9aa7bd" : "#4d5a72"}
          >
            {d.label}
          </text>
        ))}

        {hover !== null && (
          <g>
            <line
              x1={x(hover)}
              x2={x(hover)}
              y1={padT}
              y2={padT + innerH}
              stroke="#2f7bff"
              strokeWidth="1"
              strokeDasharray="4 4"
              vectorEffect="non-scaling-stroke"
            />
            <circle
              cx={x(hover)}
              cy={y(data[hover].value)}
              r="14"
              fill="#2f7bff"
              opacity="0.18"
            />
            <circle
              cx={x(hover)}
              cy={y(data[hover].value)}
              r="5"
              fill="#5b9bff"
              stroke="#04060c"
              strokeWidth="2"
              vectorEffect="non-scaling-stroke"
            />
          </g>
        )}
      </svg>

      {hover !== null && (
        <div
          className="pointer-events-none absolute -translate-x-1/2 -translate-y-full rounded-xl border border-line bg-ink-850/95 px-3 py-2 shadow-[0_20px_40px_-16px_rgba(0,0,0,.9)] backdrop-blur"
          style={{
            left: `${(x(hover) / W) * 100}%`,
            top: `${(y(data[hover].value) / H) * 100}%`,
            marginTop: -10,
          }}
        >
          <p className="text-[10px] uppercase tracking-wider text-fg-mute">
            {data[hover].label}
          </p>
          <p className="mt-0.5 text-sm font-semibold tnum">
            {brl(data[hover].value)}
          </p>
        </div>
      )}
    </div>
  );
}

/* Curva Catmull-Rom convertida em Bézier cúbica — suaviza sem overshoot feio. */
function smoothPath(pts: readonly (readonly [number, number])[]) {
  if (pts.length < 2) return `M ${pts[0]?.[0] ?? 0} ${pts[0]?.[1] ?? 0}`;
  let d = `M ${pts[0][0]} ${pts[0][1]}`;
  for (let i = 0; i < pts.length - 1; i++) {
    const p0 = pts[i - 1] ?? pts[i];
    const p1 = pts[i];
    const p2 = pts[i + 1];
    const p3 = pts[i + 2] ?? p2;
    const t = 0.2;
    const c1x = p1[0] + (p2[0] - p0[0]) * t;
    const c1y = p1[1] + (p2[1] - p0[1]) * t;
    const c2x = p2[0] - (p3[0] - p1[0]) * t;
    const c2y = p2[1] - (p3[1] - p1[1]) * t;
    d += ` C ${c1x} ${c1y}, ${c2x} ${c2y}, ${p2[0]} ${p2[1]}`;
  }
  return d;
}

function niceCeil(v: number) {
  if (v <= 0) return 1;
  const mag = Math.pow(10, Math.floor(Math.log10(v)));
  const n = v / mag;
  const step = n <= 1 ? 1 : n <= 2 ? 2 : n <= 2.5 ? 2.5 : n <= 5 ? 5 : 10;
  return step * mag;
}
