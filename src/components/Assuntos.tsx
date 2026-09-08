"use client";

import * as React from "react";
import { Plus, Tag, Trash2 } from "lucide-react";
import type { SupabaseClient } from "@supabase/supabase-js";
import { currentUserId, SESSION_EXPIRED } from "@/lib/session";
import type { Subject } from "@/lib/types";
import { NADA_GRAVADO } from "@/lib/erros";
import { Button, Empty, Field, Input, Modal, Select, cx } from "./ui";

/**
 * Etiquetas de assunto: criar, renomear, apagar.
 *
 * O assunto virou tabela porque, como texto solto na aula, renomear "edicao"
 * para "Edição" exigiria varrer todas as aulas — e "edicao", "Edição" e
 * "edição" viveriam como três etiquetas diferentes. Aqui o nome mora num lugar
 * só: renomear é uma linha, e apagar solta as aulas em vez de apagá-las.
 */

/** Mensagem para o erro de nome repetido, que o índice único devolve como 23505. */
const repetido = (e: { code?: string; message: string }) =>
  e.code === "23505" || /duplicate|unique/i.test(e.message);

export function GerenciarAssuntos({
  aberto,
  onFechar,
  supabase,
  assuntos,
  onMudou,
  /** Quantas aulas e cursos usam cada etiqueta, para avisar antes de apagar. */
  usos,
}: {
  aberto: boolean;
  onFechar: () => void;
  supabase: SupabaseClient;
  assuntos: Subject[];
  onMudou: () => void;
  usos: Record<string, number>;
}) {
  const [novo, setNovo] = React.useState("");
  const [nomes, setNomes] = React.useState<Record<string, string>>({});
  const [erro, setErro] = React.useState("");
  const [ocupado, setOcupado] = React.useState(false);

  const criar = async () => {
    const name = novo.trim();
    if (!name) return;
    setErro("");
    setOcupado(true);
    const uid = await currentUserId(supabase);
    if (!uid) {
      setOcupado(false);
      return setErro(SESSION_EXPIRED);
    }
    const { error } = await supabase.from("subjects").insert({ user_id: uid, name });
    setOcupado(false);
    if (error)
      return setErro(
        repetido(error) ? `"${name}" já existe.` : error.message
      );
    setNovo("");
    onMudou();
  };

  /**
   * Grava o nome ao sair do campo, não a cada tecla.
   *
   * Renomear é uma escrita no banco; fazer isso por caractere seria uma
   * consulta por letra digitada.
   */
  const renomear = async (a: Subject) => {
    const name = (nomes[a.id] ?? a.name).trim();
    if (!name || name === a.name) {
      setNomes((n) => ({ ...n, [a.id]: a.name }));
      return;
    }
    setErro("");
    /*
     * `select("id")` porque aqui o silêncio mente duas vezes: o campo já mostra
     * o nome novo, e sem a linha de volta um update que não achou nada passaria
     * por sucesso — o nome ficaria trocado na tela e intacto no banco.
     */
    const { data: salvo, error } = await supabase
      .from("subjects")
      .update({ name })
      .eq("id", a.id)
      .select("id");
    if (error || !salvo?.length) {
      setNomes((n) => ({ ...n, [a.id]: a.name }));
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

  const apagar = async (a: Subject) => {
    setErro("");
    const { data: saiu, error } = await supabase
      .from("subjects")
      .delete()
      .eq("id", a.id)
      .select("id");
    if (error) return setErro(error.message);
    /* Zero linhas apagadas com a etiqueta ainda na tela significa que ela não
       existe mais no banco — recarregar a lista põe as duas em acordo. */
    if (!saiu?.length) return setErro(NADA_GRAVADO);
    onMudou();
  };

  return (
    <Modal
      open={aberto}
      onClose={onFechar}
      title="Etiquetas de assunto"
      sub="Renomear aqui muda em todas as aulas e cursos de uma vez."
      footer={<Button variant="primary" onClick={onFechar}>Fechar</Button>}
    >
      <div className="space-y-4">
        {erro && (
          <p className="rounded-[14px] bg-neg/10 px-3.5 py-3 text-xs text-neg">
            {erro}
          </p>
        )}

        <Field label="Nova etiqueta">
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
              placeholder="edição, marketing, IA..."
              className="flex-1"
            />
            <Button
              variant="primary"
              onClick={criar}
              disabled={ocupado || !novo.trim()}
            >
              <Plus size={15} />
              Criar
            </Button>
          </div>
        </Field>

        {assuntos.length === 0 ? (
          <Empty
            icon={<Tag size={18} />}
            title="Nenhuma etiqueta"
            sub="Crie a primeira acima. Depois ela aparece como filtro na lista de aulas."
          />
        ) : (
          <ul className="divide-y divide-line-soft">
            {assuntos.map((a) => {
              const emUso = usos[a.id] ?? 0;
              return (
                <li key={a.id} className="flex items-center gap-2 py-2">
                  <Tag size={13} className="shrink-0 text-fg-mute" />
                  <Input
                    value={nomes[a.id] ?? a.name}
                    onChange={(e) =>
                      setNomes((n) => ({ ...n, [a.id]: e.target.value }))
                    }
                    onBlur={() => renomear(a)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter") {
                        e.preventDefault();
                        (e.target as HTMLInputElement).blur();
                      }
                      /* Escape desfaz: o campo volta ao nome gravado em vez de
                         guardar uma edição pela metade. */
                      if (e.key === "Escape")
                        setNomes((n) => ({ ...n, [a.id]: a.name }));
                    }}
                    className="h-9 flex-1 text-[12.5px]"
                  />
                  <span className="w-[74px] shrink-0 text-right text-[10.5px] text-fg-mute tnum">
                    {emUso ? `${emUso} em uso` : "sem uso"}
                  </span>
                  {/*
                    Apagar etiqueta não apaga nada usando ela: a coluna é
                    `on delete set null`, então as aulas ficam e só perdem o
                    assunto. O rótulo diz isso para o clique não parecer
                    destrutivo mais do que é.
                  */}
                  <button
                    type="button"
                    onClick={() => apagar(a)}
                    aria-label={`Apagar a etiqueta ${a.name}`}
                    title={
                      emUso
                        ? `${emUso} item perde o assunto, nada é apagado`
                        : "Apagar etiqueta"
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

/* ------------------------------ campo ------------------------------ */

/** Escolhe entre as etiquetas que existem. Criar é no gerenciador. */
export function CampoAssunto({
  valor,
  onValor,
  assuntos,
  onGerenciar,
}: {
  valor: string;
  onValor: (v: string) => void;
  assuntos: Subject[];
  onGerenciar: () => void;
}) {
  return (
    <div className="flex gap-2">
      <Select
        value={valor}
        onChange={(e) => onValor(e.target.value)}
        className="flex-1"
      >
        <option value="">Sem assunto</option>
        {assuntos.map((a) => (
          <option key={a.id} value={a.id}>
            {a.name}
          </option>
        ))}
      </Select>
      <Button type="button" onClick={onGerenciar} title="Gerenciar etiquetas">
        <Tag size={15} />
      </Button>
    </div>
  );
}

/* ------------------------------ etiqueta ------------------------------ */

/** A etiqueta na tela, na cor do tema. */
export function Etiqueta({
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
      <Tag size={9} />
      {nome}
    </span>
  );
}
