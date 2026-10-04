import { NextResponse } from "next/server";
import { createServiceClient } from "@/lib/supabase/service";
import { chamadaDoCron } from "@/lib/segredoCron";
import { enviarBrief } from "@/lib/enviarBrief";
import {
  limparAulasAssistidas,
  limparConcluidas,
  limparEventosPassados,
  limparPagasDeMesesAnteriores,
} from "@/lib/limpeza";
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

  /* As três consultas juntas: são tabelas diferentes e nenhuma depende do
     resultado da outra. Em fila, eram três idas ao banco antes de a
     manutenção começar. */
  const listas = await Promise.all(
    ["bills", "recurring_tasks", "events"].map((tabela) =>
      supabase.from(tabela).select("user_id")
    )
  );

  const ids = new Set<string>();
  for (const { data } of listas)
    ((data as { user_id: string }[]) ?? []).forEach((r) => ids.add(r.user_id));
  return [...ids].map((id) => ({ id }));
}

export async function GET(req: Request) {
  /* A trava mora em lib/segredoCron, para ser testada sem subir o Next. */
  if (!chamadaDoCron(req))
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
  const falhas: string[] = [];

  for (const u of usuarios) {
    const opcoes = { userId: u.id, hoje };

    /*
     * Em paralelo por usuário: as cinco rotinas mexem em tabelas diferentes ou
     * em linhas diferentes da mesma tabela, e nenhuma depende do resultado da
     * outra.
     */
    /*
     * A extensão da janela vem ANTES da limpeza dos passados, e por isso as duas
     * não entram no mesmo Promise.all: se rodassem juntas, a limpeza poderia
     * avaliar a série antes de a extensão criar a ocorrência adiante, e a
     * salvaguarda teria de preservar uma linha que já ia ser substituída.
     */
    const [demandas, fixas, eventos] = await Promise.all([
      reporRecorrentesPerdidas(supabase, opcoes),
      lancarProximoMesDasFixas(supabase, opcoes),
      estenderEventosRecorrentes(supabase, opcoes),
    ]);

    const [concluidas, pagas, eventosAntigos, aulas] = await Promise.all([
      limparConcluidas(supabase, { userId: u.id }),
      limparPagasDeMesesAnteriores(supabase, opcoes),
      limparEventosPassados(supabase, opcoes),
      limparAulasAssistidas(supabase, { userId: u.id }),
    ]);

    const linha = {
      usuario: u.email ?? u.id,
      demandasRecorrentesCriadas: demandas,
      contasFixasLancadas: fixas,
      ocorrenciasDeEventoCriadas: eventos,
      demandasConcluidasApagadas: concluidas,
      contasPagasApagadas: pagas,
      eventosPassadosApagados: eventosAntigos,
      aulasAssistidasApagadas: aulas,
    };
    relatorio.push(linha);

    /* null = a rotina falhou (cada uma devolve null no erro, 0 quando não
       havia nada a fazer). */
    const falharam = Object.entries(linha)
      .filter(([k, v]) => k !== "usuario" && v === null)
      .map(([k]) => k);
    if (falharam.length) falhas.push(`${linha.usuario}: ${falharam.join(", ")}`);

    /*
     * O "bom dia" por último, depois de a manutenção criar o que o Início vai
     * mostrar quando ele tocar na notificação. Um erro no envio não derruba a
     * manutenção — ela já aconteceu —, mas aparece no relatório e no log.
     */
    let brief: Awaited<ReturnType<typeof enviarBrief>> = null;
    try {
      brief = await enviarBrief(supabase, { userId: u.id });
    } catch (e) {
      console.error("[cron] brief", e);
    }
    (linha as Record<string, unknown>).brief = brief;
    /*
     * Configuracao quebrada conta como FALHA, e e por isso que isto mudou.
     *
     * `enviarBrief` devolve `{pulado}` em tres casos, e eles nao sao a mesma
     * coisa: "sem-aparelho" e legitimo — ninguem ligou a notificacao, nao ha
     * o que enviar. "sem-chave" e "sem-tabela" sao o app mal configurado, e
     * antes passavam como sucesso: a rota respondia 200, a Vercel marcava a
     * execucao como boa, e a notificacao simplesmente nao chegava, todo dia,
     * sem nada em lugar nenhum dizendo por que.
     *
     * "recusados" entra pelo mesmo motivo: o servidor de push negar o envio
     * (403, tipico de par de chaves VAPID trocado) deixava `enviados` em 0 e
     * tambem respondia 200.
     */
    if (brief === null) falhas.push(`${linha.usuario}: brief`);
    else if ("pulado" in brief && brief.pulado !== "sem-aparelho")
      falhas.push(`${linha.usuario}: brief ${brief.pulado}`);
    else if ("recusados" in brief && brief.recusados > 0)
      falhas.push(`${linha.usuario}: brief recusado em ${brief.recusados}`);
  }

  /*
   * Falha aparece como falha.
   *
   * A rota respondia 200 com `ok: true` mesmo quando uma rotina devolvia null,
   * e não escrevia nada no log: se a manutenção parasse — contas fixas sem
   * lançar, demandas recorrentes sem nascer —, ninguém ficaria sabendo. Agora
   * o resultado vai para o log da Vercel sempre, e uma falha responde 500,
   * que é o que faz a Vercel marcar a execução do cron como falha.
   */
  const ok = falhas.length === 0;
  const corpo = { ok, hoje, usuarios: usuarios.length, falhas, relatorio };
  if (ok) console.log("[cron] manutenção ok", JSON.stringify(corpo));
  else console.error("[cron] manutenção com falha", JSON.stringify(corpo));
  return NextResponse.json(corpo, { status: ok ? 200 : 500 });
}
