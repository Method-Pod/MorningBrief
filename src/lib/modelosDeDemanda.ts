import type { Priority } from "./types";

/*
 * Modelos de demanda: "Carrossel" já nasce com cliente, prioridade,
 * checklist, links e prazo. Ver supabase/CLAUDE-REVISAO-E-MODELOS.sql.
 *
 * As contas de ida e volta moram aqui, e não na tela, porque são duas a
 * usar: o formulário de Demandas e o Claude (lib/mcp), que cria demanda a
 * partir de modelo pelo nome.
 */

export type ModeloDeDemanda = {
  id: string;
  user_id: string;
  nome: string;
  titulo: string;
  descricao: string;
  cliente_id: string | null;
  projeto_id: string | null;
  priority: Priority;
  checklist: string[];
  links: string[];
  /** Dias depois da criação; nulo = sem prazo. */
  prazo_dias: number | null;
  created_at: string;
};

const PRIORIDADES: Priority[] = ["low", "medium", "high", "urgent"];

/** `hoje` + n dias, em YYYY-MM-DD, sem passar por fuso. */
export function somarDias(hoje: string, n: number): string {
  const [a, m, d] = hoje.split("-").map(Number);
  const t = new Date(Date.UTC(a, m - 1, d + n));
  return t.toISOString().slice(0, 10);
}

/** Quantos dias de `hoje` até `data`; nulo se não há data ou ela já passou. */
export function diasAte(hoje: string, data: string | null | undefined): number | null {
  if (!data) return null;
  const [a1, m1, d1] = hoje.split("-").map(Number);
  const [a2, m2, d2] = data.slice(0, 10).split("-").map(Number);
  const n = Math.round((Date.UTC(a2, m2 - 1, d2) - Date.UTC(a1, m1 - 1, d1)) / 86_400_000);
  return n >= 0 && n <= 365 ? n : null;
}

/** Os títulos do checklist, limpos: sem vazios e sem repetir. */
export function limparChecklist(itens: string[]): string[] {
  const vistos = new Set<string>();
  return itens
    .map((t) => t.trim())
    .filter((t) => t && !vistos.has(t.toLowerCase()) && vistos.add(t.toLowerCase()));
}

/** O que a demanda nova recebe do modelo, com o prazo contado de hoje. */
export function demandaDoModelo(m: ModeloDeDemanda, hoje: string) {
  return {
    title: m.titulo.trim() || m.nome.trim(),
    description: m.descricao,
    cliente_id: m.cliente_id,
    projeto_id: m.projeto_id,
    priority: PRIORIDADES.includes(m.priority) ? m.priority : ("medium" as Priority),
    links: m.links ?? [],
    due_date: m.prazo_dias == null ? null : somarDias(hoje, m.prazo_dias),
    checklist: limparChecklist(m.checklist ?? []),
  };
}

/** O modelo que sai de uma demanda (do formulário), pronto para gravar. */
export function modeloDaDemanda(
  d: {
    title: string;
    description: string;
    cliente_id: string | null;
    projeto_id: string | null;
    priority: Priority;
    links: string[];
    checklist: string[];
  },
  nome: string,
  prazoDias: number | null
) {
  return {
    nome: nome.trim().slice(0, 80),
    titulo: d.title.trim(),
    descricao: d.description.trim(),
    cliente_id: d.cliente_id || null,
    projeto_id: d.projeto_id || null,
    priority: d.priority,
    checklist: limparChecklist(d.checklist),
    links: d.links.map((l) => l.trim()).filter(Boolean),
    prazo_dias: prazoDias == null ? null : Math.max(0, Math.min(365, Math.round(prazoDias))),
  };
}

/** Acha um modelo pelo nome, sem ligar para maiúscula, acento ou espaço. */
export function acharModelo<T extends { nome: string }>(lista: T[], nome: string): T | undefined {
  const chave = (s: string) =>
    s.normalize("NFD").replace(/[̀-ͯ]/g, "").trim().toLowerCase();
  const alvo = chave(nome);
  return lista.find((m) => chave(m.nome) === alvo);
}
