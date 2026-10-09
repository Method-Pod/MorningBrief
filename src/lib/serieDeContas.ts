import { ehAbatida, type Bill } from "./types";
import { rotuloMes } from "./format";

/**
 * O que sai e o que fica quando uma conta é excluída em Gerenciar contas.
 *
 * Antes, excluir apagava a série inteira — inclusive as parcelas já pagas. O
 * aviso até dizia "o histórico vai junto", o que era honesto e errado ao
 * mesmo tempo: quem para de pagar uma assinatura não está pedindo para apagar
 * os doze meses em que pagou. Dinheiro que saiu da conta é registro, não
 * agenda, e registro não se apaga junto com o que foi cancelado.
 *
 * Então a régua é o tempo, não a série:
 *
 * - o que ainda VAI vencer sai, porque é justamente o que ele não quer mais;
 * - o que já venceu fica, pago ou não — é o mês que já aconteceu;
 * - o que tem pagamento registrado fica sempre, mesmo vencendo lá na frente,
 *   porque adiantar o pagamento não torna o pagamento menos real.
 *
 * O dia de hoje FICA. Uma conta que vence hoje já está no mês corrente, e
 * apagá-la encolheria o total de um mês que a pessoa já está vivendo. Se ela
 * não quiser mesmo essa, exclui a linha sozinha em Contas a pagar.
 */

/** Esta conta é história, e não agenda? */
const ehHistorico = (b: Bill, hoje: string) =>
  b.status === "paid" || ehAbatida(b) || b.due_date.slice(0, 10) <= hoje;

export type Reparticao = {
  /** as que serão apagadas: vencem depois de hoje e ninguém pagou */
  excluir: Bill[];
  /** as que ficam no histórico */
  ficam: Bill[];
  /**
   * Quais das que ficam ainda estão marcadas como fixas.
   *
   * Precisam deixar de ser, e esta é a parte que não dá para esquecer:
   * `lancarProximoMesDasFixas` decide se a série continua olhando o
   * lançamento MAIS RECENTE dela. Apagar só o futuro e deixar o passado
   * marcado como fixo faria a automação das 6h recriar a conta no dia 1º —
   * a conta excluída voltaria sozinha no mês seguinte.
   */
  pararRepeticao: Bill[];
};

export function repartirSerie(contas: Bill[], hoje: string): Reparticao {
  const ficam = contas.filter((b) => ehHistorico(b, hoje));
  return {
    excluir: contas.filter((b) => !ehHistorico(b, hoje)),
    ficam,
    pararRepeticao: ficam.filter((b) => b.recurring),
  };
}

/**
 * O que a caixa de confirmação diz antes de apagar.
 *
 * Mora aqui, e não dentro da tela, para que a frase seja conferível: ela é a
 * última coisa que a pessoa lê antes de uma exclusão que não tem desfazer, e
 * uma frase que promete errado é tão grave quanto a gravação errada. Era
 * exatamente o defeito antigo — o aviso dizia "o histórico vai junto", e ia
 * mesmo.
 *
 * `acao` diz à tela qual das três coisas fazer, para que o texto e o efeito
 * não possam discordar:
 *
 * - `excluir`  — apaga o futuro e, se precisar, para a repetição;
 * - `parar`    — não há futuro para apagar, só a repetição a desligar;
 * - `nada`     — tudo já é histórico; não há o que fazer.
 */
export type AvisoDeExclusao =
  | { acao: "excluir" | "parar"; texto: string }
  | { acao: "nada"; texto: string };

export function avisoDeExclusao(
  descricao: string,
  r: Reparticao
): AvisoDeExclusao {
  if (!r.excluir.length) {
    if (!r.pararRepeticao.length)
      return {
        acao: "nada",
        texto: `Nada a excluir: todos os lançamentos de "${descricao}" já venceram ou foram pagos, e ficam no histórico.`,
      };
    return {
      acao: "parar",
      texto: `"${descricao}" não tem nenhum lançamento futuro para excluir. Parar a repetição, para que ela não volte no mês que vem? Os ${r.ficam.length} já lançados ficam no histórico.`,
    };
  }

  /* Um lançamento só é nomeado pelo mês: "o lançamento de nov/26" diz mais do
     que "1 lançamento futuro", e é a informação que decide o clique. */
  const quantas =
    r.excluir.length === 1
      ? `o lançamento de ${rotuloMes(r.excluir[0].due_date.slice(0, 7))}`
      : `os ${r.excluir.length} lançamentos futuros`;

  const sobra = r.ficam.length
    ? ` ${
        r.ficam.length === 1
          ? "O lançamento já pago ou vencido fica"
          : `Os ${r.ficam.length} já pagos ou vencidos ficam`
      } no histórico.`
    : "";

  const repete = r.pararRepeticao.length ? " A conta deixa de se repetir." : "";

  return {
    acao: "excluir",
    texto: `Excluir ${quantas} de "${descricao}"?${sobra}${repete}`,
  };
}
