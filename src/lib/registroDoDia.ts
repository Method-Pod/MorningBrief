import type { SupabaseClient } from "@supabase/supabase-js";
import { diaDeManutencao } from "./viradaDoDia";
import { naoExiste } from "./saudeDoBanco";

/*
 * O registro do dia: o que a limpeza apaga, guardado antes de apagar.
 *
 * Demanda concluída sai às 6h do dia seguinte e aula assistida sai depois
 * de 7 dias -- e com elas ia embora a única prova de que aconteceram. A
 * revisão da semana e os padrões precisam desse histórico, então a limpeza
 * passou a gravar aqui, um dia por linha, e só então apagar. Ver
 * supabase/CLAUDE-REVISAO-E-MODELOS.sql.
 *
 * O dia é o de manutenção (6h às 6h), o mesmo relógio da limpeza: concluir
 * algo à 1h da manhã conta no dia anterior, que é como a pessoa vive.
 */

export type Concluida = {
  id: string;
  titulo: string;
  cliente: string;
  cliente_id: string | null;
  concluida_em: string;
};
export type AulaVista = { id: string; titulo: string; concluida_em: string };

export type RegistroDoDia = {
  dia: string;
  concluidas: Concluida[];
  aulas: AulaVista[];
  energia: number | null;
};

/** O dia (6h às 6h) a que um instante pertence. */
export const diaDoInstante = (iso: string) => diaDeManutencao(new Date(iso));

/** Junta duas listas sem repetir: a mesma coisa, guardada duas vezes, conta uma. */
export function juntarPorId<T extends { id: string }>(antes: T[], novos: T[]): T[] {
  const vistos = new Set(antes.map((x) => x.id));
  return [...antes, ...novos.filter((x) => !vistos.has(x.id))];
}

/**
 * Grava itens no registro, agrupados pelo dia em que aconteceram.
 *
 * Lê o que o dia já tinha e junta: a limpeza pode rodar duas vezes (cron e
 * Início), e a segunda não pode apagar o que a primeira guardou. A energia
 * do dia não é tocada -- ela não vai no pedido.
 *
 * "sem-tabela" quando o SQL ainda não rodou: aí quem chama segue limpando
 * como antes. "erro" em qualquer outra falha: aí quem chama NÃO apaga,
 * porque apagar sem ter guardado perderia o histórico de vez.
 *
 * `userId` é obrigatório com a chave de serviço (ela passa por cima do RLS);
 * no navegador o RLS e o valor padrão da coluna cuidam disso.
 */
export async function guardarNoRegistro(
  supabase: SupabaseClient,
  campo: "concluidas" | "aulas",
  itens: (Concluida | AulaVista)[],
  userId?: string
): Promise<"ok" | "sem-tabela" | "erro"> {
  if (!itens.length) return "ok";
  const porDia = new Map<string, (Concluida | AulaVista)[]>();
  for (const it of itens) {
    const d = diaDoInstante(it.concluida_em);
    porDia.set(d, [...(porDia.get(d) ?? []), it]);
  }
  const dias = [...porDia.keys()];

  let leitura = supabase.from("registro_do_dia").select(`dia, ${campo}`).in("dia", dias);
  if (userId) leitura = leitura.eq("user_id", userId);
  const { data, error } = await leitura;
  if (error) return naoExiste(error) ? "sem-tabela" : "erro";

  const tinha = new Map(
    ((data ?? []) as unknown as Record<string, unknown>[]).map((r) => [
      String(r.dia),
      (r[campo] as (Concluida | AulaVista)[]) ?? [],
    ])
  );
  const agora = new Date().toISOString();
  const linhas = dias.map((dia) => ({
    ...(userId ? { user_id: userId } : {}),
    dia,
    [campo]: juntarPorId(tinha.get(dia) ?? [], porDia.get(dia) ?? []),
    atualizado_em: agora,
  }));
  const { error: erroGravar } = await supabase
    .from("registro_do_dia")
    .upsert(linhas, { onConflict: "user_id,dia" });
  if (erroGravar) return naoExiste(erroGravar) ? "sem-tabela" : "erro";
  return "ok";
}

/** O registro de um intervalo de dias, inclusive nas duas pontas. */
export async function lerRegistro(
  supabase: SupabaseClient,
  { de, ate, userId }: { de: string; ate: string; userId?: string }
): Promise<{ dias: RegistroDoDia[]; semTabela: boolean }> {
  let q = supabase
    .from("registro_do_dia")
    .select("dia, concluidas, aulas, energia")
    .gte("dia", de)
    .lte("dia", ate);
  if (userId) q = q.eq("user_id", userId);
  const { data, error } = await q;
  if (error) return { dias: [], semTabela: naoExiste(error) };
  return {
    dias: ((data ?? []) as RegistroDoDia[]).map((r) => ({
      dia: String(r.dia),
      concluidas: r.concluidas ?? [],
      aulas: r.aulas ?? [],
      energia: r.energia ?? null,
    })),
    semTabela: false,
  };
}

/**
 * Grava a energia do dia em curso (1 a 5), ou tira com `null`. Com a chave
 * de serviço (o Claude), passe `userId`.
 */
export async function gravarEnergia(
  supabase: SupabaseClient,
  energia: number | null,
  { agora = new Date(), userId }: { agora?: Date; userId?: string } = {}
) {
  return supabase
    .from("registro_do_dia")
    .upsert(
      {
        ...(userId ? { user_id: userId } : {}),
        dia: diaDeManutencao(agora),
        energia,
        atualizado_em: agora.toISOString(),
      },
      { onConflict: "user_id,dia" }
    );
}
