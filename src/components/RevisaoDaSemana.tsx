"use client";

import * as React from "react";
import { BookOpen, CalendarRange, CheckCircle2, ChevronLeft, ChevronRight, Hourglass, Sparkles, Zap } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { brl, dataCurta, todayISO } from "@/lib/format";
import { diaDeManutencao } from "@/lib/viradaDoDia";
import { gravarEnergia, lerRegistro } from "@/lib/registroDoDia";
import { lerDadosDaSemana, montarRevisao, semanaDe, semanaEmRevisao, type Revisao } from "@/lib/revisaoDaSemana";
import { DIAS_PARA_COMECAR, lerPadroes, type Padrao } from "@/lib/padroes";
import { somarDias } from "@/lib/modelosDeDemanda";
import { naoExiste } from "@/lib/saudeDoBanco";
import { Card, cx } from "./ui";

/* ------------------------------ energia do dia ------------------------------ */

const ROTULOS_ENERGIA = ["muito baixa", "baixa", "média", "boa", "alta"];
const SIGLA_DO_DIA = ["D", "S", "T", "Q", "Q", "S", "S"];
const NOME_DO_DIA = ["domingo", "segunda", "terça", "quarta", "quinta", "sexta", "sábado"];
const diaDaSemana = (iso: string) => {
  const [a, m, d] = iso.split("-").map(Number);
  return new Date(Date.UTC(a, m - 1, d)).getUTCDay();
};

/**
 * A energia do dia, de 1 a 5, com um toque. Tocar no mesmo número de novo
 * desmarca. O dia vai das 6h às 6h, como o resto do registro.
 *
 * Embaixo, a semana de segunda a domingo, uma barrinha por dia. Tocar na
 * barrinha de um dia que já passou escolhe aquele dia, e os botões passam a
 * marcar ele -- pedido dele, para o dia em que esqueceu de marcar. As setas
 * mostram as semanas anteriores (na segunda-feira, "ontem" é da semana
 * passada). Dia que ainda não chegou não se escolhe.
 *
 * Some sem aviso se o SQL ainda não rodou: um seletor que não grava seria
 * pior que nenhum.
 */
