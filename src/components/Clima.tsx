"use client";

import * as React from "react";
import {
  Cloud,
  CloudDrizzle,
  CloudFog,
  CloudLightning,
  CloudRain,
  CloudSnow,
  MapPin,
  Sun,
  SunDim,
} from "lucide-react";
import { Input, cx } from "./ui";

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

/** De onde saiu o número. Fica no `title`, para um valor estranho se explicar. */
type Fonte = "cidade" | "aparelho" | "rede";

type Clima = {
  temp: number;
  codigo: number;
  lugar: string | null;
  fonte: Fonte;
};

const CHAVE_CIDADE = "mb.clima.cidade";
const CHAVE_LOCAL = "mb.clima.local";
/*
 * O `2` no nome é de propósito.
 *
 * A primeira versão gravava "negado" em qualquer erro, e o cabeçalho
 * Permissions-Policy — que era o bug de verdade — rejeitava em silêncio antes
 * de qualquer caixa de permissão. Resultado: quem abriu naquela versão ficou
 * com a recusa gravada sem nunca ter recusado nada, e continuaria sem ser
 * perguntado depois do conserto. Trocar a chave descarta esse registro falso.
 */
const CHAVE_NEGADO = "mb.clima.negado2";
const CHAVE_NEGADO_ANTIGA = "mb.clima.negado";
const DIAS = 86_400_000;

type Lugar = { lat: number; lon: number; nome?: string };

const ler = (chave: string) => {
  try {
    return localStorage.getItem(chave);
  } catch {
    return null;
  }
};
const gravar = (chave: string, v: string) => {
  try {
    localStorage.setItem(chave, v);
  } catch {}
};
const apagar = (chave: string) => {
  try {
    localStorage.removeItem(chave);
  } catch {}
};

/** Cidade escolhida à mão. Não expira: foi uma decisão, não um palpite. */
function cidadeSalva(): Lugar | null {
  try {
    const c = JSON.parse(ler(CHAVE_CIDADE) ?? "null");
    return Number.isFinite(c?.lat) && Number.isFinite(c?.lon) ? c : null;
  } catch {
    return null;
  }
}

