/**
 * Categoria provável a partir da descrição da conta.
 *
 * Existe porque escolher a categoria é um passo a mais em cada lançamento, e o
 * passo é sempre pulado: a maioria das contas acaba em "Outros" e os gráficos
 * por categoria deixam de dizer qualquer coisa. A descrição já carrega a
 * resposta — "Fatura | Nubank" é Cartão, "Academia" é Saúde.
 *
 * Duas regras de contenção:
 *
 * 1. Só sugere categoria que existe na lista da pessoa. Devolver um nome fora
 *    da lista deixaria o select com um valor sem opção correspondente.
 * 2. É sugestão, não decisão: quem mexeu no campo manda, e o palpite não
 *    sobrescreve escolha feita à mão.
 */

/*
 * Ordem importa: a primeira regra que casar ganha. As mais específicas vêm
 * antes — "cartão de crédito" é Cartão, não Fornecedores.
 *
 * Cada alternância fecha com "s?" para aceitar o plural. Sem isso "Perfumes"
 * não casava com "perfume": o "s" é caractere de palavra, então a borda de
 * palavra cai dentro do termo em vez de depois dele.
 */
const REGRAS: { padrao: RegExp; categoria: string }[] = [
  {
    padrao:
      /\b(fatura|cart[ãa]o|nubank|inter|ita[uú]|bradesco|santander|c6|will|neon|picpay|credit)s?\b/i,
    categoria: "Cartão",
  },
  {
    padrao:
      /\b(netflix|spotify|youtube|prime|disney|hbo|globoplay|deezer|paramount|crunchyroll|streaming)s?\b/i,
    categoria: "Streaming",
  },
  {
    padrao: /\b(internet|wi-?fi|fibra|banda larga|telefone|celular|vivo|claro|tim|oi)s?\b/i,
    categoria: "Internet",
  },
  {
    padrao:
      /\b(aluguel|condom[íi]nio|iptu|luz|energia|el[ée]trica|[áa]gua|esgoto|g[áa]s|enel|cemig|sabesp|copasa|light)s?\b/i,
    categoria: "Moradia",
  },
  {
    padrao:
      /\b(academia|gym|crossfit|personal|nutri|nutricionista|dentista|m[ée]dic[oa]|consulta|exame|farm[áa]cia|rem[ée]dio|psic[óo]log[oa]|terapia|plano de sa[úu]de|unimed|amil)s?\b/i,
    categoria: "Saúde",
  },
  {
    padrao:
      /\b(perfume|barbeiro|barbearia|cabelo|sal[ãa]o|manicure|est[ée]tica|skincare|creme|maquiagem)s?\b/i,
    categoria: "Cuidados Pessoais",
  },
  {
    padrao: /\b(presente|anivers[áa]rio|casamento|natal|amigo oculto|lembran[çc]a)s?\b/i,
    categoria: "Presente",
  },
  {
    padrao:
      /\b(curso|faculdade|mensalidade|escola|auto ?escola|carteira de motorista|cnh|detran|livro|apostila|udemy|alura)s?\b/i,
    categoria: "Educação",
  },
  {
    padrao:
      /\b(uber|99|taxi|t[áa]xi|gasolina|combust[íi]vel|[ôo]nibus|metr[ôo]|passagem|estacionamento|pedágio|ipva|licenciamento|mec[âa]nic[oa]|pneu)s?\b/i,
    categoria: "Transporte",
  },
  {
    padrao:
      /\b(mercado|supermercado|feira|hortifruti|ifood|rappi|restaurante|padaria|a[çc]ougue|lanche)s?\b/i,
    categoria: "Supermercado",
  },
  {
    padrao:
      /\b(imposto|das|mei|simples nacional|inss|irpf|darf|contador|contabilidade)s?\b/i,
    categoria: "Impostos",
  },
  {
    padrao:
      /\b(adobe|figma|notion|canva|chatgpt|openai|google one|icloud|dropbox|hospedagem|dom[íi]nio|servidor|assinatura|software|licen[çc]a)s?\b/i,
    categoria: "Software",
  },
  {
    padrao: /\b(an[úu]ncio|ads|tr[áa]fego|impulsionamento|marketing|meta ads|google ads)s?\b/i,
    categoria: "Marketing",
  },
  {
    padrao: /\b(sal[áa]rio|freela|freelancer|equipe|editor|designer|social media|est[áa]gi)s?\b/i,
    categoria: "Equipe",
  },
  {
    padrao: /\b(empr[ée]stimo|financiamento|presta[çc][ãa]o|consignado|parcelamento banc)s?\b/i,
    categoria: "Empréstimo",
  },
  {
    padrao: /\b(seguro|apólice|porto seguro|sul am[ée]rica)s?\b/i,
    categoria: "Seguro",
  },
];

/**
 * Devolve a categoria sugerida, ou null quando nada casa ou quando a categoria
 * que casou não está disponível para a pessoa.
 */
export function sugerirCategoria(
  descricao: string,
  disponiveis: string[]
): string | null {
  const texto = descricao.trim();
  if (texto.length < 3) return null;

  /* Comparação sem acento e sem caixa: a lista da pessoa pode ter "Educacao". */
  const normalizar = (s: string) =>
    s
      .normalize("NFD")
      .replace(/[̀-ͯ]/g, "")
      .toLowerCase();
  const mapa = new Map(disponiveis.map((c) => [normalizar(c), c]));

  for (const { padrao, categoria } of REGRAS) {
    if (!padrao.test(texto)) continue;
    const existente = mapa.get(normalizar(categoria));
    if (existente) return existente;
    /* Casou, mas a pessoa não tem essa categoria. Não inventa nem troca por
       outra: seguir procurando daria uma sugestão pior que nenhuma. */
    return null;
  }
  return null;
}
