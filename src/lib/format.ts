export const brl = (v: number) =>
  new Intl.NumberFormat("pt-BR", {
    style: "currency",
    currency: "BRL",
  }).format(Number.isFinite(v) ? v : 0);

export const brlCompact = (v: number) =>
  new Intl.NumberFormat("pt-BR", {
    style: "currency",
    currency: "BRL",
    notation: "compact",
    maximumFractionDigits: 1,
  }).format(Number.isFinite(v) ? v : 0);

/** "2026-08-26" -> "26/08/2026" sem escorregar de fuso. */
export const dateBR = (iso: string | null | undefined) => {
  if (!iso) return "—";
  const [y, m, d] = iso.slice(0, 10).split("-");
  return `${d}/${m}/${y}`;
};

export const dateTimeBR = (iso: string | null | undefined) => {
  if (!iso) return "—";
  const dt = new Date(iso);
  return dt.toLocaleString("pt-BR", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
};

/** Data local de hoje em ISO (YYYY-MM-DD), sem converter para UTC. */
export const todayISO = () => {
  const d = new Date();
  const off = d.getTimezoneOffset();
  return new Date(d.getTime() - off * 60_000).toISOString().slice(0, 10);
};

export const daysUntil = (iso: string) => {
  const today = new Date(todayISO() + "T00:00:00");
  const target = new Date(iso.slice(0, 10) + "T00:00:00");
  return Math.round((target.getTime() - today.getTime()) / 86_400_000);
};

export const greeting = () => {
  const h = new Date().getHours();
  if (h < 12) return "Bom dia";
  if (h < 18) return "Boa tarde";
  return "Boa noite";
};

/**
 * Dia local (YYYY-MM-DD) de um timestamptz.
 *
 * O PostgREST devolve timestamptz em UTC. Cortar a string com slice(0,10) dá o
 * dia em UTC, não no fuso de quem olha: um evento às 22h em Brasília é gravado
 * como 01h30 do dia seguinte em UTC, e aparecia um dia adiantado no calendário.
 * Aqui o instante é convertido para o fuso do navegador antes de virar data.
 */
export const localDay = (iso: string | null | undefined) => {
  if (!iso) return "";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return String(iso).slice(0, 10);
  const off = d.getTimezoneOffset();
  return new Date(d.getTime() - off * 60_000).toISOString().slice(0, 10);
};

/** Hora local HH:MM de um timestamptz. */
export const localTime = (iso: string | null | undefined) => {
  if (!iso) return "";
  return new Date(iso).toLocaleTimeString("pt-BR", {
    hour: "2-digit",
    minute: "2-digit",
  });
};

const MES_ABREV = [
  "jan", "fev", "mar", "abr", "mai", "jun",
  "jul", "ago", "set", "out", "nov", "dez",
];

/** "2026-08-04" -> "04 de ago." — mais legível numa lista que dd/mm/aaaa. */
export const dataCurta = (iso: string | null | undefined) => {
  if (!iso) return "—";
  const [, m, d] = iso.slice(0, 10).split("-");
  return `${d} de ${MES_ABREV[Number(m) - 1] ?? "?"}.`;
};

/** "2026-08" -> "ago/26" — rótulo do eixo da evolução mensal. */
export const rotuloMes = (ym: string) => {
  const [y, m] = ym.split("-");
  return `${MES_ABREV[Number(m) - 1] ?? "?"}/${y.slice(2)}`;
};

/** Os 7 dias terminando em `fim` (inclusive), em ISO local. */
export const ultimosDias = (fim: string, n = 7) => {
  const base = new Date(fim + "T00:00:00");
  const dias: string[] = [];
  for (let i = n - 1; i >= 0; i--) {
    const d = new Date(base.getFullYear(), base.getMonth(), base.getDate() - i);
    dias.push(
      `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(
        d.getDate()
      ).padStart(2, "0")}`
    );
  }
  return dias;
};

/**
 * Semana de segunda a domingo que contém `iso`, deslocada em `semanas`.
 *
 * Uma janela móvel dos últimos 7 dias deixa as iniciais fora de ordem
 * (Q S S D S T Q) e torna a grade ilegível. Com a semana fixa, a ordem das
 * colunas nunca muda e "nesta semana" corresponde à semana de verdade.
 */
export const semanaDe = (iso: string, semanas = 0) => {
  const d = new Date(iso + "T00:00:00");
  const dow = d.getDay(); // 0=dom
  const paraSegunda = dow === 0 ? -6 : 1 - dow;
  const segunda = new Date(
    d.getFullYear(),
    d.getMonth(),
    d.getDate() + paraSegunda + semanas * 7
  );
  return Array.from({ length: 7 }, (_, i) => {
    const x = new Date(
      segunda.getFullYear(),
      segunda.getMonth(),
      segunda.getDate() + i
    );
    return `${x.getFullYear()}-${String(x.getMonth() + 1).padStart(
      2,
      "0"
    )}-${String(x.getDate()).padStart(2, "0")}`;
  });
};

/* ------------------------------ links ------------------------------ */

/**
 * Deixa o que foi digitado em forma de endereço navegável.
 *
 * Colar "drive.google.com/..." é o normal — ninguém digita o esquema. Sem isso
 * o href vira relativo e o clique navega para dentro do próprio app.
 */
export const normalizarLink = (v: string) => {
  const t = v.trim();
  if (!t) return "";
  return /^[a-z][a-z0-9+.-]*:\/\//i.test(t) ? t : `https://${t}`;
};

/**
 * Nome curto para exibir no lugar da URL inteira.
 *
 * O cartão tem largura de coluna de quadro: uma URL de Drive ocuparia três
 * linhas e não diria mais do que "drive.google.com".
 */
export const rotuloDeLink = (v: string) => {
  try {
    return new URL(normalizarLink(v)).hostname.replace(/^www\./, "");
  } catch {
    return v.trim().slice(0, 28);
  }
};
