"use client";

import * as React from "react";
import { createPortal } from "react-dom";
import { useRouter } from "next/navigation";
import {
  BookOpen,
  GraduationCap,
  Image as ImagemIcone,
  ListChecks,
  Search,
  Wallet,
  FileText,
} from "lucide-react";

import { createClient } from "@/lib/supabase/client";
import { cx } from "./ui";

/**
 * Busca em tudo, de qualquer tela, com Ctrl+K.
 *
 * O app tem dez telas e cada uma tem a própria caixa de busca — o que quer
 * dizer que, para achar alguma coisa, é preciso saber antes onde ela está.
 * Procurar "Derrite" exigia abrir Demandas, esperar carregar, buscar; não
 * achou, abrir Anotações, esperar, buscar de novo. E não havia nenhum atalho
 * de teclado no app inteiro.
 *
 * Aqui é uma pergunta só, para as seis tabelas que guardam coisa com nome.
 * Num sistema que se usa todo dia, o custo de três cliques e duas esperas é
 * pago dezenas de vezes por dia.
 *
 * Tudo local: as tabelas já têm índice por usuário e o RLS já limita cada
 * consulta ao dono. Nenhum serviço novo, nenhuma tabela nova.
 */

/** Espera antes de consultar, para não disparar seis consultas por tecla. */
const ESPERA_MS = 220;
/** Por tabela. Mais que isso vira rolagem, e aí a busca deixou de responder. */
const POR_TIPO = 4;
/** Abaixo disto quase tudo casa, e a lista não ajuda a decidir. */
const MINIMO = 2;

/** "20 de set." — curto, porque divide a linha com o nome. */
function dataCurta(iso: string) {
  const [a, m, d] = iso.slice(0, 10).split("-").map(Number);
  return new Date(a, m - 1, d).toLocaleDateString("pt-BR", {
    day: "numeric",
    month: "short",
  });
}

type Achado = {
  id: string;
  titulo: string;
  detalhe?: string | null;
  onde: string;
  destino: string;
  icone: React.ReactNode;
};

