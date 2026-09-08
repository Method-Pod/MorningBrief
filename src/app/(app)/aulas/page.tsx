"use client";

import * as React from "react";
import {
  Check,
  Clock,
  ExternalLink,
  GraduationCap,
  Layers,
  ListVideo,
  Loader2,
  Minus,
  Pencil,
  Plus,
  Send,
  Tag,
  Target,
  Trash2,
  Youtube,
} from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { currentUserId, SESSION_EXPIRED } from "@/lib/session";
import {
  FONTE_AULA_LABEL,
  type Course,
  type FonteAula,
  type Lesson,
  type Subject,
} from "@/lib/types";
import { dataCurta, semanaDe, todayISO } from "@/lib/format";
import { DIAS_RETENCAO_AULAS } from "@/lib/limpeza";
import {
  dadosDoLink,
  duracaoCurta,
  fonteDoLink,
  idDaPlaylist,
  normalizarUrl,
  pctAssistido,
  type AulaDaPlaylist,
} from "@/lib/aulas";
import { temCache, useEstadoCacheado } from "@/lib/cachePagina";
import {
  CampoAssunto,
  Etiqueta,
  GerenciarAssuntos,
} from "@/components/Assuntos";
import {
  Badge,
  Button,
  Card,
  Empty,
  Field,
  Input,
  Modal,
  Segmented,
  cx,
  useConfirm,
  useNotice,
} from "@/components/ui";

/** "Todas" é filtro de tela; as outras duas são o estado da aula. */
type Aba = "fila" | "feitas" | "todas";

const ABAS: { valor: Aba; rotulo: string }[] = [
  { valor: "fila", rotulo: "Para assistir" },
  { valor: "feitas", rotulo: "Assistidas" },
  { valor: "todas", rotulo: "Todas" },
];

const SEM_ASSUNTO = "::sem-assunto::";

const ICONE: Record<FonteAula, typeof Youtube> = {
  youtube: Youtube,
  telegram: Send,
  outro: ExternalLink,
};

/**
 * A miniatura da aula, ou um lugar onde ela deveria estar.
 *
 * O espaço é sempre reservado, com o ícone da fonte quando não há imagem. Sem
 * isto, aula sem miniatura — toda do Telegram, e as adicionadas à mão — virava
 * uma linha vazia com o título encostado na borda e nada ancorando o olho.
 *
 * 16:9 porque é a proporção de vídeo: um quadrado cortaria a imagem do YouTube.
 */
function MiniaturaAula({
  url,
  fonte,
  feita,
}: {
  url: string | null;
  fonte: FonteAula;
  feita: boolean;
}) {
  const Icone = ICONE[fonte];
  return (
    <span
      className={cx(
        "relative block aspect-video w-[76px] shrink-0 overflow-hidden rounded-[10px] bg-ink-800 sm:w-[104px]",
        /* Aula vista fica apagada, como o título riscado: a linha inteira
           precisa dizer "já foi", não só o texto. */
        feita && "opacity-55"
      )}
    >
      {url ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={url}
          alt=""
          loading="lazy"
          decoding="async"
          className="h-full w-full object-cover"
        />
      ) : (
        <span className="grid h-full w-full place-items-center text-brand-400/45">
          <Icone size={22} />
        </span>
      )}
    </span>
  );
}

const aulaVazia = () => ({
  url: "",
  title: "",
  canal: "",
  subject_id: "",
  minutos: "",
  thumb_url: "",
});

const cursoVazio = () => ({
  title: "",
  plataforma: "",
  url: "",
  subject_id: "",
  total_aulas: "",
  aulas_feitas: "",
});

