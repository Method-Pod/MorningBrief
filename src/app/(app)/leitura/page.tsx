"use client";

import * as React from "react";
import {
  BookOpen,
  Check,
  ChevronDown,
  Loader2,
  Plus,
  Search,
  Trash2,
} from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { currentUserId, SESSION_EXPIRED } from "@/lib/session";
import {
  BOOK_STATUS_LABEL,
  type Book,
  type BookStatus,
  type ReadingSession,
} from "@/lib/types";
import { dataCurta, todayISO, ultimosDias } from "@/lib/format";
import { type LivroAchado } from "@/lib/livros";
import {
  Badge,
  Button,
  Card,
  Empty,
  Field,
  Input,
  Modal,
  Segmented,
  Select,
  Textarea,
  cx,
  useConfirm,
  useNotice,
} from "@/components/ui";

const PRATELEIRAS: BookStatus[] = ["reading", "want", "done"];

/** Iniciais dos últimos 7 dias, para o eixo do ritmo. */
const INICIAL = ["D", "S", "T", "Q", "Q", "S", "S"];

const anoDe = (v: string | null) => v?.slice(0, 4) ?? null;

/*
 * Cadastro manual.
 *
 * Existe porque nenhuma das duas fontes tem tudo: edição antiga, tiragem
 * pequena, apostila, PDF encadernado, livro que a pessoa tem na mão e a API
 * nunca ouviu falar. Sem esta saída, a estante recusaria justamente o livro que
 * mais interessa a quem está lendo.
 */
const manualVazio = () => ({
  title: "",
  authors: "",
  isbn: "",
  cover_url: "",
  publisher: "",
  published_on: "",
  total_pages: "",
  description: "",
});

