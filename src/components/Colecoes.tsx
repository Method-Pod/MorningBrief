"use client";

import * as React from "react";
import { FolderOpen, Plus, Trash2 } from "lucide-react";
import type { SupabaseClient } from "@supabase/supabase-js";
import { currentUserId, SESSION_EXPIRED } from "@/lib/session";
import type { Colecao } from "@/lib/types";
import { NADA_GRAVADO } from "@/lib/erros";
import { Button, Empty, Field, Input, Modal, cx } from "./ui";

/**
 * Coleções de referência: criar, renomear, apagar.
 *
 * Coleção virou tabela pelo mesmo motivo da etiqueta de assunto: como texto
 * solto no link, renomear "Landing" para "Landing page" exigiria varrer todas
 * as referências, e "Landing", "landing" e "Landing page" viveriam como três
 * coleções diferentes. Aqui o nome mora num lugar só.
 *
 * Apagar a coleção não apaga os links dela — a ligação é `on delete cascade`
 * só na linha da ligação, então os links ficam e apenas saem daquela coleção.
 */

const repetido = (e: { code?: string; message: string }) =>
  e.code === "23505" || /duplicate|unique/i.test(e.message);

/**
 * Coleções sugeridas para a tela vazia.
 *
 * Não são criadas sozinhas: o banco fica como você deixou, e um toque cria a
 * que interessa. São as três que você descreveu — o site onde se procura, e os
 * dois tipos de exemplo que se guarda.
 */
export const SUGESTOES = ["Sites de busca", "Landing page", "Dashboard"];

