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
};

export type Task = {
  id: string;
  user_id: string;
  title: string;
  description: string;
  client: string;
  priority: Priority;
  status: TaskStatus;
  due_date: string | null;
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
  frequency: Frequency;
  weekday: number | null;
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
};

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

export const WEEKDAYS = [
  "Domingo",
  "Segunda",
  "Terça",
  "Quarta",
  "Quinta",
  "Sexta",
  "Sábado",
];

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
