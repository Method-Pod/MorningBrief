"use client";

import * as React from "react";
import { Check, Pencil, Plus, Tag, Trash2, X } from "lucide-react";
import type { SupabaseClient } from "@supabase/supabase-js";
import { currentUserId, SESSION_EXPIRED } from "@/lib/session";
import { BILL_CATEGORIES, type BillCategory } from "@/lib/types";
import { Button, Input, Modal, cx } from "./ui";

/** A tabela vem de supabase/CATEGORIAS.sql. */
const TABELA = "bill_categories";
/** PGRST205: tabela inexistente — migração ainda não rodou. */
const SEM_TABELA = "PGRST205";

export type EstadoCategorias = {
  nomes: string[];
  disponivel: boolean;
  recarregar: () => Promise<void>;
};

/**
 * Categorias do usuário, com reserva.
 *
 * Se a migração não rodou, `disponivel` fica falso e a lista cai na semente
 * fixa: os formulários continuam funcionando e apenas a edição fica indisponível,
 * em vez de a página inteira quebrar por uma tabela que não existe.
 *
 * Na primeira visita com a tabela vazia, semeia a partir das categorias já
 * usadas nas contas da pessoa, e completa com a semente padrão — assim ninguém
 * começa com uma lista em branco nem perde categoria que já usava.
 */
export function useCategorias(supabase: SupabaseClient): EstadoCategorias {
  const [nomes, setNomes] = React.useState<string[]>(BILL_CATEGORIES);
  const [disponivel, setDisponivel] = React.useState(false);

  const recarregar = React.useCallback(async () => {
    const { data, error } = await supabase
      .from(TABELA)
      .select("name")
      .order("name");

    if (error) {
      if (error.code === SEM_TABELA) setDisponivel(false);
      return;
    }
    setDisponivel(true);

    if (data && data.length) {
      setNomes(data.map((c) => c.name as string));
      return;
    }

    // tabela vazia: semeia uma vez
    const uid = await currentUserId(supabase);
    if (!uid) return;
    const { data: contas } = await supabase.from("bills").select("category");
    const usadas = new Set<string>(
      ((contas as { category: string }[]) ?? []).map((b) => b.category)
    );
    BILL_CATEGORIES.forEach((c) => usadas.add(c));
    const lista = [...usadas].filter(Boolean).sort((a, b) => a.localeCompare(b, "pt-BR"));
    if (!lista.length) return;
    await supabase
      .from(TABELA)
      .insert(lista.map((name) => ({ user_id: uid, name })));
    setNomes(lista);
  }, [supabase]);

  React.useEffect(() => {
    recarregar();
  }, [recarregar]);

  return { nomes, disponivel, recarregar };
}

