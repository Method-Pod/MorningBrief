export type Priority = "low" | "medium" | "high" | "urgent";
export type TaskStatus = "todo" | "doing" | "review" | "done";
export type BillStatus = "pending" | "paid";
export type Frequency =
  | "daily"
  | "weekly"
  | "biweekly"
  | "monthly"
  | "quarterly"
  | "yearly";

export type Note = {
  id: string;
  user_id: string;
  title: string;
  content: string;
  color: string;
  pinned: boolean;
  created_at: string;
  updated_at: string;
};

export type Bill = {
  id: string;
  user_id: string;
  description: string;
  amount: number;
  due_date: string;
  category: string;
  status: BillStatus;
  paid_at: string | null;
  recurring: boolean;
  notes: string;
  created_at: string;
  /* Parcelas: nulo nas duas = conta simples. Ver migration-003.sql. */
  installment_no: number | null;
  installment_total: number | null;
  /*
   * Conta abatida: nulo = pagamento único. Não-nulo = quanto já foi abatido,
   * e a conta segue como dívida do mês atual até cobrir `amount`.
   * Ver ABATIDAS.sql.
   */
  paid_amount: number | null;
  /*
   * Fatura de cartão e afins. Ver supabase/CARTOES.sql.
   *
   * `valor_variavel` quer dizer "este valor é para ser perguntado, não
   * copiado do mês passado" — e é separado de `amount = 0` porque zero é um
   * valor legítimo: uma fatura sem compras fecha em zero, e isso é diferente
   * de ainda não saber.
   *
   * `fecha_dia` diz a partir de quando faz sentido perguntar. Nulo quer
   * dizer "assim que a conta existir".
   */
  cartao_id: string | null;
  valor_variavel: boolean;
  fecha_dia: number | null;
};

/**
 * A conta está esperando você digitar o valor?
 *
 * As duas condições juntas, sempre: a marca sozinha não basta (depois de
 * informado, o valor continua variável para o mês que vem), e o zero sozinho
 * também não (uma conta comum de R$ 0,00 não está esperando nada).
 */
export const semValorAinda = (b: Pick<Bill, "valor_variavel" | "amount">) =>
  !!b.valor_variavel && Number(b.amount) === 0;

/**
 * Em que dia esta fatura fechou. Nulo quando a conta não tem fechamento.
 *
 * A regra que decide o mês: **a fatura sempre fecha antes de vencer.** Então,
 * para uma conta que vence no dia D:
 *
 * - fechamento até o dia D → fechou no mesmo mês do vencimento
 *   (Nubank fecha 1, vence 10 → a fatura de outubro fecha 1º de outubro)
 * - fechamento depois do dia D → fechou no mês anterior
 *   (um cartão que fecha 28 e vence 7 fecha em 28 de outubro a fatura que
 *   vence em 7 de novembro)
 *
 * Essa segunda linha é o conserto de um buraco real: a conta comparava mês
 * com mês, e a fatura que fecha num mês e vence no outro só era cobrada no
 * mês do vencimento — ou seja, um mês atrasada, quando já estava vencendo.
 *
 * `Math.min` com o último dia do mês: "fecha dia 31" em fevereiro fecha no
 * dia 28. Sem isso, `new Date` viraria para março e a cobrança atrasaria.
 */
export const dataDoFechamento = (
  b: Pick<Bill, "fecha_dia" | "due_date">
): string | null => {
  if (!b.fecha_dia) return null;

  const [ano, mes, dia] = b.due_date.slice(0, 10).split("-").map(Number);
  if (!ano || !mes || !dia) return null;

  const noMesAnterior = b.fecha_dia > dia;
  const alvo = new Date(Date.UTC(ano, mes - 1 - (noMesAnterior ? 1 : 0), 1));
  const ultimoDia = new Date(
    Date.UTC(alvo.getUTCFullYear(), alvo.getUTCMonth() + 1, 0)
  ).getUTCDate();
  alvo.setUTCDate(Math.min(b.fecha_dia, ultimoDia));

  return alvo.toISOString().slice(0, 10);
};