export function BuscaGlobal() {
  const router = useRouter();
  const supabase = React.useMemo(() => createClient(), []);

  const [aberto, setAberto] = React.useState(false);
  const [montado, setMontado] = React.useState(false);
  const [termo, setTermo] = React.useState("");
  const [achados, setAchados] = React.useState<Achado[]>([]);
  const [buscando, setBuscando] = React.useState(false);
  const [ativo, setAtivo] = React.useState(0);
  const campo = React.useRef<HTMLInputElement>(null);

  React.useEffect(() => setMontado(true), []);

  /* Ctrl+K em qualquer lugar, e Esc para sair. */
  React.useEffect(() => {
    const aoTeclar = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        setAberto((v) => !v);
      }
    };
    /* O botão de lupa da barra do telefone avisa por aqui: no toque não há
       Ctrl+K, e sem isto a busca global só existiria no computador. */
    const aoPedir = () => setAberto(true);
    window.addEventListener("keydown", aoTeclar);
    window.addEventListener("mb:buscar", aoPedir);
    return () => {
      window.removeEventListener("keydown", aoTeclar);
      window.removeEventListener("mb:buscar", aoPedir);
    };
  }, []);

  /* Ao abrir: foco no campo e trava da rolagem de fundo. */
  React.useEffect(() => {
    if (!aberto) return;
    campo.current?.focus();
    const antes = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = antes;
    };
  }, [aberto]);

  /* Fechar limpa: reabrir com o resultado velho na tela seria mentira. */
  React.useEffect(() => {
    if (aberto) return;
    setTermo("");
    setAchados([]);
    setAtivo(0);
  }, [aberto]);

  React.useEffect(() => {
    const t = termo.trim();
    if (t.length < MINIMO) {
      setAchados([]);
      setBuscando(false);
      return;
    }
    setBuscando(true);

    /*
     * `vivo` cancela o resultado de uma consulta que voltou tarde.
     *
     * Digitando rápido, várias consultas ficam no ar ao mesmo tempo e elas não
     * voltam na ordem em que saíram. Sem esta trava, a resposta de "der" podia
     * chegar depois da de "derrite" e sobrescrever a lista certa pela antiga.
     */
    let vivo = true;
    const id = setTimeout(async () => {
      const like = `%${t}%`;
      const [tarefas, notas, contas, refs, livros, aulas] = await Promise.all([
        supabase
          .from("tasks")
          .select("id,title,client,status")
          .or(`title.ilike.${like},client.ilike.${like}`)
          .limit(POR_TIPO),
        supabase.from("notes").select("id,title").ilike("title", like).limit(POR_TIPO),
        supabase
          .from("bills")
          .select("id,description,due_date")
          .ilike("description", like)
          .limit(POR_TIPO),
        supabase.from("referencias").select("id,name").ilike("name", like).limit(POR_TIPO),
        supabase
          .from("books")
          .select("id,title,authors")
          .ilike("title", like)
          .limit(POR_TIPO),
        supabase.from("lessons").select("id,title").ilike("title", like).limit(POR_TIPO),
      ]);
      if (!vivo) return;

      /* `?q=` leva o termo junto: a tela abre já filtrada, em vez de largar a
         pessoa numa lista cheia para procurar de novo o que ela já digitou. */
      const q = encodeURIComponent(t);
      const lista: Achado[] = [
        ...((tarefas.data as { id: string; title: string; client: string }[]) ?? []).map(
          (r) => ({
            id: `t${r.id}`,
            titulo: r.title,
            detalhe: r.client || null,
            onde: "Demanda",
            destino: `/demandas?q=${q}`,
            icone: <ListChecks size={15} />,
          })
        ),
        ...((notas.data as { id: string; title: string }[]) ?? []).map((r) => ({
          id: `n${r.id}`,
          titulo: r.title,
          onde: "Anotação",
          /* Nota tem endereço próprio: abre direto, sem passar pela lista. */
          destino: `/anotacoes/${r.id}`,
          icone: <FileText size={15} />,
        })),
        ...(
          (contas.data as { id: string; description: string; due_date: string }[]) ?? []
        ).map((r) => ({
          id: `c${r.id}`,
          titulo: r.description,
          /*
           * A data é o que distingue uma conta da outra.
           *
           * Conta se repete todo mês, então buscar "internet" devolvia quatro
           * linhas escritas igual, sem nada para escolher entre elas. O nome
           * sozinho não identifica a linha; o vencimento identifica.
           */
          detalhe: r.due_date ? `vence ${dataCurta(r.due_date)}` : null,
          onde: "Conta",
          destino: `/contas?q=${q}`,
          icone: <Wallet size={15} />,
        })),
        ...((refs.data as { id: string; name: string }[]) ?? []).map((r) => ({
          id: `r${r.id}`,
          titulo: r.name,
          onde: "Referência",
          /* Referências e Aulas não têm busca por texto: mandar `?q=` para
             elas seria parâmetro que ninguém lê. */
          destino: "/referencias",
          icone: <ImagemIcone size={15} />,
        })),
        ...((livros.data as { id: string; title: string; authors: string | null }[]) ?? []).map(
          (r) => ({
            id: `l${r.id}`,
            titulo: r.title,
            detalhe: r.authors,
            onde: "Livro",
            destino: `/leitura?q=${q}`,
            icone: <BookOpen size={15} />,
          })
        ),
        ...((aulas.data as { id: string; title: string }[]) ?? []).map((r) => ({
          id: `a${r.id}`,
          titulo: r.title,
          onde: "Aula",
          destino: "/aulas",
          icone: <GraduationCap size={15} />,
        })),
      ];
      setAchados(lista);
      setAtivo(0);
      setBuscando(false);
    }, ESPERA_MS);

    return () => {
      vivo = false;
      clearTimeout(id);
    };
  }, [termo, supabase]);

  const abrir = React.useCallback(
    (a: Achado) => {
      setAberto(false);
      router.push(a.destino);
    },
    [router]
  );

  const aoTeclarNoCampo = (e: React.KeyboardEvent) => {
    if (e.key === "Escape") return setAberto(false);
    if (!achados.length) return;
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setAtivo((i) => (i + 1) % achados.length);
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setAtivo((i) => (i - 1 + achados.length) % achados.length);
    } else if (e.key === "Enter") {
      e.preventDefault();
      abrir(achados[ativo]);
    }
  };

  if (!montado || !aberto) return null;

  return createPortal(
    <div className="fixed inset-0 z-[80] flex items-start justify-center px-4 pt-[12vh]">
      <div className="absolute inset-0 bg-fg/35 fade" onClick={() => setAberto(false)} />
      <div
        role="dialog"
        aria-label="Buscar em tudo"
        className="pop relative w-full max-w-[560px] overflow-hidden rounded-[18px] bg-white shadow-[var(--elev-4)]"
      >
        <div className="flex items-center gap-2.5 border-b border-line-soft px-4">
          <Search size={16} className="shrink-0 text-fg-mute" />
          <input
            ref={campo}
            value={termo}
            onChange={(e) => setTermo(e.target.value)}
            onKeyDown={aoTeclarNoCampo}
            placeholder="Buscar demanda, anotação, conta, referência…"
            className="h-12 w-full bg-transparent text-[14.5px] text-fg outline-none placeholder:text-fg-mute"
          />
          <kbd className="hidden shrink-0 rounded border border-line px-1.5 py-0.5 text-[10px] text-fg-mute sm:block">
            esc
          </kbd>
        </div>

        <div className="max-h-[52vh] overflow-y-auto overscroll-contain p-1.5">
          {termo.trim().length < MINIMO ? (
            <p className="px-3 py-6 text-center text-[12.5px] text-fg-mute">
              Digite ao menos {MINIMO} letras.
            </p>
          ) : buscando ? (
            <p className="px-3 py-6 text-center text-[12.5px] text-fg-mute">Procurando…</p>
          ) : achados.length === 0 ? (
            <p className="px-3 py-6 text-center text-[12.5px] text-fg-mute">
              Nada com “{termo.trim()}”.
            </p>
          ) : (
            achados.map((a, i) => (
              <button
                key={a.id}
                onClick={() => abrir(a)}
                onMouseEnter={() => setAtivo(i)}
                className={cx(
                  "flex w-full items-center gap-3 rounded-[12px] px-3 py-2.5 text-left transition-colors",
                  i === ativo ? "bg-brand-500/12" : "hover:bg-ink-800"
                )}
              >
                <span className="shrink-0 text-fg-mute">{a.icone}</span>
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-[13.5px] font-medium text-fg">
                    {a.titulo}
                  </span>
                  {a.detalhe && (
                    <span className="block truncate text-[11.5px] text-fg-mute">
                      {a.detalhe}
                    </span>
                  )}
                </span>
                <span className="shrink-0 text-[10.5px] font-semibold uppercase tracking-wider text-fg-mute">
                  {a.onde}
                </span>
              </button>
            ))
          )}
        </div>
      </div>
    </div>,
    document.body
  );
}
