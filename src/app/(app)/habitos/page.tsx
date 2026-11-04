"use client";

import * as React from "react";
import { CabecalhoCrescimento } from "@/components/AbasCrescimento";
import { CartaoPadroes } from "@/components/RevisaoDaSemana";
import { FaixaResumo } from "@/components/FaixaResumo";
import {
  Check,
  ChevronLeft,
  ChevronRight,
  Flame,
  Pencil,
  Plus,
  Power,
  Repeat2,
  Trash2,
} from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { criarFilaPorChave } from "@/lib/filaPorChave";
import { temCache, useEstadoCacheado } from "@/lib/cachePagina";
import { currentUserId, SESSION_EXPIRED } from "@/lib/session";
import { NADA_GRAVADO, nenhumaLinha } from "@/lib/erros";
import { type Habit, type HabitLog } from "@/lib/types";
import { dataCurta, semanaDe, todayISO, ultimosDias } from "@/lib/format";
import {
  Button,
  Card,
  Field,
  Input,
  Modal,
  Select,
  cx,
  useConfirm,
  useNotice,
  EsqueletoPagina,
} from "@/components/ui";
import { MenuSuspenso } from "@/components/MenuSuspenso";

/** semanaDe devolve segunda→domingo, então os nomes seguem a mesma ordem. */
const DIAS = ["seg", "ter", "qua", "qui", "sex", "sáb", "dom"];

const vazio = () => ({ name: "", target_per_week: 7, active: true });

