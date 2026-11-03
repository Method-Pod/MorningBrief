import type { SupabaseClient } from "@supabase/supabase-js";

/*
 * Quais arquivos de supabase/ já foram rodados no banco.
 *
 * São 30 e tantos SQLs, rodados à mão no SQL Editor, sem registro de quais
 * já foram. O app aguenta coluna faltando (cai no comportamento antigo), e
 * por isso mesmo um SQL esquecido não quebra nada à vista: a função nova só
 * não funciona, calada. Foi assim com PRIVACIDADE-E-AGENDA.sql, pendente
 * desde outubro.
 *
 * Em vez de uma tabela de controle -- que também dependeria de alguém
 * lembrar de marcar --, o app PERGUNTA ao banco: para cada arquivo, pede as
 * tabelas e colunas que ele cria, com `limit(0)`, que não traz linha
 * nenhuma. Se o banco reclama que a coluna não existe, o arquivo não rodou.
 *
 * O que não dá para perguntar assim (índice, valor padrão, regra de
 * validação) fica marcado como tal, com o motivo -- e não como "ok".
 *
 * O teste `saudeDoBanco.test.mjs` exige uma linha aqui para cada arquivo da
 * pasta: SQL novo sem verificação não passa.
 */

export type Sonda = { tabela: string; colunas?: string[] } | { balde: string };

export type ArquivoSql = {
  arquivo: string;
  /** `null` = não há o que perguntar pela API; ver `porque`. */
  sondas: Sonda[] | null;
  porque?: string;
};

export const ARQUIVOS_SQL: ArquivoSql[] = [
  {
    arquivo: "schema.sql",
    sondas: [
      { tabela: "notes" },
      { tabela: "bills" },
      { tabela: "tasks" },
      { tabela: "recurring_tasks" },
      { tabela: "events" },
    ],
  },
  { arquivo: "migration-002.sql", sondas: null, porque: "só cria um índice contra demanda recorrente duplicada" },
  { arquivo: "migration-003.sql", sondas: [{ tabela: "bills", colunas: ["installment_no", "installment_total"] }] },
  {
    arquivo: "PENDENTE.sql",
    sondas: [
      { tabela: "habits" },
      { tabela: "habit_logs" },
      { tabela: "bills", colunas: ["installment_no", "installment_total"] },
      { balde: "avatars" },
    ],
  },
  { arquivo: "ABATIDAS.sql", sondas: [{ tabela: "bills", colunas: ["paid_amount"] }] },
  { arquivo: "AULAS.sql", sondas: [{ tabela: "lessons" }] },
  { arquivo: "AULAS-EXTRAS.sql", sondas: [{ tabela: "lesson_goals" }] },
  { arquivo: "CANAIS.sql", sondas: [{ tabela: "channels" }] },
  { arquivo: "CAPAS.sql", sondas: [{ balde: "capas" }] },
  {
    arquivo: "CARTOES.sql",
    sondas: [
      { tabela: "cartoes" },
      { tabela: "bills", colunas: ["cartao_id", "valor_variavel", "fecha_dia"] },
    ],
  },
  { arquivo: "CATEGORIAS.sql", sondas: [{ tabela: "bill_categories" }] },
  {
    arquivo: "CATEGORIAS-DE-NOTA.sql",
    sondas: [{ tabela: "note_categories" }, { tabela: "note_in_category" }],
  },
  {
    arquivo: "CLIENTES.sql",
    sondas: [
      { tabela: "clientes" },
      { tabela: "projetos" },
      { tabela: "tasks", colunas: ["cliente_id", "projeto_id"] },
      { tabela: "recurring_tasks", colunas: ["cliente_id", "projeto_id"] },
    ],
  },
  { arquivo: "CONTAS-SEM-DUPLICATA.sql", sondas: null, porque: "só cria um índice contra conta fixa duplicada" },
  { arquivo: "COR-ROXA.sql", sondas: null, porque: "só troca a cor padrão de itens novos" },
  {
    arquivo: "CURSOS-E-ASSUNTOS.sql",
    sondas: [{ tabela: "subjects" }, { tabela: "courses" }, { tabela: "lessons", colunas: ["subject_id"] }],
  },
  { arquivo: "DEMANDAS-ARQUIVADAS.sql", sondas: [{ tabela: "tasks", colunas: ["arquivada_em"] }] },
  { arquivo: "DIAS-DA-SEMANA.sql", sondas: [{ tabela: "recurring_tasks", colunas: ["weekdays"] }] },
  { arquivo: "DURACAO-EXATA.sql", sondas: [{ tabela: "lessons", colunas: ["duracao_seg"] }] },
  { arquivo: "ERROS-DO-APP.sql", sondas: [{ tabela: "app_erros" }] },
  { arquivo: "EVENTOS-RECORRENTES.sql", sondas: [{ tabela: "events", colunas: ["recurrence", "series_id"] }] },
  { arquivo: "HORARIO-NA-DEMANDA.sql", sondas: [{ tabela: "tasks", colunas: ["due_time"] }] },
  { arquivo: "ICONE-DO-SITE.sql", sondas: [{ tabela: "referencias", colunas: ["icon_url"] }] },
  { arquivo: "LEITURA.sql", sondas: [{ tabela: "books" }, { tabela: "reading_sessions" }] },
  {
    arquivo: "LEITURA-EXTRAS.sql",
    sondas: [{ tabela: "reading_goals" }, { tabela: "books", colunas: ["rating"] }],
  },
  {
    arquivo: "LINK-NA-DEMANDA.sql",
    sondas: [
      { tabela: "tasks", colunas: ["links"] },
      { tabela: "recurring_tasks", colunas: ["links"] },
    ],
  },
  { arquivo: "ORDEM-PROJETOS.sql", sondas: [{ tabela: "projetos", colunas: ["position"] }] },
  {
    arquivo: "PASTAS-DE-PLAYLIST.sql",
    sondas: [{ tabela: "playlists" }, { tabela: "lessons", colunas: ["playlist_id", "posicao"] }],
  },
  { arquivo: "PRATELEIRAS.sql", sondas: null, porque: "só amplia os estados aceitos de um livro" },
  {
    arquivo: "PRIVACIDADE-E-AGENDA.sql",
    sondas: [{ tabela: "push_assinaturas" }, { tabela: "events", colunas: ["cancelado"] }],
  },
  { arquivo: "REFERENCIA-SO-IMAGEM.sql", sondas: null, porque: "só deixa o link da referência ser opcional" },
  {
    arquivo: "REFERENCIAS.sql",
    sondas: [
      { tabela: "colecoes" },
      { tabela: "referencias" },
      { tabela: "referencia_colecao" },
      { balde: "referencias" },
    ],
  },
  { arquivo: "SITE-DE-BUSCA.sql", sondas: [{ tabela: "referencias", colunas: ["busca"] }] },
  {
    arquivo: "SUBTAREFAS.sql",
    sondas: [{ tabela: "task_items" }, { tabela: "recurring_tasks", colunas: ["checklist"] }],
  },
];