export function GerenciarColecoes({
  aberto,
  onFechar,
  supabase,
  colecoes,
  onMudou,
  /** Quantos links usam cada coleção, para avisar antes de apagar. */
  usos,
}: {
  aberto: boolean;
  onFechar: () => void;
  supabase: SupabaseClient;
  colecoes: Colecao[];
  onMudou: () => void;
  usos: Record<string, number>;
}) {
  const [novo, setNovo] = React.useState("");
  const [nomes, setNomes] = React.useState<Record<string, string>>({});
  const [erro, setErro] = React.useState("");
  const [ocupado, setOcupado] = React.useState(false);

  const criar = async (nome?: string) => {
    const name = (nome ?? novo).trim();
    if (!name) return;
    setErro("");
    setOcupado(true);
    const uid = await currentUserId(supabase);
    if (!uid) {
      setOcupado(false);
      return setErro(SESSION_EXPIRED);
    }
    const { error } = await supabase
      .from("colecoes")
      .insert({ user_id: uid, name });
    setOcupado(false);
    if (error)
      return setErro(
        repetido(error)
          ? `"${name}" já existe.`
          : /find the table|does not exist/i.test(error.message)
            ? "As referências precisam de supabase/REFERENCIAS.sql no banco. Rode o arquivo e recarregue."
            : error.message
      );
    if (!nome) setNovo("");
    onMudou();
  };

  /** Grava ao sair do campo, não a cada tecla: renomear é escrita no banco. */
  const renomear = async (c: Colecao) => {
    const name = (nomes[c.id] ?? c.name).trim();
    if (!name || name === c.name) {
      setNomes((n) => ({ ...n, [c.id]: c.name }));
      return;
    }
    setErro("");
    /* `select("id")` porque aqui o silêncio mente duas vezes: o campo já mostra
       o nome novo, e sem a linha de volta um update que não achou nada passaria
       por sucesso. */
    const { data: salvo, error } = await supabase
      .from("colecoes")
      .update({ name })
      .eq("id", c.id)
      .select("id");
    if (error || !salvo?.length) {
      setNomes((n) => ({ ...n, [c.id]: c.name }));
      return setErro(
        !error
          ? NADA_GRAVADO
          : repetido(error)
            ? `"${name}" já existe.`
            : error.message
      );
    }
    onMudou();
  };

  const apagar = async (c: Colecao) => {
    setErro("");
    const { data: saiu, error } = await supabase
      .from("colecoes")
      .delete()
      .eq("id", c.id)
      .select("id");
    if (error) return setErro(error.message);
    if (!saiu?.length) return setErro(NADA_GRAVADO);
    onMudou();
  };

  const faltando = SUGESTOES.filter(
    (s) => !colecoes.some((c) => c.name.toLowerCase() === s.toLowerCase())
  );

  return (
    <Modal
      open={aberto}
      onClose={onFechar}
      title="Coleções"
      sub="Renomear aqui muda em todas as referências de uma vez."
      footer={
        <Button variant="primary" onClick={onFechar}>
          Fechar
        </Button>
      }
    >
      <div className="space-y-4">
        {erro && (
          <p className="rounded-[14px] bg-neg/10 px-3.5 py-3 text-xs text-neg">
            {erro}
          </p>
        )}

        <Field label="Nova coleção">
          <div className="flex gap-2">
            <Input
              value={novo}
              onChange={(e) => {
                setNovo(e.target.value);
                setErro("");
              }}
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  e.preventDefault();
                  criar();
                }
              }}
              placeholder="Landing page, Dashboard, Sites de busca..."
              className="flex-1"
            />
            <Button
              variant="primary"
              onClick={() => criar()}
              disabled={ocupado || !novo.trim()}
            >
              <Plus size={15} />
              Criar
            </Button>
          </div>
        </Field>

        {faltando.length > 0 && (
          <div className="flex flex-wrap items-center gap-1.5">
            <span className="text-[10.5px] text-fg-mute">Sugestões:</span>
            {faltando.map((s) => (
              <button
                key={s}
                type="button"
                onClick={() => criar(s)}
                disabled={ocupado}
                className="h-6 rounded-full border border-line bg-white px-2.5 text-[10.5px] font-semibold text-brand-400 transition-colors hover:border-brand-400 hover:bg-brand-500/8 disabled:opacity-50"
              >
                + {s}
              </button>
            ))}
          </div>
        )}

        {colecoes.length === 0 ? (
          <Empty
            icon={<FolderOpen size={18} />}
            title="Nenhuma coleção"
            sub="Crie a primeira acima. Depois ela aparece como filtro na parede de referências."
          />
        ) : (
          <ul className="divide-y divide-line-soft">
            {colecoes.map((c) => {
              const emUso = usos[c.id] ?? 0;
              return (
                <li key={c.id} className="flex items-center gap-2 py-2">
                  <FolderOpen size={13} className="shrink-0 text-fg-mute" />
                  <Input
                    value={nomes[c.id] ?? c.name}
                    onChange={(e) =>
                      setNomes((n) => ({ ...n, [c.id]: e.target.value }))
                    }
                    onBlur={() => renomear(c)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter") {
                        e.preventDefault();
                        (e.target as HTMLInputElement).blur();
                      }
                      /* Escape desfaz, em vez de guardar meia edição. */
                      if (e.key === "Escape")
                        setNomes((n) => ({ ...n, [c.id]: c.name }));
                    }}
                    className="h-9 flex-1 text-[12.5px]"
                  />
                  <span className="w-[74px] shrink-0 text-right text-[10.5px] text-fg-mute tnum">
                    {emUso ? `${emUso} link${emUso === 1 ? "" : "s"}` : "vazia"}
                  </span>
                  {/* Apagar coleção não apaga link nenhum: só desfaz a ligação.
                      O rótulo diz isso para o clique não parecer mais
                      destrutivo do que é. */}
                  <button
                    type="button"
                    onClick={() => apagar(c)}
                    aria-label={`Apagar a coleção ${c.name}`}
                    title={
                      emUso
                        ? `${emUso} link sai da coleção, nenhum é apagado`
                        : "Apagar coleção"
                    }
                    className="grid h-8 w-8 shrink-0 place-items-center rounded-lg text-fg-mute transition-colors hover:bg-neg/15 hover:text-neg"
                  >
                    <Trash2 size={14} />
                  </button>
                </li>
              );
            })}
          </ul>
        )}
      </div>
    </Modal>
  );
}

/* ------------------------------ pastilha ------------------------------ */

/** A coleção na tela, na cor do tema. */
export function Pastilha({
  nome,
  className,
}: {
  nome: string | null | undefined;
  className?: string;
}) {
  if (!nome) return null;
  return (
    <span
      className={cx(
        "inline-flex items-center gap-1 rounded-full bg-brand-500/12 px-2 py-0.5 text-[10px] font-medium text-brand-400",
        className
      )}
    >
      <FolderOpen size={9} />
      {nome}
    </span>
  );
}