/**
 * Já passou do fechamento, e portanto já dá para saber o valor?
 *
 * Sem `fecha_dia`, a resposta é sim — é o caso de quem não tem data de
 * fechamento e quer ser perguntado desde já.
 *
 * O corte existe porque as contas fixas são geradas um mês antes: sem ele, o
 * aviso cobraria em setembro o valor de uma fatura de outubro.
 */
export const jaFechou = (
  b: Pick<Bill, "fecha_dia" | "due_date">,
  hojeISO: string
) => {
  const fechou = dataDoFechamento(b);
  return !fechou || hojeISO.slice(0, 10) >= fechou;
};

/** Quanto falta numa conta abatida. Conta comum devolve o valor cheio. */
export const restanteDe = (b: Pick<Bill, "amount" | "paid_amount">) =>
  Math.max(0, Number(b.amount) - Number(b.paid_amount ?? 0));

/** É conta abatida? */
export const ehAbatida = (b: Pick<Bill, "paid_amount">) =>
  b.paid_amount !== null && b.paid_amount !== undefined;

export type Task = {
  id: string;
  user_id: string;
  title: string;
  description: string;
  client: string;
  /* Para onde a demanda aponta no cadastro. Nulos = só o texto acima,
     que é como ficam as linhas de antes de CLIENTES.sql. */
  cliente_id: string | null;
  projeto_id: string | null;
  priority: Priority;
  status: TaskStatus;
  due_date: string | null;
  /* Endereços do material. Nulo em base sem LINK-NA-DEMANDA.sql. */
  links: string[] | null;
  origin_id: string | null;
  created_at: string;
  completed_at: string | null;
};

export type RecurringTask = {
  id: string;
  user_id: string;
  title: string;
  description: string;
  client: string;
  /* Para onde a demanda aponta no cadastro. Nulos = só o texto acima,
     que é como ficam as linhas de antes de CLIENTES.sql. */
  cliente_id: string | null;
  projeto_id: string | null;
  priority: Priority;
  /* Links do modelo: cada ocorrência nasce com eles. */
  links: string[] | null;
  frequency: Frequency;
  weekday: number | null;
  /*
   * Dias da semana da regra semanal: 0 = domingo ... 6 = sábado.
   * Ver supabase/DIAS-DA-SEMANA.sql.
   *
   * Nulo nas regras criadas antes da migração, que seguem valendo pelo
   * `weekday`. Nunca lista vazia — o check no banco não aceita, porque uma
   * regra semanal sem nenhum dia nunca dispararia, em silêncio.
   */
  weekdays: number[] | null;
  /*
   * Modelo do checklist: os títulos dos itens que cada ocorrência recebe.
   * Ver supabase/SUBTAREFAS.sql. Nulo ou vazio = a demanda nasce sem checklist.
   */
  checklist: string[] | null;
  day_of_month: number | null;
  active: boolean;
  last_run_on: string | null;
  created_at: string;
};

export type CalendarEvent = {
  id: string;
  user_id: string;
  title: string;
  description: string;
  start_at: string;
  end_at: string | null;
  all_day: boolean;
  color: string;
  location: string;
  created_at: string;
  /*
   * Repetição do evento. Ver supabase/EVENTOS-RECORRENTES.sql.
   *
   * 'none' é o evento único. As ocorrências de uma repetição compartilham
   * `series_id`, que é um id próprio e não o título: dois eventos podem se
   * chamar igual sem serem a mesma repetição.
   */
  recurrence: EventRecurrence;
  series_id: string | null;
};

export type EventRecurrence = "none" | "weekly" | "biweekly" | "monthly";