/** Coordenada do aparelho, se ainda vale. */
function localGuardado(): Lugar | null {
  try {
    const c = JSON.parse(ler(CHAVE_LOCAL) ?? "null");
    if (!Number.isFinite(c?.lat) || !Number.isFinite(c?.lon)) return null;
    /* Sete dias: cidade não muda toda hora, e quando muda a diferença de
       temperatura é justamente o que se quer ver. */
    return Date.now() - c.em > 7 * DIAS ? null : c;
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
 */
function pedirLocal(): Promise<Lugar | null> {
  return new Promise((resolve) => {
    if (!navigator.geolocation) return resolve(null);
    navigator.geolocation.getCurrentPosition(
      (p) => {
        const lugar = {
          lat: Math.round(p.coords.latitude * 100) / 100,
          lon: Math.round(p.coords.longitude * 100) / 100,
        };
        gravar(CHAVE_LOCAL, JSON.stringify({ ...lugar, em: Date.now() }));
        resolve(lugar);
      },
      (erro) => {
        /*
         * Só recusa de verdade fica registrada.
         *
         * O callback de erro também dispara em timeout e em POSITION_UNAVAILABLE
         * — este último é o caso comum de desktop com o serviço de localização
         * do sistema desligado: o navegador concede a permissão e o sistema não
         * entrega posição nenhuma. Gravar "negado" nesses casos desligaria a
         * pergunta para sempre por um problema passageiro ou externo ao app.
         */
        if (erro.code === erro.PERMISSION_DENIED) gravar(CHAVE_NEGADO, "1");
        resolve(null);
      },
      /* 15s, não 8: a primeira leitura de GPS costuma ser a lenta, e estourar
         antes de o aparelho responder jogava direto no palpite por IP. */
      { timeout: 15_000, maximumAge: 30 * 60_000 }
    );
  });
}

/** Coordenada de um nome de cidade, pelo geocoder do próprio Open-Meteo. */
async function acharCidade(nome: string): Promise<Lugar | null> {
  const url =
    "https://geocoding-api.open-meteo.com/v1/search?count=1&language=pt" +
    `&format=json&name=${encodeURIComponent(nome)}`;
  try {
    const r = await fetch(url);
    const d = r.ok ? await r.json() : null;
    const a = d?.results?.[0];
    if (!a || !Number.isFinite(a.latitude)) return null;
    return {
      lat: a.latitude,
      lon: a.longitude,
      nome: [a.name, a.admin1].filter(Boolean).join(", "),
    };
  } catch {
    return null;
  }
}

/** Temperatura e código para uma coordenada. */
async function buscarClima(l: Lugar) {
  const url =
    `https://api.open-meteo.com/v1/forecast?latitude=${l.lat}` +
    `&longitude=${l.lon}&current=temperature_2m,weather_code&timezone=auto`;
  try {
    const r = await fetch(url);
    const d = r.ok ? await r.json() : null;
    if (typeof d?.current?.temperature_2m !== "number") return null;
    return {
      temp: Math.round(d.current.temperature_2m),
      codigo: Number(d.current.weather_code ?? 0),
    };
  } catch {
    return null;
  }
}

const COMO: Record<Fonte, string> = {
  cidade: "cidade escolhida por você",
  aparelho: "sua localização",
  rede: "aproximado pelo endereço de rede — clique para escolher a cidade",
};

/**
 * Temperatura e condição, ao lado da data.
 *
 * Clicar abre um campo de cidade. Existe porque as duas fontes automáticas
 * falham de formas que o app não controla: o palpite pelo endereço de rede erra
 * por centenas de quilômetros, e a posição do aparelho depende do serviço de
 * localização do sistema estar ligado — no desktop, muita vez não está.
 * Escrever a cidade uma vez resolve sem depender de nenhuma das duas.
 */
export function Clima({ className }: { className?: string }) {
  const [clima, setClima] = React.useState<Clima | null>(null);
  const [abrindo, setAbrindo] = React.useState(false);
  const [rascunho, setRascunho] = React.useState("");
  const [erro, setErro] = React.useState(false);

  React.useEffect(() => {
    let vivo = true;

    (async () => {
      /* Ordem: escolha explícita, aparelho, palpite. A escolha vem primeiro
         porque é a única que a pessoa mandou. */
      const escolhida = cidadeSalva();
      if (escolhida) {
        const c = await buscarClima(escolhida);
        if (c && vivo)
          return setClima({
            ...c,
            lugar: escolhida.nome ?? null,
            fonte: "cidade",
          });
      }

      let onde = localGuardado();
      if (!onde) {
        /*
         * O estado real da permissão manda mais que o registro local.
         *
         * Se a pessoa liberou nas configurações do navegador depois de ter
         * recusado, o registro antigo estaria mentindo e a pergunta nunca mais
         * seria feita. Com "granted" ele é apagado.
         */
        let estado = "";
        try {
          estado = (await navigator.permissions.query({ name: "geolocation" }))
            .state;
        } catch {}
        if (estado === "granted") apagar(CHAVE_NEGADO);
        apagar(CHAVE_NEGADO_ANTIGA);

        if (estado !== "denied" && ler(CHAVE_NEGADO) !== "1")
          onde = await pedirLocal();
      }
      if (!vivo) return;

      if (onde) {
        /*
         * Direto no Open-Meteo, sem passar pelo servidor.
         *
         * É uma API aberta, sem chave, então o desvio não acrescentaria nada — e
         * mandar a posição de alguém para o próprio backend só para repassar
         * seria criar um dado que não precisa existir lá.
         */
        const c = await buscarClima(onde);
        if (c && vivo) return setClima({ ...c, lugar: null, fonte: "aparelho" });
      }

      /* Último recurso: o palpite pelo endereço de rede, impreciso mas melhor
         que campo vazio — e o `title` avisa que é aproximado. */
      try {
        const r = await fetch("/api/clima");
        const d = r.ok ? await r.json() : null;
        if (typeof d?.temp === "number" && vivo)
          setClima({
            temp: d.temp,
            codigo: d.codigo,
            lugar: d.cidade ?? null,
            fonte: "rede",
          });
      } catch {}
    })();

    /* Evita gravar estado depois que a página saiu — o fetch continua no ar
       mesmo com o componente desmontado. */
    return () => {
      vivo = false;
    };
  }, []);

  const salvarCidade = async () => {
    const nome = rascunho.trim();
    if (!nome) return;
    setErro(false);
    const lugar = await acharCidade(nome);
    if (!lugar) return setErro(true);
    gravar(CHAVE_CIDADE, JSON.stringify(lugar));
    const c = await buscarClima(lugar);
    if (c) setClima({ ...c, lugar: lugar.nome ?? null, fonte: "cidade" });
    setAbrindo(false);
    setRascunho("");
  };

  if (!clima) return null;

  const { Icone, rotulo } = faixaDe(clima.codigo);

  return (
    <span className={cx("relative", className)}>
      <button
        type="button"
        onClick={() => setAbrindo((v) => !v)}
        title={`${rotulo}${clima.lugar ? ` · ${clima.lugar}` : ""} · ${
          COMO[clima.fonte]
        }`}
        className="flex items-center gap-1.5 rounded-md transition-opacity hover:opacity-70"
      >
        <Icone
          size={15}
          className={cx(
            "shrink-0",
            /* Cinza mais apagado quando o número é só palpite: discreto, mas dá
               para ver que aquele valor é o menos confiável dos três. */
            clima.fonte === "rede" ? "text-fg-mute/60" : "text-fg-mute"
          )}
        />
        <span className="tnum">{clima.temp}°</span>
      </button>

      {abrindo && (
        <span className="absolute right-0 top-[calc(100%+10px)] z-20 flex w-[230px] flex-col gap-1.5 rounded-[14px] bg-white p-2.5 text-left shadow-[0_12px_32px_-8px_rgb(20_24_26/0.25)]">
          <span className="flex items-center gap-1.5 px-0.5 text-[10px] font-medium uppercase tracking-wider text-fg-mute">
            <MapPin size={11} />
            Sua cidade
          </span>
          <Input
            autoFocus
            value={rascunho}
            onChange={(e) => {
              setRascunho(e.target.value);
              setErro(false);
            }}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                e.preventDefault();
                salvarCidade();
              }
              if (e.key === "Escape") setAbrindo(false);
            }}
            placeholder="Campo Grande"
            className="h-9 text-[12.5px] font-normal"
          />
          <span className="px-0.5 text-[10.5px] font-normal text-fg-mute">
            {erro ? "Não encontrei essa cidade." : "Enter para salvar."}
          </span>
        </span>
      )}
    </span>
  );
}
