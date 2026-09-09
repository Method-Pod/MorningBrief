"use client";

import * as React from "react";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { ArrowLeft, Check, Loader2, Pin, PinOff, Tag, Trash2 } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { currentUserId, SESSION_EXPIRED } from "@/lib/session";
import { limparCache } from "@/lib/cachePagina";
import { NADA_GRAVADO, recadoDeErro } from "@/lib/erros";
import {
  NOTE_COLORS,
  type Note,
  type NoteCategory,
  type NoteInCategory,
} from "@/lib/types";
import { dateTimeBR } from "@/lib/format";
import { linkificar, paraEditor } from "@/lib/notas";
import { Editor } from "@/components/editor/Editor";
import { Button, Card, cx, useConfirm, useNotice } from "@/components/ui";

/**
 * Uma anotação, em página cheia.
 *
 * Rota própria em vez de um estado da lista: assim o voltar do navegador
 * funciona, o endereço da nota é um endereço, e recarregar no meio de escrever
 * cai de volta na mesma nota em vez de na lista.
 *
 * Salva sozinho. Não há botão de salvar de propósito — com salvamento
 * automático, um botão só cria a dúvida de se o que está na tela já foi ou não.
 * O que existe é o aviso de estado, que diz qual dos dois é o caso.
 */

const CORES: Record<string, string> = {
  blue: "bg-brand-500",
  violet: "bg-violet-500",
  emerald: "bg-pos",
  amber: "bg-warn",
  rose: "bg-neg",
  slate: "bg-ink-600",
};

type Estado = "lendo" | "limpo" | "pendente" | "gravando" | "erro";

