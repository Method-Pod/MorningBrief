/*
 * As cores de destaque, numa fonte só.
 *
 * Esta lista vivia dentro de `components/accent.tsx`, que é um módulo de
 * cliente. O layout raiz é de servidor e precisa das mesmas chaves para montar
 * o script que aplica a cor salva antes da primeira pintura — e importar um
 * módulo "use client" só para ler um array constante arrastaria o componente
 * inteiro para dentro do servidor por causa de uma lista de cinco palavras.
 *
 * Então a lista desceu para cá, que é dado puro sem React, e os dois lados a
 * importam. O que ela resolve é concreto: as chaves estavam escritas em dois
 * lugares e os dois divergiram. `accent.tsx` conhecia todas; o script do
 * layout validava contra quatro, as originais. Quem escolhia laranja, ciano,
 * violeta ou rosa recarregava a página e via o azul aparecer primeiro, porque
 * o script não reconhecia o valor salvo e não aplicava nada.
 *
 * A ordem segue a roda de cores, não a de criação: agrupar por matiz faz a
 * fileira de bolinhas ser lida de uma vez.
 *
 * São cinco, e não oito. Amarelo, ciano e rosa saíram a pedido — as três que
 * sobravam eram as de pior contraste: o amarelo e o ciano são claros demais
 * para servir de tinta e obrigavam a escurecer muito o texto, e o rosa ficava
 * perto demais do vermelho na fileira para alguém escolher entre os dois.
 *
 * Quem tinha uma delas salva no navegador volta para o azul sozinho:
 * `ehAccent` não reconhece mais a chave, e tanto o script de abertura quanto
 * `read()` caem no padrão. Nenhuma migração a rodar.
 */
export const ACCENTS = [
  { key: "red", hex: "#e72828", name: "Vermelho" },
  { key: "orange", hex: "#e78e28", name: "Laranja" },
  { key: "green", hex: "#28e75e", name: "Verde" },
  { key: "blue", hex: "#287ee7", name: "Azul" },
  { key: "violet", hex: "#7e28e7", name: "Roxo" },
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
