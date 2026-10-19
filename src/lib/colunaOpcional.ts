/**
 * Colunas que podem não existir no banco ainda, e o que dizer quando faltam.
 *
 * Este app roda contra um banco que a pessoa migra na mão, arquivo por
 * arquivo. Toda coluna nova passa por um período em que o código já a envia e
 * o banco ainda não a tem — e nesse período gravar tem que CONTINUAR
 * funcionando, só que sem ela. Salvar uma demanda não pode depender de uma
 * migração pendente.
 *
 * A tela de demandas já fazia isso para `links`, com um `if` próprio. Com a
 * segunda coluna opcional (`due_time`) a cascata começaria a dobrar, e cada
 * nova coluna exigiria lembrar de escrever o `if` de novo. Aqui a regra é
 * dado: a gravação tenta, e se o banco reclamar de uma destas, ela sai e a
 * tentativa se repete.
 */

export type ColunaOpcional = {
  /** O nome da coluna, como o Postgres a chama. */
  coluna: string;
  /** O arquivo que a cria, para o aviso dizer o que rodar. */
  arquivo: string;
  /** Como chamá-la numa frase: "…, mas o horário não". */
  rotulo: string;
};

export const COLUNAS_OPCIONAIS: ColunaOpcional[] = [
  { coluna: "links", arquivo: "LINK-NA-DEMANDA.sql", rotulo: "os links" },
  { coluna: "due_time", arquivo: "HORARIO-NA-DEMANDA.sql", rotulo: "o horário" },
];

/**
 * O erro é de coluna que falta? Qual?
 *
 * Os dois códigos que aparecem na prática:
 *
 * - 42703, do Postgres: `column "due_time" of relation "tasks" does not exist`
 * - PGRST204, do PostgREST: `Could not find the 'due_time' column of 'tasks'
 *   in the schema cache`
 *
 * O nome é procurado entre aspas ou como palavra inteira, e não como pedaço
 * solto: `/links/` casaria com uma mensagem sobre `links_backup` ou sobre um
 * valor que por acaso contivesse a palavra, e aí a gravação tiraria uma
 * coluna que o banco tem — perdendo o dado em silêncio, que é pior do que o
 * erro original.
 */
export function colunaQueFaltou(
  mensagem: string | null | undefined,
  colunas: ColunaOpcional[] = COLUNAS_OPCIONAIS
): ColunaOpcional | null {
  if (!mensagem) return null;
  if (!/does not exist|schema cache/i.test(mensagem)) return null;
  return (
    colunas.find((c) =>
      new RegExp(`['"\`]${c.coluna}['"\`]|\b${c.coluna}\b`).test(mensagem)
    ) ?? null
  );
}

/** Tira uma chave do objeto a ser gravado, sem alterar o original. */
export function semColuna<T extends object>(campos: T, coluna: string): T {
  const copia = { ...campos } as Record<string, unknown>;
  delete copia[coluna];
  return copia as T;
}
