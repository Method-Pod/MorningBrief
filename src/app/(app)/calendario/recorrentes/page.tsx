"use client";

import * as React from "react";
import Link from "next/link";
import {
  ArrowLeft,
  CalendarDays,
  MapPin,
  Pencil,
  Repeat2,
  Trash2,
} from "lucide-react";

import { createClient } from "@/lib/supabase/client";
import { useEstadoCacheado, temCache } from "@/lib/cachePagina";
import { NADA_GRAVADO } from "@/lib/erros";
import { dateBR, localDay, localTime, todayISO } from "@/lib/format";
import {
  EVENT_RECURRENCE_LABEL,
  type CalendarEvent,
  type EventRecurrence,
} from "@/lib/types";
import { atualizarSerie } from "@/lib/serieDeEventos";
import {
  Button,
  Card,
  Empty,
  EsqueletoPagina,
  Field,
  Input,
  Modal,
  Textarea,
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
 * É aqui que se muda a repetição inteira — título, hora, local, descrição —,
 * e é o único lugar: o calendário passou a salvar sempre uma ocorrência só.
 * Lá os dois botões ("só esta" e "em todas") ficavam lado a lado, e o que
 * alterava nove linhas de uma vez era o mais à mão.
 *
 * O que NÃO se muda aqui: a DATA, que é de cada ocorrência — remarcar um
 * encontro específico continua sendo no calendário —, e a FREQUÊNCIA, porque
 * trocá-la obrigaria a refazer as ocorrências já marcadas. Para mudar de
 * semanal para mensal, encerre e crie de novo.
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

  /* O editor da série. `aberta` é a série em edição; nulo é fechado. */
  const [aberta, setAberta] = React.useState<Serie | null>(null);
  const [form, setForm] = React.useState({
    title: "",
    time: "",
    end_time: "",
    all_day: false,
    location: "",
    description: "",
  });
  const [salvando, setSalvando] = React.useState(false);
  const [erro, setErro] = React.useState("");

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

  const editar = (s: Serie) => {
    const e = s.proxima;
    setAberta(s);
    setErro("");
    setForm({
      title: e.title,
      time: e.all_day ? "" : localTime(e.start_at),
      end_time: e.end_at && !e.all_day ? localTime(e.end_at) : "",
      all_day: e.all_day,
      location: e.location ?? "",
      description: e.description ?? "",
    });
  };

  const salvar = async () => {
    if (!aberta) return;
    if (!form.title.trim()) return setErro("Informe o título.");
    setSalvando(true);
    setErro("");

    /*
     * A duração é medida no formulário, não lida do banco: se ele mudar o fim
     * de 16h para 17h, é a duração NOVA que tem de ir para todas. Lendo a do
     * banco, a hora de fim que ele acabou de digitar seria ignorada em silêncio.
     */
    const duracaoMs =
      form.all_day || !form.time || !form.end_time
        ? null
        : new Date(`2000-01-01T${form.end_time}:00`).getTime() -
          new Date(`2000-01-01T${form.time}:00`).getTime();

    const { gravadas, erro: falha } = await atualizarSerie(supabase, {
      serieId: aberta.id,
      campos: {
        title: form.title.trim(),
        description: form.description.trim(),
        location: form.location.trim(),
        color: aberta.proxima.color,
        all_day: form.all_day,
      },
      hora: form.all_day ? "00:00" : form.time,
      duracaoMs: duracaoMs !== null && duracaoMs > 0 ? duracaoMs : null,
    });

    setSalvando(false);
    if (falha) return setErro(falha.message);
    if (!gravadas) return setErro(NADA_GRAVADO);
    setAberta(null);
    notice.show(
      `Alterado em ${gravadas} ocorrência${gravadas === 1 ? "" : "s"}.`,
      "ok"
    );
    carregar();
  };

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
                    onClick={() => editar(s)}
                    aria-label={`Editar a repetição de ${s.titulo}`}
                    title="Editar a repetição"
                    className="grid h-7 w-7 shrink-0 place-items-center rounded-lg text-fg-mute transition-colors hover:bg-ink-800 hover:text-fg"
                  >
                    <Pencil size={13} />
                  </button>
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

      <Modal
        open={!!aberta}
        onClose={() => setAberta(null)}
        title="Editar a repetição"
        footer={
          <>
            <Button onClick={() => setAberta(null)}>Cancelar</Button>
            <Button variant="primary" onClick={salvar} disabled={salvando}>
              {salvando ? "Salvando..." : "Salvar em todas"}
            </Button>
          </>
        }
      >
        <div className="flex flex-col gap-4">
          <p className="rounded-[14px] bg-ink-800 px-3.5 py-3 text-[12px] leading-relaxed text-fg-dim">
            O que mudar aqui vale para{" "}
            <b className="text-fg">
              as {aberta?.total ?? 0} ocorrência
              {(aberta?.total ?? 0) === 1 ? "" : "s"}
            </b>{" "}
            desta repetição, inclusive as que já passaram — horário trocado pela
            metade mostraria dois horários para o mesmo compromisso.
          </p>

          <Field label="Título">
            <Input
              value={form.title}
              onChange={(e) => setForm({ ...form, title: e.target.value })}
              autoFocus
            />
          </Field>

          <label className="flex cursor-pointer items-center gap-2.5 rounded-[14px] bg-ink-800 px-3.5 py-3 text-[13px]">
            <input
              type="checkbox"
              checked={form.all_day}
              onChange={(e) => setForm({ ...form, all_day: e.target.checked })}
              className="h-4 w-4 accent-[var(--a)]"
            />
            Dia inteiro
          </label>

          {!form.all_day && (
            <div className="grid gap-4 sm:grid-cols-2">
              <Field label="Início">
                <Input
                  type="time"
                  value={form.time}
                  onChange={(e) => setForm({ ...form, time: e.target.value })}
                />
              </Field>
              <Field label="Fim">
                <Input
                  type="time"
                  value={form.end_time}
                  onChange={(e) => setForm({ ...form, end_time: e.target.value })}
                />
              </Field>
            </div>
          )}

          <Field label="Local">
            <Input
              value={form.location}
              onChange={(e) => setForm({ ...form, location: e.target.value })}
              placeholder="Zoom, sala, endereço..."
            />
          </Field>

          <Field label="Descrição">
            <Textarea
              rows={3}
              value={form.description}
              onChange={(e) => setForm({ ...form, description: e.target.value })}
              placeholder="Pauta, links, participantes..."
            />
          </Field>

          {/* A DATA não está aqui de propósito: ela é de cada ocorrência, e
              propagá-la empilharia a repetição inteira num dia só. Remarcar um
              encontro específico continua sendo no calendário. */}
          <p className="text-[11.5px] leading-relaxed text-fg-mute">
            A data de cada ocorrência e a frequência não mudam aqui. Para
            remarcar um dia só, abra o evento no calendário; para trocar de
            semanal para mensal, encerre a repetição e crie de novo.
          </p>

          {erro && (
            <p className="rounded-[14px] bg-neg/12 p-3 text-xs font-medium text-neg">
              {erro}
            </p>
          )}
        </div>
      </Modal>

      {confirm.node}
      {notice.node}
    </>
  );
}
