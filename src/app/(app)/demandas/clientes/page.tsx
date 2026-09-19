"use client";

import * as React from "react";
import Link from "next/link";
import { ArrowLeft, FolderOpen, Pencil, Plus, Trash2, Users } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { currentUserId, SESSION_EXPIRED } from "@/lib/session";
import { NADA_GRAVADO } from "@/lib/erros";
import { useEstadoCacheado, temCache } from "@/lib/cachePagina";
import {
  CORES_HEX,
  NOTE_COLORS,
  type Cliente,
  type Projeto,
  type Task,
} from "@/lib/types";
import {
  Button,
  Card,
  EsqueletoPagina,
  Field,
  Input,
  Modal,
  cx,
  useConfirm,
  useNotice,
} from "@/components/ui";

/**
 * Clientes e projetos: o cadastro por trás do campo da demanda.
 *
 * O campo "Cliente / projeto" era texto livre, e texto livre cria cliente
 * novo a cada grafia — em silêncio. Na base real a Bia virou cinco: "Bia",
 * "Bia - Canal Oficial", "Bia - Pedido Carol", "Bia - Pedido Nero" e
 * "Bia - Setembro Amarelo". Cinco linhas no filtro, contagens separadas, e
 * nenhum número dizendo quantas demandas ela tem.
 *
 * Aqui são dois níveis: o CLIENTE é quem paga, o PROJETO é o que está sendo
 * feito para ele. A demanda passa a apontar para os dois, em vez de guardar
 * uma frase — então **renomear o cliente muda o nome em todas as demandas
 * dele de uma vez**, que é o que junta as cinco Bias numa só.
 *
 * O que esta tela NÃO faz: criar demanda. Ela é a ficha do cliente.
 */

const VAZIO_CLIENTE = { nome: "", cor: "blue" };

