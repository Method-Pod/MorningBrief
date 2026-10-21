import type { TaskStatus } from "./types";

/*
 * Para onde a demanda só vai com o checklist inteiro feito.
 *
 * Revisão entrou junto com Concluída: mandar para revisar com corte em aberto
 * é pedir que alguém revise um trabalho que ainda não terminou. Voltar para A
 * fazer ou Em andamento não pede nada.
 */
export const PEDE_CHECKLIST_COMPLETO: TaskStatus[] = ["review", "done"];

export const pedeChecklistCompleto = (status: TaskStatus) =>
  PEDE_CHECKLIST_COMPLETO.includes(status);

const itens = (n: number) => `${n} ${n === 1 ? "item" : "itens"}`;

/** A confirmação do quadro: concluir os itens em aberto e mover. */
export function confirmacaoDoChecklist(
  titulo: string,
  faltam: number,
  status: TaskStatus
) {
  const revisao = status === "review";
  return {
    texto: `"${titulo}" tem ${itens(faltam)} do checklist em aberto. Concluir ${
      faltam === 1 ? "ele" : "eles"
    } e ${revisao ? "enviar a demanda para revisão" : "a demanda"}?`,
    titulo: revisao ? "Enviar para revisão" : "Concluir a demanda",
    rotulo: revisao ? "Concluir itens e enviar" : "Concluir tudo",
  };
}

/** O aviso do formulário, que recusa em vez de concluir sozinho. */
export const avisoDoChecklist = (faltam: number, status: TaskStatus) =>
  `${faltam === 1 ? "Falta" : "Faltam"} ${itens(faltam)} do checklist. Marque tudo antes de ${
    status === "review" ? "enviar a demanda para revisão" : "concluir a demanda"
  }.`;
