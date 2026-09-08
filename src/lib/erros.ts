/**
 * Erros do banco em português, com o que fazer.
 *
 * O PostgREST e o GoTrue respondem em inglês e em vocabulário de quem escreveu
 * o servidor: "JWT issued at future" não diz a ninguém que o relógio do
 * aparelho está fora de hora. Mostrar isso cru numa caixa de aviso deixa a
 * pessoa sem saída — e foi o que aconteceu.
 */

export type RecadoDeErro = {
  texto: string;
  /** Recarregar resolve? Decide se a tela oferece o botão de recarregar. */
  recarregar?: boolean;
};

export function recadoDeErro(
  erro: { message: string; code?: string } | null | undefined
): RecadoDeErro | null {
  if (!erro) return null;
  const m = erro.message;

  /*
   * Relógio fora de hora.
   *
   * O servidor compara o instante em que o token foi emitido com a hora dele.
   * Divergência de alguns minutos entre os dois basta para o token parecer
   * emitido no futuro, e nenhuma consulta passa enquanto isso durar.
   */
  if (/issued at future|JWTIssuedAtFuture/i.test(m))
    return {
      texto:
        "O relógio do aparelho está fora de hora, e o servidor recusou a sessão por isso. Confira data e hora nas configurações — no Windows, ative “Definir horário automaticamente” — e recarregue.",
      recarregar: true,
    };

  if (/JWT expired|token is expired/i.test(m))
    return { texto: "A sessão expirou. Recarregue para entrar de novo.", recarregar: true };

  if (/Failed to fetch|NetworkError|network request failed/i.test(m))
    return {
      texto: "Não consegui falar com o servidor. Verifique a conexão e recarregue.",
      recarregar: true,
    };

  /* 42501: o RLS recusou. Em uso normal isso é sessão perdida, não permissão
     de verdade — o app só lê e escreve o que é da própria pessoa. */
  if (erro.code === "42501")
    return {
      texto: "O banco recusou o acesso. Provavelmente a sessão caiu: recarregue.",
      recarregar: true,
    };

  return { texto: m };
}

/**
 * Recado para update que não atingiu linha nenhuma.
 *
 * O PostgREST responde 204 sem erro quando o `eq("id", ...)` não casa com
 * nada — porque zero linhas alteradas não é falha, é resultado. Só que na tela
 * isso vira o pior dos mundos: o formulário fecha, a lista recarrega, e o
 * valor antigo continua ali sem nenhuma explicação. Foi assim que "mudei o
 * prazo e a demanda continua atrasada" ficou sem pista para investigar.
 *
 * Quem escreve precisa pedir a linha de volta com `.select("id")` e conferir.
 */
export const NADA_GRAVADO =
  "Nada foi gravado: o item não foi encontrado. Recarregue a página e tente de novo.";