export default function ClientesPage() {
  const supabase = React.useMemo(() => createClient(), []);

  const [clientes, setClientes] = useEstadoCacheado<Cliente[]>("clientes", []);
  const [projetos, setProjetos] = useEstadoCacheado<Projeto[]>("projetos", []);
  const [demandas, setDemandas] = useEstadoCacheado<Task[]>(
    "clientes:demandas",
    []
  );
  const [loading, setLoading] = React.useState(
    () => !temCache("clientes", "projetos")
  );
  /* A tabela pode não existir ainda: quem não rodou o SQL vê o aviso em vez
     de uma tela vazia sem explicação. */
  const [semTabela, setSemTabela] = React.useState(false);

  const [abertoCliente, setAbertoCliente] = React.useState(false);
  const [editando, setEditando] = React.useState<Cliente | null>(null);
  const [form, setForm] = React.useState(VAZIO_CLIENTE);

  const [projetoDe, setProjetoDe] = React.useState<Cliente | null>(null);
  const [editandoProjeto, setEditandoProjeto] = React.useState<Projeto | null>(
    null
  );
  const [nomeProjeto, setNomeProjeto] = React.useState("");

  const [salvando, setSalvando] = React.useState(false);
  const [erro, setErro] = React.useState("");
  const confirm = useConfirm();
  const notice = useNotice();

  const carregar = React.useCallback(async () => {
    const [c, p, t] = await Promise.all([
      supabase.from("clientes").select("*").order("nome"),
      supabase.from("projetos").select("*").order("nome"),
      /* Só o que conta: o cadastro mostra quantas demandas cada um tem, e
         para isso bastam três colunas — não o corpo de todas as demandas. */
      supabase.from("tasks").select("id,status,cliente_id,projeto_id"),
    ]);
    if (c.error) {
      setSemTabela(true);
      setLoading(false);
      return;
    }
    setClientes((c.data as Cliente[]) ?? []);
    setProjetos((p.data as Projeto[]) ?? []);
    setDemandas((t.data as Task[]) ?? []);
    setLoading(false);
  }, [supabase, setClientes, setProjetos, setDemandas]);

  React.useEffect(() => {
    carregar();
  }, [carregar]);

  /* Quantas demandas em aberto cada cliente e cada projeto tem. */
  const contagem = React.useMemo(() => {
    const porCliente = new Map<string, number>();
    const porProjeto = new Map<string, number>();
    for (const t of demandas) {
      if (t.status === "done") continue;
      if (t.cliente_id)
        porCliente.set(t.cliente_id, (porCliente.get(t.cliente_id) ?? 0) + 1);
      if (t.projeto_id)
        porProjeto.set(t.projeto_id, (porProjeto.get(t.projeto_id) ?? 0) + 1);
    }
    return { porCliente, porProjeto };
  }, [demandas]);

  const projetosDe = React.useMemo(() => {
    const m = new Map<string, Projeto[]>();
    for (const p of projetos) {
      const l = m.get(p.cliente_id) ?? [];
      l.push(p);
      m.set(p.cliente_id, l);
    }
    return m;
  }, [projetos]);

  /* ------------------------------ cliente ------------------------------ */

  const novoCliente = () => {
    setEditando(null);
    setForm(VAZIO_CLIENTE);
    setErro("");
    setAbertoCliente(true);
  };

  const editarCliente = (c: Cliente) => {
    setEditando(c);
    setForm({ nome: c.nome, cor: c.cor });
    setErro("");
    setAbertoCliente(true);
  };

  const salvarCliente = async () => {
    const nome = form.nome.trim();
    if (!nome) return setErro("Dê um nome ao cliente.");
    setSalvando(true);
    setErro("");

    const campos = { nome, cor: form.cor };
    let falha: { code?: string; message?: string } | null = null;

    if (editando) {
      /* `select("id")` porque o PostgREST responde 204 sem erro quando o
         `eq` não casa com nada — sem isto, uma gravação que não aconteceu
         fecharia o formulário como se tivesse dado certo. */
      const { data, error } = await supabase
        .from("clientes")
        .update(campos)
        .eq("id", editando.id)
        .select("id");
      falha = error ?? (data?.length ? null : { message: NADA_GRAVADO });
    } else {
      const uid = await currentUserId(supabase);
      if (!uid) {
        setSalvando(false);
        return setErro(SESSION_EXPIRED);
      }
      const { error } = await supabase
        .from("clientes")
        .insert({ ...campos, user_id: uid });
      falha = error;
    }

    setSalvando(false);
    if (falha) {
      /* 23505 é o índice de nome único — e é ele que impede a volta do
         problema das cinco Bias. A mensagem crua do Postgres não diz isso. */
      return setErro(
        falha.code === "23505"
          ? "Já existe um cliente com esse nome."
          : (falha.message ?? "Não consegui salvar.")
      );
    }
    setAbertoCliente(false);
    carregar();
  };

  const excluirCliente = (c: Cliente) => {
    const abertas = contagem.porCliente.get(c.id) ?? 0;
    const proj = projetosDe.get(c.id)?.length ?? 0;
    confirm.ask(
      `Excluir "${c.nome}"?` +
        (proj > 0 ? ` Os ${proj} projeto(s) dele saem junto.` : "") +
        (abertas > 0
          ? ` As ${abertas} demandas em aberto continuam existindo, mas ficam sem cliente.`
          : ""),
      async () => {
        const { data, error } = await supabase
          .from("clientes")
          .delete()
          .eq("id", c.id)
          .select("id");
        if (notice.check(error, "excluir o cliente")) return;
        if (!data?.length) return notice.show(NADA_GRAVADO);
        carregar();
      }
    );
  };

  /* ------------------------------ projeto ------------------------------ */

  const salvarProjeto = async () => {
    const nome = nomeProjeto.trim();
    const dono = editandoProjeto
      ? clientes.find((c) => c.id === editandoProjeto.cliente_id)
      : projetoDe;
    if (!nome || !dono) return;
    setSalvando(true);

    let falha: { code?: string; message?: string } | null = null;
    if (editandoProjeto) {
      const { data, error } = await supabase
        .from("projetos")
        .update({ nome })
        .eq("id", editandoProjeto.id)
        .select("id");
      falha = error ?? (data?.length ? null : { message: NADA_GRAVADO });
    } else {
      const uid = await currentUserId(supabase);
      if (!uid) {
        setSalvando(false);
        return notice.show(SESSION_EXPIRED);
      }
      const { error } = await supabase
        .from("projetos")
        .insert({ user_id: uid, cliente_id: dono.id, nome });
      falha = error;
    }

    setSalvando(false);
    if (falha)
      return notice.show(
        falha.code === "23505"
          ? `"${dono.nome}" já tem um projeto com esse nome.`
          : (falha.message ?? "Não consegui salvar.")
      );

    setProjetoDe(null);
    setEditandoProjeto(null);
    setNomeProjeto("");
    carregar();
  };

  const excluirProjeto = (p: Projeto) => {
    const abertas = contagem.porProjeto.get(p.id) ?? 0;
    confirm.ask(
      `Excluir o projeto "${p.nome}"?` +
        (abertas > 0
          ? ` As ${abertas} demandas em aberto ficam com o cliente, sem projeto.`
          : ""),
      async () => {
        const { data, error } = await supabase
          .from("projetos")
          .delete()
          .eq("id", p.id)
          .select("id");
        if (notice.check(error, "excluir o projeto")) return;
        if (!data?.length) return notice.show(NADA_GRAVADO);
        carregar();
      }
    );
  };

  if (loading) return <EsqueletoPagina />;

  return (
    <>
      <div className="mb-4 flex flex-wrap items-center gap-3">
        <Link
          href="/demandas"
          className="grid h-9 w-9 shrink-0 place-items-center rounded-[14px] bg-ink-800 text-fg-dim transition-colors hover:text-fg"
          aria-label="Voltar para demandas"
        >
          <ArrowLeft size={16} />
        </Link>
        <div className="min-w-0 flex-1">
          <h1 className="titulo-pagina">Clientes e projetos</h1>
          <p className="mt-0.5 text-[13px] text-fg-mute">
            Renomear um cliente muda o nome em todas as demandas dele.
          </p>
        </div>
        {!semTabela && (
          <Button variant="primary" onClick={novoCliente}>
            <Plus size={15} />
            Novo cliente
          </Button>
        )}
      </div>

      {semTabela ? (
        <Card>
          <div className="p-6 text-[13.5px] leading-relaxed text-fg-dim">
            <b className="block text-fg">O cadastro ainda não existe no banco.</b>
            <p className="mt-2">
              Rode <code className="rounded bg-ink-800 px-1.5 py-0.5 text-[12.5px]">supabase/CLIENTES.sql</code>{" "}
              no SQL Editor do Supabase. Ele cria as duas tabelas e já
              transforma em cartão cada cliente que você usa hoje — separando
              &quot;Bia - Canal Oficial&quot; em cliente <b>Bia</b> e projeto{" "}
              <b>Canal Oficial</b>.
            </p>
            <p className="mt-2 text-fg-mute">
              Nada é apagado: o texto original continua em cada demanda.
            </p>
          </div>
        </Card>
      ) : clientes.length === 0 ? (
        <Card>
          <div className="p-6 text-center">
            <Users size={20} className="mx-auto text-fg-mute" />
            <p className="mt-2 text-[13.5px] font-semibold">
              Nenhum cliente cadastrado
            </p>
            <p className="mt-1 text-[12.5px] text-fg-mute">
              Cadastre um e ele passa a aparecer na hora de criar a demanda.
            </p>
            <Button variant="primary" size="sm" className="mt-4" onClick={novoCliente}>
              <Plus size={14} />
              Novo cliente
            </Button>
          </div>
        </Card>
      ) : (
        <div className="grid grid-cols-[minmax(0,1fr)] gap-4 md:grid-cols-2 xl:grid-cols-3">
          {clientes.map((c) => {
            const meus = projetosDe.get(c.id) ?? [];
            const abertas = contagem.porCliente.get(c.id) ?? 0;
            return (
              <Card key={c.id}>
                <div className="flex items-start gap-2.5 px-[18px] pt-[18px]">
                  <span
                    className="mt-1 h-2.5 w-2.5 shrink-0 rounded-full"
                    style={{ background: CORES_HEX[c.cor] ?? CORES_HEX.blue }}
                  />
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-[14px] font-bold">
                      {c.nome}
                    </span>
                    <span className="mt-0.5 block text-[11.5px] text-fg-mute">
                      {abertas === 0
                        ? "nada em aberto"
                        : `${abertas} em aberto`}
                      {meus.length > 0 &&
                        ` · ${meus.length} projeto${meus.length > 1 ? "s" : ""}`}
                    </span>
                  </span>
                  <button
                    type="button"
                    onClick={() => editarCliente(c)}
                    aria-label={`Editar ${c.nome}`}
                    className="grid h-7 w-7 shrink-0 place-items-center rounded-lg text-fg-mute transition-colors hover:bg-ink-800 hover:text-fg"
                  >
                    <Pencil size={13} />
                  </button>
                  <button
                    type="button"
                    onClick={() => excluirCliente(c)}
                    aria-label={`Excluir ${c.nome}`}
                    className="grid h-7 w-7 shrink-0 place-items-center rounded-lg text-fg-mute transition-colors hover:bg-neg/12 hover:text-neg"
                  >
                    <Trash2 size={13} />
                  </button>
                </div>

                <div className="px-[18px] pb-[18px] pt-2.5">
                  {meus.length > 0 && (
                    <ul className="mb-2">
                      {meus.map((p) => (
                        <li
                          key={p.id}
                          className="group flex items-center gap-2 border-b border-line-soft py-1.5 last:border-0"
                        >
                          <FolderOpen size={12} className="shrink-0 text-fg-mute" />
                          <span className="min-w-0 flex-1 truncate text-[12.5px]">
                            {p.nome}
                          </span>
                          <span className="shrink-0 text-[11px] text-fg-mute tnum">
                            {contagem.porProjeto.get(p.id) ?? 0}
                          </span>
                          <button
                            type="button"
                            onClick={() => {
                              setEditandoProjeto(p);
                              setNomeProjeto(p.nome);
                              setProjetoDe(null);
                            }}
                            aria-label={`Renomear ${p.nome}`}
                            className="grid h-6 w-6 shrink-0 place-items-center rounded text-fg-mute transition-colors hover:text-fg"
                          >
                            <Pencil size={11} />
                          </button>
                          <button
                            type="button"
                            onClick={() => excluirProjeto(p)}
                            aria-label={`Excluir ${p.nome}`}
                            className="grid h-6 w-6 shrink-0 place-items-center rounded text-fg-mute transition-colors hover:text-neg"
                          >
                            <Trash2 size={11} />
                          </button>
                        </li>
                      ))}
                    </ul>
                  )}
                  <button
                    type="button"
                    onClick={() => {
                      setProjetoDe(c);
                      setEditandoProjeto(null);
                      setNomeProjeto("");
                    }}
                    className="flex h-8 w-full items-center justify-center gap-1.5 rounded-[10px] border border-dashed border-line text-[12px] font-semibold text-fg-mute transition-colors hover:border-brand-400 hover:text-brand-400"
                  >
                    <Plus size={13} />
                    projeto
                  </button>
                </div>
              </Card>
            );
          })}
        </div>
      )}

      {/* ---------------------------- modal cliente ---------------------------- */}
      <Modal
        open={abertoCliente}
        onClose={() => setAbertoCliente(false)}
        title={editando ? "Editar cliente" : "Novo cliente"}
        footer={
          <>
            <Button onClick={() => setAbertoCliente(false)}>Cancelar</Button>
            <Button variant="primary" onClick={salvarCliente} disabled={salvando}>
              {salvando ? "Salvando..." : "Salvar"}
            </Button>
          </>
        }
      >
        <div className="flex flex-col gap-4">
          <Field label="Nome">
            <Input
              value={form.nome}
              onChange={(e) => setForm({ ...form, nome: e.target.value })}
              placeholder="Bia"
              autoFocus
            />
          </Field>
          <Field label="Cor">
            <div className="flex flex-wrap gap-2">
              {NOTE_COLORS.map((cor) => (
                <button
                  key={cor}
                  type="button"
                  onClick={() => setForm({ ...form, cor })}
                  aria-label={cor}
                  aria-pressed={form.cor === cor}
                  className={cx(
                    "h-8 w-8 rounded-full transition-transform",
                    form.cor === cor
                      ? "ring-2 ring-brand-500"
                      : "opacity-70 hover:opacity-100"
                  )}
                  style={{ background: CORES_HEX[cor] }}
                />
              ))}
            </div>
          </Field>
          {editando && (
            <p className="text-[12px] leading-relaxed text-fg-mute">
              Mudar o nome aqui muda em todas as demandas deste cliente — é
              assim que dois nomes parecidos viram um só.
            </p>
          )}
          {erro && (
            <p className="rounded-[14px] bg-neg/12 p-3 text-xs font-medium text-neg">
              {erro}
            </p>
          )}
        </div>
      </Modal>

      {/* ---------------------------- modal projeto ---------------------------- */}
      <Modal
        open={!!projetoDe || !!editandoProjeto}
        onClose={() => {
          setProjetoDe(null);
          setEditandoProjeto(null);
        }}
        title={editandoProjeto ? "Renomear projeto" : "Novo projeto"}
        footer={
          <>
            <Button
              onClick={() => {
                setProjetoDe(null);
                setEditandoProjeto(null);
              }}
            >
              Cancelar
            </Button>
            <Button variant="primary" onClick={salvarProjeto} disabled={salvando}>
              {salvando ? "Salvando..." : "Salvar"}
            </Button>
          </>
        }
      >
        <Field
          label="Nome do projeto"
          hint={
            projetoDe
              ? `Dentro de ${projetoDe.nome}`
              : "Renomear muda em todas as demandas deste projeto."
          }
        >
          <Input
            value={nomeProjeto}
            onChange={(e) => setNomeProjeto(e.target.value)}
            placeholder="Canal Oficial"
            autoFocus
          />
        </Field>
      </Modal>

      {confirm.node}
      {notice.node}
    </>
  );
}
