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

const CHAVE_LOCAL = "mb.clima.local";
const CHAVE_NEGADO = "mb.clima.negado";
const DIAS = 86_400_000;

/** Coordenada guardada, se ainda vale. */
function localGuardado(): { lat: number; lon: number } | null {
  try {
    const cru = localStorage.getItem(CHAVE_LOCAL);
    if (!cru) return null;
    const { lat, lon, em } = JSON.parse(cru);
    /* Sete dias: cidade não muda toda hora, e quando muda a diferença de
       temperatura é justamente o que se quer ver. */
    if (!Number.isFinite(lat) || Date.now() - em > 7 * DIAS) return null;
    return { lat, lon };
  } catch {
    return null;
  }
}

/**
 * Pede a posição ao aparelho.
 *
 * Duas casas decimais, cerca de 1 km. É precisão de sobra para temperatura, e
 * guardar o endereço exato de alguém para dizer "27°" seria coletar mais do que
 * a informação exige.
 *
 * A recusa fica registrada: sem isso a caixa de permissão voltaria em toda
 * abertura do início, o que é a forma mais rápida de tornar o recurso odioso.
 */
function pedirLocal(): Promise<{ lat: number; lon: number } | null> {
  return new Promise((resolve) => {
    if (!navigator.geolocation) return resolve(null);
    navigator.geolocation.getCurrentPosition(
      (p) => {
        const lat = Math.round(p.coords.latitude * 100) / 100;
        const lon = Math.round(p.coords.longitude * 100) / 100;
        try {
          localStorage.setItem(
            CHAVE_LOCAL,
            JSON.stringify({ lat, lon, em: Date.now() })
          );
        } catch {}
        resolve({ lat, lon });
      },
      () => {
        try {
          localStorage.setItem(CHAVE_NEGADO, "1");
        } catch {}
        resolve(null);
      },
      { timeout: 8000, maximumAge: 30 * 60_000 }
    );
  });
}

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

    const aplicar = (c: Clima | null) => {
      if (vivo && c) setClima(c);
    };

    (async () => {
      /*
       * Primeiro a posição do aparelho, depois o palpite pelo endereço de rede.
       *
       * O palpite da Vercel erra por centenas de quilômetros — na prática ele
       * dava a capital do estado em vez da cidade de quem estava olhando, e
       * 19° onde fazia 27°. Só a posição do aparelho responde "aqui".
       */
      let onde = localGuardado();

      let negado = false;
      try {
        negado = localStorage.getItem(CHAVE_NEGADO) === "1";
      } catch {}

      if (!onde && !negado) onde = await pedirLocal();
      if (!vivo) return;

      if (onde) {
        /*
         * Direto no Open-Meteo, sem passar pelo servidor.
         *
         * É uma API aberta, sem chave, então o desvio não acrescentaria nada —
         * e mandar a posição de alguém para o próprio backend só para repassar
         * seria guardar um dado que não precisa existir lá.
         */
        const url =
          `https://api.open-meteo.com/v1/forecast?latitude=${onde.lat}` +
          `&longitude=${onde.lon}&current=temperature_2m,weather_code&timezone=auto`;
        try {
          const r = await fetch(url);
          const d = r.ok ? await r.json() : null;
          if (typeof d?.current?.temperature_2m === "number")
            return aplicar({
              temp: Math.round(d.current.temperature_2m),
              codigo: Number(d.current.weather_code ?? 0),
              cidade: null,
            });
        } catch {}
      }

      /* Sem permissão: sobra o palpite pelo endereço de rede, que é impreciso
         mas melhor que campo vazio. */
      try {
        const r = await fetch("/api/clima");
        const d = r.ok ? await r.json() : null;
        if (typeof d?.temp === "number") aplicar(d);
      } catch {}
    })();

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