export default function AulasPage() {
  const supabase = React.useMemo(() => createClient(), []);
  const [rows, setRows] = useEstadoCacheado<Lesson[]>("lessons", []);
  const [cursos, setCursos] = useEstadoCacheado<Course[]>("courses", []);
  const [assuntos, setAssuntos] = useEstadoCacheado<Subject[]>("subjects", []);
  const [loading, setLoading] = React.useState(
    () => !temCache("lessons", "courses", "subjects")
  );
  const [falta, setFalta] = React.useState("");
  const [aba, setAba] = React.useState<Aba>("fila");
  const [filtro, setFiltro] = React.useState<"all" | string>("all");
  const [marcando, setMarcando] = React.useState<string | null>(null);
  const [minutoEmEdicao, setMinutoEmEdicao] = React.useState<
    Record<string, string>
  >({});

  /* modais */
  const [addAula, setAddAula] = React.useState(false);
  const [form, setForm] = React.useState(aulaVazia());
  const [buscando, setBuscando] = React.useState(false);
  const [salvando, setSalvando] = React.useState(false);
  const [erro, setErro] = React.useState("");

  const [addCurso, setAddCurso] = React.useState(false);
  const [editando, setEditando] = React.useState<Course | null>(null);
  const [formCurso, setFormCurso] = React.useState(cursoVazio());
  const [erroCurso, setErroCurso] = React.useState("");

  const [gerindo, setGerindo] = React.useState(false);

  /* meta semanal */
  const [meta, setMeta] = useEstadoCacheado<number | null>("meta_aulas", null);
  const [metaEmEdicao, setMetaEmEdicao] = React.useState("");
  const [editandoMeta, setEditandoMeta] = React.useState(false);

  /* importar playlist */
  const [importando, setImportando] = React.useState(false);
  const [linkPlaylist, setLinkPlaylist] = React.useState("");
  const [achados, setAchados] = React.useState<AulaDaPlaylist[] | null>(null);
  const [assuntoImport, setAssuntoImport] = React.useState("");
  const [buscandoPlaylist, setBuscandoPlaylist] = React.useState(false);
  const [erroImport, setErroImport] = React.useState("");

  const confirm = useConfirm();
  const notice = useNotice();

  const load = React.useCallback(async () => {
    const [l, c, a, m] = await Promise.all([
      supabase.from("lessons").select("*").order("created_at", { ascending: false }),
      supabase.from("courses").select("*").order("created_at", { ascending: false }),
      supabase.from("subjects").select("*").order("name"),
      /* A meta tolera falha: sem AULAS-EXTRAS.sql a tira não aparece e o resto
         da aba continua funcionando. */
      supabase.from("lesson_goals").select("per_week").maybeSingle(),
    ]);

    /* Tabela que falta é recado que fica na tela, não aviso que passa. */
    const problema = l.error ?? c.error ?? a.error;
    if (problema) {
      setFalta(
        /lessons/.test(problema.message)
          ? "As aulas precisam de supabase/AULAS.sql no banco. Rode o arquivo e recarregue."
          : /courses|subjects/.test(problema.message)
            ? "Cursos e etiquetas precisam de supabase/CURSOS-E-ASSUNTOS.sql no banco. Rode o arquivo e recarregue."
            : problema.message
      );
      setLoading(false);
      return;
    }
    setFalta("");
    setRows((l.data as Lesson[]) ?? []);
    setCursos((c.data as Course[]) ?? []);
    setAssuntos((a.data as Subject[]) ?? []);
    setMeta((m.data as { per_week: number } | null)?.per_week ?? null);
    setLoading(false);
  }, [supabase, setRows, setCursos, setAssuntos, setMeta]);

  React.useEffect(() => {
    load();
  }, [load]);

  const patch = React.useCallback(
    (id: string, mudanca: Partial<Lesson>) =>
      setRows((v) => v.map((l) => (l.id === id ? { ...l, ...mudanca } : l))),
    [setRows]
  );

  /** Nome da etiqueta por id, para a tela não procurar em lista a cada linha. */
  const nomeDoAssunto = React.useMemo(() => {
    const m = new Map<string, string>();
    assuntos.forEach((a) => m.set(a.id, a.name));
    return m;
  }, [assuntos]);

  /* ------------------------------ aulas ------------------------------ */

  /**
   * Ao colar o link, tenta preencher sozinho.
   *
   * Só o YouTube responde: ele tem oEmbed público, sem chave, e o navegador
   * chama direto. Telegram não tem equivalente — canal privado não expõe
   * metadado — então lá o título fica para você digitar.
   */
  const lerLink = async (url: string) => {
    const limpo = normalizarUrl(url);
    if (!limpo) return;
    setBuscando(true);
    const d = await dadosDoLink(limpo);
    setBuscando(false);
    setForm((f) => ({
      ...f,
      /* Não sobrescreve o que você já digitou: se o título está preenchido, foi
         escolha sua, e a API não tem por que vencer. */
      title: f.title.trim() || d.title || "",
      canal: f.canal.trim() || d.canal || "",
      thumb_url: d.thumb_url ?? f.thumb_url,
    }));
  };

  const fecharAula = () => {
    setAddAula(false);
    setForm(aulaVazia());
    setErro("");
  };

  const adicionarAula = async () => {
    const title = form.title.trim();
    if (!title) return setErro("Dê um nome à aula.");

    const cru = form.minutos.trim();
    const minutos = cru ? Number(cru) : null;
    if (cru && (!Number.isFinite(minutos) || (minutos ?? 0) <= 0))
      return setErro("A duração precisa ser um número de minutos maior que zero.");

    setErro("");
    setSalvando(true);
    const uid = await currentUserId(supabase);
    if (!uid) {
      setSalvando(false);
      return notice.show(SESSION_EXPIRED);
    }

    const ou = (v: string) => v.trim() || null;
    const { data, error } = await supabase
      .from("lessons")
      .insert({
        user_id: uid,
        title,
        url: form.url.trim() ? normalizarUrl(form.url) : null,
        fonte: form.url.trim() ? fonteDoLink(form.url) : "outro",
        canal: ou(form.canal),
        thumb_url: ou(form.thumb_url),
        subject_id: form.subject_id || null,
        minutos,
        feita: false,
      })
      .select("*")
      .single();
    setSalvando(false);

    if (error) {
      if (/subject_id/.test(error.message))
        return setErro(
          "Etiquetas precisam de supabase/CURSOS-E-ASSUNTOS.sql no banco. Rode o arquivo."
        );
      return setErro(error.message);
    }
    if (data) setRows((v) => [data as Lesson, ...v]);
    setAba("fila");
    fecharAula();
  };

  /** Marca ou desmarca. Desmarcar limpa a data, senão a limpeza contaria dela. */
  const alternar = async (l: Lesson) => {
    const feita = !l.feita;
    const mudanca = { feita, feita_em: feita ? new Date().toISOString() : null };
    setMarcando(l.id);
    /* Otimista: marcar aula é o gesto do dia, e esperar a ida de rede a cada
       clique tornaria a lista mais lenta que o hábito que ela acompanha. */
    patch(l.id, mudanca);
    const { error } = await supabase.from("lessons").update(mudanca).eq("id", l.id);
    setMarcando(null);
    if (notice.check(error, "marcar a aula")) load();
  };

  const gravarMinuto = async (l: Lesson) => {
    const cru = (minutoEmEdicao[l.id] ?? "").trim();
    const n = Number(cru);
    if (!cru || !Number.isFinite(n) || n < 0) return;
    if (l.minutos && n > l.minutos)
      return notice.show(`A aula tem ${l.minutos} minutos.`);

    const { error } = await supabase
      .from("lessons")
      .update({ em_minuto: Math.round(n) })
      .eq("id", l.id);
    setMinutoEmEdicao((r) => ({ ...r, [l.id]: "" }));
    if (!notice.check(error, "gravar o minuto"))
      patch(l.id, { em_minuto: Math.round(n) });
  };

  const removerAula = (l: Lesson) =>
    confirm.ask(`Tirar "${l.title}" da lista?`, async () => {
      const { error } = await supabase.from("lessons").delete().eq("id", l.id);
      if (notice.check(error, "tirar a aula")) return;
      setRows((v) => v.filter((x) => x.id !== l.id));
    });

  /* ------------------------------ cursos ------------------------------ */

  const abrirCurso = (c?: Course) => {
    setEditando(c ?? null);
    setFormCurso(
      c
        ? {
            title: c.title,
            plataforma: c.plataforma ?? "",
            url: c.url ?? "",
            subject_id: c.subject_id ?? "",
            total_aulas: String(c.total_aulas),
            aulas_feitas: String(c.aulas_feitas),
          }
        : cursoVazio()
    );
    setErroCurso("");
    setAddCurso(true);
  };

  const salvarCurso = async () => {
    const title = formCurso.title.trim();
    if (!title) return setErroCurso("Dê um nome ao curso.");

    const total = Number(formCurso.total_aulas.trim());
    if (!Number.isFinite(total) || total <= 0)
      return setErroCurso("Quantas aulas o curso tem? Precisa ser um número maior que zero.");

    const feitasCru = formCurso.aulas_feitas.trim();
    const feitas = feitasCru ? Number(feitasCru) : 0;
    if (!Number.isFinite(feitas) || feitas < 0)
      return setErroCurso("Aulas concluídas não pode ser negativo.");
    /* O banco recusaria pelo check, mas o erro chegaria em inglês e sem dizer
       o que fazer. Aqui a mensagem já traz os dois números. */
    if (feitas > total)
      return setErroCurso(
        `Você marcou ${feitas} concluídas num curso de ${total} aulas.`
      );

    setErroCurso("");
    setSalvando(true);
    const ou = (v: string) => v.trim() || null;
    const dados = {
      title,
      plataforma: ou(formCurso.plataforma),
      url: formCurso.url.trim() ? normalizarUrl(formCurso.url) : null,
      subject_id: formCurso.subject_id || null,
      total_aulas: Math.round(total),
      aulas_feitas: Math.round(feitas),
    };

    if (editando) {
      const { data, error } = await supabase
        .from("courses")
        .update(dados)
        .eq("id", editando.id)
        .select("*")
        .single();
      setSalvando(false);
      if (error) return setErroCurso(error.message);
      if (data)
        setCursos((v) =>
          v.map((c) => (c.id === editando.id ? (data as Course) : c))
        );
    } else {
      const uid = await currentUserId(supabase);
      if (!uid) {
        setSalvando(false);
        return notice.show(SESSION_EXPIRED);
      }
      const { data, error } = await supabase
        .from("courses")
        .insert({ ...dados, user_id: uid })
        .select("*")
        .single();
      setSalvando(false);
      if (error) {
        if (/courses/.test(error.message))
          return setErroCurso(
            "Cursos precisam de supabase/CURSOS-E-ASSUNTOS.sql no banco. Rode o arquivo."
          );
        return setErroCurso(error.message);
      }
      if (data) setCursos((v) => [data as Course, ...v]);
    }
    setAddCurso(false);
    setEditando(null);
  };

  /**
   * Uma aula a mais ou a menos no curso.
   *
   * O passo é o gesto diário — terminou uma aula, aperta o mais. Trava nos
   * limites em vez de deixar o banco recusar: o check do banco devolveria um
   * erro por um clique que só precisava não acontecer.
   */
  const passo = async (c: Course, delta: number) => {
    const feitas = Math.min(c.total_aulas, Math.max(0, c.aulas_feitas + delta));
    if (feitas === c.aulas_feitas) return;
    setCursos((v) =>
      v.map((x) => (x.id === c.id ? { ...x, aulas_feitas: feitas } : x))
    );
    const { error } = await supabase
      .from("courses")
      .update({ aulas_feitas: feitas })
      .eq("id", c.id);
    if (notice.check(error, "atualizar o curso")) load();
  };

  /* ------------------------------ meta ------------------------------ */

  const salvarMeta = async () => {
    const n = Number(metaEmEdicao.trim());
    if (!Number.isFinite(n) || n < 1 || n > 99)
      return notice.show("A meta precisa ser um número de 1 a 99.");
    const uid = await currentUserId(supabase);
    if (!uid) return notice.show(SESSION_EXPIRED);

    /* upsert na chave do usuário: trocar a meta é sobrescrever, não criar uma
       segunda linha. */
    const { error } = await supabase
      .from("lesson_goals")
      .upsert({ user_id: uid, per_week: Math.round(n) }, { onConflict: "user_id" });
    if (error && /lesson_goals/.test(error.message))
      return notice.show(
        "A meta precisa de supabase/AULAS-EXTRAS.sql no banco. Rode o arquivo."
      );
    if (!notice.check(error, "salvar a meta")) {
      setMeta(Math.round(n));
      setEditandoMeta(false);
      setMetaEmEdicao("");
    }
  };

  /* --------------------------- playlist --------------------------- */

  const buscarPlaylist = async () => {
    const id = idDaPlaylist(linkPlaylist);
    if (!id)
      return setErroImport(
        "Não achei a playlist nesse link. Cole o endereço da playlist, ou de um vídeo tocando dentro dela. Listas privadas como “Assistir mais tarde” não podem ser lidas."
      );
    setErroImport("");
    setAchados(null);
    setBuscandoPlaylist(true);
    try {
      const r = await fetch(`/api/playlist?id=${encodeURIComponent(id)}`);
      const d = await r.json();
      if (!r.ok) {
        setErroImport(d?.recado ?? "Não consegui ler a playlist.");
        return;
      }
      setAchados(d.itens ?? []);
      if (!d.itens?.length)
        setErroImport("A playlist respondeu, mas sem nenhum vídeo utilizável.");
    } catch {
      setErroImport("Não consegui ler a playlist agora.");
    } finally {
      setBuscandoPlaylist(false);
    }
  };

  /**
   * Grava a playlist inteira numa inserção só.
   *
   * Uma chamada com o lote, e não uma por aula: são dezenas de linhas, e
   * dezenas de idas ao banco deixariam a importação lenta e parcialmente
   * aplicada se alguma falhasse no meio.
   */
  const importar = async () => {
    if (!achados?.length) return;
    setSalvando(true);
    const uid = await currentUserId(supabase);
    if (!uid) {
      setSalvando(false);
      return notice.show(SESSION_EXPIRED);
    }

    /* O que já está na lista não entra de novo: reimportar uma playlist que
       ganhou aulas novas deve trazer só as novas. */
    const jaTenho = new Set(rows.map((l) => l.url).filter(Boolean));
    const novas = achados.filter((a) => !jaTenho.has(a.url));

    if (!novas.length) {
      setSalvando(false);
      setErroImport("Todas as aulas dessa playlist já estão na sua lista.");
      return;
    }

    const { data, error } = await supabase
      .from("lessons")
      .insert(
        novas.map((a) => ({
          user_id: uid,
          title: a.title,
          url: a.url,
          fonte: "youtube" as const,
          canal: a.canal,
          thumb_url: a.thumb_url,
          subject_id: assuntoImport || null,
          minutos: a.minutos,
          feita: false,
        }))
      )
      .select("*");
    setSalvando(false);

    if (notice.check(error, "importar a playlist")) return;
    if (data) setRows((v) => [...(data as Lesson[]), ...v]);
    const pulou = achados.length - novas.length;
    notice.show(
      `${novas.length} aula${novas.length === 1 ? "" : "s"} importada${
        novas.length === 1 ? "" : "s"
      }${pulou ? ` · ${pulou} já estava${pulou === 1 ? "" : "m"} na lista` : ""}.`
    );
    setImportando(false);
    setLinkPlaylist("");
    setAchados(null);
    setAssuntoImport("");
    setAba("fila");
  };

  const removerCurso = (c: Course) =>
    confirm.ask(`Tirar o curso "${c.title}"?`, async () => {
      const { error } = await supabase.from("courses").delete().eq("id", c.id);
      if (notice.check(error, "tirar o curso")) return;
      setCursos((v) => v.filter((x) => x.id !== c.id));
    });

  /* ------------------------------ derivados ------------------------------ */

  const contagem = (a: Aba) =>
    a === "todas"
      ? rows.length
      : rows.filter((l) => (a === "feitas" ? l.feita : !l.feita)).length;

  /** Quantas aulas e cursos usam cada etiqueta — o gerenciador avisa antes de apagar. */
  const usosDoAssunto = React.useMemo(() => {
    const c: Record<string, number> = {};
    [...rows, ...cursos].forEach((x) => {
      if (x.subject_id) c[x.subject_id] = (c[x.subject_id] ?? 0) + 1;
    });
    return c;
  }, [rows, cursos]);

  /** Etiquetas que aparecem como filtro: as em uso, mais "sem assunto" se houver. */
  const filtros = React.useMemo(() => {
    const usadas = assuntos.filter((a) => usosDoAssunto[a.id]);
    const temSem = rows.some((l) => !l.subject_id);
    return [
      ...usadas.map((a) => ({ chave: a.id, nome: a.name })),
      ...(temSem ? [{ chave: SEM_ASSUNTO, nome: "Sem assunto" }] : []),
    ];
  }, [assuntos, usosDoAssunto, rows]);

  const lista = React.useMemo(
    () =>
      rows
        .filter((l) =>
          aba === "todas" ? true : aba === "feitas" ? l.feita : !l.feita
        )
        .filter(
          (l) =>
            filtro === "all" || (l.subject_id || SEM_ASSUNTO) === filtro
        ),
    [rows, aba, filtro]
  );

  /**
   * Aulas assistidas na semana corrente, de segunda a domingo.
   *
   * Usa a mesma semana fixa dos hábitos, e não "últimos 7 dias": com janela
   * móvel a meta nunca fecha — sempre há uma aula saindo pela borda de trás, e
   * o número balança sem você ter feito nada.
   */
  const naSemana = React.useMemo(() => {
    const dias = new Set(semanaDe(todayISO()));
    return rows.filter(
      (l) => l.feita && l.feita_em && dias.has(l.feita_em.slice(0, 10))
    ).length;
  }, [rows]);

  const emAndamento = cursos.filter((c) => c.aulas_feitas < c.total_aulas);
  const concluidos = cursos.length - emAndamento.length;

  const pilula = (ativa: boolean) =>
    cx(
      "h-8 shrink-0 rounded-full px-3 text-[11.5px] font-medium transition-colors",
      ativa
        ? "bg-brand-500 text-on-brand"
        : "bg-ink-800 text-fg-mute hover:text-fg-dim"
    );

  return (
    <div className="space-y-5 rise">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Aulas</h1>
          <p className="mt-1 text-sm text-fg-mute">
            {contagem("fila")} para assistir · {contagem("feitas")} assistida
            {contagem("feitas") === 1 ? "" : "s"}
            {cursos.length > 0 && (
              <>
                {" "}
                · {emAndamento.length} curso
                {emAndamento.length === 1 ? "" : "s"} em andamento
              </>
            )}
          </p>
        </div>
        <div className="flex w-full items-center gap-2 sm:w-auto">
          <Button
            onClick={() => setGerindo(true)}
            className="shrink-0"
            title="Gerenciar etiquetas"
          >
            <Tag size={15} />
            <span className="hidden sm:inline">Etiquetas</span>
          </Button>
          <Button
            onClick={() => setImportando(true)}
            className="shrink-0"
            title="Importar playlist do YouTube"
          >
            <ListVideo size={15} />
            <span className="hidden sm:inline">Playlist</span>
          </Button>
          <Button onClick={() => abrirCurso()} className="min-w-0 flex-1 sm:flex-none">
            <Layers size={15} className="shrink-0" />
            <span className="truncate">Curso</span>
          </Button>
          <Button
            variant="primary"
            onClick={() => setAddAula(true)}
            className="min-w-0 flex-1 sm:flex-none"
          >
            <Plus size={15} className="shrink-0" />
            <span className="truncate">Aula</span>
          </Button>
        </div>
      </div>

      {falta && (
        <Card className="border-warn/40 bg-warn/10 px-5 py-4">
          <p className="text-[12.5px] text-fg-dim">{falta}</p>
        </Card>
      )}

      {/* ------------------------------ cursos ------------------------------ */}
      {/*
        Curso é recipiente, não item de lista: fica numa faixa própria acima,
        como o "continuar lendo" da estante. A aula solta embaixo é o que se
        consome no dia; o curso é o que se acompanha ao longo de semanas.
      */}
      {cursos.length > 0 && (
        <div className="space-y-2.5">
          <h2 className="text-[10px] font-medium uppercase tracking-wider text-fg-mute">
            Cursos
            {concluidos > 0 && (
              <span className="ml-1.5 normal-case text-fg-mute/70">
                · {concluidos} concluído{concluidos === 1 ? "" : "s"}
              </span>
            )}
          </h2>
          <div className="grid gap-3 lg:grid-cols-2">
            {cursos.map((c, i) => {
              const pct = Math.round((c.aulas_feitas / c.total_aulas) * 100);
              const pronto = c.aulas_feitas >= c.total_aulas;
              return (
                <Card
                  key={c.id}
                  className="entra group p-3.5"
                  style={{ "--i": i } as React.CSSProperties}
                >
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <p
                        className={cx(
                          "text-[13px] font-semibold leading-snug",
                          pronto && "text-fg-mute"
                        )}
                      >
                        {c.title}
                      </p>
                      <div className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-1">
                        {c.plataforma && (
                          <span className="text-[10.5px] text-fg-mute">
                            {c.plataforma}
                          </span>
                        )}
                        <Etiqueta nome={nomeDoAssunto.get(c.subject_id ?? "")} />
                        {pronto && <Badge tone="pos">concluído</Badge>}
                        {c.url && (
                          <a
                            href={c.url}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="inline-flex items-center gap-1 text-[10.5px] text-brand-400 hover:underline"
                          >
                            <ExternalLink size={10} />
                            abrir
                          </a>
                        )}
                      </div>
                    </div>
                    <div className="flex shrink-0 items-center gap-0.5 transition-opacity lg:opacity-0 lg:group-hover:opacity-100 lg:focus-within:opacity-100">
                      <button
                        type="button"
                        onClick={() => abrirCurso(c)}
                        aria-label={`Editar ${c.title}`}
                        className="grid h-7 w-7 place-items-center rounded-md text-fg-mute hover:bg-ink-750 hover:text-fg"
                      >
                        <Pencil size={13} />
                      </button>
                      <button
                        type="button"
                        onClick={() => removerCurso(c)}
                        aria-label={`Tirar ${c.title}`}
                        className="grid h-7 w-7 place-items-center rounded-md text-fg-mute hover:bg-neg/15 hover:text-neg"
                      >
                        <Trash2 size={13} />
                      </button>
                    </div>
                  </div>

                  <div className="mt-2.5 flex items-center gap-2.5">
                    <span className="text-[11px] font-bold text-brand-400 tnum">
                      {pct}%
                    </span>
                    <span className="h-1.5 flex-1 overflow-hidden rounded-full bg-ink-800">
                      <span
                        className={cx(
                          "block h-full w-full origin-left rounded-full transition-transform duration-[300ms] ease-[cubic-bezier(0.22,0.61,0.36,1)]",
                          pronto ? "bg-pos" : "bg-brand-500"
                        )}
                        style={{ transform: `scaleX(${pct / 100})` }}
                      />
                    </span>
                    <span className="shrink-0 text-[10.5px] text-fg-mute tnum">
                      {c.aulas_feitas}/{c.total_aulas} aulas
                    </span>
                    {/* O passo é o gesto diário: terminou uma aula, aperta o
                        mais. Trava nos limites em vez de deixar o banco
                        recusar um clique que só precisava não acontecer. */}
                    <span className="flex shrink-0 items-center gap-1">
                      <button
                        type="button"
                        onClick={() => passo(c, -1)}
                        disabled={c.aulas_feitas === 0}
                        aria-label={`Uma aula a menos em ${c.title}`}
                        className="grid h-7 w-7 place-items-center rounded-lg bg-ink-800 text-fg-dim transition-colors hover:bg-ink-750 disabled:opacity-35"
                      >
                        <Minus size={13} />
                      </button>
                      <button
                        type="button"
                        onClick={() => passo(c, 1)}
                        disabled={pronto}
                        aria-label={`Uma aula a mais em ${c.title}`}
                        className="grid h-7 w-7 place-items-center rounded-lg bg-brand-500 text-on-brand transition-colors hover:bg-brand-600 disabled:opacity-35"
                      >
                        <Plus size={13} />
                      </button>
                    </span>
                  </div>
                </Card>
              );
            })}
          </div>
        </div>
      )}

      {/* ------------------------------ aulas ------------------------------ */}
      <div className="space-y-3">
        {/*
          Meta e aviso de retenção na mesma linha fina, como na estante: são
          referência de canto de olho, não a razão de abrir a tela.
        */}
        <div className="flex flex-wrap items-center gap-x-4 gap-y-2 text-[11px] text-fg-mute sm:text-[12px]">
          <span className="flex items-center gap-2">
            <Target size={13} className="shrink-0" />
            {meta ? (
              <>
                <span className="font-semibold text-fg-dim tnum">
                  {naSemana}/{meta}
                </span>
                <span>aulas esta semana</span>
                <span className="h-1 w-[52px] overflow-hidden rounded-full bg-ink-800">
                  <span
                    className={cx(
                      "block h-full w-full origin-left rounded-full transition-transform duration-[320ms]",
                      naSemana >= meta ? "bg-pos" : "bg-brand-500"
                    )}
                    style={{
                      transform: `scaleX(${Math.min(1, naSemana / meta)})`,
                    }}
                  />
                </span>
              </>
            ) : (
              <span>
                {naSemana} assistida{naSemana === 1 ? "" : "s"} esta semana
              </span>
            )}

            {editandoMeta ? (
              <span className="flex items-center gap-1">
                <span className="w-[58px]">
                  <Input
                    autoFocus
                    type="number"
                    min={1}
                    max={99}
                    value={metaEmEdicao}
                    onChange={(e) => setMetaEmEdicao(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter") {
                        e.preventDefault();
                        salvarMeta();
                      }
                      if (e.key === "Escape") setEditandoMeta(false);
                    }}
                    placeholder="3"
                    aria-label="Aulas por semana"
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

          <span className="flex items-center gap-1.5">
            <span className="text-fg-mute">·</span>
            <Check size={12} className="shrink-0" />
            Assistidas saem em {DIAS_RETENCAO_AULAS} dias
          </span>
        </div>

        <div className="flex flex-wrap items-center gap-2.5 sm:gap-3">
          <div className="-mx-1 max-w-full overflow-x-auto px-1 pb-0.5">
            <Segmented
              value={aba}
              onChange={setAba}
              options={ABAS.map((a) => ({
                value: a.valor,
                label: a.rotulo,
                count: contagem(a.valor),
              }))}
            />
          </div>

          {/* Filtro só com mais de uma etiqueta em uso: com uma só, seria um
              botão que não filtra nada. */}
          {filtros.length > 1 && (
            <div className="-mx-1 flex max-w-full gap-1.5 overflow-x-auto px-1 pb-0.5">
              <button
                type="button"
                onClick={() => setFiltro("all")}
                className={pilula(filtro === "all")}
              >
                Todos
              </button>
              {filtros.map((f) => (
                <button
                  key={f.chave}
                  type="button"
                  onClick={() => setFiltro(f.chave)}
                  className={pilula(filtro === f.chave)}
                >
                  {f.nome}
                </button>
              ))}
            </div>
          )}
        </div>

        {loading ? null : lista.length === 0 ? (
          <Card>
            <Empty
              icon={<GraduationCap size={18} />}
              title={rows.length ? "Nada aqui" : "Nenhuma aula ainda"}
              sub="Cole o link do YouTube e o título, o canal e a capa vêm junto. Do Telegram, é só dar um nome."
              action={
                <Button variant="primary" size="sm" onClick={() => setAddAula(true)}>
                  <Plus size={14} />
                  Adicionar aula
                </Button>
              }
            />
          </Card>
        ) : (
          <Card className="overflow-hidden">
            <ul className="divide-y divide-line-soft">
              {lista.map((l, i) => {
                const Icone = ICONE[l.fonte];
                const pct = pctAssistido(l);
                return (
                  <li
                    key={l.id}
                    className="entra group flex items-start gap-3 px-4 py-4 transition-colors hover:bg-ink-800/40 sm:gap-3.5 sm:px-5"
                    style={{ "--i": i } as React.CSSProperties}
                  >
                    <button
                      type="button"
                      onClick={() => alternar(l)}
                      disabled={marcando === l.id}
                      aria-label={`${l.feita ? "Desmarcar" : "Marcar"} ${l.title}`}
                      aria-pressed={l.feita}
                      className={cx(
                        "mt-[3px] grid h-[22px] w-[22px] shrink-0 place-items-center rounded-[7px] border-[1.5px] transition-[background-color,border-color] duration-[180ms] disabled:opacity-50",
                        l.feita
                          ? "border-pos bg-pos text-white"
                          : "border-line bg-white hover:border-brand-400"
                      )}
                    >
                      <Check
                        size={13}
                        strokeWidth={3.5}
                        className={cx(
                          "transition-[transform,opacity] duration-[180ms] ease-[cubic-bezier(0.34,1.4,0.64,1)]",
                          l.feita ? "scale-100 opacity-100" : "scale-50 opacity-0"
                        )}
                      />
                    </button>

                    <MiniaturaAula
                      url={l.thumb_url}
                      fonte={l.fonte}
                      feita={l.feita}
                    />

                    <div className="min-w-0 flex-1 py-0.5">
                      <p
                        className={cx(
                          "text-[13.5px] font-semibold leading-snug",
                          l.feita ? "text-fg-mute line-through" : "text-fg"
                        )}
                      >
                        {l.title}
                      </p>

                      {/*
                        Uma linha de metadados com pesos diferentes, não quatro
                        textos cinzas iguais.

                        Antes o canal, a duração e o "abrir" tinham o mesmo
                        tamanho e a mesma cor: o olho não achava onde começar.
                        Agora o canal é o texto, a duração é uma pastilha com
                        número, e "abrir" é um botão pequeno.
                      */}
                      <div className="mt-1.5 flex flex-wrap items-center gap-x-2 gap-y-1.5">
                        <span className="inline-flex min-w-0 items-center gap-1.5 text-[11.5px] text-fg-dim">
                          <Icone size={12} className="shrink-0 text-fg-mute" />
                          <span className="truncate">
                            {l.canal || FONTE_AULA_LABEL[l.fonte]}
                          </span>
                        </span>

                        {duracaoCurta(l.minutos) && (
                          <span className="inline-flex items-center gap-1 rounded-full bg-ink-800 px-2 py-0.5 text-[10px] font-semibold text-fg-mute tnum">
                            <Clock size={9} />
                            {duracaoCurta(l.minutos)}
                          </span>
                        )}

                        <Etiqueta nome={nomeDoAssunto.get(l.subject_id ?? "")} />

                        {l.feita && l.feita_em && (
                          <span className="inline-flex items-center gap-1 rounded-full bg-pos/12 px-2 py-0.5 text-[10px] font-semibold text-pos">
                            <Check size={9} strokeWidth={3} />
                            visto {dataCurta(l.feita_em.slice(0, 10))}
                          </span>
                        )}

                        {l.url && (
                          <a
                            href={l.url}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="inline-flex h-6 items-center gap-1 rounded-full border border-line bg-white px-2.5 text-[10.5px] font-semibold text-brand-400 transition-colors hover:border-brand-400 hover:bg-brand-500/8"
                          >
                            <ExternalLink size={10} />
                            abrir
                          </a>
                        )}
                      </div>

                      {!l.feita && l.minutos && (
                        <div className="mt-2 flex flex-wrap items-center gap-2">
                          {pct !== null && (
                            <>
                              <span className="h-1 min-w-[48px] flex-1 overflow-hidden rounded-full bg-ink-800">
                                <span
                                  className="block h-full w-full origin-left rounded-full bg-brand-500 transition-transform duration-300"
                                  style={{ transform: `scaleX(${pct / 100})` }}
                                />
                              </span>
                              <span className="text-[10px] font-bold text-fg-mute tnum">
                                {l.em_minuto}/{l.minutos}min
                              </span>
                            </>
                          )}
                          <span className="flex items-center gap-1.5">
                            <span className="w-[62px]">
                              <Input
                                type="number"
                                min={0}
                                max={l.minutos}
                                value={minutoEmEdicao[l.id] ?? ""}
                                onChange={(e) =>
                                  setMinutoEmEdicao((r) => ({
                                    ...r,
                                    [l.id]: e.target.value,
                                  }))
                                }
                                onKeyDown={(e) => {
                                  if (e.key === "Enter") {
                                    e.preventDefault();
                                    gravarMinuto(l);
                                  }
                                }}
                                placeholder="min"
                                aria-label={`Minuto atual de ${l.title}`}
                                className="h-7 text-center text-[11px]"
                              />
                            </span>
                            <Button
                              size="sm"
                              onClick={() => gravarMinuto(l)}
                              disabled={!(minutoEmEdicao[l.id] ?? "").trim()}
                            >
                              Parei aqui
                            </Button>
                          </span>
                        </div>
                      )}
                    </div>

                    <button
                      type="button"
                      onClick={() => removerAula(l)}
                      aria-label={`Tirar ${l.title} da lista`}
                      className="grid h-8 w-8 shrink-0 place-items-center rounded-lg text-fg-mute transition-colors hover:bg-neg/15 hover:text-neg lg:opacity-0 lg:group-hover:opacity-100 lg:focus-visible:opacity-100"
                    >
                      <Trash2 size={14} />
                    </button>
                  </li>
                );
              })}
            </ul>
          </Card>
        )}
      </div>

      {/* ------------------------------ nova aula ------------------------------ */}
      <Modal
        open={addAula}
        onClose={fecharAula}
        title="Adicionar aula"
        sub="Cole o link. Do YouTube vem título, canal e capa."
        size="lg"
        footer={
          <>
            <Button onClick={fecharAula}>Cancelar</Button>
            <Button variant="primary" onClick={adicionarAula} disabled={salvando}>
              {salvando ? "Salvando..." : "Adicionar"}
            </Button>
          </>
        }
      >
        <div className="space-y-4">
          {erro && (
            <p className="rounded-[14px] bg-neg/10 px-3.5 py-3 text-xs text-neg">
              {erro}
            </p>
          )}

          <Field label="Link" hint="YouTube, Telegram, Drive — ou deixe vazio.">
            <div className="relative">
              <Input
                autoFocus
                type="url"
                inputMode="url"
                value={form.url}
                onChange={(e) => setForm({ ...form, url: e.target.value })}
                /* No `blur` e no Enter, não a cada tecla: o link é colado de uma
                   vez, e buscar a cada caractere seria uma chamada por letra. */
                onBlur={(e) => lerLink(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") {
                    e.preventDefault();
                    lerLink((e.target as HTMLInputElement).value);
                  }
                }}
                placeholder="youtube.com/watch?v=..."
              />
              {buscando && (
                <Loader2
                  size={14}
                  className="absolute right-3.5 top-1/2 -translate-y-1/2 animate-spin text-fg-mute"
                />
              )}
            </div>
          </Field>

          {form.thumb_url && (
            <div className="flex items-center gap-3 rounded-[14px] bg-ink-800 p-2.5">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={form.thumb_url}
                alt=""
                className="aspect-video w-[104px] shrink-0 rounded-lg object-cover"
              />
              <span className="text-[11.5px] text-fg-mute">
                Capa do vídeo, veio do link.
              </span>
            </div>
          )}

          <Field label="Nome da aula">
            <Input
              value={form.title}
              onChange={(e) => setForm({ ...form, title: e.target.value })}
              placeholder="Corte que retém nos 3 primeiros segundos"
            />
          </Field>

          <div className="grid gap-4 sm:grid-cols-[minmax(0,1fr)_110px]">
            <Field label="Canal / autor">
              <Input
                value={form.canal}
                onChange={(e) => setForm({ ...form, canal: e.target.value })}
                placeholder="Opcional"
              />
            </Field>
            <Field label="Duração" hint="min">
              <Input
                type="number"
                min={1}
                value={form.minutos}
                onChange={(e) => setForm({ ...form, minutos: e.target.value })}
                placeholder="42"
              />
            </Field>
          </div>

          <Field label="Assunto" hint="Escolha uma etiqueta, ou crie no botão ao lado.">
            <CampoAssunto
              valor={form.subject_id}
              onValor={(v) => setForm({ ...form, subject_id: v })}
              assuntos={assuntos}
              onGerenciar={() => setGerindo(true)}
            />
          </Field>
        </div>
      </Modal>

      {/* ------------------------------ curso ------------------------------ */}
      <Modal
        open={addCurso}
        onClose={() => {
          setAddCurso(false);
          setEditando(null);
        }}
        title={editando ? "Editar curso" : "Adicionar curso"}
        sub="Quantas aulas tem, e quantas você já fez."
        size="lg"
        footer={
          <>
            <Button
              onClick={() => {
                setAddCurso(false);
                setEditando(null);
              }}
            >
              Cancelar
            </Button>
            <Button variant="primary" onClick={salvarCurso} disabled={salvando}>
              {salvando ? "Salvando..." : "Salvar"}
            </Button>
          </>
        }
      >
        <div className="space-y-4">
          {erroCurso && (
            <p className="rounded-[14px] bg-neg/10 px-3.5 py-3 text-xs text-neg">
              {erroCurso}
            </p>
          )}

          <Field label="Nome do curso">
            <Input
              autoFocus
              value={formCurso.title}
              onChange={(e) =>
                setFormCurso({ ...formCurso, title: e.target.value })
              }
              placeholder="Edição avançada no Premiere"
            />
          </Field>

          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Plataforma">
              <Input
                value={formCurso.plataforma}
                onChange={(e) =>
                  setFormCurso({ ...formCurso, plataforma: e.target.value })
                }
                placeholder="Udemy, Hotmart, YouTube..."
              />
            </Field>
            <Field label="Link">
              <Input
                type="url"
                inputMode="url"
                value={formCurso.url}
                onChange={(e) =>
                  setFormCurso({ ...formCurso, url: e.target.value })
                }
                placeholder="Opcional"
              />
            </Field>
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Total de aulas">
              <Input
                type="number"
                min={1}
                value={formCurso.total_aulas}
                onChange={(e) =>
                  setFormCurso({ ...formCurso, total_aulas: e.target.value })
                }
                placeholder="40"
              />
            </Field>
            <Field label="Aulas concluídas" hint="Deixe vazio para começar em zero.">
              <Input
                type="number"
                min={0}
                value={formCurso.aulas_feitas}
                onChange={(e) =>
                  setFormCurso({ ...formCurso, aulas_feitas: e.target.value })
                }
                placeholder="0"
              />
            </Field>
          </div>

          <Field label="Assunto">
            <CampoAssunto
              valor={formCurso.subject_id}
              onValor={(v) => setFormCurso({ ...formCurso, subject_id: v })}
              assuntos={assuntos}
              onGerenciar={() => setGerindo(true)}
            />
          </Field>
        </div>
      </Modal>

      {/* --------------------------- playlist --------------------------- */}
      <Modal
        open={importando}
        onClose={() => {
          setImportando(false);
          setAchados(null);
          setErroImport("");
        }}
        title="Importar playlist"
        sub="Cole o link da playlist do YouTube. As aulas entram com título, canal, capa e duração."
        size="lg"
        footer={
          <>
            <Button
              onClick={() => {
                setImportando(false);
                setAchados(null);
                setErroImport("");
              }}
            >
              Cancelar
            </Button>
            {achados && achados.length > 0 && (
              <Button variant="primary" onClick={importar} disabled={salvando}>
                {salvando
                  ? "Importando..."
                  : `Importar ${achados.length} aula${achados.length === 1 ? "" : "s"}`}
              </Button>
            )}
          </>
        }
      >
        <div className="space-y-4">
          {erroImport && (
            <p className="rounded-[14px] bg-warn/10 px-3.5 py-3 text-xs text-fg-dim">
              {erroImport}
            </p>
          )}

          <Field label="Link da playlist">
            <div className="flex gap-2">
              <Input
                autoFocus
                type="url"
                inputMode="url"
                value={linkPlaylist}
                onChange={(e) => {
                  setLinkPlaylist(e.target.value);
                  setErroImport("");
                }}
                onKeyDown={(e) => {
                  if (e.key === "Enter") {
                    e.preventDefault();
                    buscarPlaylist();
                  }
                }}
                placeholder="youtube.com/playlist?list=..."
                className="flex-1"
              />
              <Button
                onClick={buscarPlaylist}
                disabled={buscandoPlaylist || !linkPlaylist.trim()}
              >
                {buscandoPlaylist ? (
                  <Loader2 size={15} className="animate-spin" />
                ) : (
                  <ListVideo size={15} />
                )}
                Ler
              </Button>
            </div>
          </Field>

          {achados && achados.length > 0 && (
            <>
              <Field
                label="Assunto para todas"
                hint="Aplicado às aulas desta importação. Dá para mudar depois, uma por uma."
              >
                <CampoAssunto
                  valor={assuntoImport}
                  onValor={setAssuntoImport}
                  assuntos={assuntos}
                  onGerenciar={() => setGerindo(true)}
                />
              </Field>

              <ul className="max-h-[38vh] divide-y divide-line-soft overflow-y-auto">
                {achados.map((a, i) => (
                  <li key={a.url} className="flex items-center gap-3 py-2">
                    <span className="w-5 shrink-0 text-right text-[10.5px] text-fg-mute tnum">
                      {i + 1}
                    </span>
                    {a.thumb_url && (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img
                        src={a.thumb_url}
                        alt=""
                        loading="lazy"
                        className="aspect-video w-[64px] shrink-0 rounded bg-ink-800 object-cover"
                      />
                    )}
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-[12px] font-medium">
                        {a.title}
                      </span>
                      <span className="block text-[10.5px] text-fg-mute">
                        {[a.canal, duracaoCurta(a.minutos)]
                          .filter(Boolean)
                          .join(" · ")}
                      </span>
                    </span>
                  </li>
                ))}
              </ul>
            </>
          )}
        </div>
      </Modal>

      <GerenciarAssuntos
        aberto={gerindo}
        onFechar={() => setGerindo(false)}
        supabase={supabase}
        assuntos={assuntos}
        usos={usosDoAssunto}
        onMudou={load}
      />

      {confirm.node}
      {notice.node}
    </div>
  );
}