export const EVENT_RECURRENCE_LABEL: Record<EventRecurrence, string> = {
  none: "Não repete",
  weekly: "Toda semana",
  biweekly: "A cada 15 dias",
  monthly: "Todo mês",
};

/**
 * Item de checklist de uma demanda.
 *
 * Não tem data nem prioridade de propósito: a unidade de trabalho continua
 * sendo a demanda, e o item é só um pedaço contável dela. Dar data ao item
 * criaria a pergunta "a demanda está atrasada ou só o item?".
 */
export type TaskItem = {
  id: string;
  user_id: string;
  task_id: string;
  title: string;
  done: boolean;
  position: number;
  created_at: string;
};

/** Quantos itens estão feitos, para o rótulo "3/5" e a barra. */
export const PRIORITY_LABEL: Record<Priority, string> = {
  low: "Baixa",
  medium: "Média",
  high: "Alta",
  urgent: "Urgente",
};

export const STATUS_LABEL: Record<TaskStatus, string> = {
  todo: "A fazer",
  doing: "Em andamento",
  review: "Revisão",
  done: "Concluída",
};

export const FREQUENCY_LABEL: Record<Frequency, string> = {
  daily: "Diária",
  weekly: "Semanal",
  biweekly: "Quinzenal",
  monthly: "Mensal",
  quarterly: "Trimestral",
  yearly: "Anual",
};

/** Inicial de cada dia, para as caixinhas de seleção. Mesma ordem de WEEKDAYS. */
export const WEEKDAYS_SIGLA = ["D", "S", "T", "Q", "Q", "S", "S"];

export const WEEKDAYS = [
  "Domingo",
  "Segunda",
  "Terça",
  "Quarta",
  "Quinta",
  "Sexta",
  "Sábado",
];

export type BillCategory = {
  id: string;
  user_id: string;
  name: string;
  created_at: string;
};

/** Semente usada na primeira visita e como reserva se a tabela não existir. */
export const BILL_CATEGORIES = [
  "Moradia",
  "Impostos",
  "Fornecedores",
  "Software",
  "Marketing",
  "Equipe",
  "Transporte",
  "Saúde",
  "Educação",
  "Outros",
];

export const NOTE_COLORS = ["blue", "violet", "emerald", "amber", "rose", "slate"];

/**
 * O tom de cada cor de `NOTE_COLORS`, para desenhar a bolinha.
 *
 * Estava escrito dentro do painel, e os cartões precisavam do mesmo mapa —
 * uma segunda cópia começaria a divergir da primeira no dia em que alguém
 * ajustasse um tom. Aqui, ao lado da lista de nomes que ele traduz.
 */
export const CORES_HEX: Record<string, string> = {
  blue: "#2563a8",
  violet: "#6d5bd0",
  emerald: "#1f9d63",
  amber: "#b8820c",
  rose: "#cf4a3f",
  slate: "#666e74",
};

/**
 * Um cartão de crédito. Ver supabase/CARTOES.sql.
 *
 * Nenhum dígito do cartão entra aqui. A tabela tem uma coluna `final`, dos
 * quatro últimos, que a tela chegou a mostrar e não mostra mais — nome, banco
 * e bandeira já bastam para saber de qual cartão é a fatura, e o que não é
 * preciso guardar é melhor não guardar. A coluna ficou no banco por ser
 * migração destrutiva sem ganho; nada a lê nem a escreve.
 */
/**
 * O cliente, e o projeto dentro dele.
 *
 * Existem porque o campo "Cliente / projeto" da demanda era texto livre, e
 * texto livre cria cliente novo a cada grafia — em silêncio. Na base real a
 * Bia virou cinco: "Bia", "Bia - Canal Oficial", "Bia - Pedido Carol",
 * "Bia - Pedido Nero" e "Bia - Setembro Amarelo", com as contagens
 * separadas e nenhum número dizendo quantas demandas ela tem.
 *
 * Dois níveis, e não um: o CLIENTE é quem paga, o PROJETO é o que está
 * sendo feito para ele. É a forma que o texto já tinha — só que agora o app
 * enxerga os dois pedaços em vez de uma frase.
 *
 * Ver supabase/CLIENTES.sql, que cria as tabelas e liga o que já existe.
 */