export default function HabitosPage() {
  const supabase = React.useMemo(() => createClient(), []);
  const [habits, setHabits] = useEstadoCacheado<Habit[]>("habits", []);
  const [logs, setLogs] = useEstadoCacheado<HabitLog[]>("habit_logs", []);
  /* Já visitou nesta sessão? Abre com conteúdo e atualiza atrás. */
  const [loading, setLoading] = React.useState(
    () => !temCache("habits", "habit_logs")
  );
  const [semanas, setSemanas] = React.useState(0);
  const [open, setOpen] = React.useState(false);
  const [editing, setEditing] = React.useState<Habit | null>(null);
  const [form, setForm] = React.useState(vazio());
  const [busy, setBusy] = React.useState(false);
  const [err, setErr] = React.useState("");
  const confirm = useConfirm();
  const notice = useNotice();

  const hoje = todayISO();
  const semana = React.useMemo(() => semanaDe(hoje, semanas), [hoje, semanas]);

  /* A sigla vive dentro da bolinha: sem ela, sete círculos vazios não dizem
     que dia é cada um. A data completa fica no title e no aria-label, que é
     o que resolve o S/S e o Q/Q repetidos. */
  const sigla = (iso: string) => {
    const i = semana.indexOf(iso);
    return i >= 0 ? DIAS[i][0].toUpperCase() : "";
  };
  const ehHoje = (iso: string) => iso === hoje;

  const load = React.useCallback(async () => {
    // 90 dias cobrem a sequência mais longa e algumas semanas para trás
    const desde = ultimosDias(todayISO(), 90)[0];
    const [h, l] = await Promise.all([
      supabase.from("habits").select("*").order("created_at"),
      supabase.from("habit_logs").select("*").gte("day", desde),
    ]);
    setHabits((h.data as Habit[]) ?? []);
    setLogs((l.data as HabitLog[]) ?? []);
    setLoading(false);
  }, [supabase]);

  React.useEffect(() => {
    load();
  }, [load]);

  /** Set de "habitId|dia" para consulta O(1) na renderização. */
  const feitos = React.useMemo(
    () => new Set(logs.map((l) => `${l.habit_id}|${l.day.slice(0, 10)}`)),
    [logs]
  );
  const marcado = (id: string, dia: string) => feitos.has(`${id}|${dia}`);

  /* Um pedido por vez para cada bolinha, e vale o último toque: dois toques
     rápidos chegavam ao banco na ordem trocada. Ver lib/filaPorChave. */
  const [fila] = React.useState(criarFilaPorChave);

  /** Grava ou apaga a marca. `false` quando falhou (aí a tela recarrega). */
  const gravar = async (h: Habit, dia: string, marcar: boolean) => {
    if (!marcar) {
      const { error } = await supabase
        .from("habit_logs")
        .delete()
        .eq("habit_id", h.id)
        .eq("day", dia);
      return !notice.check(error, "desmarcar o hábito");
    }
    const uid = await currentUserId(supabase);
    if (!uid) {
      notice.show(SESSION_EXPIRED);
      return false;
    }
    const { error } = await supabase
      .from("habit_logs")
      .insert({ user_id: uid, habit_id: h.id, day: dia });
    // 23505 = unique(habit_id, day): já estava marcado, não é falha
    return !(error && error.code !== "23505" && notice.check(error, "marcar o hábito"));
  };

  const alternar = (h: Habit, dia: string) => {
    const quer = !marcado(h.id, dia);

    setLogs((v) =>
      quer
        ? [
            ...v,
            {
              id: `tmp-${h.id}-${dia}`,
              user_id: "",
              habit_id: h.id,
              day: dia,
              created_at: new Date().toISOString(),
            },
          ]
        : v.filter((l) => !(l.habit_id === h.id && l.day.slice(0, 10) === dia))
    );

    void fila
      .pedir(`${h.id}|${dia}`, quer, (marcar) => gravar(h, dia, marcar))
      .then((ok) => {
        if (!ok) load();
      });
  };

  const novo = () => {
    setEditing(null);
    setForm(vazio());
    setErr("");
    setOpen(true);
  };

  const editar = (h: Habit) => {
    setEditing(h);
    setForm({
      name: h.name,
      target_per_week: h.target_per_week,
      active: h.active,
    });
    setErr("");
    setOpen(true);
  };

  const salvar = async (e: React.FormEvent) => {
    e.preventDefault();
    setErr("");
    const nome = form.name.trim();
    if (!nome) return setErr("Informe o nome do hábito.");
    setBusy(true);
    const payload = {
      name: nome,
      target_per_week: Number(form.target_per_week),
      active: form.active,
    };
    let error;
    if (editing) {
      /*
       * `select("id")` para saber se gravou de verdade.
       *
       * Sem ele, um update que não atinge linha nenhuma volta 204 sem erro: o
       * formulário fecha, a lista recarrega e o valor antigo continua ali sem
       * explicação. Ver NADA_GRAVADO.
       */
      const { data: salvo, error: falha } = await supabase
        .from("habits")
        .update(payload)
        .eq("id", editing.id)
        .select("id");
      error = falha;
      if (!falha && !salvo?.length) {
        setBusy(false);
        return setErr(NADA_GRAVADO);
      }
    } else {
      const uid = await currentUserId(supabase);
      if (!uid) {
        setBusy(false);
        return setErr(SESSION_EXPIRED);
      }
      ({ error } = await supabase
        .from("habits")
        .insert({ ...payload, user_id: uid }));
    }
    setBusy(false);
    if (error) return setErr(error.message);
    setOpen(false);
    load();
  };

  const excluir = (h: Habit) =>
    confirm.ask(
      `Excluir "${h.name}"? O histórico de marcações vai junto.`,
      async () => {
        const { data: saiu, error } = await supabase
          .from("habits")
          .delete()
          .eq("id", h.id)
          .select("id");
        if (notice.check(error, "excluir o hábito")) return;
        if (!saiu?.length) return notice.show(NADA_GRAVADO);
        setHabits((v) => v.filter((x) => x.id !== h.id));
        /* Os registros saem por cascade no banco; aqui saem do estado para a
           contagem da semana não somar dias de um hábito que já não existe. */
        setLogs((v) => v.filter((l) => l.habit_id !== h.id));
      }
    );

  const pausar = async (h: Habit) => {
    setHabits((v) =>
      v.map((x) => (x.id === h.id ? { ...x, active: !x.active } : x))
    );
    const { data: gravadas, error } = await supabase
      .from("habits")
      .update({ active: !h.active })
      .eq("id", h.id)
      .select("id");
    if (notice.check(error ?? nenhumaLinha(gravadas), h.active ? "pausar o hábito" : "retomar o hábito"))
      load();
  };

  /*
   * Os 90 dias, de hoje para trás, calculados uma vez.
   *
   * Estavam sendo montados dentro de `sequencia`, que roda uma vez por hábito
   * a cada render: dez hábitos eram novecentos objetos Date e novecentas
   * strings montadas para responder a mesma pergunta. A lista só depende de
   * `hoje`, então é aqui que ela pertence.
   *
   * Já vem invertida porque `reverse` altera o próprio array — invertê-la a
   * cada chamada mexeria no valor memoizado.
   */
  const diasParaTras = React.useMemo(
    () => ultimosDias(hoje, 90).reverse(),
    [hoje]
  );

  /** Dias seguidos terminando hoje (ou ontem, se hoje ainda não foi marcado). */
  const sequencia = React.useCallback(
    (id: string) => {
      const dias = diasParaTras;
      const inicio = marcado(id, dias[0]) ? 0 : 1;
      let n = 0;
      for (let i = inicio; i < dias.length; i++) {
        if (marcado(id, dias[i])) n++;
        else break;
      }
      return n;
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [feitos, diasParaTras]
  );

  const ativos = habits.filter((h) => h.active);
  const feitosHoje = ativos.filter((h) => marcado(h.id, hoje)).length;
  const semanaAtual = semanas === 0;

  /** "24 de ago. – 30 de ago." */
  const rotuloSemana = semanaAtual
    ? "Esta semana"
    : `${dataCurta(semana[0]).replace(".", "")} – ${dataCurta(semana[6])}`;

  /*
   * A faixa olha SEMPRE a semana de hoje, mesmo com a grade numa semana
   * passada: ela responde "como eu estou agora". Se mudasse ao navegar para
   * trás, viraria legenda da grade e deixaria de ser resumo.
   *
   * "Semana cumprida" soma as metas e conta cada hábito só até a meta dele:
   * marcar a academia sete vezes numa meta de cinco não compensa a leitura
   * que ficou em zero.
   */
  const estaSemana = semanaDe(hoje, 0);
  let somaMetas = 0;
  let cumprido = 0;
  let naMeta = 0;
  let melhorSeq = 0;
  for (const h of ativos) {
    const n = estaSemana.filter((d) => marcado(h.id, d)).length;
    somaMetas += h.target_per_week;
    cumprido += Math.min(n, h.target_per_week);
    if (n >= h.target_per_week) naMeta++;
    melhorSeq = Math.max(melhorSeq, sequencia(h.id));
  }
  const pctSemana = somaMetas ? Math.round((cumprido / somaMetas) * 100) : 0;
  const dias = (n: number) => (n === 1 ? "1 dia" : `${n} dias`);

  if (loading) return <EsqueletoPagina blocos={3} />;

  return (
    <div className="space-y-5 rise">
      <CabecalhoCrescimento
        acoes={
          <Button variant="primary" onClick={novo}>
            <Plus size={15} />
            Novo hábito
          </Button>
        }
      />

      {ativos.length > 0 && (
        <FaixaResumo
          itens={[
            {
              rotulo: "Hoje",
              valor: `${feitosHoje} de ${ativos.length}`,
              detalhe: feitosHoje === ativos.length ? "tudo feito" : "hábitos feitos",
              tom: feitosHoje === ativos.length ? "pos" : undefined,
            },
            {
              rotulo: "Na meta da semana",
              valor: `${naMeta} de ${ativos.length}`,
              detalhe: "hábitos",
              tom: naMeta === ativos.length ? "pos" : undefined,
            },
            {
              rotulo: "Semana cumprida",
              valor: `${pctSemana}%`,
              detalhe: "das metas somadas",
            },
            {
              rotulo: "Melhor sequência",
              valor: melhorSeq ? dias(melhorSeq) : "—",
              detalhe: melhorSeq ? "seguidos, até hoje" : "nenhuma ainda",
            },
          ]}
        />
      )}

      {habits.length === 0 ? (
        <Card>
          <div className="flex flex-col items-center px-6 py-14 text-center">
            <div className="mb-3 grid h-11 w-11 place-items-center rounded-[14px] bg-ink-800 text-fg-mute">
              <Repeat2 size={19} />
            </div>
            <p className="text-[13.5px] font-semibold text-fg-dim">
              Nenhum hábito ainda
            </p>
            <p className="mt-1 max-w-[330px] text-xs text-fg-mute">
              Academia, leitura, água — o que você quer repetir. Marque no dia e
              acompanhe a sequência.
            </p>
            <Button variant="primary" size="sm" className="mt-4" onClick={novo}>
              Criar o primeiro
            </Button>
          </div>
        </Card>
      ) : (
        <>
          {/*
            A semana em foco, num cartão próprio acima da grade. Cada hábito
            virou um cartão (o desenho dos projetos da referência), então os
            dias saem daqui e vão para dentro de cada um.
          */}
          <Card className="flex items-center gap-1.5 px-3 py-2.5">
            <button
              onClick={() => setSemanas((s) => s - 1)}
              aria-label="Semana anterior"
              className="grid h-9 w-9 place-items-center rounded-full border border-[var(--vidro-borda)] text-fg-dim transition-colors hover:bg-fg/[0.08] hover:text-fg"
            >
              <ChevronLeft size={16} />
            </button>
            <span className="min-w-[128px] text-center text-[14px] font-semibold">
              {rotuloSemana}
            </span>
            <button
              onClick={() => setSemanas((s) => Math.min(0, s + 1))}
              disabled={semanaAtual}
              aria-label="Próxima semana"
              className="grid h-9 w-9 place-items-center rounded-full border border-[var(--vidro-borda)] text-fg-dim transition-colors hover:bg-fg/[0.08] hover:text-fg disabled:opacity-30 disabled:hover:bg-transparent"
            >
              <ChevronRight size={16} />
            </button>
            {!semanaAtual && (
              <button
                onClick={() => setSemanas(0)}
                className="ml-1 rounded-full px-3 py-1.5 text-[12px] font-semibold text-brand-400 transition-colors hover:bg-brand-500/10"
              >
                Hoje
              </button>
            )}
          </Card>

          <ul className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
            {habits.map((h) => {
              const seq = sequencia(h.id);
              const naSemana = semana.filter((d) => marcado(h.id, d)).length;
              const meta = h.target_per_week;
              const bateu = naSemana >= meta;
              const pct = Math.min(100, Math.round((naSemana / Math.max(1, meta)) * 100));
              const R = 22;
              const C = 2 * Math.PI * R;
              return (
                <li
                  key={h.id}
                  className={cx("card group flex flex-col p-4", !h.active && "opacity-55")}
                >
                  <div className="flex items-start gap-3">
                    <span className="grid h-10 w-10 shrink-0 place-items-center rounded-full bg-brand-500/15 text-brand-400">
                      <Repeat2 size={16} />
                    </span>
                    <div className="min-w-0 flex-1">
                      <p className="truncate-livre text-[15px] font-semibold">{h.name}</p>
                      <p className="mt-0.5 text-[12px] text-fg-mute">
                        meta de {meta} {meta === 1 ? "dia" : "dias"} por semana
                      </p>
                    </div>
                    <div className="-mr-1 -mt-0.5 shrink-0">
                      <MenuSuspenso
                        rotulo={`Ações de ${h.name}`}
                        itens={[
                          {
                            rotulo: h.active ? "Pausar" : "Retomar",
                            icone: <Power size={14} />,
                            aoEscolher: () => pausar(h),
                          },
                          {
                            rotulo: "Editar",
                            icone: <Pencil size={14} />,
                            aoEscolher: () => editar(h),
                          },
                          {
                            rotulo: "Excluir",
                            icone: <Trash2 size={14} />,
                            aoEscolher: () => excluir(h),
                            perigo: true,
                          },
                        ]}
                      />
                    </div>
                  </div>

                  {/* A caixinha de progresso: o anel da meta, a frase e a barra. */}
                  <div className="mt-3 flex items-center gap-3 rounded-[16px] border border-line bg-ink-800 p-3">
                    <span className="relative shrink-0">
                      <svg width="54" height="54" viewBox="0 0 54 54" className="-rotate-90">
                        <circle cx="27" cy="27" r={R} fill="none" stroke="var(--a-line)" strokeWidth="5" />
                        <circle
                          cx="27"
                          cy="27"
                          r={R}
                          fill="none"
                          stroke={bateu ? "var(--cor-pos)" : "var(--a)"}
                          strokeWidth="5"
                          strokeLinecap="round"
                          strokeDasharray={C.toFixed(1)}
                          strokeDashoffset={(C * (1 - pct / 100)).toFixed(1)}
                          className="anel-desenha"
                          style={{ "--anel-c": C.toFixed(1) } as React.CSSProperties}
                        />
                      </svg>
                      <span className="absolute inset-0 grid place-items-center text-[11px] font-semibold tnum">
                        {pct}%
                      </span>
                    </span>
                    <div className="min-w-0 flex-1">
                      <p className={cx("text-[13px] font-semibold tnum", bateu && "text-pos")}>
                        {naSemana} de {meta} na semana
                      </p>
                      <p className="mt-0.5 flex items-center gap-1 text-[12px] text-fg-mute">
                        {!h.active ? (
                          "pausado"
                        ) : seq > 0 ? (
                          <>
                            <Flame size={12} className="text-warn" />
                            <span className="font-semibold text-warn">
                              {seq === 1 ? "1 dia seguido" : `${seq} dias seguidos`}
                            </span>
                          </>
                        ) : bateu ? (
                          "meta batida"
                        ) : (
                          `faltam ${meta - naSemana}`
                        )}
                      </p>
                      <span className="mt-2 block h-1.5 overflow-hidden rounded-full bg-[var(--a-line)]">
                        <span
                          className="cresce block h-full rounded-full"
                          style={{
                            width: `${pct}%`,
                            background: bateu ? "var(--cor-pos)" : "var(--a)",
                          }}
                        />
                      </span>
                    </div>
                  </div>

                  {/* Os sete dias, com a letra e o número em cada um. */}
                  <div className="mt-3 grid grid-cols-7 gap-1">
                    {semana.map((d, i) => {
                      const on = marcado(h.id, d);
                      const futuro = d > hoje;
                      const travado = futuro || !h.active;
                      return (
                        <div key={d} className="flex flex-col items-center gap-1">
                          <span
                            className={cx(
                              "text-[10px] font-semibold uppercase",
                              ehHoje(d) ? "text-brand-400" : "text-fg-mute"
                            )}
                          >
                            {DIAS[i][0]}
                          </span>
                          <button
                            disabled={travado}
                            onClick={() => alternar(h, d)}
                            aria-label={`${h.name} — ${dataCurta(d)}${on ? ", feito" : ""}`}
                            aria-pressed={on}
                            title={dataCurta(d)}
                            className={cx(
                              "grid h-9 w-9 place-items-center rounded-full border-[1.5px] text-[11px] font-semibold tnum transition-colors",
                              on
                                ? "border-transparent bg-brand-500 bg-[image:var(--a-degrade)] text-on-brand"
                                : ehHoje(d)
                                  ? "border-brand-500 bg-brand-500/10 text-brand-400"
                                  : futuro
                                    ? "border-dashed border-line text-fg-mute"
                                    : "border-line text-fg-dim",
                              !travado && !on && "hover:border-brand-500",
                              travado && "cursor-not-allowed"
                            )}
                          >
                            {on ? <Check size={14} strokeWidth={3} /> : Number(d.slice(8, 10))}
                          </button>
                        </div>
                      );
                    })}
                  </div>
                </li>
              );
            })}
          </ul>
        </>
      )}

      {/* Os padrões que os hábitos revelam, cruzados com o resto do app.
          Ver lib/padroes. */}
      <div className="mt-4">
        <CartaoPadroes />
      </div>

      <Modal
        open={open}
        onClose={() => setOpen(false)}
        title={editing ? "Editar hábito" : "Novo hábito"}
        footer={
          <>
            <Button onClick={() => setOpen(false)}>Cancelar</Button>
            <Button variant="primary" onClick={salvar} disabled={busy}>
              {busy ? "Salvando..." : "Salvar"}
            </Button>
          </>
        }
      >
        <form onSubmit={salvar} className="flex flex-col gap-3.5">
          <Field label="Nome">
            <Input
              autoFocus
              value={form.name}
              onChange={(e) => setForm({ ...form, name: e.target.value })}
              placeholder="Academia"
            />
          </Field>

          <Field label="Meta por semana" hint="Quantos dias você quer cumprir.">
            <Select
              value={String(form.target_per_week)}
              onChange={(e) =>
                setForm({ ...form, target_per_week: Number(e.target.value) })
              }
            >
              {[1, 2, 3, 4, 5, 6, 7].map((n) => (
                <option key={n} value={n}>
                  {n} {n === 1 ? "dia" : "dias"}
                </option>
              ))}
            </Select>
          </Field>

          <label className="flex cursor-pointer items-center gap-2.5 rounded-[14px] bg-ink-800 px-3.5 py-3">
            <input
              type="checkbox"
              checked={form.active}
              onChange={(e) => setForm({ ...form, active: e.target.checked })}
              className="h-4 w-4 accent-[var(--a)]"
            />
            <span className="text-sm text-fg-dim">
              Ativo
              <span className="ml-1 text-[11px] text-fg-mute">
                (pausado não conta nem aparece no Início)
              </span>
            </span>
          </label>

          {err && (
            <p className="rounded-[14px] bg-neg/12 px-3.5 py-3 text-xs font-medium text-neg">
              {err}
            </p>
          )}
        </form>
      </Modal>

      {confirm.node}
      {notice.node}
    </div>
  );
}