export default function LeituraPage() {
  const supabase = React.useMemo(() => createClient(), []);
  const [livros, setLivros] = React.useState<Book[]>([]);
  const [sessoes, setSessoes] = React.useState<ReadingSession[]>([]);
  const [loading, setLoading] = React.useState(true);
  const [prateleira, setPrateleira] = React.useState<BookStatus>("reading");
  const [aberto, setAberto] = React.useState<string | null>(null);
  const [rascunho, setRascunho] = React.useState<Record<string, string>>({});
  const [gravando, setGravando] = React.useState<string | null>(null);
  const [falta, setFalta] = React.useState("");
  const [totalEmEdicao, setTotalEmEdicao] = React.useState<Record<string, string>>({});

  /* modal de adicionar */
  const [add, setAdd] = React.useState(false);
  const [termo, setTermo] = React.useState("");
  const [achados, setAchados] = React.useState<LivroAchado[]>([]);
  const [buscando, setBuscando] = React.useState(false);
  const [erroBusca, setErroBusca] = React.useState("");
  const [ondeAdd, setOndeAdd] = React.useState<BookStatus>("reading");
  const [salvando, setSalvando] = React.useState<string | null>(null);
  const [modo, setModo] = React.useState<"buscar" | "manual">("buscar");
  const [manual, setManual] = React.useState(manualVazio());
  const [erroManual, setErroManual] = React.useState("");

  const hoje = todayISO();
  const confirm = useConfirm();
  const notice = useNotice();

  const load = React.useCallback(async () => {
    const [l, s] = await Promise.all([
      supabase.from("books").select("*").order("created_at", { ascending: false }),
      supabase.from("reading_sessions").select("*").order("day", { ascending: false }),
    ]);

    /*
     * PGRST205: LEITURA.sql ainda não rodou.
     *
     * Vai para estado e não para o aviso flutuante: tabela que falta não é
     * falha passageira, é um recado que precisa ficar na tela até alguém rodar
     * o arquivo. E `useNotice()` devolve objeto novo a cada render — usá-lo
     * aqui obrigaria a entrar nas dependências de `load`, e aí o efeito
     * refazia a consulta a cada render, em laço.
     */
    if (l.error) {
      setFalta(
        /books|reading_sessions/.test(l.error.message)
          ? "A estante precisa de supabase/LEITURA.sql no banco. Rode o arquivo e recarregue."
          : l.error.message
      );
      setLoading(false);
      return;
    }
    setFalta("");

    setLivros((l.data as Book[]) ?? []);
    setSessoes((s.data as ReadingSession[]) ?? []);
    setLoading(false);
  }, [supabase]);

  React.useEffect(() => {
    load();
  }, [load]);

  /* ------------------------------ busca ------------------------------ */

  /*
   * Busca com atraso, não a cada tecla.
   *
   * São 12 resultados por chamada e a pessoa digita "sapiens" em sete teclas:
   * sem o atraso seriam sete requisições para uma resposta que interessa.
   */
  React.useEffect(() => {
    const t = termo.trim();
    if (t.length < 2) {
      setAchados([]);
      setErroBusca("");
      return;
    }
    setBuscando(true);
    const id = setTimeout(async () => {
      try {
        const r = await fetch(`/api/livros?q=${encodeURIComponent(t)}`);
        if (!r.ok) throw new Error();
        const d = await r.json();
        setAchados(d.itens ?? []);
        setErroBusca("");
      } catch {
        setErroBusca("Não consegui buscar agora. Tente de novo.");
      } finally {
        setBuscando(false);
      }
    }, 450);
    return () => clearTimeout(id);
  }, [termo]);

  const adicionar = async (bruto: LivroAchado) => {
    setSalvando(bruto.id);
    const uid = await currentUserId(supabase);
    if (!uid) {
      setSalvando(null);
      return notice.show(SESSION_EXPIRED);
    }

    /*
     * Antes de gravar, tenta tapar os buracos na outra fonte.
     *
     * Uma chamada, só para o livro escolhido, e só porque o furo é real: o Open
     * Library trouxe capa e editora em 6 de 6 edições brasileiras que eu testei
     * e o total de páginas em só 4. Se a consulta falhar, grava como veio.
     */
    let a = bruto;
    try {
      const r = await fetch("/api/livros", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ livro: bruto }),
      });
      if (r.ok) a = (await r.json()).livro ?? bruto;
    } catch {}

    const { error } = await supabase.from("books").insert({
      user_id: uid,
      title: a.title,
      authors: a.authors,
      isbn: a.isbn,
      cover_url: a.cover_url,
      publisher: a.publisher,
      published_on: a.published_on,
      description: a.description,
      categories: a.categories,
      language: a.language,
      total_pages: a.total_pages,
      status: ondeAdd,
      /* Só "lendo" nasce com data de início: em "quero ler" a data seria a de
         quando foi anotado, não a de quando a leitura começou. */
      started_on: ondeAdd === "reading" ? hoje : null,
    });
    setSalvando(null);

    if (notice.check(error, "adicionar o livro")) return;
    setPrateleira(ondeAdd);
    setAdd(false);
    setTermo("");
    setAchados([]);
    load();
  };

  const adicionarManual = async () => {
    const title = manual.title.trim();
    if (!title) return setErroManual("O título é o único campo obrigatório.");

    const paginas = manual.total_pages.trim();
    const total = paginas ? Number(paginas) : null;
    if (paginas && (!Number.isFinite(total) || (total ?? 0) <= 0))
      return setErroManual("Total de páginas precisa ser um número maior que zero.");

    setErroManual("");
    setSalvando("manual");
    const uid = await currentUserId(supabase);
    if (!uid) {
      setSalvando(null);
      return notice.show(SESSION_EXPIRED);
    }

    /* Campo em branco grava nulo, não "": a tela trata ausência com "—", e ""
       apareceria como um rótulo vazio no meio da linha. */
    const ou = (v: string) => v.trim() || null;

    const { error } = await supabase.from("books").insert({
      user_id: uid,
      title,
      authors: ou(manual.authors),
      isbn: ou(manual.isbn),
      cover_url: ou(manual.cover_url),
      publisher: ou(manual.publisher),
      published_on: ou(manual.published_on),
      description: ou(manual.description),
      categories: null,
      language: null,
      total_pages: total,
      status: ondeAdd,
      started_on: ondeAdd === "reading" ? hoje : null,
    });
    setSalvando(null);

    if (notice.check(error, "adicionar o livro")) return;
    setPrateleira(ondeAdd);
    setAdd(false);
    setManual(manualVazio());
    setModo("buscar");
    load();
  };

  /**
   * Total de páginas informado à mão.
   *
   * Necessário porque a fonte falha justo nesse campo: das 6 edições
   * brasileiras que eu testei no Open Library, 2 vieram sem total — e sem ele
   * não há barra de progresso nem "terminado" automático. O Google Books,
   * quando responde, traz o da edição exata.
   */
  const gravarTotal = async (livro: Book) => {
    const cru = (totalEmEdicao[livro.id] ?? "").trim();
    const n = Number(cru);
    if (!cru || !Number.isFinite(n) || n <= 0) return;
    if (n < livro.current_page)
      return notice.show(
        `Você já está na página ${livro.current_page}; o total não pode ser menor.`
      );

    const { error } = await supabase
      .from("books")
      .update({ total_pages: Math.round(n) })
      .eq("id", livro.id);
    setTotalEmEdicao((r) => ({ ...r, [livro.id]: "" }));
    if (!notice.check(error, "gravar o total de páginas")) load();
  };

  /* ------------------------------ progresso ------------------------------ */

  /**
   * Grava a página em que a pessoa parou.
   *
   * A sessão só nasce quando andou para frente: corrigir a página para trás é
   * conserto de digitação, e virar uma linha de "-40 páginas" no histórico
   * sujaria o ritmo sem informar nada. A página atual muda nos dois casos.
   */
  const marcar = async (livro: Book) => {
    const cru = (rascunho[livro.id] ?? "").trim();
    const nova = Number(cru);
    if (!cru || !Number.isFinite(nova) || nova < 0) return;
    if (livro.total_pages && nova > livro.total_pages)
      return notice.show(
        `"${livro.title}" tem ${livro.total_pages} páginas.`
      );

    setGravando(livro.id);
    const uid = await currentUserId(supabase);
    if (!uid) {
      setGravando(null);
      return notice.show(SESSION_EXPIRED);
    }

    const avanco = nova - livro.current_page;
    const terminou = !!livro.total_pages && nova >= livro.total_pages;

    const mudanca: Record<string, unknown> = { current_page: nova };
    /* Marcar página num livro da lista de espera é o gesto de começar a ler —
       exigir mudar a prateleira antes seria um passo sem propósito. */
    if (livro.status !== "reading" && !terminou) {
      mudanca.status = "reading";
      mudanca.finished_on = null;
      if (!livro.started_on) mudanca.started_on = hoje;
    }
    if (terminou) {
      mudanca.status = "done";
      mudanca.finished_on = hoje;
    }

    const { error } = await supabase
      .from("books")
      .update(mudanca)
      .eq("id", livro.id);

    if (!error && avanco > 0)
      await supabase.from("reading_sessions").insert({
        user_id: uid,
        book_id: livro.id,
        day: hoje,
        pages: avanco,
        end_page: nova,
      });

    setGravando(null);
    setRascunho((r) => ({ ...r, [livro.id]: "" }));
    if (!notice.check(error, "gravar a página")) {
      if (terminou) notice.show(`"${livro.title}" terminado. Boa.`);
      load();
    }
  };

  const mudarPrateleira = async (livro: Book, status: BookStatus) => {
    const { error } = await supabase
      .from("books")
      .update({
        status,
        finished_on: status === "done" ? (livro.finished_on ?? hoje) : null,
        started_on:
          status !== "want" ? (livro.started_on ?? hoje) : livro.started_on,
      })
      .eq("id", livro.id);
    if (!notice.check(error, "mudar a prateleira")) load();
  };

  const remover = (livro: Book) =>
    confirm.ask(
      `Tirar "${livro.title}" da estante? O histórico de leitura dele sai junto.`,
      async () => {
        const { error } = await supabase.from("books").delete().eq("id", livro.id);
        if (!notice.check(error, "tirar o livro")) load();
      }
    );

  /* ------------------------------ derivados ------------------------------ */

  const daPrateleira = livros.filter((l) => l.status === prateleira);
  const contagem = (s: BookStatus) => livros.filter((l) => l.status === s).length;

  const sessoesDo = (id: string) => sessoes.filter((s) => s.book_id === id);

  /** Páginas por dia nos últimos 7 dias — o ritmo. */
  const ritmo = React.useMemo(() => {
    const dias = ultimosDias(hoje);
    const soma = new Map<string, number>();
    sessoes.forEach((s) =>
      soma.set(s.day, (soma.get(s.day) ?? 0) + s.pages)
    );
    return dias.map((d) => ({ dia: d, paginas: soma.get(d) ?? 0 }));
  }, [sessoes, hoje]);

  const naSemana = ritmo.reduce((a, b) => a + b.paginas, 0);
  const pico = Math.max(...ritmo.map((r) => r.paginas), 1);
  const diasLidos = ritmo.filter((r) => r.paginas > 0).length;

  return (
    <div className="space-y-5 rise">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Leitura</h1>
          <p className="mt-1 text-sm text-fg-mute">
            {contagem("reading")} em andamento · {contagem("done")} terminado
            {contagem("done") === 1 ? "" : "s"}
          </p>
        </div>
        <Button variant="primary" onClick={() => setAdd(true)}>
          <Plus size={15} />
          Adicionar livro
        </Button>
      </div>

      {falta && (
        <Card className="border-warn/40 bg-warn/10 px-5 py-4">
          <p className="text-[12.5px] text-fg-dim">{falta}</p>
        </Card>
      )}

      {/* ------------------------------ ritmo ------------------------------ */}
      {naSemana > 0 && (
        <Card className="px-5 py-4">
          <div className="flex flex-wrap items-end justify-between gap-4">
            <div>
              <p className="text-[10px] font-medium uppercase tracking-wider text-fg-mute">
                Últimos 7 dias
              </p>
              <p className="mt-1 text-[22px] font-bold leading-none tnum">
                {naSemana}
                <span className="ml-1.5 text-[12px] font-medium text-fg-mute">
                  páginas
                </span>
              </p>
              <p className="mt-1.5 text-[11.5px] text-fg-mute tnum">
                {diasLidos} de 7 dias · {Math.round(naSemana / 7)}/dia
              </p>
            </div>

            {/*
              Barras por altura, não gráfico de biblioteca: são sete pontos, e
              carregar um runtime de gráfico para desenhar sete retângulos
              custaria mais que a tela inteira.
            */}
            <div className="flex items-end gap-1.5">
              {ritmo.map((r, i) => {
                const dow = new Date(r.dia + "T00:00:00").getDay();
                return (
                  <div key={r.dia} className="flex flex-col items-center gap-1.5">
                    <div className="flex h-[52px] w-6 items-end">
                      <div
                        title={`${dataCurta(r.dia)} · ${r.paginas} pág`}
                        className={cx(
                          "w-full rounded-[5px] transition-[height] duration-[260ms] ease-[cubic-bezier(0.22,0.61,0.36,1)]",
                          r.paginas ? "bg-brand-500" : "bg-ink-800"
                        )}
                        style={{
                          height: r.paginas
                            ? `${Math.max(8, (r.paginas / pico) * 52)}px`
                            : "3px",
                        }}
                      />
                    </div>
                    <span
                      className={cx(
                        "text-[10px] font-semibold",
                        i === ritmo.length - 1 ? "text-brand-400" : "text-fg-mute"
                      )}
                    >
                      {INICIAL[dow]}
                    </span>
                  </div>
                );
              })}
            </div>
          </div>
        </Card>
      )}

      <Segmented
        value={prateleira}
        onChange={setPrateleira}
        options={PRATELEIRAS.map((s) => ({
          value: s,
          label: BOOK_STATUS_LABEL[s],
          count: contagem(s),
        }))}
      />

      {loading ? null : daPrateleira.length === 0 ? (
        <Card>
          <Empty
            icon={<BookOpen size={18} />}
            title={
              livros.length
                ? `Nada em "${BOOK_STATUS_LABEL[prateleira]}"`
                : "Estante vazia"
            }
            sub="Busque por título, autor ou ISBN — a capa e as páginas vêm junto."
            action={
              <Button variant="primary" size="sm" onClick={() => setAdd(true)}>
                <Plus size={14} />
                Adicionar livro
              </Button>
            }
          />
        </Card>
      ) : (
        <Card className="overflow-hidden">
          <ul className="divide-y divide-line-soft">
            {daPrateleira.map((l) => {
              const hist = sessoesDo(l.id);
              const pct = l.total_pages
                ? Math.min(100, Math.round((l.current_page / l.total_pages) * 100))
                : null;
              const expandido = aberto === l.id;

              return (
                <li key={l.id} className="group px-4 py-3.5 sm:px-5">
                  <div className="flex gap-3.5">
                    {/*
                      A capa vem do Google Books por link, não copiada para o
                      nosso armazenamento: são imagens públicas e estáveis, e
                      guardar cópia de centenas delas seria pagar espaço para
                      resolver um problema que não existe. `img` cru e não
                      next/image porque o domínio é externo e configurar o
                      otimizador para ele não paga a capa de 48px.
                    */}
                    {l.cover_url ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img
                        src={l.cover_url}
                        alt=""
                        className="h-[72px] w-12 shrink-0 rounded-md bg-ink-800 object-cover"
                      />
                    ) : (
                      <div className="grid h-[72px] w-12 shrink-0 place-items-center rounded-md bg-ink-800 text-fg-mute">
                        <BookOpen size={16} />
                      </div>
                    )}

                    <div className="min-w-0 flex-1">
                      <p className="text-[13.5px] font-semibold leading-snug">
                        {l.title}
                      </p>
                      <p className="mt-0.5 truncate text-[11.5px] text-fg-mute">
                        {[l.authors, anoDe(l.published_on)]
                          .filter(Boolean)
                          .join(" · ") || "—"}
                      </p>

                      {pct !== null && (
                        <div className="mt-2 flex items-center gap-2">
                          <div className="h-1.5 min-w-[60px] flex-1 overflow-hidden rounded-full bg-ink-800">
                            {/* scaleX e não width: transform roda no compositor,
                                então a barra desliza lisa mesmo com a estante
                                inteira na tela. */}
                            <div
                              className={cx(
                                "h-full w-full origin-left rounded-full transition-transform duration-[300ms] ease-[cubic-bezier(0.22,0.61,0.36,1)]",
                                l.status === "done" ? "bg-pos" : "bg-brand-500"
                              )}
                              style={{ transform: `scaleX(${pct / 100})` }}
                            />
                          </div>
                          <span className="shrink-0 text-[10.5px] font-bold text-fg-mute tnum">
                            {l.current_page}/{l.total_pages} · {pct}%
                          </span>
                        </div>
                      )}

                      <div className="mt-2 flex flex-wrap items-center gap-1.5">
                        {l.status === "done" && (
                          <Badge tone="pos">
                            <Check size={10} />
                            terminado {dataCurta(l.finished_on)}
                          </Badge>
                        )}
                        {!l.total_pages && (
                          <span className="inline-flex items-center gap-1.5">
                            <span className="text-[10px] font-medium uppercase tracking-wider text-warn">
                              total de páginas?
                            </span>
                            <span className="w-[70px]">
                              <Input
                                type="number"
                                min={1}
                                value={totalEmEdicao[l.id] ?? ""}
                                onChange={(e) =>
                                  setTotalEmEdicao((r) => ({
                                    ...r,
                                    [l.id]: e.target.value,
                                  }))
                                }
                                onKeyDown={(e) => {
                                  if (e.key === "Enter") {
                                    e.preventDefault();
                                    gravarTotal(l);
                                  }
                                }}
                                onBlur={() => gravarTotal(l)}
                                placeholder="320"
                                aria-label={`Total de páginas de ${l.title}`}
                                className="h-7 text-center text-[11px]"
                              />
                            </span>
                          </span>
                        )}
                        {l.isbn && (
                          <span className="text-[10px] text-fg-mute tnum">
                            ISBN {l.isbn}
                          </span>
                        )}
                        {hist.length > 0 && (
                          <button
                            type="button"
                            onClick={() => setAberto(expandido ? null : l.id)}
                            className="inline-flex items-center gap-1 text-[10.5px] text-fg-mute transition-colors hover:text-brand-400"
                          >
                            <ChevronDown
                              size={11}
                              className={cx(
                                "transition-transform duration-200",
                                expandido && "rotate-180"
                              )}
                            />
                            {hist.length} {hist.length === 1 ? "marcação" : "marcações"}
                          </button>
                        )}
                      </div>
                    </div>

                    <div className="flex shrink-0 flex-col items-end gap-2">
                      <div className="flex items-center gap-1">
                        <div className="w-[132px]">
                          <Select
                            value={l.status}
                            onChange={(e) =>
                              mudarPrateleira(l, e.target.value as BookStatus)
                            }
                            className="h-8 text-xs"
                          >
                            {PRATELEIRAS.map((s) => (
                              <option key={s} value={s}>
                                {BOOK_STATUS_LABEL[s]}
                              </option>
                            ))}
                          </Select>
                        </div>
                        <button
                          type="button"
                          onClick={() => remover(l)}
                          aria-label={`Tirar ${l.title} da estante`}
                          className="grid h-8 w-8 shrink-0 place-items-center rounded-lg text-fg-mute transition-colors hover:bg-neg/15 hover:text-neg lg:opacity-0 lg:group-hover:opacity-100 lg:focus-visible:opacity-100"
                        >
                          <Trash2 size={14} />
                        </button>
                      </div>

                      {l.status !== "done" && (
                        <div className="flex items-center gap-1.5">
                          <div className="w-[86px]">
                            <Input
                              type="number"
                              min={0}
                              max={l.total_pages ?? undefined}
                              value={rascunho[l.id] ?? ""}
                              onChange={(e) =>
                                setRascunho((r) => ({
                                  ...r,
                                  [l.id]: e.target.value,
                                }))
                              }
                              onKeyDown={(e) => {
                                if (e.key === "Enter") {
                                  e.preventDefault();
                                  marcar(l);
                                }
                              }}
                              placeholder="pág"
                              aria-label={`Página atual de ${l.title}`}
                              className="h-8 text-center text-xs"
                            />
                          </div>
                          <Button
                            size="sm"
                            variant="primary"
                            onClick={() => marcar(l)}
                            disabled={
                              gravando === l.id || !(rascunho[l.id] ?? "").trim()
                            }
                          >
                            {gravando === l.id ? "..." : "Marcar"}
                          </Button>
                        </div>
                      )}
                    </div>
                  </div>

                  {expandido && hist.length > 0 && (
                    <ul className="mt-3 space-y-1 rounded-[12px] bg-ink-800 px-3 py-2.5">
                      {hist.map((s) => (
                        <li
                          key={s.id}
                          className="flex items-center justify-between text-[11.5px] tnum"
                        >
                          <span className="text-fg-mute">{dataCurta(s.day)}</span>
                          <span className="text-fg-dim">
                            <span className="font-semibold text-brand-400">
                              +{s.pages}
                            </span>{" "}
                            → pág {s.end_page}
                          </span>
                        </li>
                      ))}
                    </ul>
                  )}
                </li>
              );
            })}
          </ul>
        </Card>
      )}

      {/* ------------------------------ adicionar ------------------------------ */}
      <Modal
        open={add}
        onClose={() => setAdd(false)}
        title="Adicionar livro"
        sub={
          modo === "buscar"
            ? "Título, autor ou ISBN. O resto vem preenchido."
            : "Só o título é obrigatório. O resto você põe se quiser."
        }
        size="lg"
        footer={
          modo === "manual" ? (
            <>
              <Button onClick={() => setAdd(false)}>Cancelar</Button>
              <Button
                variant="primary"
                onClick={adicionarManual}
                disabled={salvando !== null}
              >
                {salvando === "manual" ? "Salvando..." : "Adicionar"}
              </Button>
            </>
          ) : (
            <Button onClick={() => setAdd(false)}>Fechar</Button>
          )
        }
      >
        <div className="space-y-4">
          <Segmented
            value={modo}
            onChange={setModo}
            options={[
              { value: "buscar" as const, label: "Buscar" },
              { value: "manual" as const, label: "Manual" },
            ]}
          />

          <Field label="Adicionar em">
            <Segmented
              value={ondeAdd}
              onChange={setOndeAdd}
              options={[
                { value: "reading" as BookStatus, label: "Lendo" },
                { value: "want" as BookStatus, label: "Quero ler" },
                { value: "done" as BookStatus, label: "Terminado" },
              ]}
            />
          </Field>

          {modo === "manual" ? (
            <>
              {erroManual && (
                <p className="rounded-[14px] bg-neg/10 px-3.5 py-3 text-xs text-neg">
                  {erroManual}
                </p>
              )}

              <Field label="Título">
                <Input
                  autoFocus
                  value={manual.title}
                  onChange={(e) =>
                    setManual({ ...manual, title: e.target.value })
                  }
                  placeholder="Nome do livro"
                />
              </Field>

              <div className="grid gap-4 sm:grid-cols-2">
                <Field label="Autor">
                  <Input
                    value={manual.authors}
                    onChange={(e) =>
                      setManual({ ...manual, authors: e.target.value })
                    }
                    placeholder="Opcional"
                  />
                </Field>
                <Field label="Editora">
                  <Input
                    value={manual.publisher}
                    onChange={(e) =>
                      setManual({ ...manual, publisher: e.target.value })
                    }
                    placeholder="Opcional"
                  />
                </Field>
              </div>

              <div className="grid gap-4 sm:grid-cols-[minmax(0,1fr)_110px_120px]">
                <Field label="ISBN">
                  <Input
                    value={manual.isbn}
                    onChange={(e) =>
                      setManual({ ...manual, isbn: e.target.value })
                    }
                    placeholder="Opcional"
                  />
                </Field>
                <Field label="Ano">
                  <Input
                    value={manual.published_on}
                    onChange={(e) =>
                      setManual({ ...manual, published_on: e.target.value })
                    }
                    placeholder="2024"
                  />
                </Field>
                <Field label="Páginas">
                  <Input
                    type="number"
                    min={1}
                    value={manual.total_pages}
                    onChange={(e) =>
                      setManual({ ...manual, total_pages: e.target.value })
                    }
                    placeholder="320"
                  />
                </Field>
              </div>

              {/* Endereço da capa, não upload: a capa é imagem pública que já
                  existe em algum lugar, e um upload traria armazenamento,
                  limite de tamanho e uma tela de recorte para resolver o que um
                  link resolve. */}
              <Field
                label="Capa (link da imagem)"
                hint="Clique com o botão direito numa capa na web e copie o endereço da imagem."
              >
                <Input
                  type="url"
                  inputMode="url"
                  value={manual.cover_url}
                  onChange={(e) =>
                    setManual({ ...manual, cover_url: e.target.value })
                  }
                  placeholder="https://..."
                />
              </Field>

              {manual.cover_url.trim() && (
                <div className="flex items-center gap-3 rounded-[14px] bg-ink-800 p-2.5">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={manual.cover_url.trim()}
                    alt=""
                    className="h-[72px] w-12 shrink-0 rounded-md bg-ink-750 object-cover"
                  />
                  <span className="text-[11.5px] text-fg-mute">
                    Se a capa não aparecer aqui, o link não serve.
                  </span>
                </div>
              )}

              <Field label="Descrição">
                <Textarea
                  rows={3}
                  value={manual.description}
                  onChange={(e) =>
                    setManual({ ...manual, description: e.target.value })
                  }
                  placeholder="Opcional"
                />
              </Field>
            </>
          ) : (
            <>
          <Field label="Buscar">
            <div className="relative">
              <Search
                size={14}
                className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-fg-mute"
              />
              <Input
                autoFocus
                value={termo}
                onChange={(e) => setTermo(e.target.value)}
                placeholder="Sapiens, Harari, 9788525432186..."
                className="pl-9"
              />
              {buscando && (
                <Loader2
                  size={14}
                  className="absolute right-3.5 top-1/2 -translate-y-1/2 animate-spin text-fg-mute"
                />
              )}
            </div>
          </Field>

          {erroBusca && (
            <p className="rounded-[14px] bg-neg/10 px-3.5 py-3 text-xs text-neg">
              {erroBusca}
            </p>
          )}

          {achados.length > 0 && (
            <ul className="max-h-[46vh] divide-y divide-line-soft overflow-y-auto">
              {achados.map((a) => (
                <li key={a.id}>
                  <button
                    type="button"
                    onClick={() => adicionar(a)}
                    disabled={salvando !== null}
                    className="flex w-full items-start gap-3 rounded-[12px] px-2 py-2.5 text-left transition-colors hover:bg-ink-800 disabled:opacity-50"
                  >
                    {a.cover_url ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img
                        src={a.cover_url}
                        alt=""
                        className="h-16 w-11 shrink-0 rounded bg-ink-800 object-cover"
                      />
                    ) : (
                      <div className="grid h-16 w-11 shrink-0 place-items-center rounded bg-ink-800 text-fg-mute">
                        <BookOpen size={14} />
                      </div>
                    )}
                    <span className="min-w-0 flex-1">
                      <span className="block text-[12.5px] font-semibold leading-snug">
                        {a.title}
                      </span>
                      <span className="mt-0.5 block truncate text-[11px] text-fg-mute">
                        {[a.authors, a.publisher, anoDe(a.published_on)]
                          .filter(Boolean)
                          .join(" · ") || "—"}
                      </span>
                      <span className="mt-1 block text-[10.5px] text-fg-mute tnum">
                        {a.total_pages
                          ? `${a.total_pages} páginas`
                          : "páginas não informadas"}
                        {a.isbn ? ` · ISBN ${a.isbn}` : ""}
                      </span>
                    </span>
                    {salvando === a.id ? (
                      <Loader2 size={15} className="mt-1 shrink-0 animate-spin text-fg-mute" />
                    ) : (
                      <Plus size={15} className="mt-1 shrink-0 text-fg-mute" />
                    )}
                  </button>
                </li>
              ))}
            </ul>
          )}

              {!buscando &&
                !erroBusca &&
                termo.trim().length >= 2 &&
                !achados.length && (
                  <p className="px-1 text-[12px] text-fg-mute">
                    Nada encontrado para “{termo.trim()}”. Se o livro não está
                    em nenhuma base, use{" "}
                    <button
                      type="button"
                      onClick={() => setModo("manual")}
                      className="font-semibold text-brand-400 underline"
                    >
                      Manual
                    </button>
                    .
                  </p>
                )}
            </>
          )}
        </div>
      </Modal>

      {confirm.node}
      {notice.node}
    </div>
  );
}