export function GerenciarCategorias({
  aberto,
  onFechar,
  supabase,
  estado,
  usoPorNome,
  onMudou,
}: {
  aberto: boolean;
  onFechar: () => void;
  supabase: SupabaseClient;
  estado: EstadoCategorias;
  /** Quantas contas usam cada categoria, para avisar antes de excluir. */
  usoPorNome: Record<string, number>;
  onMudou: () => void;
}) {
  const [nova, setNova] = React.useState("");
  const [editando, setEditando] = React.useState<string | null>(null);
  const [rascunho, setRascunho] = React.useState("");
  const [ocupado, setOcupado] = React.useState(false);
  const [erro, setErro] = React.useState("");

  React.useEffect(() => {
    if (!aberto) {
      setNova("");
      setEditando(null);
      setErro("");
    }
  }, [aberto]);

  const criar = async () => {
    const name = nova.trim().slice(0, 40);
    setErro("");
    if (!name) return;
    if (estado.nomes.some((n) => n.toLowerCase() === name.toLowerCase()))
      return setErro("Já existe uma categoria com esse nome.");

    setOcupado(true);
    const uid = await currentUserId(supabase);
    if (!uid) {
      setOcupado(false);
      return setErro(SESSION_EXPIRED);
    }
    const { error } = await supabase.from(TABELA).insert({ user_id: uid, name });
    setOcupado(false);
    if (error) {
      if (error.code === "23505") return setErro("Já existe uma categoria com esse nome.");
      return setErro(error.message);
    }
    setNova("");
    await estado.recarregar();
    onMudou();
  };

  /*
   * Renomear muda a categoria E as contas que a usam.
   *
   * Sem o segundo passo, as contas ficariam apontando para um nome que não
   * existe mais na lista, e sumiriam dos filtros e dos gráficos por categoria.
   */
  const renomear = async (antigo: string) => {
    const name = rascunho.trim().slice(0, 40);
    setErro("");
    if (!name || name === antigo) {
      setEditando(null);
      return;
    }
    if (estado.nomes.some((n) => n.toLowerCase() === name.toLowerCase()))
      return setErro("Já existe uma categoria com esse nome.");

    setOcupado(true);
    const { error } = await supabase
      .from(TABELA)
      .update({ name })
      .eq("name", antigo);
    if (error) {
      setOcupado(false);
      return setErro(error.message);
    }
    const { error: erroContas } = await supabase
      .from("bills")
      .update({ category: name })
      .eq("category", antigo);
    setOcupado(false);
    if (erroContas) return setErro(erroContas.message);

    setEditando(null);
    await estado.recarregar();
    onMudou();
  };

  /*
   * Excluir só o que não está em uso.
   *
   * A alternativa seria reatribuir as contas em silêncio para "Outros", o que
   * altera dado sem a pessoa pedir. Melhor recusar e dizer quantas contas
   * seguram a categoria.
   */
  const excluir = async (name: string) => {
    setErro("");
    const uso = usoPorNome[name] ?? 0;
    if (uso > 0)
      return setErro(
        `"${name}" está em ${uso} conta${uso > 1 ? "s" : ""}. Troque a categoria dessas contas antes de excluir.`
      );
    setOcupado(true);
    const { error } = await supabase.from(TABELA).delete().eq("name", name);
    setOcupado(false);
    if (error) return setErro(error.message);
    await estado.recarregar();
    onMudou();
  };

  return (
    <Modal
      open={aberto}
      onClose={onFechar}
      title="Categorias"
      sub="Usadas ao classificar suas contas."
      footer={<Button onClick={onFechar}>Fechar</Button>}
    >
      {!estado.disponivel ? (
        <p className="rounded-[14px] bg-warn/12 px-3.5 py-3 text-xs leading-relaxed font-medium text-warn">
          Para editar categorias, rode <code>supabase/CATEGORIAS.sql</code> no SQL
          Editor do Supabase. Até então a lista fixa continua valendo nos
          formulários.
        </p>
      ) : (
        <div className="flex flex-col gap-3.5">
          <div className="flex gap-2">
            <Input
              value={nova}
              maxLength={40}
              onChange={(e) => {
                setNova(e.target.value);
                setErro("");
              }}
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  e.preventDefault();
                  criar();
                }
              }}
              placeholder="Nova categoria"
              className="flex-1"
            />
            <Button
              variant="primary"
              onClick={criar}
              disabled={ocupado || !nova.trim()}
            >
              <Plus size={15} />
              Criar
            </Button>
          </div>

          <ul className="flex max-h-[46vh] flex-col overflow-y-auto">
            {estado.nomes.map((name) => {
              const uso = usoPorNome[name] ?? 0;
              const emEdicao = editando === name;
              return (
                <li
                  key={name}
                  className="group flex items-center gap-2 border-b border-line-soft py-2 last:border-0"
                >
                  {emEdicao ? (
                    <>
                      <Input
                        autoFocus
                        value={rascunho}
                        maxLength={40}
                        onChange={(e) => setRascunho(e.target.value)}
                        onKeyDown={(e) => {
                          if (e.key === "Enter") {
                            e.preventDefault();
                            renomear(name);
                          }
                          if (e.key === "Escape") setEditando(null);
                        }}
                        className="h-9 flex-1"
                      />
                      <button
                        onClick={() => renomear(name)}
                        disabled={ocupado}
                        aria-label="Confirmar"
                        className="grid h-8 w-8 place-items-center rounded-lg text-pos transition-colors hover:bg-pos/12"
                      >
                        <Check size={15} />
                      </button>
                      <button
                        onClick={() => setEditando(null)}
                        aria-label="Cancelar"
                        className="grid h-8 w-8 place-items-center rounded-lg text-fg-mute transition-colors hover:bg-ink-800"
                      >
                        <X size={15} />
                      </button>
                    </>
                  ) : (
                    <>
                      <Tag size={14} className="shrink-0 text-fg-mute" />
                      <span className="min-w-0 flex-1 truncate text-[13.5px] font-medium">
                        {name}
                      </span>
                      <span className="shrink-0 text-[11px] text-fg-mute tnum">
                        {uso > 0 ? `${uso} conta${uso > 1 ? "s" : ""}` : "sem uso"}
                      </span>
                      <div className="flex shrink-0 gap-0.5 transition-opacity lg:opacity-0 lg:group-hover:opacity-100 lg:focus-within:opacity-100">
                        <button
                          onClick={() => {
                            setEditando(name);
                            setRascunho(name);
                            setErro("");
                          }}
                          aria-label={`Renomear ${name}`}
                          className="grid h-8 w-8 place-items-center rounded-lg text-fg-mute transition-colors hover:bg-ink-800 hover:text-fg"
                        >
                          <Pencil size={14} />
                        </button>
                        <button
                          onClick={() => excluir(name)}
                          disabled={ocupado}
                          aria-label={`Excluir ${name}`}
                          className={cx(
                            "grid h-8 w-8 place-items-center rounded-lg transition-colors",
                            uso > 0
                              ? "text-fg-mute/40"
                              : "text-fg-mute hover:bg-neg/15 hover:text-neg"
                          )}
                        >
                          <Trash2 size={14} />
                        </button>
                      </div>
                    </>
                  )}
                </li>
              );
            })}
          </ul>

          <p className="text-[11.5px] text-fg-mute">
            Renomear atualiza as contas que usam a categoria. Só é possível
            excluir categoria sem uso.
          </p>
        </div>
      )}

      {erro && (
        <p className="mt-3 rounded-[14px] bg-neg/12 px-3.5 py-3 text-xs font-medium text-neg">
          {erro}
        </p>
      )}
    </Modal>
  );
}
