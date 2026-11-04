import { NextResponse } from "next/server";
import { WebStandardStreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/webStandardStreamableHttp.js";
import { createServiceClient } from "@/lib/supabase/service";
import { chaveDoCabecalho, hashDaChave } from "@/lib/chavesDoClaude";
import { montarServidor } from "@/lib/mcp/servidor";

/*
 * O Morning Brief como conector do Claude Code (MCP, HTTP sem sessão).
 *
 * Entrada: `Authorization: Bearer mb_...`, a chave criada em Conta > Claude.
 * A rota calcula o hash, procura na tabela, e o dono da chave é o único
 * usuário que as ferramentas enxergam -- ver lib/mcp/ferramentas, onde
 * toda consulta leva esse id. Chave revogada ou desconhecida: 401, sem
 * dizer qual das duas.
 *
 * Fica fora do middleware de sessão (ver middleware.ts): quem chama é o
 * Claude Code, que não tem cookie.
 *
 * Sem estado entre pedidos: cada POST monta o servidor, responde e acaba.
 * É o que cabe numa função da Vercel.
 */
export const dynamic = "force-dynamic";
export const maxDuration = 60;

const negado = () =>
  NextResponse.json(
    { erro: "Chave inválida ou revogada. Gere outra em Conta > Claude." },
    { status: 401, headers: { "WWW-Authenticate": "Bearer" } }
  );

export async function POST(req: Request) {
  const chave = chaveDoCabecalho(req.headers.get("authorization"));
  if (!chave) return negado();

  let sb;
  try {
    sb = createServiceClient();
  } catch {
    return NextResponse.json({ erro: "Indisponível neste servidor." }, { status: 503 });
  }

  const hash = await hashDaChave(chave);
  const { data } = await sb
    .from("chaves_do_claude")
    .select("id, user_id, usada_em")
    .eq("hash", hash)
    .is("revogada_em", null)
    .limit(1);
  const dona = (data as { id: string; user_id: string; usada_em: string | null }[] | null)?.[0];
  if (!dona) return negado();

  /* "Usada em" para a tela de Conta mostrar se a chave está viva. Uma vez
     por hora basta; não vale um pedido ao banco por chamada. */
  if (!dona.usada_em || Date.now() - new Date(dona.usada_em).getTime() > 3_600_000)
    void sb.from("chaves_do_claude").update({ usada_em: new Date().toISOString() }).eq("id", dona.id).then(() => undefined);

  const servidor = montarServidor({ sb, uid: dona.user_id });
  const transporte = new WebStandardStreamableHTTPServerTransport({
    sessionIdGenerator: undefined,
    enableJsonResponse: true,
  });
  await servidor.connect(transporte);
  return transporte.handleRequest(req);
}

/* Sem sessão, não há fluxo de eventos para abrir nem sessão para encerrar. */
const naoSuportado = () =>
  NextResponse.json({ erro: "Use POST." }, { status: 405, headers: { Allow: "POST" } });
export const GET = naoSuportado;
export const DELETE = naoSuportado;
