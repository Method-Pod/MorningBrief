"use client";

import * as React from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  FileText,
  Pin,
  PinOff,
  Plus,
  Search,
  Pencil,
  StickyNote,
  Tag,
  Trash2,
} from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { temCache, useEstadoCacheado } from "@/lib/cachePagina";
import { currentUserId, SESSION_EXPIRED } from "@/lib/session";
import { NADA_GRAVADO } from "@/lib/erros";
import {
  NOTE_COLORS,
  type Note,
  type NoteCategory,
  type NoteInCategory,
} from "@/lib/types";
import { dateTimeBR } from "@/lib/format";
import { textoDaNota } from "@/lib/notas";
import { GerenciarEtiquetas } from "@/components/GerenciarEtiquetas";
import { MenuSuspenso } from "@/components/MenuSuspenso";
import {
  Button,
  Card,
  Empty,
  Field,
  Input,
  Modal,
  useConfirm,
  useNotice,
  cx,
} from "@/components/ui";

/**
 * A lista de anotações: nomes, e nada mais.
 *
 * Era uma grade de cartões coloridos com o texto dentro, e o texto era editado
 * num modal. Com o editor de blocos, o texto tem título, lista, caixa de
 * destaque e mais de uma página de conteúdo — não cabe num cartão de prévia, e
 * um modal aperta demais para escrever. Então a lista virou índice, como no
 * Notion, e cada nota abre na sua própria página.
 *
 * A cor continua no banco e continua aparecendo, mas encolhida ao ícone: é o
 * que deixa reconhecer a nota de longe sem transformar a lista numa parede de
 * quadrados.
 */

/** A bolinha de cada cor, no seletor da edição rápida. */
const BOLINHA: Record<string, string> = {
  blue: "bg-brand-500",
  violet: "bg-violet-500",
  emerald: "bg-pos",
  amber: "bg-warn",
  rose: "bg-neg",
  slate: "bg-ink-600",
};

const COR_DO_ICONE: Record<string, string> = {
  blue: "text-brand-400 bg-brand-500/10",
  violet: "text-violet-500 bg-violet-500/10",
  emerald: "text-pos bg-pos/10",
  amber: "text-warn bg-warn/10",
  rose: "text-neg bg-neg/10",
  slate: "text-fg-mute bg-ink-800",
};

