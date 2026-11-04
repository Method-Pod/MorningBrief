"use client";

import * as React from "react";
import type { SupabaseClient } from "@supabase/supabase-js";
import { LayoutTemplate, Trash2 } from "lucide-react";
import { acharModelo, type ModeloDeDemanda } from "@/lib/modelosDeDemanda";
import { naoExiste } from "@/lib/saudeDoBanco";
import { PRIORITY_LABEL } from "@/lib/types";
import { Button, Field, Input, Modal, Select, useConfirm } from "./ui";

/*
 * Os modelos de demanda na tela de Demandas. Ver lib/modelosDeDemanda.
 *
 * Três peças, e nenhuma tela própria: escolher um modelo ao criar a
 * demanda, salvar o formulário como modelo, e uma lista para excluir. Para
 * MUDAR um modelo, usa-se ele, ajusta-se a demanda e salva-se com o mesmo
 * nome -- o formulário da demanda já tem todos os editores (checklist,
 * links, cliente), e um segundo formulário igual seria só mais um lugar
 * para ficar diferente.
 */

export function useModelos(supabase: SupabaseClient) {
  const [modelos, setModelos] = React.useState<ModeloDeDemanda[]>([]);
  const [semTabela, setSemTabela] = React.useState(false);

  const carregar = React.useCallback(async () => {
    const { data, error } = await supabase
      .from("modelos_de_demanda")
      .select("*")
      .order("nome");
    if (error) {
      setSemTabela(naoExiste(error));
      return;
    }
    setSemTabela(false);
    setModelos((data as ModeloDeDemanda[]) ?? []);
  }, [supabase]);

  React.useEffect(() => {
    carregar();
  }, [carregar]);

  return { modelos, semTabela, carregar };
}

/** "Começar de um modelo", no topo do formulário de demanda nova. */
export function EscolherModelo({
  modelos,
  onAplicar,
  onGerenciar,
}: {
  modelos: ModeloDeDemanda[];
  onAplicar: (m: ModeloDeDemanda) => void;
  onGerenciar: () => void;
}) {
  if (!modelos.length) return null;
  return (
    <div className="flex items-center gap-2">
      <Select
        value=""
        onChange={(e) => {
          const m = modelos.find((x) => x.id === e.target.value);
          if (m) onAplicar(m);
        }}
        className="min-w-0 flex-1"
        aria-label="Começar de um modelo"
      >
        <option value="">Começar de um modelo…</option>
        {modelos.map((m) => (
          <option key={m.id} value={m.id}>
            {m.nome}
          </option>
        ))}
      </Select>
      <button
        type="button"
        onClick={onGerenciar}
        className="shrink-0 rounded-full px-3 py-2 text-[12.5px] font-semibold text-brand-400 transition-colors hover:bg-brand-500/12"
      >
        Modelos
      </button>
    </div>
  );
}

