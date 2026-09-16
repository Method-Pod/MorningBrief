/*
 * O dia da manutenção começa às 6h da manhã, não à meia-noite.
 *
 * Antes, duas coisas discordavam do que é "um dia":
 *
 * 1. As concluídas saíam por janela corrida de 24h a partir do instante em que
 *    cada uma foi marcada. Uma demanda concluída às 14h de segunda tinha 16h de
 *    idade na varredura das 6h de terça — sobrevivia — e só saía na varredura de
 *    quarta, quase dois dias depois. Outra, concluída às 4h da manhã, saía no
 *    mesmo dia. O tempo de vida dependia da hora em que a pessoa clicou.
 *
 * 2. A cópia de segurança no navegador usava a data do calendário. Abrindo o app
 *    às 00h10, o dia já tinha virado para o localStorage: a limpeza e a geração
 *    das recorrentes aconteciam ali, seis horas antes do combinado.
 *
 * Com a virada às 6h as duas passam a concordar, e o comportamento fica o que se
 * espera de uma rotina diária: às 6h da manhã o quadro amanhece limpo e com as
 * recorrentes do dia.
 *
 * O corte nunca alcança o que aconteceu depois dele. Uma demanda concluída às
 * 7h de hoje vive até as 6h de amanhã — ela nunca some debaixo da mão de quem
 * acabou de concluí-la, que é o risco de simplesmente apagar toda concluída na
 * varredura.
 */

export const FUSO = "America/Sao_Paulo";
/** Hora local em que um dia de manutenção termina e o próximo começa. */
export const HORA_DA_VIRADA = 6;

type Partes = { ano: number; mes: number; dia: number; hora: number; min: number; seg: number };

/** As partes do relógio de parede num fuso, para um instante. */
function partesNoFuso(quando: Date, fuso: string): Partes {
  const partes = new Intl.DateTimeFormat("en-US", {
    timeZone: fuso,
    hour12: false,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  })
    .formatToParts(quando)
    .filter((p) => p.type !== "literal");

  const m = Object.fromEntries(partes.map((p) => [p.type, p.value])) as Record<string, string>;
  return {
    ano: +m.year,
    mes: +m.month,
    dia: +m.day,
    /* `hour12: false` produz 24 para a meia-noite em parte dos runtimes. */
    hora: +m.hour % 24,
    min: +m.minute,
    seg: +m.second,
  };
}

/**
 * Quantos minutos o fuso está à frente do UTC naquele instante.
 *
 * Medido, e não fixado em -180. São Paulo não usa horário de verão desde 2019,
 * mas isso foi uma decisão política e já mudou antes — deixar o número escrito
 * no código faria a limpeza acontecer na hora errada, em silêncio, se voltar.
 */
function deslocamentoMin(quando: Date, fuso: string): number {
  const p = partesNoFuso(quando, fuso);
  const comoSeFosseUTC = Date.UTC(p.ano, p.mes - 1, p.dia, p.hora, p.min, p.seg);
  /* Os milissegundos não entram nas partes; zera dos dois lados. */
  const instante = Math.floor(quando.getTime() / 1000) * 1000;
  return (comoSeFosseUTC - instante) / 60_000;
}

/**
 * O instante da última virada das 6h — o corte.
 *
 * Tudo anterior a ele pertence a um dia de manutenção já encerrado.
 */
export function ultimaVirada(agora: Date = new Date(), fuso = FUSO): Date {
  const p = partesNoFuso(agora, fuso);

  /* Antes das 6h ainda se está no dia de manutenção que começou ontem. */
  const alvo = Date.UTC(p.ano, p.mes - 1, p.dia, HORA_DA_VIRADA, 0, 0);
  const diasAtras = p.hora < HORA_DA_VIRADA ? 1 : 0;
  const local = alvo - diasAtras * 86_400_000;

  /*
   * O deslocamento é o do instante de agora, e não o do alvo.
   *
   * Os dois só divergem se uma mudança de fuso tiver acontecido entre o corte e
   * agora — no máximo uma hora de diferença, uma vez por ano, num país que hoje
   * não muda. Recalcular no alvo exigiria resolver um instante que talvez não
   * exista (a hora pulada da entrada do horário de verão), e o remédio seria
   * pior que a doença.
   */
  return new Date(local - deslocamentoMin(agora, fuso) * 60_000);
}

/**
 * O dia de manutenção em curso, como `YYYY-MM-DD`.
 *
 * É a data do calendário depois das 6h, e a do dia anterior antes disso. Serve
 * de chave: enquanto ela não muda, a manutenção do dia já foi feita.
 */
export function diaDeManutencao(agora: Date = new Date(), fuso = FUSO): string {
  const v = ultimaVirada(agora, fuso);
  const p = partesNoFuso(v, fuso);
  const dois = (n: number) => String(n).padStart(2, "0");
  return `${p.ano}-${dois(p.mes)}-${dois(p.dia)}`;
}
