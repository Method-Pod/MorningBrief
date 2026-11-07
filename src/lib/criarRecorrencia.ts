import type { SupabaseClient } from "@supabase/supabase-js";
import type { Frequency, Priority, RecurringTask } from "./types";
import { isDueOn, nextOccurrence } from "./recurring";

/*
 * Cria uma demanda recorrente: a regra, e a ocorrência de hoje se a regra
 * cai hoje.
 *
 * Morava dentro da tela de Demandas, e a tela de Recorrentes não sabia criar
 * -- o botão "Nova demanda recorrente" de lá só levava de volta para
 * Demandas, sem painel nenhum. Aqui, as duas telas criam pelo mesmo caminho,
 * com cliente do cadastro, links e checklist, e não há como uma ficar
 * diferente da outra.
 */

export type DadosDaRecorrencia = {
  title: string;
  description: string;
  /** O nome de agora, gravado junto como retrato. */
  client: string;
  priority: Priority;
  cliente_id: string | null;
  projeto_id: string | null;
  links: string[];
};

export type RegraDaRecorrencia = {
  frequency: Frequency;
  weekday: number;
  weekdays: number[];
  day_of_month: number;
};

/** Os campos da regra como o banco guarda, a partir do formulário. */
export function camposDaRegra(r: RegraDaRecorrencia) {
  const semanal = r.frequency === "weekly" || r.frequency === "biweekly";
  const mensal = ["monthly", "quarterly", "yearly"].includes(r.frequency);
  return {
    frequency: r.frequency,
    /*
     * `weekday` segue sendo gravado: é o que as regras antigas usam e o que
     * o quinzenal continua lendo. No semanal ele fica com o primeiro dia
     * marcado, então a regra funciona igual num banco sem a migração de
     * vários dias.
     */
    weekday: semanal
      ? r.frequency === "weekly"
        ? Math.min(...r.weekdays)
        : Number(r.weekday)
      : null,
    day_of_month: mensal ? Math.min(31, Math.max(1, Number(r.day_of_month) || 1)) : null,
  };
}

/** O recado certo para a coluna que faltou no banco. */
export function recadoDoErro(mensagem: string): string {
  if (/weekdays/.test(mensagem))
    return "Vários dias da semana precisa de supabase/DIAS-DA-SEMANA.sql no banco. Rode o arquivo ou deixe um dia só marcado.";
  if (/checklist/.test(mensagem))
    return "Checklist precisa de supabase/SUBTAREFAS.sql no banco. Rode o arquivo ou deixe a lista vazia.";
  if (/links/.test(mensagem))
    return "Links precisam de supabase/LINK-NA-DEMANDA.sql no banco. Rode o arquivo ou deixe os campos vazios.";
  return mensagem;
}

export async function criarRecorrencia(
  supabase: SupabaseClient,
  {
    uid,
    hoje,
    dados,
    regra,
    checklist,
    comCadastro,
  }: {
    uid: string;
    hoje: string;
    dados: DadosDaRecorrencia;
    regra: RegraDaRecorrencia;
    checklist: { title: string; done?: boolean }[];
    /* Sem cadastro de clientes (CLIENTES.sql não rodado), as colunas de
       cliente não vão: mandá-las faria toda recorrente falhar. */
    comCadastro: boolean;
  }
): Promise<{ erro: string } | { regraId: string; geradaHoje: boolean; primeira: string | null }> {
  const campos = camposDaRegra(regra);

  /*
   * Só materializa hoje se a regra cai hoje.
   *
   * Criava a demanda de hoje sempre: uma mensal do dia 20 criada no dia 3
   * nascia com uma demanda no dia 3 -- e no dia 20 vinha outra. E gravar
   * "rodou hoje" pulava a primeira de uma quinzenal ou trimestral. Fora do
   * dia, a regra nasce sem nada e a primeira sai na data dela.
   */
  const regraNova = {
    ...campos,
    active: true,
    last_run_on: null,
    weekdays: regra.frequency === "weekly" ? regra.weekdays : null,
  } as unknown as RecurringTask;
  const venceHoje = isDueOn(regraNova, hoje);

  const base = {
    title: dados.title,
    description: dados.description,
    client: dados.client,
    priority: dados.priority,
    ...(comCadastro ? { cliente_id: dados.cliente_id, projeto_id: dados.projeto_id } : {}),
    /* Os links só entram quando existem: sem LINK-NA-DEMANDA.sql, mandá-los
       sempre faria falhar também as recorrentes sem link. */
    ...(dados.links.length ? { links: dados.links } : {}),
  };

  const { data: criada, error: erroRegra } = await supabase
    .from("recurring_tasks")
    .insert({
      ...base,
      ...campos,
      user_id: uid,
      /* A coluna de vários dias só entra quando há mais de um (DIAS-DA-SEMANA.sql). */
      ...(regra.frequency === "weekly" && regra.weekdays.length > 1 ? { weekdays: regra.weekdays } : {}),
      active: true,
      last_run_on: venceHoje ? hoje : null,
      /* O modelo guarda só os títulos: cada ocorrência nasce desmarcada. */
      ...(checklist.length ? { checklist: checklist.map((i) => i.title) } : {}),
    })
    .select("id")
    .single();

  if (erroRegra || !criada) return { erro: recadoDoErro(erroRegra?.message ?? "Não foi possível criar a recorrência.") };
  const regraId = (criada as { id: string }).id;

  if (!venceHoje) return { regraId, geradaHoje: false, primeira: nextOccurrence(regraNova, hoje) };

  const { data: hoje1, error: erroTarefa } = await supabase
    .from("tasks")
    .insert({ ...base, user_id: uid, status: "todo", due_date: hoje, origin_id: regraId })
    .select("id")
    .single();
  if (erroTarefa) return { erro: erroTarefa.message };

  /* A ocorrência de hoje já nasce com os itens do modelo. */
  if (hoje1 && checklist.length)
    await supabase.from("task_items").insert(
      checklist.map((item, i) => ({
        user_id: uid,
        task_id: (hoje1 as { id: string }).id,
        title: item.title,
        done: item.done ?? false,
        position: i,
      }))
    );

  return { regraId, geradaHoje: true, primeira: hoje };
}
