"use client";

import * as React from "react";
import { Plus, Trash2 } from "lucide-react";
import type { SupabaseClient } from "@supabase/supabase-js";
import { currentUserId, SESSION_EXPIRED } from "@/lib/session";
import { NADA_GRAVADO } from "@/lib/erros";
import { Button, Empty, Field, Input, Modal } from "./ui";

/**
 * Criar, renomear e apagar etiqueta — de qualquer tipo.
 *
 * O app tem três eixos de organização, e cada um nasceu com o seu próprio
 * gerenciador quase igual aos outros: assuntos (aulas e canais), coleções
 * (referências) e categorias (anotações). Três cópias do mesmo formulário
 * significam três lugares para consertar o mesmo defeito, e foi assim que a
 * verificação de "nada foi gravado" precisou ser escrita duas vezes.
 *
 * Este é o genérico. `components/Assuntos` e `components/Colecoes` continuam
 * com as próprias cópias por enquanto — trocá-las agora mexeria em duas telas
 * que funcionam, e isso é uma limpeza para fazer sozinha, não de carona.
 */

export type Etiqueta = { id: string; name: string };

const repetido = (e: { code?: string; message: string }) =>
  e.code === "23505" || /duplicate|unique/i.test(e.message);

const semTabela = (m: string) => /find the table|does not exist/i.test(m);

export function GerenciarEtiquetas({
  aberto,
  onFechar,
  supabase,
  /** Nome da tabela das etiquetas, ex. "note_categories". */
  tabela,
  itens,
  onMudou,
  /** Quantos itens usam cada etiqueta, para avisar antes de apagar. */
  usos,
  /** Ícone que aparece na linha e no vazio. */
  icone,
  titulo,
  sub,
  rotuloNovo,
  exemplo,
  /** O que rodar quando a tabela não existe. */
  arquivoSql,
  /** "3 notas" / "3 links" — o que a etiqueta está marcando. */
  contagem,
  /** Sugestões para criar num toque, quando ainda não existem. */
  sugestoes = [],
}: {
  aberto: boolean;
  onFechar: () => void;
  supabase: SupabaseClient;
  tabela: string;
  itens: Etiqueta[];
  onMudou: () => void;
  usos: Record<string, number>;
  icone: React.ReactNode;
  titulo: string;
  sub: string;
  rotuloNovo: string;
  exemplo: string;
  arquivoSql: string;
  contagem: (n: number) => string;
  sugestoes?: string[];
}) {
  const [novo, setNovo] = React.useState("");
  const [nomes, setNomes] = React.useState<Record<string, string>>({});
  const [erro, setErro] = React.useState("");
  const [ocupado, setOcupado] = React.useState(false);

  const recado = (e: { code?: string; message: string }, nome?: string) =>
    semTabela(e.message) || e.code === "PGRST205"
      ? `Isto precisa de supabase/${arquivoSql} no banco. Rode o arquivo e recarregue.`
      : repetido(e)
        ? `"${nome}" já existe.`
        : e.message;

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
    const { error } = await supabase.from(tabela).insert({ user_id: uid, name });
    setOcupado(false);
    if (error) return setErro(recado(error, name));
    if (!nome) setNovo("");
    onMudou();
  };

  /** Grava ao sair do campo, não a cada tecla: renomear é escrita no banco. */
  const renomear = async (t: Etiqueta) => {
    const name = (nomes[t.id] ?? t.name).trim();
    if (!name || name === t.name) {
      setNomes((n) => ({ ...n, [t.id]: t.name }));
      return;
    }
    setErro("");
    /* `select("id")` porque aqui o silêncio mente duas vezes: o campo já mostra
       o nome novo, e sem a linha de volta um update que não achou nada passaria
       por sucesso. */
    const { data: salvo, error } = await supabase
      .from(tabela)
      .update({ name })
      .eq("id", t.id)
      .select("id");
    if (error || !salvo?.length) {
      setNomes((n) => ({ ...n, [t.id]: t.name }));
      return setErro(!error ? NADA_GRAVADO : recado(error, name));
    }
    onMudou();
  };

  const apagar = async (t: Etiqueta) => {
    setErro("");
    const { data: saiu, error } = await supabase
      .from(tabela)
      .delete()
      .eq("id", t.id)
      .select("id");
    if (error) return setErro(recado(error));
    if (!saiu?.length) return setErro(NADA_GRAVADO);
    onMudou();
  };

  const faltando = sugestoes.filter(
    (s) => !itens.some((t) => t.name.toLowerCase() === s.toLowerCase())
  );

  return (
    <Modal
      open={aberto}
      onClose={onFechar}
      title={titulo}
      sub={sub}
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

        <Field label={rotuloNovo}>
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
              placeholder={exemplo}
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

        {itens.length === 0 ? (
          <Empty
            icon={icone}
            title="Nada aqui ainda"
            sub="Crie a primeira acima. Depois ela aparece como filtro na lista."
          />
        ) : (
          <ul className="divide-y divide-line-soft">
            {itens.map((t) => {
              const emUso = usos[t.id] ?? 0;
              return (
                <li key={t.id} className="flex items-center gap-2 py-2">
                  <span className="shrink-0 text-fg-mute">{icone}</span>
                  <Input
                    value={nomes[t.id] ?? t.name}
                    onChange={(e) =>
                      setNomes((n) => ({ ...n, [t.id]: e.target.value }))
                    }
                    onBlur={() => renomear(t)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter") {
                        e.preventDefault();
                        (e.target as HTMLInputElement).blur();
                      }
                      /* Escape desfaz, em vez de guardar meia edição. */
                      if (e.key === "Escape")
                        setNomes((n) => ({ ...n, [t.id]: t.name }));
                    }}
                    className="h-9 flex-1 text-[12.5px]"
                  />
                  <span className="w-[78px] shrink-0 text-right text-[10.5px] text-fg-mute tnum">
                    {emUso ? contagem(emUso) : "vazia"}
                  </span>
                  {/* Apagar a etiqueta não apaga nada que a usa: a ligação cai
                      e o item fica, só sem a etiqueta. O rótulo diz isso para
                      o clique não parecer mais destrutivo do que é. */}
                  <button
                    type="button"
                    onClick={() => apagar(t)}
                    aria-label={`Apagar ${t.name}`}
                    title={
                      emUso
                        ? `${contagem(emUso)} perde a etiqueta, nada é apagado`
                        : "Apagar"
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
