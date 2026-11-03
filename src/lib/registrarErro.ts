/*
 * Guarda os erros do app na tabela `app_erros` (supabase/ERROS-DO-APP.sql).
 *
 * Antes, um erro só existia na tela de quem o viu: o aviso "Não foi possível
 * marcar o hábito" sumia em segundos, e a tela quebrada ficava no console do
 * celular, que ninguém abre. Para chegar até mim dependia de ele lembrar o
 * que estava fazendo e descrever. Agora fica gravado, com a tela e a versão,
 * e aparece em Conta > Dados para copiar.
 *
 * Três portas chamam isto: o `check` dos avisos (todo pedido ao banco que
 * falha), a tela de erro do Next e os erros soltos da janela (VigiaDeErros).
 *
 * Nunca lança, nunca avisa e nunca chama a si mesmo: se gravar o erro
 * falhar -- sem rede, sem sessão, tabela ainda não criada --, desiste calado.
 * Um registrador de erros que gera erro é pior que nenhum.
 */

export const LIMITES = { mensagem: 500, detalhe: 4000, pagina: 300, aparelho: 300, versao: 40 };
/** Por visita. Um laço de erro não pode virar mil linhas. */
export const MAXIMO_POR_VISITA = 15;
/** O mesmo erro, de novo, dentro deste tempo, não é gravado outra vez. */
export const JANELA_DE_REPETICAO_MS = 10 * 60_000;

/*
 * Ruído que não é defeito do app:
 * - "ResizeObserver loop" é aviso do navegador, inofensivo;
 * - "Script error." é erro de script de outro site, sem detalhe nenhum;
 * - pedido cancelado é o próprio app desistindo de propósito;
 * - pedaço do pacote que não carrega é deploy novo com a aba velha aberta,
 *   e o AvisoDeVersao já cuida disso.
 */
const RUIDO = [
  /ResizeObserver loop/i,
  /^Script error\.?$/i,
  /AbortError|The (user|operation) aborted|signal is aborted/i,
  /ChunkLoadError|Loading chunk [\w-]+ failed|Failed to fetch dynamically imported module/i,
];

const corta = (v: string, n: number) => (v.length > n ? v.slice(0, n - 1) + "…" : v);

export type ErroPreparado = {
  mensagem: string;
  detalhe: string;
  pagina: string;
  aparelho: string;
  versao: string;
};

/** O texto de qualquer coisa que tenha sido lançada ou devolvida como erro. */
function textoDe(erro: unknown): { mensagem: string; detalhe: string } {
  if (erro instanceof Error)
    return { mensagem: erro.message || erro.name, detalhe: erro.stack ?? "" };
  if (typeof erro === "string") return { mensagem: erro, detalhe: "" };
  if (erro && typeof erro === "object") {
    /* O erro do Supabase não é Error: é um objeto com message, code e details. */
    const o = erro as { message?: unknown; code?: unknown; details?: unknown; hint?: unknown };
    if (typeof o.message === "string") {
      const extra = [o.code, o.details, o.hint].filter((x) => typeof x === "string" && x);
      return { mensagem: o.message, detalhe: extra.join(" · ") };
    }
  }
  return { mensagem: String(erro), detalhe: "" };
}

/**
 * Monta a linha a gravar, ou `null` para o que é ruído.
 *
 * `onde` é o contexto de quem chamou ("marcar o hábito", "tela"), e vai na
 * frente da mensagem: "marcar o hábito: duplicate key..." diz mais que só
 * a mensagem do banco.
 */
export function prepararErro(
  erro: unknown,
  ambiente: { onde?: string; pagina: string; aparelho: string; versao: string }
): ErroPreparado | null {
  const { mensagem, detalhe } = textoDe(erro);
  const limpa = mensagem.trim();
  if (!limpa || RUIDO.some((r) => r.test(limpa))) return null;
  return {
    mensagem: corta(ambiente.onde ? `${ambiente.onde}: ${limpa}` : limpa, LIMITES.mensagem),
    detalhe: corta(detalhe, LIMITES.detalhe),
    pagina: corta(ambiente.pagina, LIMITES.pagina),
    aparelho: corta(ambiente.aparelho, LIMITES.aparelho),
    versao: corta(ambiente.versao, LIMITES.versao),
  };
}

/** A trava de repetição e de quantidade, separada para o teste. */
export function criarTrava(agora: () => number = Date.now) {
  const vistos = new Map<string, number>();
  let gravados = 0;
  return (chave: string) => {
    if (gravados >= MAXIMO_POR_VISITA) return false;
    const t = agora();
    const ultimo = vistos.get(chave);
    if (ultimo !== undefined && t - ultimo < JANELA_DE_REPETICAO_MS) return false;
    vistos.set(chave, t);
    gravados++;
    return true;
  };
}

const trava = criarTrava();

/** Grava um erro. Seguro de chamar de qualquer lugar do navegador. */
export function registrarErro(erro: unknown, onde?: string) {
  if (typeof window === "undefined") return;
  try {
    const linha = prepararErro(erro, {
      onde,
      pagina: location.pathname + location.search,
      aparelho: navigator.userAgent,
      versao: process.env.NEXT_PUBLIC_VERSAO ?? "dev",
    });
    /* Sem rede, o pedido falharia de qualquer jeito -- e "sem rede" não é
       defeito do app. Antes da trava, para não gastar a cota da visita. */
    if (!linha || !navigator.onLine) return;
    if (!trava(`${linha.pagina}|${linha.mensagem}`)) return;
    void import("./supabase/client")
      .then(({ createClient }) => createClient().from("app_erros").insert(linha))
      .then(
        () => undefined,
        () => undefined
      );
  } catch {
    /* desiste calado, ver o topo */
  }
}