/** Pergunta o nome (e o prazo) e grava o formulário como modelo. */
export function SalvarComoModelo({
  open,
  onClose,
  modelos,
  sugestaoNome,
  sugestaoPrazo,
  onSalvar,
}: {
  open: boolean;
  onClose: () => void;
  modelos: ModeloDeDemanda[];
  sugestaoNome: string;
  sugestaoPrazo: number | null;
  /** Devolve a mensagem de erro, ou "" quando gravou. */
  onSalvar: (nome: string, prazoDias: number | null, substituir: ModeloDeDemanda | undefined) => Promise<string>;
}) {
  const [nome, setNome] = React.useState("");
  const [prazo, setPrazo] = React.useState("");
  const [erro, setErro] = React.useState("");
  const [ocupado, setOcupado] = React.useState(false);

  React.useEffect(() => {
    if (!open) return;
    setNome(sugestaoNome);
    setPrazo(sugestaoPrazo == null ? "" : String(sugestaoPrazo));
    setErro("");
  }, [open, sugestaoNome, sugestaoPrazo]);

  const existente = nome.trim() ? acharModelo(modelos, nome) : undefined;

  const salvar = async () => {
    if (!nome.trim()) return setErro("Dê um nome ao modelo.");
    const n = prazo.trim() === "" ? null : Number(prazo);
    if (n !== null && (!Number.isInteger(n) || n < 0 || n > 365))
      return setErro("O prazo é um número de dias, de 0 a 365.");
    setOcupado(true);
    const falha = await onSalvar(nome, n, existente);
    setOcupado(false);
    if (falha) return setErro(falha);
    onClose();
  };

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="Salvar como modelo"
      lateral={false}
      footer={
        <>
          <Button onClick={onClose}>Cancelar</Button>
          <Button variant="primary" onClick={salvar} disabled={ocupado}>
            {ocupado ? "Salvando..." : existente ? "Substituir modelo" : "Salvar modelo"}
          </Button>
        </>
      }
    >
      <div className="space-y-4">
        <p className="text-[12.5px] leading-relaxed text-fg-mute">
          Guarda título, cliente, prioridade, descrição, links e checklist desta
          demanda. Ao usar o modelo, tudo isso já vem preenchido.
        </p>
        <Field label="Nome do modelo">
          <Input
            autoFocus
            value={nome}
            onChange={(e) => setNome(e.target.value)}
            placeholder="Carrossel"
            maxLength={80}
          />
        </Field>
        <Field
          label="Prazo"
          hint="Dias depois de criar a demanda. Vazio = sem prazo; 0 = no mesmo dia."
        >
          <Input
            inputMode="numeric"
            value={prazo}
            onChange={(e) => setPrazo(e.target.value.replace(/\D/g, "").slice(0, 3))}
            placeholder="Ex.: 3"
          />
        </Field>
        {existente && (
          <p className="rounded-[14px] bg-warn/12 px-3.5 py-3 text-xs font-medium text-warn">
            Já existe o modelo &quot;{existente.nome}&quot;. Salvar substitui ele por este.
          </p>
        )}
        {erro && (
          <p className="rounded-[14px] bg-neg/12 px-3.5 py-3 text-xs font-medium text-neg">{erro}</p>
        )}
      </div>
    </Modal>
  );
}

/** A lista dos modelos, para conferir e excluir. */
export function GerenciarModelos({
  open,
  onClose,
  modelos,
  nomeDoCliente,
  onExcluir,
}: {
  open: boolean;
  onClose: () => void;
  modelos: ModeloDeDemanda[];
  nomeDoCliente: (m: ModeloDeDemanda) => string;
  onExcluir: (m: ModeloDeDemanda) => Promise<void>;
}) {
  const confirm = useConfirm();
  return (
    <>
      <Modal
        open={open}
        onClose={onClose}
        title="Modelos de demanda"
        sub="Para mudar um modelo, use-o numa demanda nova, ajuste e salve com o mesmo nome."
        footer={<Button onClick={onClose}>Fechar</Button>}
      >
        {modelos.length === 0 ? (
          <p className="text-[13px] text-fg-mute">
            Nenhum modelo ainda. Abra uma demanda e toque em &quot;Salvar como modelo&quot;.
          </p>
        ) : (
          <ul className="flex flex-col gap-2.5">
            {modelos.map((m) => {
              const detalhes = [
                nomeDoCliente(m),
                PRIORITY_LABEL[m.priority],
                m.checklist.length ? `${m.checklist.length} itens` : "",
                m.prazo_dias == null
                  ? "sem prazo"
                  : m.prazo_dias === 0
                    ? "prazo no mesmo dia"
                    : `prazo em ${m.prazo_dias} dia${m.prazo_dias === 1 ? "" : "s"}`,
              ].filter(Boolean);
              return (
                <li
                  key={m.id}
                  className="flex items-center gap-3 rounded-[18px] border border-line bg-ink-800 px-4 py-3"
                >
                  <span className="grid h-9 w-9 shrink-0 place-items-center rounded-full bg-brand-500/12 text-brand-400">
                    <LayoutTemplate size={16} />
                  </span>
                  <span className="min-w-0 flex-1">
                    <b className="block truncate text-[14px]">{m.nome}</b>
                    <span className="block truncate text-[12px] text-fg-mute">
                      {detalhes.join(" · ")}
                    </span>
                  </span>
                  <button
                    type="button"
                    aria-label={`Excluir o modelo ${m.nome}`}
                    onClick={() =>
                      confirm.ask(
                        `Excluir o modelo "${m.nome}"? As demandas criadas com ele continuam.`,
                        () => void onExcluir(m)
                      )
                    }
                    className="grid h-9 w-9 shrink-0 place-items-center rounded-full text-fg-mute transition-colors hover:bg-neg/12 hover:text-neg"
                  >
                    <Trash2 size={15} />
                  </button>
                </li>
              );
            })}
          </ul>
        )}
      </Modal>
      {confirm.node}
    </>
  );
}
