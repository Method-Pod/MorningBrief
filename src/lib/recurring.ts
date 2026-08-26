import type { RecurringTask } from "./types";
import { todayISO } from "./format";

const DAY = 86_400_000;

const toDate = (iso: string) => new Date(iso.slice(0, 10) + "T00:00:00");
const toISO = (d: Date) => {
  const off = d.getTimezoneOffset();
  return new Date(d.getTime() - off * 60_000).toISOString().slice(0, 10);
};
const daysBetween = (a: string, b: string) =>
  Math.round((toDate(b).getTime() - toDate(a).getTime()) / DAY);
const daysInMonth = (y: number, m: number) => new Date(y, m + 1, 0).getDate();

/** Dia do mês pedido, encolhido para o último dia quando o mês é curto. */
function effectiveDom(r: RecurringTask, d: Date) {
  const dom = r.day_of_month ?? 1;
  return Math.min(dom, daysInMonth(d.getFullYear(), d.getMonth()));
}

/** A recorrência deve gerar uma demanda na data `iso`? */
export function isDueOn(r: RecurringTask, iso: string): boolean {
  if (!r.active) return false;
  if (r.last_run_on === iso) return false;

  const d = toDate(iso);
  const gap = r.last_run_on ? daysBetween(r.last_run_on, iso) : Infinity;

  switch (r.frequency) {
    case "daily":
      return true;
    case "weekly":
      return d.getDay() === (r.weekday ?? 1);
    case "biweekly":
      return d.getDay() === (r.weekday ?? 1) && gap >= 14;
    case "monthly":
      return d.getDate() === effectiveDom(r, d);
    case "quarterly":
      return d.getDate() === effectiveDom(r, d) && gap >= 80;
    case "yearly":
      return d.getDate() === effectiveDom(r, d) && gap >= 350;
    default:
      return false;
  }
}

/**
 * Próxima data em que a recorrência realmente dispara, olhando até 400 dias
 * à frente. Avalia com o `last_run_on` real — é o que garante que o intervalo
 * mínimo de quinzenal/trimestral/anual seja respeitado; zerar o campo aqui
 * fazia a regra quinzenal anunciar "hoje" num dia em que ela não geraria nada.
 */
export function nextOccurrence(r: RecurringTask, fromISO = todayISO()): string | null {
  if (!r.active) return null;
  const start = toDate(fromISO);
  for (let i = 0; i <= 400; i++) {
    const iso = toISO(new Date(start.getTime() + i * DAY));
    if (isDueOn(r, iso)) return iso;
  }
  return null;
}

export function frequencyDescription(r: RecurringTask): string {
  const WD = ["domingo", "segunda", "terça", "quarta", "quinta", "sexta", "sábado"];
  switch (r.frequency) {
    case "daily":
      return "Todos os dias";
    case "weekly":
      return `Toda ${WD[r.weekday ?? 1]}`;
    case "biweekly":
      return `A cada 15 dias, ${WD[r.weekday ?? 1]}`;
    case "monthly":
      return `Dia ${r.day_of_month ?? 1} de cada mês`;
    case "quarterly":
      return `Dia ${r.day_of_month ?? 1}, a cada 3 meses`;
    case "yearly":
      return `Dia ${r.day_of_month ?? 1}, uma vez por ano`;
  }
}
