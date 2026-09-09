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
  StickyNote,
  Trash2,
} from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { temCache, useEstadoCacheado } from "@/lib/cachePagina";
import { currentUserId, SESSION_EXPIRED } from "@/lib/session";
import { NADA_GRAVADO } from "@/lib/erros";
import type { Note } from "@/lib/types";
import { dateTimeBR } from "@/lib/format";
import { textoDaNota } from "@/lib/notas";
import {
  Button,
  Card,
  Empty,
  Input,
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
  /* Já visitou nesta sessão? Abre com conteúdo e atualiza atrás. */
  const [loading, setLoading] = React.useState(() => !temCache("notes"));
  const [q, setQ] = React.useState("");
  const [criando, setCriando] = React.useState(false);

  const confirm = useConfirm();
  const notice = useNotice();

  const load = React.useCallback(async () => {
    const { data, error } = await supabase
      .from("notes")
      .select("*")
      .order("pinned", { ascending: false })
      .order("updated_at", { ascending: false });
    if (!error) setRows((data as Note[]) ?? []);
    setLoading(false);
  }, [supabase, setRows]);

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

  /* A busca olha o texto por trás do HTML: procurar "div" achava toda nota que
     tivesse uma, agora que o conteúdo é marcado. */
  const vista = React.useMemo(() => {
    const term = q.trim().toLowerCase();
    if (!term) return rows;
    return rows.filter(
      (n) =>
        n.title.toLowerCase().includes(term) ||
        textoDaNota(n.content).toLowerCase().includes(term)
    );
  }, [rows, q]);

  const fixadas = vista.filter((n) => n.pinned).length;

  if (loading) return null;

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
          </span>
        </span>
      </Link>

      <span className="flex shrink-0 items-center gap-0.5 transition-opacity lg:opacity-0 lg:group-hover:opacity-100 lg:focus-within:opacity-100">
        <button
          type="button"
          onClick={() => fixar(n)}
          aria-label={n.pinned ? `Desafixar ${n.title}` : `Fixar ${n.title}`}
          className="grid h-8 w-8 place-items-center rounded-lg text-fg-mute transition-colors hover:bg-ink-800 hover:text-brand-400"
        >
          {n.pinned ? <PinOff size={14} /> : <Pin size={14} />}
        </button>
        <button
          type="button"
          onClick={() => remover(n)}
          aria-label={`Excluir ${n.title}`}
          className="grid h-8 w-8 place-items-center rounded-lg text-fg-mute transition-colors hover:bg-neg/15 hover:text-neg"
        >
          <Trash2 size={14} />
        </button>
      </span>
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
        <Button
          variant="primary"
          onClick={nova}
          disabled={criando}
          className="w-full sm:w-auto"
        >
          <Plus size={15} />
          {criando ? "Criando..." : "Nova"}
        </Button>
      </div>

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
            title={q ? "Nada encontrado" : "Nenhuma anotação"}
            sub={
              q
                ? "Nenhum título ou texto com esse termo."
                : "Cada nota abre numa página. Dentro dela, digite / para inserir título, lista, tarefa ou caixa de destaque."
            }
            action={
              !q && (
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