export default function AnotacoesPage() {
  const supabase = React.useMemo(() => createClient(), []);
  const router = useRouter();

  const [rows, setRows] = useEstadoCacheado<Note[]>("notes", []);
  const [cats, setCats] = useEstadoCacheado<NoteCategory[]>(
    "note_categories",
    []
  );
  const [ligacoes, setLigacoes] = useEstadoCacheado<NoteInCategory[]>(
    "note_in_category",
    []
  );
  /* Já visitou nesta sessão? Abre com conteúdo e atualiza atrás. */
  const [loading, setLoading] = React.useState(() => !temCache("notes"));
  const [q, setQ] = React.useState("");
  const [criando, setCriando] = React.useState(false);
  const [filtro, setFiltro] = React.useState<"all" | "sem" | string>("all");
  const [gerindo, setGerindo] = React.useState(false);

  /*
   * Edição rápida: o que se muda sem abrir a nota.
   *
   * Nome, cor e categoria são decisões de organização, e vêm à cabeça olhando
   * a lista — "essa é de estudo", "essa devia ser verde". Ter que abrir a nota,
   * mexer no cabeçalho dela e voltar transformava três segundos em três
   * navegações. Por isso saíram da página da nota e vieram para cá.
   */
  const [editando, setEditando] = React.useState<Note | null>(null);
  const [rascunho, setRascunho] = React.useState({ title: "", color: "blue" });
  const [minhas, setMinhas] = React.useState<string[]>([]);
  const [salvando, setSalvando] = React.useState(false);
  const [erroEdicao, setErroEdicao] = React.useState("");

  const confirm = useConfirm();
  const notice = useNotice();

  const load = React.useCallback(async () => {
    const [n, c, l] = await Promise.all([
      supabase
        .from("notes")
        .select("*")
        .order("pinned", { ascending: false })
        .order("updated_at", { ascending: false }),
      /* As categorias toleram falha: sem CATEGORIAS-DE-NOTA.sql a faixa de
         filtro não aparece e o resto da tela continua funcionando. */
      supabase.from("note_categories").select("*").order("name"),
      supabase.from("note_in_category").select("*"),
    ]);
    if (!n.error) setRows((n.data as Note[]) ?? []);
    setCats((c.data as NoteCategory[]) ?? []);
    setLigacoes((l.data as NoteInCategory[]) ?? []);
    setLoading(false);
  }, [supabase, setRows, setCats, setLigacoes]);

  React.useEffect(() => {
    load();
  }, [load]);

  /**
   * Cria a nota vazia e vai direto para ela.
   *
   * Sem modal pedindo o título antes: no Notion a página nasce em branco e o
   * título é a primeira coisa que se digita nela. Pedir o nome de algo que
   * ainda não existe é um passo a mais para escrever a mesma palavra.
   */
  const nova = async () => {
    if (criando) return;
    setCriando(true);
    const uid = await currentUserId(supabase);
    if (!uid) {
      setCriando(false);
      return notice.show(SESSION_EXPIRED);
    }
    const { data, error } = await supabase
      .from("notes")
      .insert({ user_id: uid, title: "", content: "", color: "blue" })
      .select("id")
      .maybeSingle();
    setCriando(false);
    if (notice.check(error, "criar a anotação")) return;
    if (!data) return notice.show(NADA_GRAVADO);
    router.push(`/anotacoes/${data.id}`);
  };

  const fixar = async (n: Note) => {
    setRows((r) =>
      r.map((x) => (x.id === n.id ? { ...x, pinned: !x.pinned } : x))
    );
    const { error } = await supabase
      .from("notes")
      .update({ pinned: !n.pinned })
      .eq("id", n.id);
    /* Recarrega só quando falhou, para desfazer — e também porque fixar muda a
       ordem, que a troca local não reordena. */
    if (notice.check(error, n.pinned ? "desafixar a nota" : "fixar a nota"))
      load();
    else setRows((r) => ordenar(r));
  };

  const remover = (n: Note) =>
    confirm.ask(`Excluir "${n.title || "esta anotação"}"?`, async () => {
      const { data: saiu, error } = await supabase
        .from("notes")
        .delete()
        .eq("id", n.id)
        .select("id");
      if (notice.check(error, "excluir a anotação")) return;
      if (!saiu?.length) return notice.show(NADA_GRAVADO);
      setRows((r) => r.filter((x) => x.id !== n.id));
    });

  const abrirEdicao = (n: Note) => {
    setEditando(n);
    setRascunho({ title: n.title, color: n.color });
    setMinhas(daNota.get(n.id) ?? []);
    setErroEdicao("");
  };

  const fecharEdicao = () => {
    setEditando(null);
    setErroEdicao("");
  };

  const alternarCategoria = (cid: string) =>
    setMinhas((v) =>
      v.includes(cid) ? v.filter((x) => x !== cid) : [...v, cid]
    );

  /**
   * Grava nome, cor e categorias de uma vez.
   *
   * As ligações são apagadas e reinseridas em vez de comparadas uma a uma: são
   * poucas por nota, e um `delete` seguido de `insert` não tem como deixar uma
   * sobra que a comparação erraria.
   *
   * `updated_at` só muda se o nome ou a cor mudaram. Trocar apenas a categoria
   * não é editar a nota, e mexer na data faria a lista reordenar como se o
   * texto tivesse sido escrito de novo.
   */
  const salvarEdicao = async () => {
    if (!editando) return;
    const title = rascunho.title.trim();
    setSalvando(true);
    setErroEdicao("");

    const uid = await currentUserId(supabase);
    if (!uid) {
      setSalvando(false);
      return setErroEdicao(SESSION_EXPIRED);
    }

    const mudouNota =
      title !== editando.title || rascunho.color !== editando.color;

    if (mudouNota) {
      const { data, error } = await supabase
        .from("notes")
        .update({
          title,
          color: rascunho.color,
          updated_at: new Date().toISOString(),
        })
        .eq("id", editando.id)
        .select("id")
        .maybeSingle();
      if (error || !data) {
        setSalvando(false);
        return setErroEdicao(error ? error.message : NADA_GRAVADO);
      }
    }

    const antes = daNota.get(editando.id) ?? [];
    const mudouCat =
      antes.length !== minhas.length || antes.some((c) => !minhas.includes(c));

    if (mudouCat) {
      await supabase
        .from("note_in_category")
        .delete()
        .eq("note_id", editando.id);
      if (minhas.length) {
        const { error } = await supabase.from("note_in_category").insert(
          minhas.map((category_id) => ({
            note_id: editando.id,
            category_id,
            user_id: uid,
          }))
        );
        if (error) {
          setSalvando(false);
          return setErroEdicao(
            `A nota foi salva, mas as categorias não: ${error.message}`
          );
        }
      }
    }

    setSalvando(false);
    /* Releitura completa: mudou a linha e as ligações, e refazer as duas à mão
       daria mais chance de divergir do banco do que a ida de rede economiza. */
    await load();
    fecharEdicao();
  };

  /** Categorias de cada nota, por id, para a lista não varrer as ligações. */
  const daNota = React.useMemo(() => {
    const m = new Map<string, string[]>();
    ligacoes.forEach((x) => {
      const atual = m.get(x.note_id);
      if (atual) atual.push(x.category_id);
      else m.set(x.note_id, [x.category_id]);
    });
    return m;
  }, [ligacoes]);

  const nomeDaCat = React.useMemo(() => {
    const m = new Map<string, string>();
    cats.forEach((c) => m.set(c.id, c.name));
    return m;
  }, [cats]);

  const usos = React.useMemo(() => {
    const m: Record<string, number> = {};
    ligacoes.forEach((x) => {
      m[x.category_id] = (m[x.category_id] ?? 0) + 1;
    });
    return m;
  }, [ligacoes]);

  const semCategoria = React.useMemo(
    () => rows.filter((n) => !(daNota.get(n.id) ?? []).length).length,
    [rows, daNota]
  );

  /**
   * O texto de cada anotação, sem marcação e em minúsculas, pronto para a
   * busca.
   *
   * Isto estava dentro do filtro, o que significava tirar o HTML de **todas**
   * as anotações a cada tecla digitada na busca — dez passadas de expressão
   * regular por anotação, por tecla. Medido numa anotação de 9,5 kB: 1,5 ms
   * para 20 anotações e 4,3 ms para 60, num computador. No telefone é
   * bastante mais, e some no meio da digitação.
   *
   * Agora acontece uma vez por lista carregada. A dependência é `rows`, que
   * só muda quando uma anotação é gravada, criada ou apagada — digitar na
   * busca não a toca.
   */
  const textoBuscavel = React.useMemo(() => {
    const m = new Map<string, string>();
    for (const n of rows)
      m.set(n.id, `${n.title} ${textoDaNota(n.content)}`.toLowerCase());
    return m;
  }, [rows]);

  /* Categoria e busca se somam: filtrar por "Estudo" e depois procurar uma
     palavra procura dentro do que a categoria deixou. */
  const vista = React.useMemo(() => {
    const term = q.trim().toLowerCase();
    return rows.filter((n) => {
      const minhas = daNota.get(n.id) ?? [];
      if (filtro === "sem" && minhas.length) return false;
      if (filtro !== "all" && filtro !== "sem" && !minhas.includes(filtro))
        return false;
      if (!term) return true;
      return (textoBuscavel.get(n.id) ?? "").includes(term);
    });
  }, [rows, q, filtro, daNota, textoBuscavel]);

  const fixadas = vista.filter((n) => n.pinned).length;

  if (loading) return null;

  const pilula = (ativa: boolean) =>
    cx(
      "h-8 shrink-0 rounded-full px-3 text-[11.5px] font-medium transition-colors",
      ativa
        ? "bg-brand-500 text-on-brand"
        : "bg-ink-800 text-fg-mute hover:text-fg-dim"
    );

  const linha = (n: Note) => (
    <li key={n.id} className="group flex items-center gap-2.5">
      <Link
        href={`/anotacoes/${n.id}`}
        className="flex min-w-0 flex-1 items-center gap-2.5 py-2.5"
      >
        <span
          className={cx(
            "grid h-8 w-8 shrink-0 place-items-center rounded-[10px]",
            COR_DO_ICONE[n.color] ?? COR_DO_ICONE.blue
          )}
        >
          <FileText size={15} />
        </span>
        <span className="min-w-0 flex-1">
          <span className="block truncate text-[13.5px] font-semibold">
            {n.title || "Sem título"}
          </span>
          <span className="mt-0.5 flex items-center gap-1.5 text-[10.5px] text-fg-mute">
            {n.pinned && (
              <>
                <Pin size={9} />
                fixada ·
              </>
            )}
            {dateTimeBR(n.updated_at)}
            {/* As categorias na mesma linha fraca da data: são rótulo, não
                conteúdo, e uma linha própria para elas faria a altura do
                índice crescer sem dizer mais. */}
            {(daNota.get(n.id) ?? []).slice(0, 2).map((cid) => (
              <span
                key={cid}
                className="inline-flex items-center gap-1 rounded-full bg-brand-500/12 px-1.5 py-0.5 text-[9.5px] font-medium text-brand-400"
              >
                {nomeDaCat.get(cid)}
              </span>
            ))}
            {(daNota.get(n.id) ?? []).length > 2 && (
              <span className="tnum">
                +{(daNota.get(n.id) ?? []).length - 2}
              </span>
            )}
          </span>
        </span>
      </Link>

      {/*
        Um ponto de entrada, com o nome de cada ação escrito.
        
        Eram três ícones cinzas de tamanho igual, e três ícones iguais não
        dizem qual é qual até você passar o mouse e ler o balãozinho. No
        telefone, sem hover, ficavam visíveis sempre e disputavam a largura com
        o nome da nota.
      */}
      <MenuSuspenso
        rotulo={`Ações de ${n.title || "anotação"}`}
        itens={[
          {
            rotulo: "Editar",
            icone: <Pencil size={14} />,
            aoEscolher: () => abrirEdicao(n),
          },
          {
            rotulo: n.pinned ? "Desafixar" : "Fixar no topo",
            icone: n.pinned ? <PinOff size={14} /> : <Pin size={14} />,
            aoEscolher: () => fixar(n),
          },
          {
            rotulo: "Excluir",
            icone: <Trash2 size={14} />,
            aoEscolher: () => remover(n),
            perigo: true,
          },
        ]}
      />
    </li>
  );

  return (
    <div className="space-y-5 rise">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Anotações</h1>
          <p className="mt-1 text-sm text-fg-mute">
            {rows.length === 0
              ? "Nenhuma anotação ainda"
              : `${rows.length} nota${rows.length === 1 ? "" : "s"}${
                  fixadas ? ` · ${fixadas} fixada${fixadas === 1 ? "" : "s"}` : ""
                }`}
          </p>
        </div>
        <div className="flex w-full items-center gap-2 sm:w-auto">
          <Button
            onClick={() => setGerindo(true)}
            className="shrink-0"
            title="Gerenciar categorias"
          >
            <Tag size={15} />
            <span className="hidden sm:inline">Categorias</span>
          </Button>
          <Button
            variant="primary"
            onClick={nova}
            disabled={criando}
            className="min-w-0 flex-1 sm:flex-none"
          >
            <Plus size={15} className="shrink-0" />
            <span className="truncate">{criando ? "Criando..." : "Nova"}</span>
          </Button>
        </div>
      </div>

      {/*
        A faixa de filtro só aparece quando há categoria para filtrar. Uma
        faixa com um botão "Todas" sozinho seria enfeite ocupando linha.
      */}
      {cats.length > 0 && (
        <div className="flex flex-wrap gap-1.5">
          <button
            type="button"
            onClick={() => setFiltro("all")}
            className={pilula(filtro === "all")}
          >
            Todas
            <span className="ml-1.5 opacity-60 tnum">{rows.length}</span>
          </button>
          {cats.map((c) => (
            <button
              key={c.id}
              type="button"
              onClick={() => setFiltro(c.id)}
              className={pilula(filtro === c.id)}
            >
              {c.name}
              <span className="ml-1.5 opacity-60 tnum">{usos[c.id] ?? 0}</span>
            </button>
          ))}
          {/* "Sem categoria" só quando existe alguma assim: é o filtro que
              serve para achar o que ficou de fora e arrumar. */}
          {semCategoria > 0 && (
            <button
              type="button"
              onClick={() => setFiltro("sem")}
              className={pilula(filtro === "sem")}
            >
              Sem categoria
              <span className="ml-1.5 opacity-60 tnum">{semCategoria}</span>
            </button>
          )}
        </div>
      )}

      {rows.length > 4 && (
        <div className="relative">
          <Search
            size={14}
            className="absolute left-3.5 top-1/2 -translate-y-1/2 text-fg-mute"
          />
          <Input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Buscar no título e no texto..."
            className="pl-9"
          />
        </div>
      )}

      {vista.length === 0 ? (
        <Card>
          <Empty
            icon={<StickyNote size={18} />}
            title={
              q
                ? "Nada encontrado"
                : filtro !== "all"
                  ? "Nada nesta categoria"
                  : "Nenhuma anotação"
            }
            sub={
              q
                ? "Nenhum título ou texto com esse termo."
                : filtro !== "all"
                  ? "Abra uma nota para pôr uma categoria nela."
                  : "Cada nota abre numa página. Dentro dela, digite / para inserir título, lista, tarefa ou caixa de destaque."
            }
            action={
              !q && filtro === "all" && (
                <Button variant="primary" size="sm" onClick={nova}>
                  <Plus size={14} />
                  Nova anotação
                </Button>
              )
            }
          />
        </Card>
      ) : (
        <Card className="px-4 sm:px-5">
          <ul className="divide-y divide-line-soft">{vista.map(linha)}</ul>
        </Card>
      )}

      {/* ------------------------- edição rápida ------------------------- */}
      <Modal
        open={!!editando}
        onClose={fecharEdicao}
        title="Editar anotação"
        sub="Nome, cor e categorias. O texto se edita abrindo a nota."
        footer={
          <>
            <Button onClick={fecharEdicao}>Cancelar</Button>
            <Button variant="primary" onClick={salvarEdicao} disabled={salvando}>
              {salvando ? "Salvando..." : "Salvar"}
            </Button>
          </>
        }
      >
        <div className="space-y-4">
          {erroEdicao && (
            <p className="rounded-[14px] bg-neg/10 px-3.5 py-3 text-xs text-neg">
              {erroEdicao}
            </p>
          )}

          <Field label="Nome">
            <Input
              autoFocus
              value={rascunho.title}
              onChange={(e) =>
                setRascunho({ ...rascunho, title: e.target.value })
              }
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  e.preventDefault();
                  salvarEdicao();
                }
              }}
              placeholder="Sem título"
            />
          </Field>

          {/* A cor é o que deixa reconhecer a nota de longe no índice, então
              aparece como as próprias bolinhas e não como uma lista de nomes. */}
          <Field label="Cor" hint="Aparece no ícone, na lista.">
            <div className="flex items-center gap-2">
              {NOTE_COLORS.map((c) => (
                <button
                  key={c}
                  type="button"
                  onClick={() => setRascunho({ ...rascunho, color: c })}
                  aria-label={`Cor ${c}`}
                  aria-pressed={rascunho.color === c}
                  className={cx(
                    "h-7 w-7 rounded-full transition-transform",
                    BOLINHA[c],
                    rascunho.color === c
                      ? "ring-2 ring-fg/25 ring-offset-2 ring-offset-white"
                      : "opacity-45 hover:opacity-90"
                  )}
                />
              ))}
            </div>
          </Field>

          <Field
            label="Categorias"
            hint="Pode marcar mais de uma. Crie novas no botão Categorias."
          >
            {cats.length === 0 ? (
              <p className="text-[11.5px] text-fg-mute">
                Nenhuma categoria ainda — feche e crie em <b>Categorias</b>.
              </p>
            ) : (
              <div className="flex flex-wrap gap-1.5">
                {cats.map((c) => {
                  const marcada = minhas.includes(c.id);
                  return (
                    <button
                      key={c.id}
                      type="button"
                      onClick={() => alternarCategoria(c.id)}
                      aria-pressed={marcada}
                      className={cx(
                        "h-8 rounded-full border px-3 text-[11.5px] font-medium transition-colors",
                        marcada
                          ? "border-brand-500 bg-brand-500/12 text-brand-400"
                          : "border-line bg-white text-fg-mute hover:border-brand-400"
                      )}
                    >
                      {c.name}
                    </button>
                  );
                })}
              </div>
            )}
          </Field>
        </div>
      </Modal>

      <GerenciarEtiquetas
        aberto={gerindo}
        onFechar={() => setGerindo(false)}
        supabase={supabase}
        tabela="note_categories"
        itens={cats}
        onMudou={load}
        usos={usos}
        icone={<Tag size={13} />}
        titulo="Categorias de anotação"
        sub="Renomear aqui muda em todas as notas de uma vez."
        rotuloNovo="Nova categoria"
        exemplo="Estudo, Prompt, Roteiro, Bíblia..."
        arquivoSql="CATEGORIAS-DE-NOTA.sql"
        contagem={(n) => `${n} nota${n === 1 ? "" : "s"}`}
        sugestoes={["Estudo", "Prompt", "Roteiro"]}
      />

      {confirm.node}
      {notice.node}
    </div>
  );
}

/** Fixadas em cima, e dentro de cada grupo a mais mexida primeiro. */
const ordenar = (r: Note[]) =>
  [...r].sort((a, b) =>
    a.pinned === b.pinned
      ? b.updated_at.localeCompare(a.updated_at)
      : a.pinned
        ? -1
        : 1
  );