export default function NotaPage() {
  const supabase = React.useMemo(() => createClient(), []);
  const router = useRouter();
  const params = useParams<{ id: string }>();
  const id = params?.id;

  const [nota, setNota] = React.useState<Note | null>(null);
  const [estado, setEstado] = React.useState<Estado>("lendo");
  const [falta, setFalta] = React.useState<string>("");
  const [titulo, setTitulo] = React.useState("");
  const [cats, setCats] = React.useState<NoteCategory[]>([]);
  /* As categorias desta nota. Local, e não derivado de uma lista global: esta
     tela conhece uma nota só. */
  const [minhas, setMinhas] = React.useState<string[]>([]);

  const confirm = useConfirm();
  const notice = useNotice();

  React.useEffect(() => {
    if (!id) return;
    let vivo = true;
    (async () => {
      const { data, error } = await supabase
        .from("notes")
        .select("*")
        .eq("id", id)
        .maybeSingle();
      if (!vivo) return;
      if (error) {
        setFalta(recadoDeErro(error)?.texto ?? error.message);
        setEstado("erro");
        return;
      }
      if (!data) {
        setFalta("Essa anotação não existe mais.");
        setEstado("erro");
        return;
      }
      const n = data as Note;
      setNota(n);
      setTitulo(n.title);
      setEstado("limpo");

      /* As categorias vêm depois da nota, e a falha delas é tolerada: sem
         CATEGORIAS-DE-NOTA.sql a faixa não aparece e escrever continua
         funcionando. */
      const [c, l] = await Promise.all([
        supabase.from("note_categories").select("*").order("name"),
        supabase.from("note_in_category").select("*").eq("note_id", id),
      ]);
      if (!vivo) return;
      setCats((c.data as NoteCategory[]) ?? []);
      setMinhas(
        ((l.data as NoteInCategory[]) ?? []).map((x) => x.category_id)
      );
    })();
    return () => {
      vivo = false;
    };
  }, [supabase, id]);

  /**
   * Grava um campo e cuida do aviso de estado.
   *
   * `select("id")` porque um update que não atinge linha nenhuma volta 204 sem
   * erro: a nota some do banco em outra aba e aqui a escrita seguiria parecendo
   * que deu certo, para sempre.
   */
  const gravar = React.useCallback(
    async (mudanca: Partial<Note>) => {
      if (!id) return;
      setEstado("gravando");
      const { data, error } = await supabase
        .from("notes")
        .update({ ...mudanca, updated_at: new Date().toISOString() })
        .eq("id", id)
        .select("id")
        .maybeSingle();
      if (error) {
        setEstado("erro");
        setFalta(recadoDeErro(error)?.texto ?? error.message);
        return;
      }
      if (!data) {
        setEstado("erro");
        setFalta(NADA_GRAVADO);
        return;
      }
      setEstado("limpo");
      setNota((n) => (n ? { ...n, ...mudanca } : n));
    },
    [supabase, id]
  );

  /* O título grava ao sair do campo e no Enter, não a cada tecla: é uma linha
     curta, e uma escrita por letra seria uma consulta por letra. */
  const gravarTitulo = () => {
    const t = titulo.trim();
    if (!nota || t === nota.title) return;
    gravar({ title: t });
  };

  const fixar = () => {
    if (!nota) return;
    gravar({ pinned: !nota.pinned });
  };

  /**
   * Marca ou desmarca uma categoria.
   *
   * Grava a ligação em vez de reescrever a nota: a nota em si não mudou, e
   * mexer em `updated_at` por causa de uma etiqueta faria a lista reordenar
   * como se o texto tivesse sido editado.
   *
   * Otimista, com desfazer no erro: é um clique numa pastilha, e esperar a ida
   * de rede para ela acender tornaria o gesto mais lento que o pensamento.
   */
  const alternarCategoria = async (cid: string) => {
    if (!id) return;
    const tinha = minhas.includes(cid);
    setMinhas((v) => (tinha ? v.filter((x) => x !== cid) : [...v, cid]));

    const uid = await currentUserId(supabase);
    if (!uid) {
      setMinhas((v) => (tinha ? [...v, cid] : v.filter((x) => x !== cid)));
      return notice.show(SESSION_EXPIRED);
    }

    const { error } = tinha
      ? await supabase
          .from("note_in_category")
          .delete()
          .eq("note_id", id)
          .eq("category_id", cid)
      : await supabase
          .from("note_in_category")
          .insert({ note_id: id, category_id: cid, user_id: uid });

    if (error) {
      setMinhas((v) => (tinha ? [...v, cid] : v.filter((x) => x !== cid)));
      /* Cache da lista invalidado: ela guarda as ligações e ficaria mostrando
         a pastilha que aqui não existe mais. */
      notice.check(error, tinha ? "tirar a categoria" : "pôr a categoria");
      return;
    }
    limparCache();
  };

  const trocarCor = (color: string) => {
    if (!nota || nota.color === color) return;
    gravar({ color });
  };

  const remover = () =>
    confirm.ask(
      `Excluir "${nota?.title || "esta anotação"}"? Não pode ser desfeito.`,
      async () => {
        const { data: saiu, error } = await supabase
          .from("notes")
          .delete()
          .eq("id", id)
          .select("id");
        if (notice.check(error, "excluir a anotação")) return;
        if (!saiu?.length) return notice.show(NADA_GRAVADO);
        router.push("/anotacoes");
      }
    );

  if (estado === "lendo") return null;

  if (!nota)
    return (
      <div className="rise">
        <Card className="flex flex-wrap items-center justify-between gap-3 px-5 py-4">
          <p className="min-w-0 flex-1 text-[12.5px] text-fg-dim">{falta}</p>
          <Button size="sm" onClick={() => router.push("/anotacoes")}>
            <ArrowLeft size={13} />
            Voltar
          </Button>
        </Card>
      </div>
    );

  return (
    <div className="rise mx-auto max-w-[820px]">
      <div className="mb-4 flex items-center justify-between gap-3">
        <Link
          href="/anotacoes"
          className="inline-flex h-8 items-center gap-1.5 rounded-lg px-2 text-[12px] font-semibold text-fg-mute transition-colors hover:bg-ink-800 hover:text-fg"
        >
          <ArrowLeft size={14} />
          Anotações
        </Link>

        <div className="flex items-center gap-1.5">
          <Aviso estado={estado} />

          {/* A cor da nota, encolhida a seis bolinhas. Serve para reconhecer a
              nota na lista, então mora perto do título e não num menu. */}
          <span className="flex items-center gap-1 rounded-full bg-ink-800 p-1">
            {NOTE_COLORS.map((c) => (
              <button
                key={c}
                type="button"
                onClick={() => trocarCor(c)}
                aria-label={`Cor ${c}`}
                aria-pressed={nota.color === c}
                className={cx(
                  "h-4 w-4 rounded-full transition-transform",
                  CORES[c],
                  nota.color === c
                    ? "ring-2 ring-fg/25 ring-offset-1 ring-offset-ink-800"
                    : "opacity-45 hover:opacity-90"
                )}
              />
            ))}
          </span>

          <button
            type="button"
            onClick={fixar}
            aria-label={nota.pinned ? "Desafixar" : "Fixar"}
            title={nota.pinned ? "Desafixar" : "Fixar no topo da lista"}
            className={cx(
              "grid h-8 w-8 place-items-center rounded-lg transition-colors",
              nota.pinned
                ? "bg-brand-500/15 text-brand-400"
                : "text-fg-mute hover:bg-ink-800 hover:text-fg"
            )}
          >
            {nota.pinned ? <PinOff size={14} /> : <Pin size={14} />}
          </button>
          <button
            type="button"
            onClick={remover}
            aria-label="Excluir anotação"
            className="grid h-8 w-8 place-items-center rounded-lg text-fg-mute transition-colors hover:bg-neg/15 hover:text-neg"
          >
            <Trash2 size={14} />
          </button>
        </div>
      </div>

      {estado === "erro" && falta && (
        <p className="mb-4 rounded-[14px] bg-neg/10 px-3.5 py-3 text-xs text-neg">
          {falta}
        </p>
      )}

      {/*
        O título é um campo de texto sem moldura, do tamanho de um título.

        Igual ao Notion e ao Docs: a primeira linha da página é o nome dela, e
        não um campo de formulário em outro lugar. `textarea` e não `input`
        porque título comprido precisa quebrar em duas linhas em vez de rolar
        para o lado.
      */}
      <textarea
        value={titulo}
        onChange={(e) => setTitulo(e.target.value)}
        onBlur={gravarTitulo}
        onKeyDown={(e) => {
          if (e.key === "Enter") {
            e.preventDefault();
            (e.target as HTMLTextAreaElement).blur();
          }
        }}
        rows={1}
        placeholder="Sem título"
        aria-label="Título da anotação"
        className="mb-1 w-full resize-none border-0 bg-transparent p-0 text-[30px] font-bold leading-tight tracking-[-0.03em] text-fg outline-none placeholder:text-fg-mute/40 field-sizing-content"
      />

      <div className="mb-6 flex flex-wrap items-center gap-x-2 gap-y-1.5">
        <p className="text-[11px] text-fg-mute">
          Editada em {dateTimeBR(nota.updated_at)}
        </p>

        {/*
          As categorias logo abaixo do título, e não num menu.
          
          É onde a pessoa está olhando quando acaba de nomear a nota, e é o
          momento em que ela sabe do que a nota é. Escondê-las num painel
          faria a categoria ficar vazia na maioria das notas — e um filtro que
          ninguém preenche não filtra nada.
        */}
        {cats.length > 0 && (
          <div className="flex flex-wrap items-center gap-1">
            <Tag size={11} className="shrink-0 text-fg-mute" />
            {cats.map((c) => {
              const marcada = minhas.includes(c.id);
              return (
                <button
                  key={c.id}
                  type="button"
                  onClick={() => alternarCategoria(c.id)}
                  aria-pressed={marcada}
                  className={cx(
                    "h-6 rounded-full border px-2 text-[10.5px] font-medium transition-colors",
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
      </div>

      {/* `pl-7` abre a calha onde a alça de arrastar aparece, à esquerda do
          texto — sem isso ela ficaria por cima da primeira letra. */}
      <div className="pl-7">
        <Editor
          /*
           * `linkificar` na entrada, e não uma vez no banco.
           *
           * As notas antigas eram texto puro, então os endereços dentro delas
           * nunca foram links — o `autolink` do editor só marca o que se
           * digita. Passar aqui faz o que já existe virar clicável sem
           * migração e sem tocar em nada até você editar: o texto curto só é
           * gravado na primeira mudança que você fizer na nota.
           */
          html={linkificar(paraEditor(nota.content))}
          onMudar={(content) => gravar({ content })}
          onGravando={(pendente) =>
            setEstado((e) => (pendente && e !== "gravando" ? "pendente" : e))
          }
        />
      </div>

      {confirm.node}
      {notice.node}
    </div>
  );
}

/** Diz se o que está na tela já foi para o banco. Ver o comentário do topo. */
function Aviso({ estado }: { estado: Estado }) {
  if (estado === "gravando")
    return (
      <span className="mr-1 inline-flex items-center gap-1.5 text-[10.5px] text-fg-mute">
        <Loader2 size={11} className="animate-spin" />
        salvando
      </span>
    );
  if (estado === "pendente")
    return (
      <span className="mr-1 inline-flex items-center gap-1.5 text-[10.5px] text-fg-mute">
        <span className="h-1.5 w-1.5 rounded-full bg-warn" />
        não salvo
      </span>
    );
  if (estado === "limpo")
    return (
      <span className="mr-1 inline-flex items-center gap-1.5 text-[10.5px] text-fg-mute">
        <Check size={11} className="text-pos" />
        salvo
      </span>
    );
  return null;
}
