"use client";

import * as React from "react";
import type { SupabaseClient } from "@supabase/supabase-js";
import { ChevronRight, LayoutTemplate, Plus, Trash2 } from "lucide-react";
import { modeloDaDemanda, type ModeloDeDemanda } from "@/lib/modelosDeDemanda";
import { naoExiste } from "@/lib/saudeDoBanco";
import { PRIORITY_LABEL, type Cliente, type Priority, type Projeto } from "@/lib/types";
import { EditorChecklist, type ItemEmEdicao } from "./Checklist";
import { EditorLinks, limparLinks } from "./Links";
import { Badge, Button, Field, Input, Modal, Select, Textarea, useConfirm } from "./ui";
import { tomDaPrioridade } from "./CartaoDeDemanda";

/*
 * Os modelos de demanda na tela de Demandas. Ver lib/modelosDeDemanda.
 *
 * Duas peças: escolher um modelo ao criar a demanda ("Começar de um
 * modelo"), e o cadastro dos modelos, em Gerenciar › Modelos de demanda --
 * um painel com a lista e, dentro dele, o formulário de cada modelo, no
 * mesmo desenho do de Nova demanda. Pedido dele: o modelo se cria e se
 * configura ali, e não pelo formulário da demanda.
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

/* ------------------------------ o formulário do modelo ------------------------------ */

type Form = {
  nome: string;
  titulo: string;
  descricao: string;
  cliente_id: string;
  projeto_id: string;
  priority: Priority;
  prazo: string;
  links: string[];
};

const formVazio = (): Form => ({
  nome: "",
  titulo: "",
  descricao: "",
  cliente_id: "",
  projeto_id: "",
  priority: "medium",
  prazo: "",
  links: [],
});

const formDo = (m: ModeloDeDemanda): Form => ({
  nome: m.nome,
  titulo: m.titulo,
  descricao: m.descricao,
  cliente_id: m.cliente_id ?? "",
  projeto_id: m.projeto_id ?? "",
  priority: m.priority,
  prazo: m.prazo_dias == null ? "" : String(m.prazo_dias),
  links: m.links ?? [],
});

const textoDoPrazo = (dias: number | null) =>
  dias == null
    ? "Sem prazo"
    : dias === 0
      ? "Prazo no mesmo dia"
      : `Prazo em ${dias} dia${dias === 1 ? "" : "s"}`;

/** A linha gravável, para o pai mandar ao banco. */
export type LinhaDoModelo = ReturnType<typeof modeloDaDemanda>;

/**
 * Gerenciar › Modelos de demanda: a lista, e o formulário de cada modelo
 * dentro do mesmo painel.
 *
 * Um painel só, que troca de conteúdo, e não um segundo painel por cima do
 * primeiro: dois painéis empilhados à direita deixam a pessoa sem saber
 * qual fechar. "Voltar" leva do formulário à lista.
 */
