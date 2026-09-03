"use client";

import * as React from "react";
import {
  BookOpen,
  Check,
  Loader2,
  Plus,
  Search,
  Target,
  Trash2,
} from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { currentUserId, SESSION_EXPIRED } from "@/lib/session";
import {
  BOOK_STATUS_LABEL,
  type Book,
  type BookStatus,
  type ReadingGoal,
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
import {
  Capa,
  Estrelas,
  EscolherCapa,
  apagarCapa,
  enviarCapa,
} from "@/components/CapaLivro";

/*
 * Ordem das prateleiras, seguindo o caminho de um livro: está aberto, é o
 * próximo, terminou, parou no meio, ainda não é seu (Lista de Desejos).
 */
const PRATELEIRAS: BookStatus[] = [
  "reading",
  "queue",
  "done",
  "dropped",
  "want",
];

/*
 * "Todos" é filtro de tela, não prateleira do banco.
 *
 * Por isso vive num tipo separado de `BookStatus`: se entrasse na mesma lista,
 * apareceria no seletor de "adicionar em" e no detalhe do livro, e o banco
 * recusaria "todos" como status. A separação é o que impede esse erro.
 */
type Filtro = "todos" | BookStatus;

const FILTROS: Filtro[] = ["todos", ...PRATELEIRAS];

const rotuloFiltro = (f: Filtro) =>
  f === "todos" ? "Todos" : BOOK_STATUS_LABEL[f];

const anoDe = (v: string | null) => v?.slice(0, 4) ?? null;

type Ordem = "recentes" | "titulo" | "autor" | "progresso" | "nota";

const ORDENS: { valor: Ordem; rotulo: string }[] = [
  { valor: "recentes", rotulo: "Adicionados por último" },
  { valor: "titulo", rotulo: "Título" },
  { valor: "autor", rotulo: "Autor" },
  { valor: "progresso", rotulo: "Progresso" },
  { valor: "nota", rotulo: "Nota" },
];

/*
 * A lista não traz `description`.
 *
 * Medido na estante real: a descrição era 56% do corpo da consulta (11,4 KB de
 * 20,2 KB em 14 livros), e só o detalhe a mostra. Ela é buscada junto com o
 * histórico quando o livro abre.
 *
 * O tipo diz a verdade sobre isso — `Omit` em vez de fingir que o campo veio,
 * senão `ver.description` seria `undefined` num objeto tipado como `string`.
 */
const COLUNAS_LISTA =
  "id,user_id,title,authors,isbn,cover_url,publisher,published_on," +
  "categories,language,total_pages,current_page,status,started_on," +
  "finished_on,rating,created_at";

type BookLista = Omit<Book, "description">;

const pctDe = (l: BookLista) =>
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
  const [livros, setLivros] = React.useState<BookLista[]>([]);
  const [sessoes, setSessoes] = React.useState<ReadingSession[]>([]);
  const [loading, setLoading] = React.useState(true);
  const [falta, setFalta] = React.useState("");
  const [prateleira, setPrateleira] = React.useState<Filtro>("reading");
  const [busca, setBusca] = React.useState("");
  const [ordem, setOrdem] = React.useState<Ordem>("recentes");

  /* meta do ano */
  const [meta, setMeta] = React.useState<number | null>(null);
  const [metaEmEdicao, setMetaEmEdicao] = React.useState("");
  const [editandoMeta, setEditandoMeta] = React.useState(false);

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
    const ano = new Date().getFullYear();
    const [l, s, m] = await Promise.all([
      supabase
        .from("books")
        .select(COLUNAS_LISTA)
        .order("created_at", { ascending: false }),
      /*
       * Só a janela do ritmo, não o histórico inteiro.
       *
       * Antes era `select("*")` sem limite: a consulta crescia para sempre e
       * carregava anos de marcações para desenhar sete dias. O histórico de um
       * livro é buscado quando o detalhe dele abre — é lá que ele é lido.
       */
      supabase
        .from("reading_sessions")
        .select("*")
        .gte("day", ultimosDias(todayISO())[0])
        .order("day", { ascending: false }),
      /* A meta tolera falha: sem LEITURA-EXTRAS.sql o cartão simplesmente não
         aparece, e a estante continua funcionando. */
      supabase
        .from("reading_goals")
        .select("*")
        .eq("year", ano)
        .maybeSingle(),
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
    setLivros((l.data as unknown as BookLista[]) ?? []);
    setSessoes((s.data as ReadingSession[]) ?? []);
    setMeta((m.data as ReadingGoal | null)?.target ?? null);
    setLoading(false);
  }, [supabase]);

  React.useEffect(() => {
    load();
  }, [load]);

  /**
   * Aplica a mudança de um livro no estado, sem reler o banco.
   *
   * É o que substitui o `load()` que rodava depois de cada clique. O update já
   * foi aceito pelo banco quando isto roda, e o valor novo é conhecido — reler
   * a estante inteira, as sessões e a meta para descobrir o que já sabemos
   * custava três consultas por marcação de página.
   */
  const patch = React.useCallback((id: string, mudanca: Partial<BookLista>) => {
    setLivros((v) => v.map((l) => (l.id === id ? { ...l, ...mudanca } : l)));
  }, []);

  /* ------------------------ histórico do detalhe ------------------------ */

  /*
   * O histórico é buscado quando o livro é aberto, e guardado por livro.
   *
   * Fica fora da carga inicial porque só o detalhe o mostra, e trazer todas as
   * marcações de todos os livros para talvez abrir um era o desperdício que
   * mais crescia com o tempo.
   */
  const [historico, setHistorico] = React.useState<
    Record<string, ReadingSession[]>
  >({});
  const [descricoes, setDescricoes] = React.useState<
    Record<string, string | null>
  >({});

  React.useEffect(() => {
    if (!verId || historico[verId]) return;
    let vivo = true;
    (async () => {
      /* As duas em paralelo, e as duas só uma vez por livro: o cache é por id,
         então reabrir o mesmo livro não consulta de novo. */
      const [h, d] = await Promise.all([
        supabase
          .from("reading_sessions")
          .select("*")
          .eq("book_id", verId)
          /* `created_at` como segundo critério: duas marcações no mesmo dia
             ficavam em ordem indefinida, e é justo essa ordem que decide qual
             delas é "a última" ao apagar. */
          .order("day", { ascending: false })
          .order("created_at", { ascending: false }),
        supabase.from("books").select("description").eq("id", verId).maybeSingle(),
      ]);
      if (!vivo) return;
      setHistorico((v) => ({ ...v, [verId]: (h.data as ReadingSession[]) ?? [] }));
      setDescricoes((v) => ({
        ...v,
        [verId]: (d.data as { description: string | null } | null)?.description ?? null,
      }));
    })();
    return () => {
      vivo = false;
    };
  }, [verId, historico, supabase]);

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

    /* `select().single()` devolve a linha gravada, com o id e os padrões que o
       banco preencheu. É o que permite mostrar o livro sem reler a estante. */
    const { data: criado, error } = await supabase
      .from("books")
      .insert({
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
      /* Só "lendo" nasce com data de início: na Lista de Desejos a data seria
         a de quando foi anotado, não a de quando a leitura começou. */
      started_on: ondeAdd === "reading" ? hoje : null,
    })
      .select(COLUNAS_LISTA)
      .single();
    setSalvando(null);

    if (notice.check(error, "adicionar o livro")) return;
    if (criado) setLivros((v) => [criado as unknown as BookLista, ...v]);
    setPrateleira(ondeAdd);
    fecharAdd();
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
      .select(COLUNAS_LISTA)
      .single();

    if (error || !criado) {
      setSalvando(null);
      return notice.show(
        `Não foi possível adicionar o livro: ${error?.message ?? "erro"}`
      );
    }

    const novo = criado as unknown as BookLista;
    /* A descrição digitada já entra no cache: o livro acabou de nascer, não há
       o que reler do banco para mostrá-la se o detalhe abrir em seguida. */
    setDescricoes((v) => ({ ...v, [novo.id]: ou(manual.description) }));

    /*
     * A capa sobe depois do insert, não antes.
     *
     * O caminho no Storage é `<usuário>/<id do livro>`, e o id só existe depois
     * de gravar. Falha aqui não desfaz o livro — ele vale mais sem capa do que
     * não existir, e a capa pode ser posta depois pelo detalhe.
     */
    if (arquivoCapa) {
      const { url, erro } = await enviarCapa(supabase, uid, novo.id, arquivoCapa);
      if (url) {
        await supabase.from("books").update({ cover_url: url }).eq("id", novo.id);
        novo.cover_url = url;
      } else if (erro) {
        notice.show(`Livro salvo, mas a capa não subiu: ${erro}`);
      }
    }

    setSalvando(null);
    setLivros((v) => [novo, ...v]);
    setPrateleira(ondeAdd);
    fecharAdd();
  };

  /* ------------------------------ progresso ------------------------------ */

  /**
   * Grava a página em que a pessoa parou.
   *
   * A sessão só nasce quando andou para frente: corrigir a página para trás é
   * conserto de digitação, e uma linha de "-40 páginas" no histórico sujaria o
   * ritmo sem informar nada. A página atual muda nos dois casos.
   */
  const marcar = async (livro: BookLista) => {
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
    /* Marcar página em livro que está em Ler, Abandonado ou na Lista de
       Desejos é o gesto de (re)começar a leitura — exigir trocar a prateleira
       antes seria um passo sem propósito. */
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

    /*
     * A sessão volta com `select().single()` para entrar no estado com o id e a
     * data que o banco gerou. Sem isso, o histórico e o ritmo só mostrariam a
     * marcação nova depois de um recarregamento.
     */
    let sessaoNova: ReadingSession | null = null;
    if (!error && avanco > 0) {
      const { data } = await supabase
        .from("reading_sessions")
        .insert({
          user_id: uid,
          book_id: livro.id,
          day: hoje,
          pages: avanco,
          end_page: nova,
        })
        .select("*")
        .single();
      sessaoNova = (data as ReadingSession) ?? null;
    }

    setGravando(null);
    setRascunho((r) => ({ ...r, [livro.id]: "" }));
    if (notice.check(error, "gravar a página")) return;

    patch(livro.id, mudanca as Partial<Book>);
    if (sessaoNova) {
      setSessoes((v) => [sessaoNova as ReadingSession, ...v]);
      setHistorico((h) =>
        h[livro.id]
          ? { ...h, [livro.id]: [sessaoNova as ReadingSession, ...h[livro.id]] }
          : h
      );
    }
    if (terminou) notice.show(`"${livro.title}" lido. Boa.`);
  };

  /**
   * Total de páginas informado à mão.
   *
   * Necessário porque a fonte falha justo nesse campo, e sem ele não há barra
   * de progresso nem "lido" automático.
   */
  const gravarTotal = async (livro: BookLista) => {
    const n = Number(totalEmEdicao.trim());
    if (!totalEmEdicao.trim() || !Number.isFinite(n) || n <= 0) return;
    if (n < livro.current_page)
      return notice.show(
        `Você já está na página ${livro.current_page}; o total não pode ser menor.`
      );
    const total = Math.round(n);
    const { error } = await supabase
      .from("books")
      .update({ total_pages: total })
      .eq("id", livro.id);
    setTotalEmEdicao("");
    if (!notice.check(error, "gravar o total de páginas"))
      patch(livro.id, { total_pages: total });
  };

  const darNota = async (livro: BookLista, nota: number | null) => {
    const { error } = await supabase
      .from("books")
      .update({ rating: nota })
      .eq("id", livro.id);
    if (error && /rating/.test(error.message))
      return notice.show(
        "Nota precisa de supabase/LEITURA-EXTRAS.sql no banco. Rode o arquivo."
      );
    if (!notice.check(error, "gravar a nota")) patch(livro.id, { rating: nota });
  };

  const salvarMeta = async () => {
    const n = Number(metaEmEdicao.trim());
    if (!Number.isFinite(n) || n < 1 || n > 999)
      return notice.show("A meta precisa ser um número de 1 a 999.");

    const uid = await currentUserId(supabase);
    if (!uid) return notice.show(SESSION_EXPIRED);

    /* upsert na chave (user_id, year): trocar a meta do ano é sobrescrever,
       não criar uma segunda linha para o mesmo ano. */
    const { error } = await supabase
      .from("reading_goals")
      .upsert(
        { user_id: uid, year: new Date().getFullYear(), target: Math.round(n) },
        { onConflict: "user_id,year" }
      );
    if (error && /reading_goals/.test(error.message))
      return notice.show(
        "A meta precisa de supabase/LEITURA-EXTRAS.sql no banco. Rode o arquivo."
      );
    if (!notice.check(error, "salvar a meta")) {
      setEditandoMeta(false);
      setMetaEmEdicao("");
      setMeta(Math.round(n));
    }
  };

  const mudarPrateleira = async (livro: BookLista, status: BookStatus) => {
    /*
     * As datas seguem o significado da prateleira, não a troca em si.
     *
     * "Ler" e "Lista de Desejos" são estados de quem não começou, então não
     * inventam data de início. "Abandonado" preserva a que já existia — parar
     * no meio não apaga o fato de ter começado. E só "Lido" tem data de fim.
     */
    const naoComecou = status === "want" || status === "queue";
    const mudanca = {
      status,
      finished_on: status === "done" ? (livro.finished_on ?? hoje) : null,
      started_on: naoComecou ? livro.started_on : (livro.started_on ?? hoje),
    };
    const { error } = await supabase
      .from("books")
      .update(mudanca)
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
    if (!notice.check(error, "mudar a prateleira")) patch(livro.id, mudanca);
  };

  const trocarCapa = async (livro: BookLista, arquivo: File) => {
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
    if (!notice.check(error, "gravar a capa"))
      patch(livro.id, { cover_url: url ?? null });
  };

  const removerCapa = async (livro: BookLista) => {
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
    if (!notice.check(error, "remover a capa"))
      patch(livro.id, { cover_url: null });
  };

  /**
   * Apaga uma marcação do histórico.
   *
   * A página atual só volta atrás quando a marcação apagada era a última: aí a
   * posição do livro passa a ser o fim da marcação anterior, ou zero se não
   * sobrou nenhuma. Apagar uma do meio não mexe na página — você continua onde
   * está, só o registro de como chegou lá que muda.
   *
   * E se apagar a marcação que terminou o livro, ele deixa de estar lido: ficar
   * em "Lido" numa página que não é a última seria uma contradição na tela.
   */
  const apagarSessao = (livro: BookLista, sessao: ReadingSession) => {
    const lista = historico[livro.id] ?? [];
    const eraAUltima = lista[0]?.id === sessao.id;

    confirm.ask(
      `Apagar a marcação de ${dataCurta(sessao.day)} (+${sessao.pages} ${
        sessao.pages === 1 ? "página" : "páginas"
      })?${eraAUltima ? " A página atual volta para onde estava antes dela." : ""}`,
      async () => {
        const { error } = await supabase
          .from("reading_sessions")
          .delete()
          .eq("id", sessao.id);
        if (notice.check(error, "apagar a marcação")) return;

        const restantes = lista.filter((x) => x.id !== sessao.id);
        setHistorico((h) => ({ ...h, [livro.id]: restantes }));
        setSessoes((v) => v.filter((x) => x.id !== sessao.id));

        if (!eraAUltima) return;

        const volta = restantes[0]?.end_page ?? 0;
        const mudanca: Partial<BookLista> = { current_page: volta };
        if (
          livro.status === "done" &&
          livro.total_pages &&
          volta < livro.total_pages
        ) {
          mudanca.status = "reading";
          mudanca.finished_on = null;
        }
        const { error: erroLivro } = await supabase
          .from("books")
          .update(mudanca)
          .eq("id", livro.id);
        if (!notice.check(erroLivro, "voltar a página")) patch(livro.id, mudanca);
      },
      { titulo: "Apagar marcação", rotulo: "Apagar" }
    );
  };

  const remover = (livro: BookLista) =>
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
          setLivros((v) => v.filter((l) => l.id !== livro.id));
          /* As sessões saem por cascade no banco; aqui saem do estado para o
             ritmo não contar páginas de um livro que já não existe. */
          setSessoes((v) => v.filter((x) => x.book_id !== livro.id));
          setHistorico(({ [livro.id]: _, ...resto }) => resto);
        }
      }
    );

  /* ------------------------------ derivados ------------------------------ */

  /*
   * As contagens numa passada só.
   *
   * `contagem` era chamada seis vezes por render — uma por prateleira — e cada
   * chamada varria a estante inteira. Agora é um `reduce` memoizado.
   */
  const contagens = React.useMemo(() => {
    const c: Record<string, number> = { todos: livros.length };
    livros.forEach((l) => {
      c[l.status] = (c[l.status] ?? 0) + 1;
    });
    return c;
  }, [livros]);

  const contagem = (f: Filtro) => contagens[f] ?? 0;

  /*
   * A prateleira, filtrada e ordenada.
   *
   * A busca olha título, autor e ISBN — os três jeitos de procurar um livro que
   * você tem na cabeça mas não na frente. A ordenação existe porque a grade
   * cresce: "adicionados por último" serve para os primeiros vinte, depois
   * ninguém acha nada sem ordenar por título.
   */
  const daPrateleira = React.useMemo(() => {
    const termo = busca.trim().toLowerCase();
    const lista = livros
      .filter((l) => prateleira === "todos" || l.status === prateleira)
      .filter(
        (l) =>
          !termo ||
          l.title.toLowerCase().includes(termo) ||
          (l.authors ?? "").toLowerCase().includes(termo) ||
          (l.isbn ?? "").includes(termo)
      );

    const pct = (l: BookLista) => pctDe(l) ?? -1;
    return [...lista].sort((a, b) => {
      switch (ordem) {
        case "titulo":
          return a.title.localeCompare(b.title, "pt-BR");
        case "autor":
          /* Sem autor vai para o fim: uma leva de "—" no começo da lista
             esconderia justamente os que dá para ordenar. */
          return (a.authors ?? "￿").localeCompare(
            b.authors ?? "￿",
            "pt-BR"
          );
        case "progresso":
          return pct(b) - pct(a);
        case "nota":
          return (b.rating ?? 0) - (a.rating ?? 0);
        default:
          return b.created_at.localeCompare(a.created_at);
      }
    });
  }, [livros, prateleira, busca, ordem]);
  const lendo = livros.filter((l) => l.status === "reading");
  const ver = livros.find((l) => l.id === verId) ?? null;
  const histDoVer = (ver && historico[ver.id]) || [];

  /** Páginas por dia nos últimos 7 dias — o ritmo. */
  const ritmo = React.useMemo(() => {
    const soma = new Map<string, number>();
    sessoes.forEach((s) => soma.set(s.day, (soma.get(s.day) ?? 0) + s.pages));
    return ultimosDias(hoje).map((d) => ({ dia: d, paginas: soma.get(d) ?? 0 }));
  }, [sessoes, hoje]);

  /* Lidos neste ano, pela data de conclusão — não pela de cadastro. */
  const anoAtual = String(new Date().getFullYear());
  const lidosNoAno = livros.filter(
    (l) => l.status === "done" && l.finished_on?.startsWith(anoAtual)
  ).length;

  const naSemana = ritmo.reduce((a, b) => a + b.paginas, 0);

  /* O mesmo controle de página serve ao "continuar lendo" e ao detalhe. */
  const campoPagina = (l: BookLista, largo?: boolean) => (
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
            {contagem("want")} na lista de desejos
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

      {/* ------------------------------ resumo ------------------------------ */}
      {/*
        Meta e ritmo numa tira, não em dois cartões.
        
        Os dois cartões ocupavam mais altura que o livro que você está lendo, e
        nenhum dos dois é a razão de abrir a tela — são referência de canto de
        olho. Como detalhe eles informam igual e param de competir com a
        estante.
      */}
      <div className="flex flex-wrap items-center gap-x-4 gap-y-2 px-1 text-[11.5px] text-fg-mute">
        <span className="flex items-center gap-2">
          <Target size={13} className="shrink-0" />
          {meta ? (
            <>
              <span className="font-semibold text-fg-dim tnum">
                {lidosNoAno}/{meta}
              </span>
              <span>livros em {anoAtual}</span>
              <span className="h-1 w-[52px] overflow-hidden rounded-full bg-ink-800">
                <span
                  className={cx(
                    "block h-full w-full origin-left rounded-full transition-transform duration-[320ms]",
                    lidosNoAno >= meta ? "bg-pos" : "bg-brand-500"
                  )}
                  style={{
                    transform: `scaleX(${Math.min(1, lidosNoAno / meta)})`,
                  }}
                />
              </span>
            </>
          ) : (
            <span>
              {lidosNoAno} lido{lidosNoAno === 1 ? "" : "s"} em {anoAtual}
            </span>
          )}

          {editandoMeta ? (
            <span className="flex items-center gap-1">
              <span className="w-[62px]">
                <Input
                  autoFocus
                  type="number"
                  min={1}
                  max={999}
                  value={metaEmEdicao}
                  onChange={(e) => setMetaEmEdicao(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") {
                      e.preventDefault();
                      salvarMeta();
                    }
                    if (e.key === "Escape") setEditandoMeta(false);
                  }}
                  placeholder="12"
                  aria-label={`Meta de livros para ${anoAtual}`}
                  className="h-7 text-center text-[11.5px]"
                />
              </span>
              <button
                type="button"
                onClick={salvarMeta}
                className="font-semibold text-brand-400 hover:underline"
              >
                ok
              </button>
            </span>
          ) : (
            <button
              type="button"
              onClick={() => {
                setMetaEmEdicao(meta ? String(meta) : "");
                setEditandoMeta(true);
              }}
              className="text-fg-mute underline decoration-line underline-offset-2 transition-colors hover:text-brand-400"
            >
              {meta ? "mudar" : "definir meta"}
            </button>
          )}
        </span>

        {naSemana > 0 && (
          <span className="flex items-center gap-2">
            <span className="text-fg-mute">·</span>
            {/*
              Só o número, sem gráfico.
              
              Sete barras de 3px não diziam nada além do que o número já diz —
              na prática viravam um risco solto do lado do texto. O ritmo por
              dia é uma pergunta de outra tela, não de um detalhe de canto.
            */}
            <span className="font-semibold text-fg-dim tnum">{naSemana}</span>
            <span>
              página{naSemana === 1 ? "" : "s"} nos últimos 7 dias
            </span>
          </span>
        )}
      </div>

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
              options={FILTROS.map((f) => ({
                value: f,
                label: rotuloFiltro(f),
                count: contagem(f),
              }))}
            />
          </div>
        </div>

        {/* Busca e ordenação só aparecem quando há o que procurar: numa estante
            de três livros os dois controles seriam enfeite ocupando linha. */}
        {livros.length > 4 && (
          <div className="flex flex-wrap items-center gap-2.5">
            <div className="relative min-w-[180px] flex-1">
              <Search
                size={14}
                className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-fg-mute"
              />
              <Input
                value={busca}
                onChange={(e) => setBusca(e.target.value)}
                placeholder="Buscar por título, autor ou ISBN..."
                className="h-9 pl-9 text-[12.5px]"
              />
            </div>
            <div className="w-[190px]">
              <Select
                value={ordem}
                onChange={(e) => setOrdem(e.target.value as Ordem)}
                aria-label="Ordenar a biblioteca"
                className="h-9 text-[12.5px]"
              >
                {ORDENS.map((o) => (
                  <option key={o.valor} value={o.valor}>
                    {o.rotulo}
                  </option>
                ))}
              </Select>
            </div>
          </div>
        )}

        {loading ? null : daPrateleira.length === 0 ? (
          <Card>
            <Empty
              icon={<BookOpen size={18} />}
              title={
                busca.trim()
                  ? `Nada com “${busca.trim()}”`
                  : livros.length
                    ? `Nada em "${rotuloFiltro(prateleira)}"`
                    : "Estante vazia"
              }
              sub={
                busca.trim()
                  ? "Tente outro termo, ou olhe em outra prateleira."
                  : "Busque por título, autor ou ISBN — a capa e as páginas vêm junto."
              }
              action={
                busca.trim() ? (
                  <Button size="sm" onClick={() => setBusca("")}>
                    Limpar a busca
                  </Button>
                ) : (
                  <Button variant="primary" size="sm" onClick={() => setAdd(true)}>
                    <Plus size={14} />
                    Adicionar livro
                  </Button>
                )
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
                      <span className="mt-1 flex flex-wrap items-center gap-x-1.5">
                        <Estrelas nota={l.rating} tamanho={10} />
                        <span className="text-[9.5px] font-semibold text-pos">
                          lido {dataCurta(l.finished_on)}
                        </span>
                      </span>
                    )}
                    {l.status === "dropped" && l.total_pages && (
                      <span className="mt-1 block text-[9.5px] font-semibold text-fg-mute tnum">
                        parou na pág {l.current_page}
                      </span>
                    )}
                    {/* Só em "Todos": aqui a grade mistura as cinco prateleiras,
                        e sem a etiqueta não há como saber onde cada livro
                        mora. Nas outras abas ela repetiria o cabeçalho. */}
                    {prateleira === "todos" && (
                      <span className="mt-1 block text-[9.5px] font-medium uppercase tracking-wider text-fg-mute">
                        {BOOK_STATUS_LABEL[l.status]}
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

            {/* A nota vem antes do resto para quem acabou de fechar o livro:
                é o momento em que se tem opinião, e adiar até rolar a tela é
                perder a opinião. */}
            <Field
              label="Sua nota"
              hint={
                ver.rating
                  ? "Clique na mesma estrela para tirar a nota."
                  : "De 1 a 5, quando quiser."
              }
            >
              <Estrelas
                nota={ver.rating}
                onNota={(n) => darNota(ver, n)}
                tamanho={22}
              />
            </Field>

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

            {descricoes[ver.id] && (
              <p className="max-h-[22vh] overflow-y-auto rounded-[14px] bg-ink-800 px-3.5 py-3 text-[12px] leading-relaxed text-fg-dim">
                {descricoes[ver.id]}
              </p>
            )}

            {histDoVer.length > 0 && (
              <div>
                <p className="mb-1.5 text-[10px] font-medium uppercase tracking-wider text-fg-mute">
                  Histórico
                </p>
                <ul className="max-h-[20vh] space-y-1 overflow-y-auto rounded-[12px] bg-ink-800 px-3 py-2.5">
                  {histDoVer.map((s, i) => (
                    <li
                      key={s.id}
                      className="group/s flex items-center justify-between gap-2 text-[11.5px] tnum"
                    >
                      <span className="text-fg-mute">{dataCurta(s.day)}</span>
                      <span className="flex items-center gap-1.5 text-fg-dim">
                        <span>
                          <span className="font-semibold text-brand-400">
                            +{s.pages}
                          </span>{" "}
                          → pág {s.end_page}
                        </span>
                        {/* A lixeira aparece no hover e é sempre visível no
                            toque: só a primeira linha é "a última marcação", e
                            é a que se erra mais — vale estar à mão. */}
                        <button
                          type="button"
                          onClick={() => apagarSessao(ver, s)}
                          aria-label={`Apagar a marcação de ${dataCurta(s.day)}`}
                          title={
                            i === 0
                              ? "Apagar — a página atual volta atrás"
                              : "Apagar esta marcação"
                          }
                          className="grid h-6 w-6 shrink-0 place-items-center rounded-md text-fg-mute transition-colors hover:bg-neg/15 hover:text-neg lg:opacity-0 lg:group-hover/s:opacity-100 lg:focus-visible:opacity-100"
                        >
                          <Trash2 size={12} />
                        </button>
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
