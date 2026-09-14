/*
 * Os formatadores nascem uma vez, fora das funções.
 *
 * `new Intl.NumberFormat` é caro: construir resolve dados de locale, e medido
 * aqui deu 44µs contra 0,6µs de um `.format()` em formatador já pronto — 73
 * vezes. Como estava, cada valor em real na tela construía o seu próprio, e a
 * tela de contas mostra dezenas deles por render, dentro de listas que
 * redesenham a cada clique. Fora da função, o custo é pago uma vez na vida do
 * módulo.
 *
 * Mesma razão para os de data e hora abaixo.
 */
const FMT_BRL = new Intl.NumberFormat("pt-BR", {
  style: "currency",
  currency: "BRL",
});

const FMT_BRL_CURTO = new Intl.NumberFormat("pt-BR", {
  style: "currency",
  currency: "BRL",
  notation: "compact",
  maximumFractionDigits: 1,
});

export const brl = (v: number) =>
  FMT_BRL.format(Number.isFinite(v) ? v : 0);

export const brlCompact = (v: number) =>
  FMT_BRL_CURTO.format(Number.isFinite(v) ? v : 0);

/** "2026-08-26" -> "26/08/2026" sem escorregar de fuso. */
export const dateBR = (iso: string | null | undefined) => {
  if (!iso) return "—";
  const [y, m, d] = iso.slice(0, 10).split("-");
  return `${d}/${m}/${y}`;
};

const FMT_DATA_HORA = new Intl.DateTimeFormat("pt-BR", {
  day: "2-digit",
  month: "2-digit",
  year: "numeric",
  hour: "2-digit",
  minute: "2-digit",
});

/**
 * Data e hora de um instante ISO.
 *
 * O guarda de data invalida nao e zelo: `Intl.format` levanta RangeError com
 * `Invalid Date`, e isso acontece **dentro do render**. Um unico timestamp
 * torto — de uma linha antiga, de uma migracao pela metade — derrubaria a
 * arvore inteira do React e a tela ficaria branca, sem nada na tela que
 * dissesse de onde veio.
 */
export const dateTimeBR = (iso: string | null | undefined) => {
  if (!iso) return "—";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "—";
  return FMT_DATA_HORA.format(d);
};

/**
 * O número por trás do que foi digitado num campo de dinheiro.
 *
 * Existe porque a mesma conta estava escrita em dez lugares, e estava errada
 * nos dez: `replace(/\./g, "")` apagava **todo** ponto antes de trocar a
 * vírgula por ponto. Quem digitasse `1234.56` — o formato do teclado, do
 * extrato do banco, de qualquer planilha em inglês — lançava
 * **R$ 123.456,00**. Cem vezes o valor certo, sem aviso nenhum.
 *
 * A regra, na ordem:
 *
 * 1. **Tem vírgula** → é o formato daqui: ponto é milhar, vírgula é decimal.
 *    `1.234,56` → 1234.56
 * 2. **Só ponto, com exatamente 3 dígitos depois do último** → é milhar, que
 *    é como se escreve mil e quinhentos aqui: `1.500` → 1500
 * 3. **Só ponto, com qualquer outra quantidade de dígitos** → é decimal:
 *    `1234.56` → 1234.56, `1234.5` → 1234.5
 *
 * Devolve `NaN` quando não sobra número, para quem chama decidir o que dizer.
 */
export const valorDigitado = (entrada: string | number): number => {
  if (typeof entrada === "number") return entrada;

  /* Fora o que não é número: "R$", espaço, espaço fino que vem de colagem. */
  const cru = String(entrada)
    .replace(/[^\d.,-]/g, "")
    .trim();
  if (!cru) return NaN;

  if (cru.includes(",")) {
    return parseFloat(cru.replace(/\./g, "").replace(",", "."));
  }

  const pedacos = cru.split(".");
  const ehMilhar = pedacos.length > 1 && pedacos[pedacos.length - 1].length === 3;

  return parseFloat(ehMilhar ? pedacos.join("") : cru);
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

/**
 * A meia-noite de ontem, no fuso de quem olha, como instante ISO.
 *
 * Serve de piso para consultas que só mostram de hoje em diante — a agenda do
 * painel é a primeira. É *ontem* e não hoje de propósito: o banco guarda
 * timestamptz em UTC e a tela decide o dia pelo fuso local, então um evento
 * que a tela chama de "hoje" pode estar gravado com data de ontem em UTC.
 * Cortar na meia-noite de hoje deixaria esse evento de fora da consulta e ele
 * sumiria da tela. Um dia de folga custa algumas linhas e não erra.
 */
export const inicioDeOntem = () => {
  const d = new Date(todayISO() + "T00:00:00");
  d.setDate(d.getDate() - 1);
  return d.toISOString();
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

const FMT_HORA = new Intl.DateTimeFormat("pt-BR", {
  hour: "2-digit",
  minute: "2-digit",
});

/** Hora local HH:MM de um timestamptz. Mesmo guarda de `dateTimeBR`. */
export const localTime = (iso: string | null | undefined) => {
  if (!iso) return "";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  return FMT_HORA.format(d);
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