export type Cliente = {
  id: string;
  user_id: string;
  nome: string;
  /** Da mesma paleta das notas e dos cartões. Ver `CORES_HEX`. */
  cor: string;
  created_at: string;
};

export type Projeto = {
  id: string;
  user_id: string;
  cliente_id: string;
  nome: string;
  /**
   * A ordem manual dentro do cliente, do menor para o maior.
   *
   * Opcional porque ela pode nao existir: quem ainda nao rodou
   * `supabase/ORDEM-PROJETOS.sql` recebe as linhas sem esta coluna, e a tela
   * cai na ordem alfabetica de antes em vez de quebrar.
   */
  position?: number;
  created_at: string;
};

/**
 * O nome que a tela mostra para uma demanda.
 *
 * Prefere o cadastro; cai no texto antigo quando a demanda ainda não foi
 * ligada a nenhum cliente — o que acontece com quem não rodou o SQL, e com
 * a linha cujo texto não bateu com cadastro nenhum. Nos dois casos a tela
 * continua mostrando o que a pessoa escreveu, em vez de um vazio.
 */
export const nomeDoCliente = (
  t: { client: string; cliente_id: string | null; projeto_id: string | null },
  clientes: Map<string, Cliente>,
  projetos: Map<string, Projeto>
): string => {
  const c = t.cliente_id ? clientes.get(t.cliente_id) : null;
  if (!c) return t.client || "";
  const p = t.projeto_id ? projetos.get(t.projeto_id) : null;
  return p ? `${c.nome} - ${p.nome}` : c.nome;
};

export type Cartao = {
  id: string;
  user_id: string;
  nome: string;
  banco: string;
  bandeira: string;
  /** Dia do mês em que a fatura fecha. É dele que sai a hora de perguntar. */
  fecha_dia: number;
  /** Dia do mês do vencimento. Só sugere a data ao criar a conta. */
  vence_dia: number;
  limite: number | null;
  cor: string;
  created_at: string;
};

export type Habit = {
  id: string;
  user_id: string;
  name: string;
  /*
   * A coluna continua no banco, com default 'blue', mas nada mais a lê: as
   * bolinhas seguem a cor do tema. Fica aqui para o tipo bater com a tabela —
   * derrubar a coluna seria uma migração destrutiva sem ganho nenhum.
   */
  color: string;
  target_per_week: number;
  active: boolean;
  created_at: string;
};

export type HabitLog = {
  id: string;
  user_id: string;
  habit_id: string;
  day: string;
  created_at: string;
};


/* ------------------------------ leitura ------------------------------ */

/*
 * As prateleiras de uma estante de verdade.
 *
 * `queue` (Ler) e `want` (Lista de Desejos) são coisas diferentes de
 * propósito: um livro já é seu e espera a vez, o outro nem foi comprado.
 * Misturar os dois é o que faz a lista de desejos virar cobrança.
 *
 * `dropped` existe porque abandonar livro é normal, e sem essa prateleira ele
 * fica para sempre em "Lendo" fingindo que está em andamento — o que estraga a
 * única pergunta que a tela responde bem, "onde eu parei".
 *
 * Vem de PRATELEIRAS.sql, que amplia o check constraint criado em LEITURA.sql.
 */
export type BookStatus = "want" | "queue" | "reading" | "done" | "dropped";

export const BOOK_STATUS_LABEL: Record<BookStatus, string> = {
  reading: "Lendo",
  queue: "Ler",
  done: "Lido",
  dropped: "Abandonado",
  want: "Lista de Desejos",
};

