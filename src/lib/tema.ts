/*
 * Claro, escuro ou como o sistema estiver.
 *
 * Mora aqui, e não dentro do componente, pelo mesmo motivo de `accents.ts`: o
 * layout raiz é de servidor e precisa das mesmas três palavras para montar o
 * script que aplica o tema salvo antes da primeira pintura. Importar um módulo
 * "use client" só para ler três strings arrastaria o componente inteiro para
 * o servidor.
 *
 * **"auto" não é um terceiro tema.** É a ausência de escolha: nenhum atributo
 * no <html>, e o CSS decide pela consulta de mídia
 * `prefers-color-scheme`. Por isso `auto` é o padrão de quem nunca abriu a
 * página de Conta — o app já nasce seguindo o telefone.
 */

export const TEMAS = [
  { key: "claro", name: "Claro" },
  { key: "escuro", name: "Escuro" },
  { key: "auto", name: "Automático" },
] as const;

export type TemaKey = (typeof TEMAS)[number]["key"];

export const TEMA_PADRAO: TemaKey = "auto";

/**
 * Só as chaves.
 *
 * O layout interpola isto dentro de um `<script>` em linha. São constantes
 * escritas aqui e só têm letras minúsculas — se algum dia uma ganhar aspa,
 * barra ou `<`, ela passa a poder fechar a tag. Mantenha-as como palavras.
 */
export const TEMA_KEYS = TEMAS.map((t) => t.key) as readonly TemaKey[];

export const ehTema = (v: unknown): v is TemaKey =>
  TEMAS.some((t) => t.key === v);

/** A chave usada no armazenamento do navegador, nos dois lados. */
export const TEMA_STORAGE = "mb.tema";
