import type { SupabaseClient } from "@supabase/supabase-js";

import { localDay } from "./format";

/**
 * Alterar uma repetição inteira da agenda.
 *
 * Mora aqui, e não dentro de uma tela, porque mudou de lugar: a edição "em
 * todas" saiu do calendário e passou a ser a tela de Eventos recorrentes. Com
 * a conta numa função só, as duas telas não têm como discordar sobre o que
 * "todas" significa — e a parte que faz conta de hora fica testável sem subir
 * o Next.
 *
 * O que vale para a série toda: título, descrição, local, cor, dia inteiro e
 * a HORA. O que é de cada ocorrência: a DATA. Por isso cada linha é escrita
 * com a data que ela já tinha e a hora nova.
 */

/** Os campos que são iguais em todas as ocorrências. */
export type CamposDaSerie = {
  title: string;
  description: string;
  location: string;
  color: string;
  all_day: boolean;
};

/**
 * O início e o fim novos de UMA ocorrência.
 *
 * A data vem da ocorrência, a hora vem do formulário. `duracaoMs` nulo é o
 * evento sem hora de fim — e aí o fim continua nulo, em vez de virar igual ao
 * início, que apareceria no calendário como um evento de duração zero.
 *
 * `localDay` e não `slice(0, 10)`: `start_at` é timestamptz e volta em UTC,
 * então uma ocorrência às 21h de domingo em São Paulo está gravada como
 * segunda em UTC. Cortar a string jogaria a ocorrência para o dia seguinte e
 * a série andaria um dia a cada edição.
 */
export function horarioDaOcorrencia(
  startAtAtual: string,
  hora: string,
  duracaoMs: number | null
): { start_at: string; end_at: string | null } {
  const dia = localDay(startAtAtual);
  const inicio = new Date(`${dia}T${hora || "00:00"}:00`);
  return {
    start_at: inicio.toISOString(),
    end_at:
      duracaoMs === null
        ? null
        : new Date(inicio.getTime() + duracaoMs).toISOString(),
  };
}

/**
 * Grava os campos comuns e a hora nova em todas as ocorrências da série.
 *
 * Em paralelo, e não uma esperando a outra: uma repetição semanal na janela
 * de dois meses tem umas nove ocorrências, e em fila isso é quase um segundo
 * de espera para nove escritas que não dependem umas das outras.
 *
 * Todas são tentadas mesmo que uma falhe, e o primeiro erro é o devolvido.
 * Parar na primeira deixaria a série metade trocada e metade não — que é
 * pior do que falhar inteira, porque não aparece.
 */
export async function atualizarSerie(
  supabase: SupabaseClient,
  {
    serieId,
    campos,
    hora,
    duracaoMs,
  }: {
    serieId: string;
    campos: CamposDaSerie;
    hora: string;
    duracaoMs: number | null;
  }
): Promise<{ gravadas: number; erro: { message: string } | null }> {
  const { data: ocorrencias, error: erroBusca } = await supabase
    .from("events")
    .select("id,start_at")
    .eq("series_id", serieId);
  if (erroBusca) return { gravadas: 0, erro: erroBusca };

  const linhas = (ocorrencias as { id: string; start_at: string }[]) ?? [];
  if (!linhas.length) return { gravadas: 0, erro: null };

  const resultados = await Promise.all(
    linhas.map((o) =>
      supabase
        .from("events")
        .update({ ...campos, ...horarioDaOcorrencia(o.start_at, hora, duracaoMs) })
        .eq("id", o.id)
        .select("id")
    )
  );

  const falha = resultados.find((r) => r.error)?.error ?? null;
  const gravadas = resultados.filter((r) => !r.error && r.data?.length).length;
  return { gravadas, erro: falha };
}