export type Book = {
  id: string;
  user_id: string;
  title: string;
  authors: string | null;
  isbn: string | null;
  cover_url: string | null;
  publisher: string | null;
  /* Texto e não data: a API devolve "2015", "2015-03" ou "2015-03-11", e
     converter obrigaria a inventar mês e dia. */
  published_on: string | null;
  description: string | null;
  categories: string | null;
  language: string | null;
  /* Nulo quando a API não trouxe: a barra some, o registro continua valendo. */
  total_pages: number | null;
  current_page: number;
  status: BookStatus;
  started_on: string | null;
  finished_on: string | null;
  /*
   * 1 a 5, ou nulo. Nulo é diferente de zero: "não avaliei" não é "achei
   * ruim". Vem de LEITURA-EXTRAS.sql.
   */
  rating: number | null;
  created_at: string;
};

/** Meta de livros de um ano. Por ano, para não perder a do ano passado. */
export type ReadingGoal = {
  user_id: string;
  year: number;
  target: number;
};

export type ReadingSession = {
  id: string;
  user_id: string;
  book_id: string;
  day: string;
  /** Páginas lidas nesta marcação. */
  pages: number;
  /** Página em que parou — guardada para o histórico não depender da soma. */
  end_page: number;
  created_at: string;
};

/* ------------------------------ aulas ------------------------------ */

export type FonteAula = "youtube" | "telegram" | "outro";

export const FONTE_AULA_LABEL: Record<FonteAula, string> = {
  youtube: "YouTube",
  telegram: "Telegram",
  outro: "Outro",
};

export type Lesson = {
  id: string;
  user_id: string;
  title: string;
  url: string | null;
  fonte: FonteAula;
  canal: string | null;
  thumb_url: string | null;
  /* Aponta para a etiqueta, não guarda o nome. Renomear o assunto é uma
     linha em `subjects`, e não uma varredura em todas as aulas. */
  subject_id: string | null;
  /**
   * Duração total em segundos, quando conhecida.
   *
   * Em segundos e não em minutos porque minuto arredondado descarta o que não
   * volta: um vídeo de 1h23m45s gravado como 84 perde os 45 segundos para
   * sempre. O minuto é uma divisão na hora de mostrar. Ver DURACAO-EXATA.sql.
   */
  duracao_seg: number | null;
  /**
   * A coluna antiga, em minutos arredondados.
   *
   * Só existe em banco onde DURACAO-EXATA.sql ainda não rodou, e é opcional
   * por isso. Existe para a tela não ficar sem duração nenhuma entre o deploy
   * e a migração: `duracaoDaAula` lê esta quando a nova está vazia. Depois de
   * migrar, a coluna deixa de existir e o campo nunca chega.
   */
  minutos?: number | null;
  /**
   * Onde parou, em minutos.
   *
   * Continua em minutos de propósito: é o número que se digita ao pausar, e
   * ninguém anota o segundo em que parou. Nulo é diferente de zero — "não
   * anotei" não é "no começo".
   */
  em_minuto: number | null;
  feita: boolean;
  /** Quando foi marcada — é por esta data que a limpeza dos 7 dias conta. */
  feita_em: string | null;
  created_at: string;
};

/**
 * Canal para estudar.
 *
 * É fonte, não item de lista: não termina como um curso nem sai da tela como
 * uma aula assistida. Fica guardado como o lugar onde procurar quando der
 * vontade de estudar um assunto — e `notes` guarda justamente o motivo pelo
 * qual ele foi salvo, senão em três meses a lista de fotos não diz mais nada.
 */
export type Channel = {
  id: string;
  user_id: string;
  name: string;
  url: string;
  avatar_url: string | null;
  subject_id: string | null;
  notes: string | null;
  created_at: string;
};

/* --------------------------- categorias de nota --------------------------- */

