import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import * as f from "./ferramentas";

/*
 * O servidor MCP do Morning Brief: as ferramentas que o Claude Code enxerga.
 *
 * Separado da rota (app/api/mcp) para o teste poder montar o mesmo servidor
 * com um banco de mentira e conversar com ele pelo protocolo de verdade.
 */

const PRIORIDADE = z.enum(["low", "medium", "high", "urgent"]).describe("low, medium, high ou urgent");
const STATUS = z.enum(["todo", "doing", "review", "done"]).describe("todo = a fazer, doing = fazendo, review = revisão, done = concluída");

export function montarServidor(ctx: f.Ctx) {
  const servidor = new McpServer(
    { name: "morning-brief", version: "1.0.0" },
    {
      instructions:
        "Morning Brief é o painel pessoal e de trabalho do Cauã: demandas de clientes, contas a pagar, agenda, anotações, referências, hábitos e energia. Datas no formato AAAA-MM-DD, horário de Brasília. Pode ler, criar e editar; não há como apagar nada por aqui. Ao concluir ou mandar para revisão uma demanda com checklist em aberto, pergunte à pessoa antes de confirmar.",
    }
  );

  /* Erro de uso volta como texto para o Claude ler e perguntar; erro do
     banco volta marcado como erro. */
  const rodar = (fn: () => Promise<string>) => async () => {
    try {
      return { content: [{ type: "text" as const, text: await fn() }] };
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      return {
        content: [{ type: "text" as const, text: e instanceof f.ErroDeUso ? msg : `Falhou: ${msg}` }],
        isError: !(e instanceof f.ErroDeUso),
      };
    }
  };
  const leitura = { readOnlyHint: true, destructiveHint: false, openWorldHint: false };
  const escrita = { readOnlyHint: false, destructiveHint: false, idempotentHint: false, openWorldHint: false };

  servidor.registerTool(
    "resumo_de_hoje",
    { title: "Resumo de hoje", description: "Demandas de hoje e atrasadas, contas dos próximos 7 dias, agenda de hoje e a energia marcada.", annotations: leitura },
    rodar(() => f.resumoDeHoje(ctx))
  );

  servidor.registerTool(
    "listar_demandas",
    {
      title: "Listar demandas",
      description: "Demandas com id, cliente, prazo, status e prioridade. Sem filtro: as abertas.",
      inputSchema: {
        status: z.enum(["abertas", "todo", "doing", "review", "done"]).optional(),
        cliente: z.string().optional().describe("Nome do cliente (aceita parte do nome)"),
        ate: z.string().optional().describe("Prazo até esta data, AAAA-MM-DD"),
        busca: z.string().optional().describe("Texto no título"),
        limite: z.number().int().min(1).max(100).optional(),
      },
      annotations: leitura,
    },
    async (a) => rodar(() => f.listarDemandas(ctx, a))()
  );

  servidor.registerTool(
    "criar_demanda",
    {
      title: "Criar demanda",
      description:
        "Cria uma demanda. Com `modelo`, parte de um modelo de demanda (título, cliente, checklist e prazo); o que vier na chamada passa por cima. Cliente e projeto precisam existir no cadastro.",
      inputSchema: {
        titulo: z.string().optional(),
        cliente: z.string().optional(),
        projeto: z.string().optional(),
        prazo: z.string().optional().describe("AAAA-MM-DD"),
        hora: z.string().optional().describe("HH:MM"),
        prioridade: PRIORIDADE.optional(),
        descricao: z.string().optional(),
        links: z.array(z.string().max(2000)).max(50).optional(),
        checklist: z.array(z.string().max(2000)).max(50).optional(),
        modelo: z.string().optional().describe("Nome de um modelo de demanda"),
      },
      annotations: escrita,
    },
    async (a) => rodar(() => f.criarDemanda(ctx, a))()
  );

  servidor.registerTool(
    "atualizar_demanda",
    {
      title: "Atualizar demanda",
      description:
        "Muda título, prazo, hora, prioridade, descrição ou status de uma demanda pelo id. Para Revisão ou Concluída com checklist em aberto, pergunte à pessoa e só então mande confirmar_checklist: true (isso conclui os itens).",
      inputSchema: {
        id: z.string(),
        titulo: z.string().optional(),
        prazo: z.string().nullable().optional().describe("AAAA-MM-DD, ou null para tirar o prazo"),
        hora: z.string().nullable().optional().describe("HH:MM, ou null"),
        prioridade: PRIORIDADE.optional(),
        descricao: z.string().optional(),
        status: STATUS.optional(),
        confirmar_checklist: z.boolean().optional(),
      },
      annotations: escrita,
    },
    async (a) => rodar(() => f.atualizarDemanda(ctx, a))()
  );

  servidor.registerTool(
    "listar_contas",
    {
      title: "Listar contas",
      description: "Contas a pagar de um mês, com id, valor, vencimento e situação.",
      inputSchema: {
        mes: z.string().optional().describe("AAAA-MM; padrão: o mês atual"),
        situacao: z.enum(["abertas", "pagas", "vencidas", "todas"]).optional(),
      },
      annotations: leitura,
    },
    async (a) => rodar(() => f.listarContas(ctx, a))()
  );

  servidor.registerTool(
    "criar_conta",
    {
      title: "Criar conta",
      description: "Cria uma conta avulsa a pagar. Parcelada, fixa e cartão de crédito são feitas no app.",
      inputSchema: {
        descricao: z.string(),
        valor: z.number().min(0),
        vencimento: z.string().describe("AAAA-MM-DD"),
        categoria: z.string().optional(),
        observacoes: z.string().optional(),
      },
      annotations: escrita,
    },
    async (a) => rodar(() => f.criarConta(ctx, a))()
  );

  servidor.registerTool(
    "marcar_conta_paga",
    { title: "Marcar conta como paga", description: "Marca uma conta como paga, pelo id.", inputSchema: { id: z.string() }, annotations: escrita },
    async (a) => rodar(() => f.marcarContaPaga(ctx, a))()
  );

  servidor.registerTool(
    "listar_eventos",
    {
      title: "Listar agenda",
      description: "Eventos da agenda num intervalo. Padrão: os próximos 7 dias.",
      inputSchema: { de: z.string().optional().describe("AAAA-MM-DD"), ate: z.string().optional().describe("AAAA-MM-DD") },
      annotations: leitura,
    },
    async (a) => rodar(() => f.listarEventos(ctx, a))()
  );

  servidor.registerTool(
    "criar_evento",
    {
      title: "Criar evento",
      description: "Cria um evento na agenda. Horário de Brasília.",
      inputSchema: {
        titulo: z.string(),
        inicio: z.string().describe("AAAA-MM-DDTHH:MM, ou AAAA-MM-DD para o dia todo"),
        fim: z.string().optional().describe("AAAA-MM-DDTHH:MM"),
        dia_inteiro: z.boolean().optional(),
        local: z.string().optional(),
        descricao: z.string().optional(),
      },
      annotations: escrita,
    },
    async (a) => rodar(() => f.criarEvento(ctx, a))()
  );

  servidor.registerTool(
    "listar_anotacoes",
    { title: "Listar anotações", description: "Anotações mais recentes, ou as que contêm o texto buscado.", inputSchema: { busca: z.string().optional() }, annotations: leitura },
    async (a) => rodar(() => f.listarAnotacoes(ctx, a))()
  );

  servidor.registerTool(
    "criar_anotacao",
    { title: "Criar anotação", description: "Cria uma anotação. Cada linha do texto vira um parágrafo.", inputSchema: { titulo: z.string(), texto: z.string() }, annotations: escrita },
    async (a) => rodar(() => f.criarAnotacao(ctx, a))()
  );

  servidor.registerTool(
    "criar_referencia",
    {
      title: "Salvar referência",
      description: "Salva uma referência (inspiração) com título, link e notas.",
      inputSchema: { titulo: z.string(), url: z.string().optional(), notas: z.string().optional() },
      annotations: escrita,
    },
    async (a) => rodar(() => f.criarReferencia(ctx, a))()
  );

  servidor.registerTool(
    "listar_clientes",
    { title: "Listar clientes", description: "Clientes cadastrados e os projetos de cada um.", annotations: leitura },
    rodar(() => f.listarClientes(ctx))
  );

  servidor.registerTool(
    "listar_modelos",
    { title: "Listar modelos de demanda", description: "Modelos de demanda, para usar em criar_demanda.", annotations: leitura },
    rodar(() => f.listarModelos(ctx))
  );

  servidor.registerTool(
    "marcar_habito",
    {
      title: "Marcar hábito",
      description: "Marca um hábito como feito num dia (padrão: hoje).",
      inputSchema: { habito: z.string(), dia: z.string().optional().describe("AAAA-MM-DD") },
      annotations: escrita,
    },
    async (a) => rodar(() => f.marcarHabito(ctx, a))()
  );

  servidor.registerTool(
    "registrar_energia",
    {
      title: "Registrar energia do dia",
      description: "Marca a energia de hoje, de 1 (muito baixa) a 5 (alta).",
      inputSchema: { nivel: z.number().int().min(1).max(5) },
      annotations: escrita,
    },
    async (a) => rodar(() => f.registrarEnergia(ctx, a))()
  );

  servidor.registerTool(
    "revisao_da_semana",
    {
      title: "Revisão da semana",
      description: "Fecha uma semana (segunda a domingo): concluídas por cliente, atrasadas, hábitos, leitura, aulas, pagamentos, energia e o que vem na seguinte. Padrão: a semana de ontem.",
      inputSchema: { data: z.string().optional().describe("Qualquer dia da semana desejada, AAAA-MM-DD") },
      annotations: leitura,
    },
    async (a) => rodar(() => f.revisaoDaSemana(ctx, a))()
  );

  servidor.registerTool(
    "padroes",
    { title: "Padrões nos dados", description: "Padrões entre hábitos, energia, demandas concluídas, leitura e aulas nos últimos 90 dias.", annotations: leitura },
    rodar(() => f.padroes(ctx))
  );

  return servidor;
}

