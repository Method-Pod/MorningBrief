import { NextResponse } from "next/server";

/**
 * Clima de agora, para a linha da data no início.
 *
 * Roda no servidor por dois motivos. O primeiro é localização sem incomodar:
 * a Vercel manda a latitude e a longitude aproximadas da requisição nos
 * cabeçalhos, então não há caixa de permissão do navegador nem serviço de
 * terceiro no meio. O segundo é cache — a resposta serve para todo mundo que
 * abrir do mesmo lugar dentro da janela, e não uma chamada por aba aberta.
 *
 * Open-Meteo não pede chave nem cadastro, então não há segredo para guardar.
 */

/* Fora da Vercel — o `next dev` aqui — não existem os cabeçalhos de geo. Cai em
   São Paulo, que é o mesmo fuso que a manutenção diária já assume. */
const PADRAO = { lat: -23.5505, lon: -46.6333, cidade: "São Paulo" };

export async function GET(req: Request) {
  const h = req.headers;
  const lat = Number(h.get("x-vercel-ip-latitude"));
  const lon = Number(h.get("x-vercel-ip-longitude"));

  /* Number("") é 0, e 0,0 é um ponto no Atlântico: sem o teste de finitude o
     clima de um cabeçalho ausente viria do Golfo da Guiné. */
  const usar =
    Number.isFinite(lat) && Number.isFinite(lon) && (lat !== 0 || lon !== 0)
      ? {
          lat,
          lon,
          cidade: decodeURIComponent(h.get("x-vercel-ip-city") ?? "").trim(),
        }
      : PADRAO;

  const url =
    `https://api.open-meteo.com/v1/forecast?latitude=${usar.lat}` +
    `&longitude=${usar.lon}&current=temperature_2m,weather_code&timezone=auto`;

  try {
    /* 15 min: o cabeçalho de temperatura não muda mais rápido que isso, e o
       limite gratuito do Open-Meteo é por chamada. */
    const r = await fetch(url, { next: { revalidate: 900 } });
    if (!r.ok) return NextResponse.json({ erro: true }, { status: 502 });

    const dados = await r.json();
    const atual = dados?.current;
    if (typeof atual?.temperature_2m !== "number")
      return NextResponse.json({ erro: true }, { status: 502 });

    return NextResponse.json(
      {
        temp: Math.round(atual.temperature_2m),
        codigo: Number(atual.weather_code ?? 0),
        cidade: usar.cidade || null,
      },
      /* private, não public: a cidade vem do IP de quem pediu, então é dado de
         uma pessoa e não deve ficar num cache compartilhado no caminho. */
      { headers: { "Cache-Control": "private, max-age=900" } }
    );
  } catch {
    /* Sem clima a página não perde nada: o componente simplesmente não desenha
       nada. Por isso aqui devolve um erro curto em vez de levantar. */
    return NextResponse.json({ erro: true }, { status: 502 });
  }
}
