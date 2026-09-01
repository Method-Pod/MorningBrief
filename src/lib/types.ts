export type Priority = "low" | "medium" | "high" | "urgent";
export type TaskStatus = "todo" | "doing" | "review" | "done";
export type BillStatus = "pending" | "paid";
export type Frequency =
  | "daily"
  | "weekly"
  | "biweekly"
  | "monthly"
  | "quarterly"
  | "yearly";

export type Note = {
  id: string;
  user_id: string;
  title: string;
  content: string;
  color: string;
  pinned: boolean;
  created_at: string;
  updated_at: string;
};

export type Bill = {
  id: string;
  user_id: string;
  description: string;
  amount: number;
  due_date: string;
  category: string;
  status: BillStatus;
  paid_at: string | null;
  recurring: boolean;
  notes: string;
  created_at: string;
  /* Parcelas: nulo nas duas = conta simples. Ver migration-003.sql. */
  installment_no: number | null;
  installment_total: number | null;
  /*
   * Conta abatida: nulo = pagamento único. Não-nulo = quanto já foi abatido,
   * e a conta segue como dívida do mês atual até cobrir `amount`.
   * Ver ABATIDAS.sql.
   */
  paid_amount: number | null;
};

/** Quanto falta numa conta abatida. Conta comum devolve o valor cheio. */
export const restanteDe = (b: Pick<Bill, "amount" | "paid_amount">) =>
  Math.max(0, Number(b.amount) - Number(b.paid_amount ?? 0));

/** É conta abatida? */
export const ehAbatida = (b: Pick<Bill, "paid_amount">) =>
  b.paid_amount !== null && b.paid_amount !== undefined;

export type Task = {
  id: string;
  user_id: string;
  title: string;
  description: string;
  client: string;
  priority: Priority;
  status: TaskStatus;
  due_date: string | null;
  /* Endereço do material da demanda. Nulo em base sem LINK-NA-DEMANDA.sql. */
  link: string | null;
  origin_id: string | null;
  created_at: string;
  completed_at: string | null;
};

export type RecurringTask = {
  id: string;
  user_id: string;
  title: string;
  description: string;
  client: string;
  priority: Priority;
  /* Link do modelo: cada ocorrência nasce com ele. */
  link: string | null;
  frequency: Frequency;
  weekday: number | null;
  /*
   * Dias da semana da regra semanal: 0 = domingo ... 6 = sábado.
   * Ver supabase/DIAS-DA-SEMANA.sql.
   *
   * Nulo nas regras criadas antes da migração, que seguem valendo pelo
   * `weekday`. Nunca lista vazia — o check no banco não aceita, porque uma
   * regra semanal sem nenhum dia nunca dispararia, em silêncio.
   */
  weekdays: number[] | null;
  /*
   * Modelo do checklist: os títulos dos itens que cada ocorrência recebe.
   * Ver supabase/SUBTAREFAS.sql. Nulo ou vazio = a demanda nasce sem checklist.
   */
  checklist: string[] | null;
  day_of_month: number | null;
  active: boolean;
  last_run_on: string | null;
  created_at: string;
};

export type CalendarEvent = {
  id: string;
  user_id: string;
  title: string;
  description: string;
  start_at: string;
  end_at: string | null;
  all_day: boolean;
  color: string;
  location: string;
  created_at: string;
  /*
   * Repetição do evento. Ver supabase/EVENTOS-RECORRENTES.sql.
   *
   * 'none' é o evento único. As ocorrências de uma repetição compartilham
   * `series_id`, que é um id próprio e não o título: dois eventos podem se
   * chamar igual sem serem a mesma repetição.
   */
  recurrence: EventRecurrence;
  series_id: string | null;
};

export type EventRecurrence = "none" | "weekly" | "biweekly" | "monthly";

export const EVENT_RECURRENCE_LABEL: Record<EventRecurrence, string> = {
  none: "Não repete",
  weekly: "Toda semana",
  biweekly: "A cada 15 dias",
  monthly: "Todo mês",
};

/**
 * Item de checklist de uma demanda.
 *
 * Não tem data nem prioridade de propósito: a unidade de trabalho continua
 * sendo a demanda, e o item é só um pedaço contável dela. Dar data ao item
 * criaria a pergunta "a demanda está atrasada ou só o item?".
 */
export type TaskItem = {
  id: string;
  user_id: string;
  task_id: string;
  title: string;
  done: boolean;
  position: number;
  created_at: string;
};

/** Quantos itens estão feitos, para o rótulo "3/5" e a barra. */
export const progressoDe = (itens: Pick<TaskItem, "done">[]) => ({
  feitos: itens.filter((i) => i.done).length,
  total: itens.length,
});

export const PRIORITY_LABEL: Record<Priority, string> = {
  low: "Baixa",
  medium: "Média",
  high: "Alta",
  urgent: "Urgente",
};

export const STATUS_LABEL: Record<TaskStatus, string> = {
  todo: "A fazer",
  doing: "Em andamento",
  review: "Revisão",
  done: "Concluída",
};

export const FREQUENCY_LABEL: Record<Frequency, string> = {
  daily: "Diária",
  weekly: "Semanal",
  biweekly: "Quinzenal",
  monthly: "Mensal",
  quarterly: "Trimestral",
  yearly: "Anual",
};

/** Inicial de cada dia, para as caixinhas de seleção. Mesma ordem de WEEKDAYS. */
export const WEEKDAYS_SIGLA = ["D", "S", "T", "Q", "Q", "S", "S"];

export const WEEKDAYS = [
  "Domingo",
  "Segunda",
  "Terça",
  "Quarta",
  "Quinta",
  "Sexta",
  "Sábado",
];

export type BillCategory = {
  id: string;
  user_id: string;
  name: string;
  created_at: string;
};

/** Semente usada na primeira visita e como reserva se a tabela não existir. */
export const BILL_CATEGORIES = [
  "Moradia",
  "Impostos",
  "Fornecedores",
  "Software",
  "Marketing",
  "Equipe",
  "Transporte",
  "Saúde",
  "Educação",
  "Outros",
];

export const NOTE_COLORS = ["blue", "violet", "emerald", "amber", "rose", "slate"];

export type Habit = {
  id: string;
  user_id: string;
  name: string;
  color: string;
  target_per_week: number;
  active: boolean;
  created_at: string;
};

export type HabitLog = {
  id: string;
  user_id: string;
  habit_id: string;
  day: string;
  created_at: string;
};

export const HABIT_COLORS = ["blue", "violet", "emerald", "amber", "rose", "slate"];
