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
 * Ficam de fora, de propósito: `push_assinaturas` (os endereços de
 * notificação de cada aparelho, com as chaves de cada um -- o aparelho se
 * inscreve de novo), `chaves_do_claude` (impressões digitais de chaves de
 * acesso, que não devem passear num arquivo baixado) e `app_erros` (registro
 * técnico, não dado da pessoa).
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
  "registro_do_dia",
  "modelos_de_demanda",
] as const;

/** As que o código consulta e que, de propósito, não entram na cópia. */
export const TABELAS_FORA_DA_COPIA = ["push_assinaturas", "app_erros", "chaves_do_claude"] as const;
