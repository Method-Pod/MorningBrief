/**
 * Todas as tabelas com dados da pessoa -- o que uma cópia de segurança precisa
 * levar.
 *
 * Mora aqui, e não dentro da tela de Conta como antes, porque agora são dois
 * a usar a mesma lista: o botão "Exportar tudo" e a cópia automática do cron.
 * Na tela ela já tinha esquecido `playlists` -- as pastas de playlist das
 * Aulas não entravam no arquivo. O teste `tabelasDoApp.test.mjs` compara esta
 * lista com toda tabela que o código consulta, para isso não voltar a
 * acontecer calado.
 *
 * Fica de fora, de propósito, só `push_assinaturas`: são os endereços de
 * notificação de cada aparelho, com as chaves de cada um. Não é dado da
 * pessoa, não serve para restaurar nada (o aparelho se inscreve de novo) e
 * não deve passear num arquivo baixado.
 */
export const TABELAS_DO_APP = [
  "bills",
  "cartoes",
  "bill_categories",
  "tasks",
  "task_items",
  "clientes",
  "projetos",
  "recurring_tasks",
  "events",
  "habits",
  "habit_logs",
  "notes",
  "note_categories",
  "note_in_category",
  "referencias",
  "colecoes",
  "referencia_colecao",
  "books",
  "reading_sessions",
  "reading_goals",
  "lessons",
  "playlists",
  "courses",
  "subjects",
  "lesson_goals",
  "channels",
] as const;

/** As que o código consulta e que, de propósito, não entram na cópia. */
export const TABELAS_FORA_DA_COPIA = ["push_assinaturas", "app_erros"] as const;