/**
 * Categoria de anotação.
 *
 * O terceiro eixo de organização do app, e de propósito separado dos outros
 * dois: [Subject] responde "sobre o que é" (Design, IA) e serve às aulas e aos
 * canais; [Colecao] responde "para que serve" (Landing page, Dashboard) e
 * serve às referências. Juntar os três faria uma categoria de anotação
 * aparecer no filtro das Aulas, onde não diz nada.
 */
export type NoteCategory = {
  id: string;
  user_id: string;
  name: string;
  created_at: string;
};

/** A ligação. Uma nota pode estar em várias categorias ao mesmo tempo. */
export type NoteInCategory = {
  note_id: string;
  category_id: string;
  user_id: string;
};

/* ------------------------------ referências ------------------------------ */

/**
 * Coleção de referências.
 *
 * Separada de [Subject] de propósito: assunto responde "sobre o que é"
 * (Design, IA) e serve às aulas e aos canais; coleção responde "para que
 * serve" (Landing page, Dashboard, Sites de busca). Misturar as duas faria
 * "landing page" aparecer no filtro das Aulas, onde não diz nada.
 */
export type Colecao = {
  id: string;
  user_id: string;
  name: string;
  created_at: string;
};

/**
 * Um link salvo.
 *
 * `name`, `description` e `image_url` vêm das metatags do site quando ele
 * responde. `image_own` marca a imagem que você subiu à mão — é o que impede
 * uma releitura do link de sobrescrever a escolha que você fez, no caso dos
 * sites que bloqueiam a leitura.
 */
export type Referencia = {
  id: string;
  user_id: string;
  /**
   * O endereço, quando existe.
   *
   * Nulo quando a referência é só uma imagem — um print de layout, um recorte
   * que apareceu numa conversa. Nem toda referência tem página, e exigir um
   * endereço obrigava a inventar um ou a não guardar. Ver
   * REFERENCIA-SO-IMAGEM.sql.
   */
  url: string | null;
  name: string;
  description: string | null;
  image_url: string | null;
  /**
   * O logo do site, para a linha da lista "Onde buscar".
   *
   * Separado de `image_url` porque as duas imagens têm trabalhos diferentes: o
   * banner mostra como a página é e serve ao quadro; o ícone mostra de quem é
   * o site e serve à linha. Recortar o banner num quadradinho de 32px entrega
   * um pedaço do meio de um print. Ver ICONE-DO-SITE.sql.
   */
  icon_url: string | null;
  image_own: boolean;
  /**
   * É um site onde se procura referência, e não um exemplo guardado?
   *
   * Coluna, e não coleção, porque o app mostra os dois de formas diferentes —
   * lista fixa no topo contra parede de quadros. Se dependesse de uma coleção
   * chamada "Sites de busca", renomeá-la faria a seção sumir sem explicação.
   * Ver SITE-DE-BUSCA.sql.
   */
  busca: boolean;
  /** Por que você salvou. Sem isso, uma parede de prints não diz mais nada. */
  notes: string | null;
  created_at: string;
};

/** A ligação. Um link pode estar em várias coleções ao mesmo tempo. */
export type ReferenciaColecao = {
  referencia_id: string;
  colecao_id: string;
  user_id: string;
};

export const BUCKET_REFERENCIAS = "referencias";

/**
 * Etiqueta de assunto.
 *
 * Sem cor: a etiqueta segue a cor do tema, como os hábitos.
 */
export type Subject = {
  id: string;
  user_id: string;
  name: string;
  created_at: string;
};

/**
 * Curso, com os dois números que você digita.
 *
 * Não guarda a lista de aulas: cadastrar 40 linhas para acompanhar um curso
 * seria mais trabalho que assistir a ele. O que interessa é "vou na 12 de 40".
 */
export type Course = {
  id: string;
  user_id: string;
  title: string;
  plataforma: string | null;
  url: string | null;
  subject_id: string | null;
  total_aulas: number;
  aulas_feitas: number;
  created_at: string;
};
