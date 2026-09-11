"use client";

import * as React from "react";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { ArrowLeft, Check, Loader2, Pin, PinOff, Trash2 } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { NADA_GRAVADO, recadoDeErro } from "@/lib/erros";
import type { Note } from "@/lib/types";
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
  /* Onde a barra de formatação do editor é desenhada. Ver o comentário no
     `<div ref={setLugarDaBarra} />`, lá embaixo. */
  const [lugarDaBarra, setLugarDaBarra] = React.useState<HTMLDivElement | null>(
    null
  );

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
        O lugar da barra de formatação, acima do título.

        Um div vazio, e não a barra em si: a barra precisa do estado do editor
        para acender o negrito e dizer em que bloco o cursor está, e esse
        estado vive lá dentro. A página empresta o lugar e o editor desenha
        nele por portal — assim a ordem na tela é a que se quer (barra, depois
        título) sem subir o editor inteiro para cá.

        `ref` em estado, e não `useRef`: o portal só pode ser criado depois de
        o elemento existir, e um `useRef` não avisa ninguém quando ele passa a
        existir. Com estado, a montagem dispara o redesenho que cria o portal.
      */}
      <div ref={setLugarDaBarra} />

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

      {/*
        Só a data aqui.
        
        Cor e categoria saíram para a edição rápida da lista: são decisões de
        organização, e vêm à cabeça olhando o índice — "essa é de estudo",
        "essa devia ser verde" —, não no meio de escrever. Dentro da nota elas
        eram seis bolinhas e N pastilhas competindo com o título pela atenção.
      */}
      <p className="mb-6 text-[11px] text-fg-mute">
        Editada em {dateTimeBR(nota.updated_at)}
      </p>

      {/*
        O corpo começa na mesma coluna do título, sem recuo.

        Havia um `pl-7` aqui para abrir calha à alça de arrastar. O preço era
        o texto inteiro da nota deslocado 28px à direita do título, e é isso
        que se vê antes de se ver a calha: uma margem que não tem motivo
        aparente. A alça passou a morar na margem da página — no computador
        sobra espaço dos dois lados da coluna de 820px, e no telefone ela não
        aparece de todo jeito, porque não existe passar o mouse.

        Recuo no corpo agora só quando o texto pede: lista, citação e caixa
        de destaque trazem o seu, e aí ele quer dizer alguma coisa.
      */}
      <div>
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
          barraEm={lugarDaBarra}
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
