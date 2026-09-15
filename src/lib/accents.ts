/*
 * As cores de destaque, numa fonte só.
 *
 * Esta lista vivia dentro de `components/accent.tsx`, que é um módulo de
 * cliente. O layout raiz é de servidor e precisa das mesmas chaves para montar
 * o script que aplica a cor salva antes da primeira pintura — e importar um
 * módulo "use client" só para ler um array constante arrastaria o componente
 * inteiro para dentro do servidor por causa de uma lista de oito palavras.
 *
 * Então a lista desceu para cá, que é dado puro sem React, e os dois lados a
 * importam. O que ela resolve é concreto: as chaves estavam escritas em dois
 * lugares e os dois divergiram. `accent.tsx` conhecia as oito; o script do
 * layout validava contra quatro, as originais. Quem escolhia laranja, ciano,
 * violeta ou rosa recarregava a página e via o azul aparecer primeiro, porque
 * o script não reconhecia o valor salvo e não aplicava nada.
 *
 * A ordem segue a roda de cores, não a de criação: com oito opções, agrupar
 * por matiz faz a fileira de bolinhas ser lida de uma vez.
 */
export const ACCENTS = [
  { key: "red", hex: "#e72828", name: "Vermelho" },
  { key: "orange", hex: "#e78e28", name: "Laranja" },
  { key: "yellow", hex: "#e7e128", name: "Amarelo" },
  { key: "green", hex: "#28e75e", name: "Verde" },
  { key: "cyan", hex: "#28e7e1", name: "Ciano" },
  { key: "blue", hex: "#287ee7", name: "Azul" },
  { key: "violet", hex: "#7e28e7", name: "Violeta" },
  { key: "pink", hex: "#e7288e", name: "Rosa" },
] as const;

export type AccentKey = (typeof ACCENTS)[number]["key"];

/**
 * Só as chaves.
 *
 * O layout interpola isto dentro de um `<script>` em linha. As chaves são
 * constantes escritas aqui e só têm letras minúsculas — se algum dia uma
 * ganhar aspa, barra ou `<`, ela passa a poder fechar a tag e o que entra na
 * página deixa de ser o que está escrito aqui. Mantenha-as como palavras.
 */
export const ACCENT_KEYS = ACCENTS.map((a) => a.key) as readonly AccentKey[];

export const ehAccent = (v: unknown): v is AccentKey =>
  ACCENTS.some((a) => a.key === v);
