"use client";

import * as React from "react";
import {
  Cloud,
  CloudDrizzle,
  CloudFog,
  CloudLightning,
  CloudRain,
  CloudSnow,
  Sun,
  SunDim,
} from "lucide-react";

/**
 * Códigos WMO do Open-Meteo, agrupados no que dá para ver do lado de fora.
 *
 * A tabela oficial tem 28 códigos, com distinções que não cabem numa linha —
 * "garoa congelante leve" e "garoa congelante densa" viram a mesma gota. O que
 * importa aqui é a decisão da manhã: levo guarda-chuva, está frio?
 */
const FAIXAS: { ate: number; Icone: typeof Sun; rotulo: string }[] = [
  { ate: 0, Icone: Sun, rotulo: "céu limpo" },
  { ate: 2, Icone: SunDim, rotulo: "parcialmente nublado" },
  { ate: 3, Icone: Cloud, rotulo: "nublado" },
  { ate: 48, Icone: CloudFog, rotulo: "neblina" },
  { ate: 57, Icone: CloudDrizzle, rotulo: "garoa" },
  { ate: 67, Icone: CloudRain, rotulo: "chuva" },
  { ate: 77, Icone: CloudSnow, rotulo: "neve" },
  { ate: 82, Icone: CloudRain, rotulo: "pancada de chuva" },
  { ate: 86, Icone: CloudSnow, rotulo: "neve" },
  { ate: 99, Icone: CloudLightning, rotulo: "tempestade" },
];

const faixaDe = (codigo: number) =>
  FAIXAS.find((f) => codigo <= f.ate) ?? FAIXAS[FAIXAS.length - 1];

type Clima = { temp: number; codigo: number; cidade: string | null };

/**
 * Temperatura e condição, para ficar ao lado da data.
 *
 * Não desenha nada enquanto carrega nem quando falha. Um esqueleto piscando ou
 * um "—" ao lado da data chamaria mais atenção do que a informação merece: é
 * enfeite útil, não conteúdo da página.
 */
export function Clima({ className }: { className?: string }) {
  const [clima, setClima] = React.useState<Clima | null>(null);

  React.useEffect(() => {
    let vivo = true;
    fetch("/api/clima")
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => {
        if (vivo && d && typeof d.temp === "number") setClima(d);
      })
      .catch(() => {});
    /* Evita gravar estado depois que a página saiu — o fetch continua no ar
       mesmo com o componente desmontado. */
    return () => {
      vivo = false;
    };
  }, []);

  if (!clima) return null;

  const { Icone, rotulo } = faixaDe(clima.codigo);

  return (
    <span
      className={className}
      title={clima.cidade ? `${rotulo} · ${clima.cidade}` : rotulo}
    >
      <Icone size={15} className="shrink-0 text-fg-mute" />
      <span className="tnum">{clima.temp}°</span>
    </span>
  );
}