export function EnergiaDoDia() {
  const supabase = React.useMemo(() => createClient(), []);
  const [hoje] = React.useState(() => diaDeManutencao());
  /* 0 = esta semana, -1 = a passada... Nunca adiante. */
  const [semanas, setSemanas] = React.useState(0);
  const [escolhido, setEscolhido] = React.useState(hoje);
  /* Energia por dia, de todas as semanas já vistas. */
  const [valores, setValores] = React.useState<Map<string, number | null>>(new Map());
  const [carregadas, setCarregadas] = React.useState<Set<string>>(new Set());
  const [semTabela, setSemTabela] = React.useState(false);
  const [falhou, setFalhou] = React.useState(false);

  /* A semana de segunda a domingo, a mesma da revisão da semana. */
  const segunda = somarDias(semanaDe(hoje).de, semanas * 7);
  const pronto = carregadas.has(segunda);

  React.useEffect(() => {
    if (carregadas.has(segunda)) return;
    const domingo = somarDias(segunda, 6);
    lerRegistro(supabase, { de: segunda, ate: domingo < hoje ? domingo : hoje }).then((r) => {
      setSemTabela(r.semTabela);
      setValores((v) => {
        const m = new Map(v);
        for (const d of r.dias) m.set(d.dia, d.energia);
        return m;
      });
      setCarregadas((c) => new Set(c).add(segunda));
    });
  }, [supabase, hoje, segunda, carregadas]);

  const dias = Array.from({ length: 7 }, (_, i) => {
    const dia = somarDias(segunda, i);
    return { dia, valor: valores.get(dia) ?? null, futuro: dia > hoje };
  });
  const passados = dias.filter((d) => !d.futuro).length;
  const marcados = dias.filter((d) => d.valor != null).map((d) => d.valor as number);
  const media = marcados.length ? marcados.reduce((s, v) => s + v, 0) / marcados.length : null;

  if (semTabela) return null;

  const energia = valores.get(escolhido) ?? null;
  const ehHojeEscolhido = escolhido === hoje;
  const nomeDoEscolhido = `${NOME_DO_DIA[diaDaSemana(escolhido)]}, ${escolhido.slice(8, 10)}/${escolhido.slice(5, 7)}`;
  const titulo = ehHojeEscolhido ? "Sua energia hoje" : `Energia de ${nomeDoEscolhido}`;

  const escolher = async (n: number) => {
    const dia = escolhido;
    const antes = valores.get(dia) ?? null;
    const novo = antes === n ? null : n;
    setValores((v) => new Map(v).set(dia, novo));
    setFalhou(false);
    const { error } = await gravarEnergia(supabase, novo, { dia });
    if (error) {
      setValores((v) => new Map(v).set(dia, antes));
      setFalhou(true);
      if (naoExiste(error)) setSemTabela(true);
    }
  };

  const tituloDaSemana =
    semanas === 0
      ? "Esta semana"
      : semanas === -1
        ? "Semana passada"
        : `Semana de ${segunda.slice(8, 10)}/${segunda.slice(5, 7)}`;

  return (
    <div className="px-5 pb-5">
      <div className="flex items-center justify-between gap-2">
        <span className="flex min-w-0 items-center gap-1.5 text-[12px] font-semibold text-fg-mute">
          <Zap size={13} className="shrink-0" />
          <span className="truncate">{titulo}</span>
        </span>
        {ehHojeEscolhido ? (
          <span className="shrink-0 text-[11.5px] text-fg-mute">
            {falhou ? "não gravou, tente de novo" : energia ? ROTULOS_ENERGIA[energia - 1] : "toque para marcar"}
          </span>
        ) : (
          <button
            type="button"
            onClick={() => {
              setEscolhido(hoje);
              setSemanas(0);
              setFalhou(false);
            }}
            className="shrink-0 rounded-full px-2 py-0.5 text-[11.5px] font-semibold text-brand-400 transition-colors hover:bg-brand-500/12"
          >
            voltar para hoje
          </button>
        )}
      </div>
      {!ehHojeEscolhido && falhou && (
        <p className="mt-1 text-[11.5px] text-neg">Não gravou, tente de novo.</p>
      )}
      <div className="mt-2 grid grid-cols-5 gap-1.5" role="radiogroup" aria-label={`${titulo}, de 1 a 5`}>
        {[1, 2, 3, 4, 5].map((n) => {
          const ativo = energia != null && n <= energia;
          return (
            <button
              key={n}
              type="button"
              role="radio"
              aria-checked={energia === n}
              aria-label={`${n}: ${ROTULOS_ENERGIA[n - 1]}`}
              disabled={!carregadas.has(semanaDe(escolhido).de)}
              onClick={() => escolher(n)}
              className={cx(
                "h-9 rounded-full text-[13px] font-semibold transition-[background-color,color,transform] duration-200 active:scale-95",
                ativo
                  ? "bg-brand-500 bg-[image:var(--a-degrade)] text-on-brand"
                  : "border border-line bg-ink-800 text-fg-mute hover:text-fg"
              )}
            >
              {n}
            </button>
          );
        })}
      </div>

      {/*
        A semana, de segunda a domingo, uma barrinha por dia, da altura da
        energia daquele dia. Dia sem marca fica só com o trilho, para a falta
        aparecer em vez de virar um "zero" que não aconteceu; dia que ainda
        não chegou fica tracejado e não se escolhe.
      */}
      <div className="mt-4">
        <div className="flex items-center justify-between gap-2 text-[11.5px] text-fg-mute">
          <span className="flex min-w-0 items-center gap-1">
            <button
              type="button"
              aria-label="Semana anterior"
              onClick={() => setSemanas((s) => s - 1)}
              className="grid h-6 w-6 shrink-0 place-items-center rounded-full transition-colors hover:bg-fg/[0.08] hover:text-fg"
            >
              <ChevronLeft size={14} />
            </button>
            <span className="truncate">{tituloDaSemana}</span>
            {semanas < 0 && (
              <button
                type="button"
                aria-label="Semana seguinte"
                onClick={() => setSemanas((s) => Math.min(0, s + 1))}
                className="grid h-6 w-6 shrink-0 place-items-center rounded-full transition-colors hover:bg-fg/[0.08] hover:text-fg"
              >
                <ChevronRight size={14} />
              </button>
            )}
          </span>
          <span className="shrink-0 tnum">
            {!pronto
              ? ""
              : media == null
                ? "nada marcado"
                : `média ${media.toLocaleString("pt-BR", { maximumFractionDigits: 1 })} · ${marcados.length}/${passados} dias`}
          </span>
        </div>
        <ol className="mt-2 grid grid-cols-7 gap-1.5" aria-label={`Energia: ${tituloDaSemana.toLowerCase()}`}>
          {dias.map(({ dia, valor, futuro }) => {
            const ehHoje = dia === hoje;
            const ehEscolhido = dia === escolhido;
            const dow = diaDaSemana(dia);
            const descricao = `${ehHoje ? "hoje" : NOME_DO_DIA[dow]}: ${
              futuro ? "ainda não chegou" : valor ? `${valor} (${ROTULOS_ENERGIA[valor - 1]})` : "sem marca"
            }`;
            return (
              <li key={dia}>
                <button
                  type="button"
                  disabled={futuro || !pronto}
                  aria-pressed={ehEscolhido}
                  aria-label={futuro ? descricao : `${descricao}. Toque para marcar este dia`}
                  title={descricao}
                  onClick={() => {
                    setEscolhido(dia);
                    setFalhou(false);
                  }}
                  className="group flex w-full flex-col items-center gap-1 disabled:cursor-default"
                >
                  <span
                    className={cx(
                      "flex h-12 w-full max-w-[22px] items-end overflow-hidden rounded-full",
                      futuro ? "border border-dashed border-line" : "bg-fg/[0.07] group-hover:bg-fg/[0.12]",
                      ehEscolhido && "outline outline-2 outline-offset-2 outline-brand-500/70"
                    )}
                  >
                    {valor != null && (
                      <span
                        className={cx(
                          "block w-full rounded-full",
                          ehEscolhido ? "bg-brand-500 bg-[image:var(--a-degrade)]" : "bg-brand-500/55"
                        )}
                        style={{ height: `${(valor / 5) * 100}%` }}
                      />
                    )}
                  </span>
                  <span
                    className={cx(
                      "text-[10.5px] font-semibold",
                      ehEscolhido || ehHoje ? "text-brand-400" : futuro ? "text-fg-mute/50" : "text-fg-mute"
                    )}
                  >
                    {SIGLA_DO_DIA[dow]}
                  </span>
                </button>
              </li>
            );
          })}
        </ol>
      </div>
    </div>
  );
}

