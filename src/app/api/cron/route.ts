import { NextResponse } from "next/server";
import { createServiceClient } from "@/lib/supabase/service";
import { limparConcluidas, limparPagasDeMesesAnteriores } from "@/lib/limpeza";
import {
  estenderEventosRecorrentes,
  lancarProximoMesDasFixas,
  reporRecorrentesPerdidas,
} from "@/lib/manutencao";

/*
 * Manutenção diária, sem depender de alguém abrir o app.
 *
 * Chama exatamente as mesmas funções que as páginas chamam ao abrir — a lógica
 * não é duplicada aqui. Quem chegar primeiro faz o trabalho; a segunda passada
 * não encontra nada a fazer, porque cada rotina verifica antes de criar.
 *
 * A rota é dinâmica e sem cache: uma resposta cacheada faria o cron parecer que
 * rodou sem ter rodado.
 */
export const dynamic = "force-dynamic";
export const revalidate = 0;
/* Cinco minutos: com muitos usuários, as idas ao banco somam. */
export const maxDuration = 300;

/**
 * O dia de hoje em São Paulo, não em UTC.
 *
 * O servidor do Vercel roda em UTC. Entre 21h e meia-noite no Brasil ele já está
 * no dia seguinte, e a manutenção lançaria a conta fixa do mês que vem algumas
 * horas antes da virada. As funções aceitam `hoje` justamente para isso.
 */
function hojeEmSaoPaulo(): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Sao_Paulo",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date());
}

/**
 * Confere se a chamada é do cron.
 *
 * O Vercel manda `Authorization: Bearer <CRON_SECRET>`. Sem essa checagem,
 * qualquer pessoa que descobrisse a URL dispararia a rotina — inclusive as
 * partes que apagam.
 *
 * Comparação de tamanho constante: comparar com `===` vaza, pelo tempo de
 * resposta, quantos caracteres iniciais estão certos.
 */
function autorizado(req: Request): boolean {
  const segredo = process.env.CRON_SECRET;
  if (!segredo) return false;

  const enviado = req.headers.get("authorization") ?? "";
  const esperado = `Bearer ${segredo}`;
  if (enviado.length !== esperado.length) return false;

  let diferenca = 0;
  for (let i = 0; i < esperado.length; i++)
    diferenca |= enviado.charCodeAt(i) ^ esperado.charCodeAt(i);
  return diferenca === 0;
}

export async function GET(req: Request) {
  if (!autorizado(req))
    return NextResponse.json({ erro: "não autorizado" }, { status: 401 });

  const hoje = hojeEmSaoPaulo();

  let supabase;
  try {
    supabase = createServiceClient();
  } catch (e) {
    return NextResponse.json(
      { erro: e instanceof Error ? e.message : "falha ao criar o cliente" },
      { status: 500 }
    );
  }

  /*
   * Um por usuário, e não uma passada global.
   *
   * A chave de serviço ignora o RLS, então nada aqui filtra sozinho: sem o
   * `userId` explícito em cada chamada, uma conta poderia receber a manutenção
   * calculada sobre os dados de outra.
   */
  const { data: lista, error: erroUsuarios } =
    await supabase.auth.admin.listUsers({ page: 1, perPage: 200 });

  if (erroUsuarios)
    return NextResponse.json(
      { erro: `não foi possível listar os usuários: ${erroUsuarios.message}` },
      { status: 500 }
    );

  const usuarios = lista?.users ?? [];
  const relatorio: Record<string, unknown>[] = [];

  for (const u of usuarios) {
    const opcoes = { userId: u.id, hoje };

    /*
     * Em paralelo por usuário: as cinco rotinas mexem em tabelas diferentes ou
     * em linhas diferentes da mesma tabela, e nenhuma depende do resultado da
     * outra.
     */
    const [demandas, fixas, eventos, concluidas, pagas] = await Promise.all([
      reporRecorrentesPerdidas(supabase, opcoes),
      lancarProximoMesDasFixas(supabase, opcoes),
      estenderEventosRecorrentes(supabase, opcoes),
      limparConcluidas(supabase, { userId: u.id }),
      limparPagasDeMesesAnteriores(supabase, opcoes),
    ]);

    relatorio.push({
      usuario: u.email ?? u.id,
      demandasRecorrentesCriadas: demandas,
      contasFixasLancadas: fixas,
      ocorrenciasDeEventoCriadas: eventos,
      demandasConcluidasApagadas: concluidas,
      contasPagasApagadas: pagas,
    });
  }

  return NextResponse.json({
    ok: true,
    hoje,
    usuarios: usuarios.length,
    relatorio,
  });
}