export function GerenciarModelos({
  open,
  onClose,
  modelos,
  clientes,
  projetos,
  onSalvar,
  onExcluir,
}: {
  open: boolean;
  onClose: () => void;
  modelos: ModeloDeDemanda[];
  clientes: Cliente[];
  projetos: Projeto[];
  /** Grava (cria sem `id`, altera com `id`). Devolve a mensagem de erro, ou "". */
  onSalvar: (linha: LinhaDoModelo, id: string | null) => Promise<string>;
  onExcluir: (m: ModeloDeDemanda) => Promise<void>;
}) {
  const confirm = useConfirm();
  /* null = a lista; "novo" ou o modelo = o formulário. */
  const [editando, setEditando] = React.useState<null | "novo" | ModeloDeDemanda>(null);
  const [form, setForm] = React.useState<Form>(formVazio);
  const [checklist, setChecklist] = React.useState<ItemEmEdicao[]>([]);
  const [erro, setErro] = React.useState("");
  const [ocupado, setOcupado] = React.useState(false);

  /* Fechar o painel volta para a lista na próxima abertura. */
  React.useEffect(() => {
    if (!open) setEditando(null);
  }, [open]);

  const abrir = (m: "novo" | ModeloDeDemanda) => {
    setForm(m === "novo" ? formVazio() : formDo(m));
    setChecklist(m === "novo" ? [] : m.checklist.map((title) => ({ title, done: false })));
    setErro("");
    setEditando(m);
  };

  const nomeDoCliente = (cId: string | null, pId: string | null) => {
    const c = clientes.find((x) => x.id === cId);
    const p = projetos.find((x) => x.id === pId);
    return c ? (p ? `${c.nome} · ${p.nome}` : c.nome) : "";
  };

  const projetosDoCliente = React.useMemo(
    () =>
      projetos
        .filter((p) => p.cliente_id === form.cliente_id)
        .sort((a, b) => (a.position ?? 0) - (b.position ?? 0) || a.nome.localeCompare(b.nome)),
    [projetos, form.cliente_id]
  );

  const prazoDias = form.prazo.trim() === "" ? null : Number(form.prazo);

  const salvar = async (e?: React.FormEvent) => {
    e?.preventDefault();
    setErro("");
    if (!form.nome.trim()) return setErro("Dê um nome ao modelo.");
    if (prazoDias !== null && (!Number.isInteger(prazoDias) || prazoDias < 0 || prazoDias > 365))
      return setErro("O prazo é um número de dias, de 0 a 365.");
    const id = editando && editando !== "novo" ? editando.id : null;
    const chave = (s: string) => s.normalize("NFD").replace(/[̀-ͯ]/g, "").trim().toLowerCase();
    if (modelos.some((m) => m.id !== id && chave(m.nome) === chave(form.nome)))
      return setErro(`Já existe um modelo chamado "${form.nome.trim()}".`);

    const linha = modeloDaDemanda(
      {
        title: form.titulo,
        description: form.descricao,
        cliente_id: form.cliente_id || null,
        projeto_id: form.projeto_id || null,
        priority: form.priority,
        links: limparLinks(form.links),
        checklist: checklist.map((i) => i.title),
      },
      form.nome,
      prazoDias
    );
    setOcupado(true);
    const falha = await onSalvar(linha, id);
    setOcupado(false);
    if (falha) return setErro(falha);
    setEditando(null);
  };

  const excluir = (m: ModeloDeDemanda) =>
    confirm.ask(`Excluir o modelo "${m.nome}"? As demandas criadas com ele continuam.`, () => void onExcluir(m));

  /* O resumo do topo, no desenho do de Nova demanda. */
  const resumo = () => {
    const quem = nomeDoCliente(form.cliente_id || null, form.projeto_id || null);
    return (
      <div className="rounded-[22px] border border-[color-mix(in_srgb,var(--a)_40%,var(--vidro-borda))] bg-[color-mix(in_srgb,var(--a)_20%,var(--vidro))] p-4 shadow-[inset_0_1px_0_var(--vidro-brilho)]">
        <div className="flex items-center justify-between gap-2">
          <span className="text-[12px] font-medium text-fg-dim">{textoDoPrazo(Number.isInteger(prazoDias) ? prazoDias : null)}</span>
          <span className="inline-flex items-center gap-1.5 rounded-full bg-ink-800 px-2.5 py-1 text-[11.5px] font-semibold">
            <LayoutTemplate size={12} className="text-brand-400" /> Modelo
          </span>
        </div>
        <p className="mt-2 line-clamp-2 text-[22px] font-semibold leading-tight tracking-[-0.02em]">
          {form.nome.trim() || "Novo modelo"}
        </p>
        <p className="mt-1 truncate text-[13px] text-fg-mute">
          {[form.titulo.trim() && `“${form.titulo.trim()}”`, quem].filter(Boolean).join(" · ") ||
            "A demanda nasce com o nome do modelo"}
        </p>
        <div className="mt-3 flex flex-wrap items-center gap-2">
          <Badge tone={tomDaPrioridade({ status: "todo", priority: form.priority })}>
            {PRIORITY_LABEL[form.priority]}
          </Badge>
          {checklist.length > 0 && (
            <span className="text-[12px] font-medium text-fg-mute tnum">
              {checklist.length} {checklist.length === 1 ? "item" : "itens"} no checklist
            </span>
          )}
        </div>
      </div>
    );
  };

  const noFormulario = editando !== null;

  return (
    <>
      <Modal
        open={open}
        onClose={onClose}
        size="lg"
        title={noFormulario ? (editando === "novo" ? "Novo modelo" : "Editar modelo") : "Modelos de demanda"}
        sub={
          noFormulario
            ? "O que a demanda já recebe ao começar deste modelo."
            : "Aparecem em Nova demanda › Começar de um modelo, e o Claude também usa."
        }
        topo={noFormulario ? resumo() : undefined}
        footer={
          noFormulario ? (
            <>
              <Button type="button" onClick={() => setEditando(null)}>
                Voltar
              </Button>
              <Button variant="primary" onClick={() => salvar()} disabled={ocupado}>
                {ocupado ? "Salvando..." : "Salvar"}
              </Button>
            </>
          ) : (
            <>
              <Button onClick={onClose}>Fechar</Button>
              <Button variant="primary" onClick={() => abrir("novo")}>
                <Plus size={15} /> Novo modelo
              </Button>
            </>
          )
        }
      >
        {!noFormulario ? (
          modelos.length === 0 ? (
            <div className="rounded-[18px] border border-dashed border-line px-5 py-8 text-center">
              <span className="mx-auto grid h-11 w-11 place-items-center rounded-full bg-brand-500/12 text-brand-400">
                <LayoutTemplate size={18} />
              </span>
              <p className="mt-3 text-[14px] font-semibold">Nenhum modelo ainda</p>
              <p className="mt-1 text-[12.5px] text-fg-mute">
                Um modelo guarda cliente, prioridade, checklist, links e prazo de um tipo de demanda que se repete,
                como &quot;Carrossel&quot; ou &quot;Thumb ao vivo&quot;.
              </p>
            </div>
          ) : (
            <ul className="flex flex-col gap-2.5">
              {modelos.map((m) => {
                const detalhes = [
                  nomeDoCliente(m.cliente_id, m.projeto_id),
                  PRIORITY_LABEL[m.priority],
                  m.checklist.length ? `${m.checklist.length} itens` : "",
                  textoDoPrazo(m.prazo_dias).toLowerCase(),
                ].filter(Boolean);
                return (
                  <li key={m.id} className="flex items-center gap-2 rounded-[18px] border border-line bg-ink-800 pr-2">
                    <button
                      type="button"
                      onClick={() => abrir(m)}
                      className="flex min-w-0 flex-1 items-center gap-3 rounded-[18px] px-4 py-3 text-left transition-colors hover:bg-fg/[0.05]"
                    >
                      <span className="grid h-9 w-9 shrink-0 place-items-center rounded-full bg-brand-500/12 text-brand-400">
                        <LayoutTemplate size={16} />
                      </span>
                      <span className="min-w-0 flex-1">
                        <b className="block truncate text-[14px]">{m.nome}</b>
                        <span className="block truncate text-[12px] text-fg-mute">{detalhes.join(" · ")}</span>
                      </span>
                      <ChevronRight size={16} className="shrink-0 text-fg-mute" />
                    </button>
                    <button
                      type="button"
                      aria-label={`Excluir o modelo ${m.nome}`}
                      onClick={() => excluir(m)}
                      className="grid h-9 w-9 shrink-0 place-items-center rounded-full text-fg-mute transition-colors hover:bg-neg/12 hover:text-neg"
                    >
                      <Trash2 size={15} />
                    </button>
                  </li>
                );
              })}
            </ul>
          )
        ) : (
          <form onSubmit={salvar} className="space-y-5">
            <Field label="Nome do modelo" hint="Como ele aparece em Começar de um modelo.">
              <Input
                autoFocus
                value={form.nome}
                maxLength={80}
                onChange={(e) => setForm({ ...form, nome: e.target.value })}
                placeholder="Carrossel"
              />
            </Field>

            <Field label="Título da demanda" hint="Vazio = a demanda nasce com o nome do modelo.">
              <Input
                value={form.titulo}
                onChange={(e) => setForm({ ...form, titulo: e.target.value })}
                placeholder="Carrossel - tema da semana"
              />
            </Field>

            <div className="space-y-4 border-t border-line-soft pt-5">
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
                <Field
                  label="Cliente"
                  hint={clientes.length === 0 ? "Cadastre em Gerenciar › Clientes e projetos." : undefined}
                >
                  <Select
                    value={form.cliente_id}
                    onChange={(e) => setForm({ ...form, cliente_id: e.target.value, projeto_id: "" })}
                  >
                    <option value="">Sem cliente</option>
                    {clientes.map((c) => (
                      <option key={c.id} value={c.id}>
                        {c.nome}
                      </option>
                    ))}
                  </Select>
                </Field>
                <Field
                  label="Projeto"
                  hint={
                    !form.cliente_id
                      ? "Escolha um cliente primeiro."
                      : projetosDoCliente.length === 0
                        ? "Este cliente ainda não tem projeto."
                        : undefined
                  }
                >
                  <Select
                    value={form.projeto_id}
                    disabled={!form.cliente_id || projetosDoCliente.length === 0}
                    onChange={(e) => setForm({ ...form, projeto_id: e.target.value })}
                  >
                    <option value="">Sem projeto</option>
                    {projetosDoCliente.map((p) => (
                      <option key={p.id} value={p.id}>
                        {p.nome}
                      </option>
                    ))}
                  </Select>
                </Field>
                <Field label="Prioridade">
                  <Select
                    value={form.priority}
                    onChange={(e) => setForm({ ...form, priority: e.target.value as Priority })}
                  >
                    {(Object.keys(PRIORITY_LABEL) as Priority[]).map((p) => (
                      <option key={p} value={p}>
                        {PRIORITY_LABEL[p]}
                      </option>
                    ))}
                  </Select>
                </Field>
              </div>

              <Field label="Prazo" hint="Dias depois de criar a demanda. Vazio = sem prazo; 0 = no mesmo dia.">
                <Input
                  inputMode="numeric"
                  value={form.prazo}
                  onChange={(e) => setForm({ ...form, prazo: e.target.value.replace(/\D/g, "").slice(0, 3) })}
                  placeholder="Ex.: 3"
                  className="sm:max-w-[200px]"
                />
              </Field>
            </div>

            <div className="space-y-4 border-t border-line-soft pt-5">
              <Field label="Descrição">
                <Textarea
                  rows={3}
                  value={form.descricao}
                  onChange={(e) => setForm({ ...form, descricao: e.target.value })}
                  placeholder="Contexto, o que precisa ser entregue..."
                />
              </Field>
              <Field label="Links do material" hint="Roteiro, pasta, referência. Toda demanda do modelo nasce com eles.">
                <EditorLinks links={form.links} onChange={(links) => setForm({ ...form, links })} />
              </Field>
              <Field label="Checklist" hint="Cada demanda do modelo nasce com estes itens desmarcados.">
                <EditorChecklist itens={checklist} onChange={setChecklist} />
              </Field>
            </div>

            {erro && (
              <p className="rounded-xl border border-neg/30 bg-neg/10 p-3 text-xs text-neg">{erro}</p>
            )}
          </form>
        )}
      </Modal>
      {confirm.node}
    </>
  );
}