/* ------------------------------ revisão da semana ------------------------------ */

function Bloco({
  icone,
  titulo,
  children,
}: {
  icone: React.ReactNode;
  titulo: string;
  children: React.ReactNode;
}) {
  return (
    <div className="min-w-0 rounded-[20px] border border-line bg-ink-800 p-4">
      <span className="flex items-center gap-1.5 text-[12px] font-semibold text-fg-mute">
        {icone}
        {titulo}
      </span>
      <div className="mt-2">{children}</div>
    </div>
  );
}

/**
 * O cartão que fecha a semana, no topo do Início. Aparece de domingo às 18h
 * até segunda à noite (pedido dele) e some sozinho depois.
 */
export function CartaoRevisao() {
  const supabase = React.useMemo(() => createClient(), []);
  const [semana] = React.useState(() => semanaEmRevisao());
  const [rev, setRev] = React.useState<Revisao | null>(null);
  const [padroes, setPadroes] = React.useState<{ lista: Padrao[]; dias: number } | null>(null);

  React.useEffect(() => {
    if (!semana) return;
    let vivo = true;
    const hoje = todayISO();
    lerDadosDaSemana(supabase, { ...semana, hoje }).then((d) => {
      if (vivo) setRev(montarRevisao(d, semana));
    });
    lerPadroes(supabase, { hoje: diaDeManutencao() }).then((p) => {
      if (vivo && !p.semTabela) setPadroes({ lista: p.padroes, dias: p.diasDeRegistro });
    });
    return () => {
      vivo = false;
    };
  }, [supabase, semana]);

  if (!semana) return null;

  return (
    <Card className="lg:col-span-12">
      <div className="flex flex-wrap items-start justify-between gap-3 px-5 pt-5">
        <div className="min-w-0">
          <span className="flex items-center gap-1.5 text-[15px] font-semibold text-fg">
            <CalendarRange size={16} className="text-brand-400" /> Sua semana
          </span>
          <span className="mt-0.5 block text-[12px] text-fg-mute">
            De {dataCurta(semana.de)} a {dataCurta(semana.ate)}: o que foi, o que ficou e o que vem.
          </span>
        </div>
      </div>

      {!rev ? (
        <div className="grid gap-3 p-5 sm:grid-cols-2 lg:grid-cols-4">
          {[0, 1, 2, 3].map((i) => (
            <div key={i} className="h-[132px] animate-pulse rounded-[20px] bg-ink-800" />
          ))}
        </div>
      ) : (
        <>
          <div className="grid gap-3 p-5 sm:grid-cols-2 lg:grid-cols-4">
            <Bloco icone={<CheckCircle2 size={13} />} titulo="Concluídas">
              <p className="text-[30px] font-semibold leading-none tracking-[-0.04em] tnum">
                {rev.concluidas.length}
              </p>
              <ul className="mt-2.5 space-y-1 text-[12.5px]">
                {rev.porCliente.slice(0, 3).map((c) => (
                  <li key={c.cliente} className="flex justify-between gap-2">
                    <span className="min-w-0 truncate text-fg-dim">{c.cliente}</span>
                    <b className="tnum">{c.n}</b>
                  </li>
                ))}
                {rev.porCliente.length === 0 && <li className="text-fg-mute">Nenhuma registrada.</li>}
              </ul>
            </Bloco>

            <Bloco icone={<Hourglass size={13} />} titulo="Ficou para trás">
              <p
                className={cx(
                  "text-[30px] font-semibold leading-none tracking-[-0.04em] tnum",
                  rev.atrasadas.n > 0 && "text-warn"
                )}
              >
                {rev.atrasadas.n}
              </p>
              <ul className="mt-2.5 space-y-1 text-[12.5px] text-fg-dim">
                {rev.atrasadas.titulos.map((t) => (
                  <li key={t} className="truncate">
                    {t}
                  </li>
                ))}
                {rev.atrasadas.n === 0 && <li className="text-fg-mute">Nada atrasado.</li>}
              </ul>
            </Bloco>

            <Bloco icone={<Sparkles size={13} />} titulo="Hábitos">
              {rev.habitos.length === 0 ? (
                <p className="text-[12.5px] text-fg-mute">Nenhum hábito ativo.</p>
              ) : (
                <ul className="space-y-2">
                  {rev.habitos.slice(0, 4).map((h) => {
                    const pct = Math.min(100, (h.feitos / Math.max(1, h.meta)) * 100);
                    return (
                      <li key={h.nome}>
                        <span className="flex justify-between gap-2 text-[12.5px]">
                          <span className="min-w-0 truncate text-fg-dim">{h.nome}</span>
                          <b className="tnum">
                            {h.feitos}/{h.meta}
                          </b>
                        </span>
                        <span className="mt-1 block h-1.5 overflow-hidden rounded-full bg-fg/10">
                          <span
                            className={cx("block h-full rounded-full", pct >= 100 ? "bg-pos" : "bg-brand-500")}
                            style={{ width: `${pct}%` }}
                          />
                        </span>
                      </li>
                    );
                  })}
                </ul>
              )}
            </Bloco>

            <Bloco icone={<BookOpen size={13} />} titulo="Leitura, aulas e contas">
              <ul className="space-y-1.5 text-[12.5px]">
                <li className="flex justify-between gap-2">
                  <span className="text-fg-dim">Páginas lidas</span>
                  <b className="tnum">{rev.paginas}</b>
                </li>
                <li className="flex justify-between gap-2">
                  <span className="text-fg-dim">Aulas assistidas</span>
                  <b className="tnum">{rev.aulas}</b>
                </li>
                <li className="flex justify-between gap-2">
                  <span className="text-fg-dim">Pago na semana</span>
                  <b className="tnum">{brl(rev.pago)}</b>
                </li>
                <li className="flex justify-between gap-2">
                  <span className="text-fg-dim">Energia média</span>
                  <b className="tnum">
                    {rev.energia.media == null
                      ? "—"
                      : rev.energia.media.toLocaleString("pt-BR", { maximumFractionDigits: 1 })}
                  </b>
                </li>
              </ul>
            </Bloco>
          </div>

          <div className="mx-5 mb-5 flex flex-col gap-3 rounded-[20px] border border-brand-500/30 bg-brand-500/10 p-4 text-[13px]">
            <p>
              <b>Na próxima semana:</b>{" "}
              {rev.proxima.demandas} demanda{rev.proxima.demandas === 1 ? "" : "s"} com prazo
              {" · "}
              {rev.proxima.contas} conta{rev.proxima.contas === 1 ? "" : "s"}
              {rev.proxima.contas > 0 && ` (${brl(rev.proxima.totalContas)})`}
              {" · "}
              {rev.proxima.eventos} evento{rev.proxima.eventos === 1 ? "" : "s"} na agenda
            </p>
            {padroes &&
              (padroes.lista.length > 0 ? (
                padroes.lista.slice(0, 2).map((p) => (
                  <p key={p.causa + p.medida} className="text-fg-dim">
                    <Sparkles size={13} className="mr-1 inline text-brand-400" />
                    {p.texto}
                  </p>
                ))
              ) : padroes.dias < DIAS_PARA_COMECAR ? (
                <p className="text-fg-mute">
                  Os padrões aparecem depois de {DIAS_PARA_COMECAR} dias de registro. Faltam{" "}
                  {DIAS_PARA_COMECAR - padroes.dias}.
                </p>
              ) : null)}
          </div>
        </>
      )}
    </Card>
  );
}