export type Situacao =
  | { estado: "ok" }
  | { estado: "pendente"; falta: string }
  | { estado: "sem-como-conferir"; porque: string }
  | { estado: "nao-deu"; erro: string };

/**
 * O erro diz que a coisa não existe? Então o SQL não rodou.
 *
 * Qualquer outro erro (sem rede, sessão vencida) NÃO é "pendente": é "não
 * deu para conferir". Confundir os dois mandaria rodar de novo um SQL que já
 * rodou -- inofensivo, porque todos são idempotentes, mas falso.
 */
export function naoExiste(erro: { code?: string; message?: string } | null): boolean {
  if (!erro) return false;
  if (erro.code && ["42703", "42P01", "PGRST204", "PGRST205"].includes(erro.code)) return true;
  return /does not exist|could not find|bucket not found/i.test(erro.message ?? "");
}

const nomeDa = (s: Sonda) =>
  "balde" in s
    ? `a pasta de arquivos "${s.balde}"`
    : s.colunas
      ? `${s.colunas.join(", ")} em ${s.tabela}`
      : `a tabela ${s.tabela}`;

async function perguntar(supabase: SupabaseClient, s: Sonda) {
  if ("balde" in s) {
    const { error } = await supabase.storage.from(s.balde).list("", { limit: 1 });
    return error as { message?: string } | null;
  }
  const { error } = await supabase
    .from(s.tabela)
    .select(s.colunas ? s.colunas.join(",") : "*")
    .limit(0);
  return error;
}

/** Confere um arquivo. Todas as sondas dele de uma vez. */
export async function conferirArquivo(
  supabase: SupabaseClient,
  a: ArquivoSql
): Promise<Situacao> {
  if (!a.sondas) return { estado: "sem-como-conferir", porque: a.porque ?? "" };
  const erros = await Promise.all(a.sondas.map((s) => perguntar(supabase, s)));
  const faltam = a.sondas.filter((_, i) => naoExiste(erros[i]));
  if (faltam.length) return { estado: "pendente", falta: faltam.map(nomeDa).join("; ") };
  const outro = erros.find((e) => e);
  if (outro) return { estado: "nao-deu", erro: outro.message ?? "erro desconhecido" };
  return { estado: "ok" };
}
