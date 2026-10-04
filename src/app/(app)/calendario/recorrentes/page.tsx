"use client";

import * as React from "react";
import Link from "next/link";
import { ArrowLeft, CalendarDays, MapPin, Repeat2, Trash2 } from "lucide-react";

import { createClient } from "@/lib/supabase/client";
import { useEstadoCacheado, temCache } from "@/lib/cachePagina";
import { NADA_GRAVADO } from "@/lib/erros";
import { dateBR, localDay, localTime, todayISO } from "@/lib/format";
import {
  EVENT_RECURRENCE_LABEL,
  type CalendarEvent,
  type EventRecurrence,
} from "@/lib/types";
import {
  Button,
  Card,
  Empty,
  EsqueletoPagina,
  cx,
  useConfirm,
  useNotice,
} from "@/components/ui";

/**
 * As repetições da agenda, uma linha por série.
 *
 * O calendário mostra OCORRÊNCIAS: a reunião de toda terça aparece quatro
 * vezes no mês, e para saber que ela se repete — ou para fazê-la parar — é
 * preciso achar uma delas no grid e abrir. Com duas ou três repetições isso
 * passa; com oito, a pergunta "o que se repete na minha agenda?" não tem
 * resposta em lugar nenhum.
 *
 * Aqui a unidade é a SÉRIE, e não a ocorrência: uma linha por `series_id`,
 * com a frequência, a próxima vez e quantas ainda estão marcadas.
 *
 * O que esta tela NÃO faz, de propósito: editar título, horário ou
 * frequência. Isso já existe no calendário, abrindo uma ocorrência e
 * escolhendo "todas as repetições" — e dois editores do mesmo dado divergem
 * no dia em que alguém mexe num só. Daqui sai o atalho para lá.
 */

type Serie = {
  id: string;
  titulo: string;
  local: string;
  recorrencia: EventRecurrence;
  /** A próxima ocorrência a partir de hoje, ou a última se todas passaram. */
  proxima: CalendarEvent;
  adiante: number;
  total: number;
};