/* ------------------------------ padrões (Hábitos) ------------------------------ */

/** Todos os padrões achados, na tela de Hábitos. */
export function CartaoPadroes() {
  const supabase = React.useMemo(() => createClient(), []);
  const [estado, setEstado] = React.useState<Awaited<ReturnType<typeof lerPadroes>> | null>(null);

  React.useEffect(() => {
    let vivo = true;
    lerPadroes(supabase, { hoje: diaDeManutencao() }).then((r) => {
      if (vivo) setEstado(r);
    });
    return () => {
      vivo = false;
    };
  }, [supabase]);

  if (!estado || estado.semTabela) return null;

  return (
    <Card className="p-5">
      <span className="flex items-center gap-1.5 text-[15px] font-semibold text-fg">
        <Sparkles size={16} className="text-brand-400" /> Padrões nos seus dados
      </span>
      <span className="mt-0.5 block max-w-[64ch] text-[12px] leading-relaxed text-fg-mute">
        Cruza hábitos e energia com demandas concluídas, páginas lidas e aulas, nos últimos 90 dias. Só aparece o
        que tem dias suficientes dos dois lados e uma diferença maior que o acaso. É padrão, não prova de causa.
      </span>
      {estado.padroes.length > 0 ? (
        <ul className="mt-4 flex flex-col gap-2.5">
          {estado.padroes.map((p) => (
            <li key={p.causa + p.medida} className="rounded-[18px] border border-line bg-ink-800 px-4 py-3">
              <p className="text-[13.5px] font-medium">{p.texto}</p>
              <p className="mt-1 text-[11.5px] text-fg-mute tnum">
                {p.comDias} dias com, {p.semDias} sem
              </p>
            </li>
          ))}
        </ul>
      ) : (
        <p className="mt-4 rounded-[18px] border border-line bg-ink-800 px-4 py-3.5 text-[12.5px] text-fg-mute">
          {estado.diasDeRegistro < DIAS_PARA_COMECAR
            ? `Ainda juntando dados: ${estado.diasDeRegistro} de ${DIAS_PARA_COMECAR} dias de registro. Marque a energia no Início todo dia para os padrões aparecerem mais cedo.`
            : "Nenhum padrão forte o bastante por enquanto. Ele aparece aqui quando a diferença deixar de parecer acaso."}
        </p>
      )}
    </Card>
  );
}
