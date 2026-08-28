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

/**
 * Os usuários que têm dados a manter.
 *
 * Tenta a Admin API primeiro, que é o caminho direto. Se ela recusar a chave,
 * deriva os ids das próprias tabelas.
 *
 * A reserva existe porque o Supabase trocou o formato das chaves privilegiadas
 * (`service_role` virou `sb_secret_...`) e eu não tenho a chave para confirmar
 * que a Admin API aceita o formato novo. Sem a reserva, uma recusa ali pararia
 * toda a manutenção com um erro difícil de ligar à causa. Os ids das tabelas
 * bastam: quem não tem nenhuma conta, demanda ou evento não tem o que manter.
 */
async function listarUsuarios(
  supabase: ReturnType<typeof createServiceClient>
): Promise<{ id: string; email?: string }[]> {
  try {
    const { data, error } = await supabase.auth.admin.listUsers({
      page: 1,
      perPage: 200,
    });
    if (!error && data?.users?.length)
      return data.users.map((u) => ({ id: u.id, email: u.email ?? undefined }));
  } catch {
    /* cai na reserva abaixo */
  }

  const ids = new Set<string>();
  for (const tabela of ["bills", "recurring_tasks", "events"]) {
    const { data } = await supabase.from(tabela).select("user_id");
    ((data as { user_id: string }[]) ?? []).forEach((r) => ids.add(r.user_id));
  }
  return [...ids].map((id) => ({ id }));
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
  const usuarios = await listarUsuarios(supabase);

  if (!usuarios.length)
    return NextResponse.json(
      { erro: "nenhum usuário encontrado — a chave de serviço está correta?" },
      { status: 500 }
    );

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
