import type { SupabaseClient } from "@supabase/supabase-js";
import { TABELAS_DO_APP } from "./tabelasDoApp";

/*
 * Cópia de segurança automática, todo dia, antes da limpeza das 6h.
 *
 * Até aqui a única cópia era o botão "Exportar tudo", e ela só existia se
 * alguém lembrasse de apertar. Enquanto isso o cron apaga de verdade todo
 * dia (concluídas, pagas antigas, eventos passados), e um defeito numa
 * dessas rotinas -- ou um script meu rodado no lugar errado, o que já
 * aconteceu duas vezes -- não tinha volta.
 *
 * Roda no cron, com a chave de serviço, ANTES da manutenção: a cópia do dia
 * é o retrato de como as coisas estavam antes de qualquer apagamento. Fica
 * num balde privado do Storage, numa pasta por pessoa. Só a chave de serviço
 * lê: não há política de leitura no balde, e quem baixa é a rota
 * /api/copias, que confere a sessão e só lista a pasta do próprio dono.
 *
 * O que ela NÃO cobre, e está dito na tela: as imagens (fotos, capas,
 * prévias de referência) ficam como endereço, não como arquivo, e a cópia
 * mora no mesmo Supabase -- protege de apagamento por engano, não de perder
 * o projeto inteiro. Para isso continua o arquivo baixado.
 */

export const BALDE_DAS_COPIAS = "copias";
/** Todas as cópias diárias dos últimos 14 dias. */
export const DIAS_DE_COPIA = 14;
/** E, além delas, a do dia 1º de cada um dos últimos 6 meses. */
export const MESES_DE_COPIA_MENSAL = 6;

const NOME = /^(\d{4})-(\d{2})-(\d{2})\.json$/;

const diaUTC = (iso: string) => {
  const [a, m, d] = iso.split("-").map(Number);
  return Date.UTC(a, m - 1, d);
};

/**
 * Quais cópias já passaram do prazo.
 *
 * Fica toda cópia de menos de 14 dias e a do dia 1º dos últimos 6 meses.
 * Arquivo com nome fora do padrão não é apagado: o que não se reconhece não
 * se joga fora.
 */
export function copiasVencidas(nomes: string[], hoje: string): string[] {
  const agora = diaUTC(hoje);
  return nomes.filter((nome) => {
    const m = NOME.exec(nome);
    if (!m) return false;
    const dias = Math.round((agora - diaUTC(`${m[1]}-${m[2]}-${m[3]}`)) / 86_400_000);
    if (dias < DIAS_DE_COPIA) return false;
    if (m[3] === "01" && dias <= MESES_DE_COPIA_MENSAL * 31) return false;
    return true;
  });
}

type Lido = { tabelas: Record<string, unknown[] | { erro: string }>; linhas: number; falhas: string[] };

/**
 * Tudo da pessoa, tabela por tabela, de 1000 em 1000 (o teto por consulta).
 *
 * Com a chave de serviço o RLS não filtra nada: o `user_id` explícito em
 * cada consulta é o que impede a cópia de uma pessoa de levar linhas de
 * outra. Uma tabela que falhe entra no arquivo como erro e não derruba as
 * outras.
 */
export async function lerTudoDaPessoa(
  supabase: SupabaseClient,
  userId: string
): Promise<Lido> {
  const lidas = await Promise.all(
    TABELAS_DO_APP.map(async (t) => {
      const todas: unknown[] = [];
      for (let de = 0; ; de += 1000) {
        const { data, error } = await supabase
          .from(t)
          .select("*")
          .eq("user_id", userId)
          .range(de, de + 999);
        if (error) return [t, { erro: error.message }] as const;
        todas.push(...(data ?? []));
        if (!data || data.length < 1000) break;
      }
      return [t, todas] as const;
    })
  );
  const tabelas: Lido["tabelas"] = {};
  const falhas: string[] = [];
  let linhas = 0;
  for (const [t, v] of lidas) {
    tabelas[t] = v;
    if (Array.isArray(v)) linhas += v.length;
    else falhas.push(t);
  }
  return { tabelas, linhas, falhas };
}

export type ResultadoDaCopia = {
  arquivo: string;
  linhas: number;
  bytes: number;
  falhas: string[];
  apagadas: number;
};

/**
 * Faz a cópia do dia e apaga as que venceram.
 *
 * `null` quando não deu para guardar -- e nesse caso nada é apagado: as
 * cópias antigas só saem depois que a nova está gravada. Se TODAS as tabelas
 * falharem a leitura, também não grava: um arquivo só de erros, repetido por
 * 14 dias, empurraria as cópias boas para fora.
 */
export async function fazerCopia(
  supabase: SupabaseClient,
  { userId, hoje }: { userId: string; hoje: string }
): Promise<ResultadoDaCopia | null> {
  try {
    const balde = supabase.storage;
    const { error: semBalde } = await balde.getBucket(BALDE_DAS_COPIAS);
    if (semBalde) {
      const { error } = await balde.createBucket(BALDE_DAS_COPIAS, { public: false });
      if (error && !/already exists/i.test(error.message)) throw error;
    }

    const lido = await lerTudoDaPessoa(supabase, userId);
    if (lido.falhas.length === TABELAS_DO_APP.length) {
      console.error("[copia] nenhuma tabela foi lida", lido.falhas);
      return null;
    }

    const corpo = JSON.stringify({
      app: "morning-brief",
      tipo: "copia-automatica",
      feita_em: new Date().toISOString(),
      dia: hoje,
      tabelas: lido.tabelas,
    });
    const arquivo = `${userId}/${hoje}.json`;
    const pasta = balde.from(BALDE_DAS_COPIAS);
    const { error: envio } = await pasta.upload(
      arquivo,
      new Blob([corpo], { type: "application/json" }),
      { upsert: true, contentType: "application/json" }
    );
    if (envio) throw envio;

    let apagadas = 0;
    const { data: lista, error: erroLista } = await pasta.list(userId, {
      limit: 1000,
      sortBy: { column: "name", order: "asc" },
    });
    if (!erroLista && lista) {
      const vencidas = copiasVencidas(
        lista.map((a) => a.name),
        hoje
      );
      if (vencidas.length) {
        const { error } = await pasta.remove(vencidas.map((n) => `${userId}/${n}`));
        if (!error) apagadas = vencidas.length;
      }
    }

    return {
      arquivo,
      linhas: lido.linhas,
      bytes: new TextEncoder().encode(corpo).length,
      falhas: lido.falhas,
      apagadas,
    };
  } catch (e) {
    console.error("[copia]", e);
    return null;
  }
}
