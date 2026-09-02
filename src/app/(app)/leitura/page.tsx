"use client";

import * as React from "react";
import { BookOpen, Check, Loader2, Plus, Search, Trash2 } from "lucide-react";
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
import { Capa, EscolherCapa, apagarCapa, enviarCapa } from "@/components/CapaLivro";

/*
 * Ordem das prateleiras, seguindo o caminho de um livro: está aberto, é o
 * próximo, terminou, parou no meio, ainda não é seu.
 */
const PRATELEIRAS: BookStatus[] = [
  "reading",
  "queue",
  "done",
  "dropped",
  "want",
];

/** Iniciais dos dias, indexadas por getDay() — 0 é domingo. */
const INICIAL = ["D", "S", "T", "Q", "Q", "S", "S"];

const anoDe = (v: string | null) => v?.slice(0, 4) ?? null;

const pctDe = (l: Book) =>
  l.total_pages
    ? Math.min(100, Math.round((l.current_page / l.total_pages) * 100))
    : null;

/*
 * Cadastro manual.
 *
 * Existe porque nenhuma base tem tudo: edição antiga, tiragem pequena,
 * apostila, encadernado. Sem esta saída a estante recusaria justamente o livro
 * que está na mão de quem está lendo.
 */
const manualVazio = () => ({
  title: "",
  authors: "",
  isbn: "",
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
  const [falta, setFalta] = React.useState("");
  const [prateleira, setPrateleira] = React.useState<BookStatus>("reading");

  /* marcação de página, por livro */
  const [rascunho, setRascunho] = React.useState<Record<string, string>>({});
  const [gravando, setGravando] = React.useState<string | null>(null);

  /* detalhe */
  const [verId, setVerId] = React.useState<string | null>(null);
  const [enviandoCapa, setEnviandoCapa] = React.useState(false);
  const [totalEmEdicao, setTotalEmEdicao] = React.useState("");

  /* adicionar */
  const [add, setAdd] = React.useState(false);
  const [modo, setModo] = React.useState<"buscar" | "manual">("buscar");
  const [termo, setTermo] = React.useState("");
  const [achados, setAchados] = React.useState<LivroAchado[]>([]);
  const [buscando, setBuscando] = React.useState(false);
  const [erroBusca, setErroBusca] = React.useState("");
  const [ondeAdd, setOndeAdd] = React.useState<BookStatus>("reading");
  const [salvando, setSalvando] = React.useState<string | null>(null);
  const [manual, setManual] = React.useState(manualVazio());
  const [arquivoCapa, setArquivoCapa] = React.useState<File | null>(null);
  const [previaCapa, setPreviaCapa] = React.useState<string | null>(null);
  const [erroManual, setErroManual] = React.useState("");

  const hoje = todayISO();
  const confirm = useConfirm();
  const notice = useNotice();

  const load = React.useCallback(async () => {
    const [l, s] = await Promise.all([
      supabase.from("books").select("*").order("created_at", { ascending: false }),
      supabase
        .from("reading_sessions")
        .select("*")
        .order("day", { ascending: false }),
    ]);

    /*
     * PGRST205: LEITURA.sql ainda não rodou.
     *
     * Vai para estado e não para o aviso flutuante: tabela que falta não é
     * falha passageira, é recado que precisa ficar na tela. E `useNotice()`
     * devolve objeto novo a cada render — usá-lo aqui obrigaria a entrar nas
     * dependências de `load`, e o efeito refazia a consulta a cada render.
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
   * Busca com atraso, não a cada tecla: "sapiens" são sete teclas, e sem o
   * atraso seriam sete requisições para uma resposta que interessa.
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
        setAchados((await r.json()).itens ?? []);
        setErroBusca("");
      } catch {
        setErroBusca("Não consegui buscar agora. Tente de novo.");
      } finally {
        setBuscando(false);
      }
    }, 450);
    return () => clearTimeout(id);
  }, [termo]);

  const fecharAdd = () => {
    setAdd(false);
    setTermo("");
    setAchados([]);
    setManual(manualVazio());
    setArquivoCapa(null);
    setPreviaCapa(null);
    setErroManual("");
    setModo("buscar");
  };

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
     * Uma chamada, só para o livro escolhido, e só porque o furo é real: das 6
     * edições brasileiras que eu testei no Open Library, todas trouxeram capa e
     * editora, mas só 4 trouxeram o total de páginas.
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
      /* Só "lendo" nasce com data de início: em "comprar" a data seria a de
         quando foi anotado, não a de quando a leitura começou. */
      started_on: ondeAdd === "reading" ? hoje : null,
    });
    setSalvando(null);

    if (notice.check(error, "adicionar o livro")) return;
    setPrateleira(ondeAdd);
    fecharAdd();
    load();
  };

  const adicionarManual = async () => {
    const title = manual.title.trim();
    if (!title) return setErroManual("O título é o único campo obrigatório.");

    const cru = manual.total_pages.trim();
    const total = cru ? Number(cru) : null;
    if (cru && (!Number.isFinite(total) || (total ?? 0) <= 0))
      return setErroManual("Total de páginas precisa ser um número maior que zero.");

    setErroManual("");
    setSalvando("manual");
    const uid = await currentUserId(supabase);
    if (!uid) {
      setSalvando(null);
      return notice.show(SESSION_EXPIRED);
    }

    /* Campo em branco grava nulo, não "": a tela mostra "—" para ausência, e ""
       viraria um rótulo vazio no meio da linha. */
    const ou = (v: string) => v.trim() || null;

    const { data: criado, error } = await supabase
      .from("books")
      .insert({
        user_id: uid,
        title,
        authors: ou(manual.authors),
        isbn: ou(manual.isbn),
        cover_url: null,
        publisher: ou(manual.publisher),
        published_on: ou(manual.published_on),
        description: ou(manual.description),
        categories: null,
        language: null,
        total_pages: total,
        status: ondeAdd,
        started_on: ondeAdd === "reading" ? hoje : null,
      })
      .select("id")
      .single();

    if (error || !criado) {
      setSalvando(null);
      return notice.show(
        `Não foi possível adicionar o livro: ${error?.message ?? "erro"}`
      );
    }

    /*
     * A capa sobe depois do insert, não antes.
     *
     * O caminho no Storage é `<usuário>/<id do livro>`, e o id só existe depois
     * de gravar. Falha aqui não desfaz o livro — ele vale mais sem capa do que
     * não existir, e a capa pode ser posta depois pelo detalhe.
     */
    if (arquivoCapa) {
      const { url, erro } = await enviarCapa(supabase, uid, criado.id, arquivoCapa);
      if (url)
        await supabase.from("books").update({ cover_url: url }).eq("id", criado.id);
      else if (erro) notice.show(`Livro salvo, mas a capa não subiu: ${erro}`);
    }

    setSalvando(null);
    setPrateleira(ondeAdd);
    fecharAdd();
    load();
  };

  /* ------------------------------ progresso ------------------------------ */

  /**
   * Grava a página em que a pessoa parou.
   *
   * A sessão só nasce quando andou para frente: corrigir a página para trás é
   * conserto de digitação, e uma linha de "-40 páginas" no histórico sujaria o
   * ritmo sem informar nada. A página atual muda nos dois casos.
   */
  const marcar = async (livro: Book) => {
    const cru = (rascunho[livro.id] ?? "").trim();
    const nova = Number(cru);
    if (!cru || !Number.isFinite(nova) || nova < 0) return;
    if (livro.total_pages && nova > livro.total_pages)
      return notice.show(`"${livro.title}" tem ${livro.total_pages} páginas.`);

    setGravando(livro.id);
    const uid = await currentUserId(supabase);
    if (!uid) {
      setGravando(null);
      return notice.show(SESSION_EXPIRED);
    }

    const avanco = nova - livro.current_page;
    const terminou = !!livro.total_pages && nova >= livro.total_pages;

    const mudanca: Record<string, unknown> = { current_page: nova };
    /* Marcar página em livro que está em Ler, Comprar ou Abandonado é o gesto
       de (re)começar a leitura — exigir trocar a prateleira antes seria um
       passo sem propósito. */
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
      if (terminou) notice.show(`"${livro.title}" lido. Boa.`);
      load();
    }
  };

  /**
   * Total de páginas informado à mão.
   *
   * Necessário porque a fonte falha justo nesse campo, e sem ele não há barra
   * de progresso nem "lido" automático.
   */
  const gravarTotal = async (livro: Book) => {
    const n = Number(totalEmEdicao.trim());
    if (!totalEmEdicao.trim() || !Number.isFinite(n) || n <= 0) return;
    if (n < livro.current_page)
      return notice.show(
        `Você já está na página ${livro.current_page}; o total não pode ser menor.`
      );
    const { error } = await supabase
      .from("books")
      .update({ total_pages: Math.round(n) })
      .eq("id", livro.id);
    setTotalEmEdicao("");
    if (!notice.check(error, "gravar o total de páginas")) load();
  };

  const mudarPrateleira = async (livro: Book, status: BookStatus) => {
    /*
     * As datas seguem o significado da prateleira, não a troca em si.
     *
     * "Ler" e "Comprar" são estados de quem não começou, então não inventam
     * data de início. "Abandonado" preserva a que já existia — parar no meio
     * não apaga o fato de ter começado. E só "Lido" tem data de fim.
     */
    const naoComecou = status === "want" || status === "queue";
    const { error } = await supabase
      .from("books")
      .update({
        status,
        finished_on: status === "done" ? (livro.finished_on ?? hoje) : null,
        started_on: naoComecou
          ? livro.started_on
          : (livro.started_on ?? hoje),
      })
      .eq("id", livro.id);

    /*
     * 23514 é violação de check constraint.
     *
     * Acontece quando PRATELEIRAS.sql ainda não rodou: o banco só aceita os
     * três valores originais, e "Ler" ou "Abandonado" viram um erro do
     * Postgres sem nenhuma pista de como resolver.
     */
    if (error?.code === "23514" || /status/.test(error?.message ?? ""))
      return notice.show(
        `"${BOOK_STATUS_LABEL[status]}" precisa de supabase/PRATELEIRAS.sql no banco. Rode o arquivo.`
      );
    if (!notice.check(error, "mudar a prateleira")) load();
  };

  const trocarCapa = async (livro: Book, arquivo: File) => {
    setEnviandoCapa(true);
    const uid = await currentUserId(supabase);
    if (!uid) {
      setEnviandoCapa(false);
      return notice.show(SESSION_EXPIRED);
    }
    const { url, erro } = await enviarCapa(supabase, uid, livro.id, arquivo);
    if (erro) {
      setEnviandoCapa(false);
      return notice.show(erro);
    }
    const { error } = await supabase
      .from("books")
      .update({ cover_url: url })
      .eq("id", livro.id);
    setEnviandoCapa(false);
    if (!notice.check(error, "gravar a capa")) load();
  };

  const removerCapa = async (livro: Book) => {
    setEnviandoCapa(true);
    const uid = await currentUserId(supabase);
    if (!uid) {
      setEnviandoCapa(false);
      return notice.show(SESSION_EXPIRED);
    }
    await apagarCapa(supabase, uid, livro.id);
    const { error } = await supabase
      .from("books")
      .update({ cover_url: null })
      .eq("id", livro.id);
    setEnviandoCapa(false);
    if (!notice.check(error, "remover a capa")) load();
  };

  const remover = (livro: Book) =>
    confirm.ask(
      `Tirar "${livro.title}" da estante? O histórico de leitura dele sai junto.`,
      async () => {
        const uid = await currentUserId(supabase);
        /* A capa no Storage não sai por cascade — a tabela não sabe do arquivo.
           Sem isto o bucket acumularia capa de livro que já não existe. */
        if (uid) await apagarCapa(supabase, uid, livro.id);
        const { error } = await supabase.from("books").delete().eq("id", livro.id);
        if (!notice.check(error, "tirar o livro")) {
          setVerId(null);
          load();
        }
      }
    );

  /* ------------------------------ derivados ------------------------------ */

  const contagem = (s: BookStatus) => livros.filter((l) => l.status === s).length;
  const daPrateleira = livros.filter((l) => l.status === prateleira);
  const lendo = livros.filter((l) => l.status === "reading");
  const ver = livros.find((l) => l.id === verId) ?? null;
  const histDoVer = ver ? sessoes.filter((s) => s.book_id === ver.id) : [];

  /** Páginas por dia nos últimos 7 dias — o ritmo. */
  const ritmo = React.useMemo(() => {
    const soma = new Map<string, number>();
    sessoes.forEach((s) => soma.set(s.day, (soma.get(s.day) ?? 0) + s.pages));
    return ultimosDias(hoje).map((d) => ({ dia: d, paginas: soma.get(d) ?? 0 }));
  }, [sessoes, hoje]);

  const naSemana = ritmo.reduce((a, b) => a + b.paginas, 0);
  const pico = Math.max(...ritmo.map((r) => r.paginas), 1);
  const diasLidos = ritmo.filter((r) => r.paginas > 0).length;

  /* O mesmo controle de página serve ao "continuar lendo" e ao detalhe. */
  const campoPagina = (l: Book, largo?: boolean) => (
    <div className="flex items-center gap-1.5">
      <div className={largo ? "w-[104px]" : "w-[76px]"}>
        <Input
          type="number"
          min={0}
          max={l.total_pages ?? undefined}
          value={rascunho[l.id] ?? ""}
          onChange={(e) => setRascunho((r) => ({ ...r, [l.id]: e.target.value }))}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              e.preventDefault();
              marcar(l);
            }
          }}
          placeholder="pág"
          aria-label={`Página atual de ${l.title}`}
          className="h-9 text-center text-[12.5px]"
        />
      </div>
      <Button
        size="sm"
        variant="primary"
        onClick={() => marcar(l)}
        disabled={gravando === l.id || !(rascunho[l.id] ?? "").trim()}
      >
        {gravando === l.id ? "..." : "Marcar"}
      </Button>
    </div>
  );

  return (
    <div className="space-y-5 rise">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Leitura</h1>
          <p className="mt-1 text-sm text-fg-mute">
            {contagem("reading")} lendo · {contagem("queue")} na fila ·{" "}
            {contagem("done")} lido{contagem("done") === 1 ? "" : "s"} ·{" "}
            {contagem("want")} para comprar
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

      {/* --------------------------- continuar lendo --------------------------- */}
      {/*
        O que está aberto na mesa vem antes de tudo.

        É a única pergunta diária desta tela — "onde eu parei" — e por isso ganha
        cartão próprio, com o campo de página ao lado do progresso. A estante
        inteira embaixo serve para organizar, que é coisa de vez em quando.
      */}
      {lendo.length > 0 && (
        <div className="space-y-2.5">
          <h2 className="text-[10px] font-medium uppercase tracking-wider text-fg-mute">
            Continuar lendo
          </h2>
          <div className="grid gap-3 lg:grid-cols-2">
            {lendo.map((l) => {
              const pct = pctDe(l);
              return (
                <Card key={l.id} className="flex gap-3.5 p-3.5">
                  <button
                    type="button"
                    onClick={() => setVerId(l.id)}
                    className="w-[58px] shrink-0 transition-transform hover:scale-[1.03]"
                  >
                    <Capa url={l.cover_url} titulo={l.title} />
                  </button>

                  <div className="flex min-w-0 flex-1 flex-col justify-between gap-2">
                    <div className="min-w-0">
                      <button
                        type="button"
                        onClick={() => setVerId(l.id)}
                        className="block w-full text-left"
                      >
                        <p className="line-clamp-2 text-[13px] font-semibold leading-snug hover:text-brand-400">
                          {l.title}
                        </p>
                      </button>
                      <p className="mt-0.5 truncate text-[11px] text-fg-mute">
                        {l.authors ?? "—"}
                      </p>
                    </div>

                    <div>
                      {pct !== null ? (
                        <div className="mb-2">
                          <div className="flex items-baseline justify-between gap-2">
                            <span className="text-[11px] font-bold text-brand-400 tnum">
                              {pct}%
                            </span>
                            <span className="text-[10.5px] text-fg-mute tnum">
                              pág {l.current_page} de {l.total_pages}
                            </span>
                          </div>
                          <div className="mt-1 h-1.5 overflow-hidden rounded-full bg-ink-800">
                            {/* scaleX e não width: transform roda no compositor,
                                então a barra desliza lisa. */}
                            <div
                              className="h-full w-full origin-left rounded-full bg-brand-500 transition-transform duration-[300ms] ease-[cubic-bezier(0.22,0.61,0.36,1)]"
                              style={{ transform: `scaleX(${pct / 100})` }}
                            />
                          </div>
                        </div>
                      ) : (
                        <p className="mb-2 text-[10.5px] text-warn">
                          Sem total de páginas — abra o livro para informar.
                        </p>
                      )}
                      {campoPagina(l)}
                    </div>
                  </div>
                </Card>
              );
            })}
          </div>
        </div>
      )}

      {/* ------------------------------ ritmo ------------------------------ */}
      {naSemana > 0 && (
        <Card className="flex flex-wrap items-end justify-between gap-4 px-5 py-4">
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

          {/* Barras por altura, não gráfico de biblioteca: são sete pontos, e um
              runtime de gráfico custaria mais que a tela inteira. */}
          <div className="flex items-end gap-1.5">
            {ritmo.map((r, i) => (
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
                  {INICIAL[new Date(r.dia + "T00:00:00").getDay()]}
                </span>
              </div>
            ))}
          </div>
        </Card>
      )}

      {/* ------------------------------ estante ------------------------------ */}
      <div className="space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h2 className="text-[10px] font-medium uppercase tracking-wider text-fg-mute">
            Biblioteca
          </h2>
          {/* Rola de lado no lugar de quebrar: com cinco prateleiras os rótulos
              passam de 375px, e `Segmented` é uma tira só — quebrar deixaria
              metade dos botões fora do fundo arredondado. */}
          <div className="-mx-1 max-w-full overflow-x-auto px-1 pb-0.5">
            <Segmented
              value={prateleira}
              onChange={setPrateleira}
              options={PRATELEIRAS.map((s) => ({
                value: s,
                label: BOOK_STATUS_LABEL[s],
                count: contagem(s),
              }))}
            />
          </div>
        </div>

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
          /*
            Grade de capas, não lista de linhas.

            A capa é o que identifica um livro de relance — é a ideia das
            referências. A linha anterior amontoava capa, título, badges, ISBN,
            seletor, lixeira e campo de página no mesmo espaço, e nada era
            legível. Todo o detalhe mudou para o modal.
          */
          <ul className="grid grid-cols-3 gap-x-3 gap-y-4 sm:grid-cols-5 lg:grid-cols-6 xl:grid-cols-8">
            {daPrateleira.map((l) => {
              const pct = pctDe(l);
              return (
                <li key={l.id}>
                  <button
                    type="button"
                    onClick={() => setVerId(l.id)}
                    className="group w-full text-left"
                  >
                    <span className="block transition-transform duration-200 group-hover:-translate-y-1">
                      <Capa url={l.cover_url} titulo={l.title} />
                    </span>
                    <span className="mt-1.5 block line-clamp-2 text-[11.5px] font-semibold leading-tight group-hover:text-brand-400">
                      {l.title}
                    </span>
                    <span className="mt-0.5 block truncate text-[10px] text-fg-mute">
                      {l.authors ?? "—"}
                    </span>
                    {l.status === "reading" && pct !== null && (
                      <span className="mt-1.5 flex items-center gap-1.5">
                        <span className="h-1 flex-1 overflow-hidden rounded-full bg-ink-800">
                          <span
                            className="block h-full w-full origin-left rounded-full bg-brand-500 transition-transform duration-300"
                            style={{ transform: `scaleX(${pct / 100})` }}
                          />
                        </span>
                        <span className="text-[9.5px] font-bold text-fg-mute tnum">
                          {pct}%
                        </span>
                      </span>
                    )}
                    {l.status === "done" && (
                      <span className="mt-1 block text-[9.5px] font-semibold text-pos">
                        lido {dataCurta(l.finished_on)}
                      </span>
                    )}
                    {l.status === "dropped" && l.total_pages && (
                      <span className="mt-1 block text-[9.5px] font-semibold text-fg-mute tnum">
                        parou na pág {l.current_page}
                      </span>
                    )}
                  </button>
                </li>
              );
            })}
          </ul>
        )}
      </div>

      {/* ------------------------------ detalhe ------------------------------ */}
      <Modal
        open={!!ver}
        onClose={() => {
          setVerId(null);
          setTotalEmEdicao("");
        }}
        title={ver?.title ?? ""}
        sub={
          ver
            ? [ver.authors, ver.publisher, anoDe(ver.published_on)]
                .filter(Boolean)
                .join(" · ") || undefined
            : undefined
        }
        size="lg"
        footer={
          ver ? (
            <>
              <Button onClick={() => remover(ver)}>
                <Trash2 size={14} />
                Tirar da estante
              </Button>
              <Button variant="primary" onClick={() => setVerId(null)}>
                Fechar
              </Button>
            </>
          ) : null
        }
      >
        {ver && (
          <div className="space-y-4">
            <EscolherCapa
              previa={ver.cover_url}
              titulo={ver.title}
              ocupado={enviandoCapa}
              onArquivo={(f) => trocarCapa(ver, f)}
              onRemover={ver.cover_url ? () => removerCapa(ver) : undefined}
            />

            <div className="grid gap-4 sm:grid-cols-2">
              <Field label="Prateleira">
                <Select
                  value={ver.status}
                  onChange={(e) =>
                    mudarPrateleira(ver, e.target.value as BookStatus)
                  }
                >
                  {PRATELEIRAS.map((s) => (
                    <option key={s} value={s}>
                      {BOOK_STATUS_LABEL[s]}
                    </option>
                  ))}
                </Select>
              </Field>

              {ver.total_pages ? (
                <Field label="Página atual">{campoPagina(ver, true)}</Field>
              ) : (
                <Field
                  label="Total de páginas"
                  hint="A base não trouxe. Sem ele não há barra nem “lido” automático."
                >
                  <div className="flex items-center gap-1.5">
                    <div className="w-[104px]">
                      <Input
                        type="number"
                        min={1}
                        value={totalEmEdicao}
                        onChange={(e) => setTotalEmEdicao(e.target.value)}
                        onKeyDown={(e) => {
                          if (e.key === "Enter") {
                            e.preventDefault();
                            gravarTotal(ver);
                          }
                        }}
                        placeholder="320"
                      />
                    </div>
                    <Button
                      size="sm"
                      variant="primary"
                      onClick={() => gravarTotal(ver)}
                      disabled={!totalEmEdicao.trim()}
                    >
                      Salvar
                    </Button>
                  </div>
                </Field>
              )}
            </div>

            {ver.total_pages && (
              <div>
                <div className="flex items-baseline justify-between gap-2">
                  <span className="text-[12px] font-bold text-brand-400 tnum">
                    {pctDe(ver)}%
                  </span>
                  <span className="text-[11px] text-fg-mute tnum">
                    pág {ver.current_page} de {ver.total_pages}
                  </span>
                </div>
                <div className="mt-1 h-2 overflow-hidden rounded-full bg-ink-800">
                  <div
                    className={cx(
                      "h-full w-full origin-left rounded-full transition-transform duration-300",
                      ver.status === "done" ? "bg-pos" : "bg-brand-500"
                    )}
                    style={{ transform: `scaleX(${(pctDe(ver) ?? 0) / 100})` }}
                  />
                </div>
              </div>
            )}

            <div className="flex flex-wrap items-center gap-2">
              {ver.status === "done" && (
                <Badge tone="pos">
                  <Check size={10} />
                  lido {dataCurta(ver.finished_on)}
                </Badge>
              )}
              {ver.status === "dropped" && (
                <Badge tone="neutral">abandonado</Badge>
              )}
              {ver.isbn && (
                <span className="text-[10.5px] text-fg-mute tnum">
                  ISBN {ver.isbn}
                </span>
              )}
              {ver.categories && (
                <span className="text-[10.5px] text-fg-mute">{ver.categories}</span>
              )}
            </div>

            {ver.description && (
              <p className="max-h-[22vh] overflow-y-auto rounded-[14px] bg-ink-800 px-3.5 py-3 text-[12px] leading-relaxed text-fg-dim">
                {ver.description}
              </p>
            )}

            {histDoVer.length > 0 && (
              <div>
                <p className="mb-1.5 text-[10px] font-medium uppercase tracking-wider text-fg-mute">
                  Histórico
                </p>
                <ul className="max-h-[20vh] space-y-1 overflow-y-auto rounded-[12px] bg-ink-800 px-3 py-2.5">
                  {histDoVer.map((s) => (
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
              </div>
            )}
          </div>
        )}
      </Modal>

      {/* ------------------------------ adicionar ------------------------------ */}
      <Modal
        open={add}
        onClose={fecharAdd}
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
              <Button onClick={fecharAdd}>Cancelar</Button>
              <Button
                variant="primary"
                onClick={adicionarManual}
                disabled={salvando !== null}
              >
                {salvando === "manual" ? "Salvando..." : "Adicionar"}
              </Button>
            </>
          ) : (
            <Button onClick={fecharAdd}>Fechar</Button>
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
            <div className="-mx-1 max-w-full overflow-x-auto px-1 pb-0.5">
              <Segmented
                value={ondeAdd}
                onChange={setOndeAdd}
                options={PRATELEIRAS.map((s) => ({
                  value: s,
                  label: BOOK_STATUS_LABEL[s],
                }))}
              />
            </div>
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
                  onChange={(e) => setManual({ ...manual, title: e.target.value })}
                  placeholder="Nome do livro"
                />
              </Field>

              <Field label="Capa">
                <EscolherCapa
                  previa={previaCapa}
                  titulo={manual.title || "Sem título"}
                  onArquivo={(f) => {
                    setArquivoCapa(f);
                    /* Prévia local: o arquivo só sobe depois do insert, porque o
                       caminho no Storage usa o id do livro. */
                    setPreviaCapa(URL.createObjectURL(f));
                  }}
                  onRemover={
                    previaCapa
                      ? () => {
                          setArquivoCapa(null);
                          setPreviaCapa(null);
                        }
                      : undefined
                  }
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

              <div className="grid gap-4 sm:grid-cols-[minmax(0,1fr)_100px_110px]">
                <Field label="ISBN">
                  <Input
                    value={manual.isbn}
                    onChange={(e) => setManual({ ...manual, isbn: e.target.value })}
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
                <ul className="max-h-[44vh] divide-y divide-line-soft overflow-y-auto">
                  {achados.map((a) => (
                    <li key={a.id}>
                      <button
                        type="button"
                        onClick={() => adicionar(a)}
                        disabled={salvando !== null}
                        className="flex w-full items-start gap-3 rounded-[12px] px-2 py-2.5 text-left transition-colors hover:bg-ink-800 disabled:opacity-50"
                      >
                        <span className="block w-11 shrink-0">
                          <Capa url={a.cover_url} titulo={a.title} />
                        </span>
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
                          <Loader2
                            size={15}
                            className="mt-1 shrink-0 animate-spin text-fg-mute"
                          />
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
                    Nada encontrado para “{termo.trim()}”. Se o livro não está em
                    nenhuma base, use{" "}
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