export default function RecorrentesDaAgenda() {
  const supabase = React.useMemo(() => createClient(), []);
  const [eventos, setEventos] = useEstadoCacheado<CalendarEvent[]>("events", []);
  const [loading, setLoading] = React.useState(() => !temCache("events"));
  const confirm = useConfirm();
  const notice = useNotice();

  const carregar = React.useCallback(async () => {
    const { data } = await supabase.from("events").select("*").order("start_at");
    /* A ocorrência excluída sozinha continua no banco, marcada. Daqui para a
       tela ela não existe — mesma regra do calendário. */
    setEventos(((data as CalendarEvent[]) ?? []).filter((x) => !x.cancelado));
    setLoading(false);
  }, [supabase, setEventos]);

  React.useEffect(() => {
    carregar();
  }, [carregar]);

  const hoje = todayISO();

  const series = React.useMemo(() => {
    const porSerie = new Map<string, CalendarEvent[]>();
    for (const e of eventos) {
      if (!e.series_id) continue;
      const l = porSerie.get(e.series_id) ?? [];
      l.push(e);
      porSerie.set(e.series_id, l);
    }

    const saida: Serie[] = [];
    for (const [id, lista] of porSerie) {
      const ordenada = [...lista].sort((a, b) => a.start_at.localeCompare(b.start_at));
      const adiante = ordenada.filter((e) => localDay(e.start_at) >= hoje);
      /*
       * Sem nenhuma adiante, a referência é a ÚLTIMA que houve.
       *
       * Acontece de verdade: a manutenção das 6h estende a janela, então uma
       * série só fica sem futuro se a extensão falhou ou se o SQL não foi
       * rodado. Mostrar a linha mesmo assim é o que deixa isso visível — some
       * da tela seria esconder o problema.
       */
      const proxima = adiante[0] ?? ordenada[ordenada.length - 1];
      saida.push({
        id,
        titulo: proxima.title,
        local: proxima.location,
        recorrencia: proxima.recurrence,
        proxima,
        adiante: adiante.length,
        total: ordenada.length,
      });
    }
    /* Pela próxima vez: o que acontece antes importa antes. */
    return saida.sort((a, b) => a.proxima.start_at.localeCompare(b.proxima.start_at));
  }, [eventos, hoje]);

  const encerrar = (s: Serie) =>
    confirm.ask(
      `Encerrar a repetição de "${s.titulo}"? São ${s.total} ocorrência${
        s.total === 1 ? "" : "s"
      }, e ela para de se repetir.`,
      async () => {
        const { data, error } = await supabase
          .from("events")
          .delete()
          .eq("series_id", s.id)
          .select("id");
        if (notice.check(error, "encerrar a repetição")) return;
        if (!data?.length) return notice.show(NADA_GRAVADO);
        carregar();
      }
    );

  if (loading) return <EsqueletoPagina />;

  return (
    <>
      <div className="mb-4 flex flex-wrap items-center gap-3">
        <Link
          href="/calendario"
          className="grid h-9 w-9 shrink-0 place-items-center rounded-[14px] bg-ink-800 text-fg-dim transition-colors hover:text-fg"
          aria-label="Voltar para o calendário"
        >
          <ArrowLeft size={16} />
        </Link>
        <div className="min-w-0 flex-1">
          <h1 className="titulo-pagina">Eventos recorrentes</h1>
          <p className="mt-0.5 text-[13px] text-fg-mute">
            {series.length === 0
              ? "Nenhuma repetição na agenda."
              : `${series.length} repetição${series.length === 1 ? "" : "ões"} na agenda.`}
          </p>
        </div>
      </div>

      {series.length === 0 ? (
        <Card>
          <Empty
            icon={<Repeat2 size={20} />}
            title="Nenhum evento se repete"
            sub="Ao criar um evento no calendário, escolha com que frequência ele volta — toda semana, a cada 15 dias ou todo mês. Ele passa a aparecer aqui."
            action={
              <Link href="/calendario">
                <Button variant="primary" size="sm">
                  <CalendarDays size={14} />
                  Abrir o calendário
                </Button>
              </Link>
            }
          />
        </Card>
      ) : (
        <div className="grid grid-cols-[minmax(0,1fr)] gap-3 md:grid-cols-2 xl:grid-cols-3">
          {series.map((s) => {
            const dia = localDay(s.proxima.start_at);
            const passou = dia < hoje;
            return (
              <Card key={s.id}>
                <div className="flex items-start gap-2.5 px-[18px] pt-[18px]">
                  <span className="mt-0.5 grid h-[22px] w-[22px] shrink-0 place-items-center rounded-[7px] bg-brand-500/12 text-brand-400">
                    <Repeat2 size={13} />
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-[14px] font-bold">
                      {s.titulo}
                    </span>
                    <span className="mt-0.5 block text-[11.5px] text-fg-mute">
                      {EVENT_RECURRENCE_LABEL[s.recorrencia] ?? "Repete"}
                    </span>
                  </span>
                  <button
                    type="button"
                    onClick={() => encerrar(s)}
                    aria-label={`Encerrar a repetição de ${s.titulo}`}
                    title="Encerrar a repetição"
                    className="grid h-7 w-7 shrink-0 place-items-center rounded-lg text-fg-mute transition-colors hover:bg-neg/12 hover:text-neg"
                  >
                    <Trash2 size={13} />
                  </button>
                </div>

                <div className="px-[18px] pb-[18px] pt-3">
                  <dl className="flex flex-col gap-1.5 text-[12px]">
                    <div className="flex items-center gap-1.5">
                      <CalendarDays size={12} className="shrink-0 text-fg-mute" />
                      <dt className="text-fg-mute">
                        {passou ? "Última foi" : "Próxima"}
                      </dt>
                      <dd className={cx("font-semibold tnum", passou && "text-warn")}>
                        {dateBR(dia)}
                        {!s.proxima.all_day && ` · ${localTime(s.proxima.start_at)}`}
                      </dd>
                    </div>
                    {s.local && (
                      <div className="flex items-center gap-1.5">
                        <MapPin size={12} className="shrink-0 text-fg-mute" />
                        <dd className="min-w-0 truncate text-fg-dim">{s.local}</dd>
                      </div>
                    )}
                  </dl>

                  <p className="mt-2.5 text-[11.5px] text-fg-mute">
                    {s.adiante === 0
                      ? "Nenhuma marcada daqui para a frente."
                      : `${s.adiante} marcada${s.adiante === 1 ? "" : "s"} daqui para a frente.`}
                  </p>

                  {/* O editor mora no calendário, e é lá que se muda título,
                      horário e frequência — abrindo a ocorrência e escolhendo
                      "todas as repetições". */}
                  <Link
                    href={`/calendario?dia=${dia}`}
                    className="mt-3 flex h-8 w-full items-center justify-center gap-1.5 rounded-[10px] border border-dashed border-line text-[12px] font-semibold text-fg-mute transition-colors hover:border-brand-400 hover:text-brand-400"
                  >
                    <CalendarDays size={13} />
                    ver no calendário
                  </Link>
                </div>
              </Card>
            );
          })}
        </div>
      )}

      {confirm.node}
      {notice.node}
    </>
  );
}
