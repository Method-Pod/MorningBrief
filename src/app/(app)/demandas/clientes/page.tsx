"use client";

import * as React from "react";
import Link from "next/link";
import {
  ArrowLeft,
  FolderOpen,
  GripVertical,
  Pencil,
  Plus,
  Trash2,
  Users,
} from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { currentUserId, SESSION_EXPIRED } from "@/lib/session";
import { NADA_GRAVADO } from "@/lib/erros";
import { useEstadoCacheado, temCache } from "@/lib/cachePagina";
import { type Cliente, type Projeto, type Task } from "@/lib/types";
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
import { useListaOrdenavel } from "@/components/arrastarLista";

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

const VAZIO_CLIENTE = { nome: "" };

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

  /*
   * Os projetos de cada cliente, na ordem que ele arrastou.
   *
   * A ordem sai daqui e nao do `order` da consulta de proposito: quando uma
   * linha muda de lugar, o que se escreve no estado e a posicao nova, e a
   * lista se reordena sozinha. Escrever no estado a ORDEM do vetor daria os
   * dois lugares para a mesma verdade.
   *
   * `?? 0` cobre a base sem a coluna: todos empatam em zero e o desempate
   * alfabetico entrega a ordem de antes.
   */
  const projetosDe = React.useMemo(() => {
    const m = new Map<string, Projeto[]>();
    for (const p of projetos) {
      const l = m.get(p.cliente_id) ?? [];
      l.push(p);
      m.set(p.cliente_id, l);
    }
    for (const l of m.values())
      l.sort(
        (a, b) =>
          (a.position ?? 0) - (b.position ?? 0) || a.nome.localeCompare(b.nome)
      );
    return m;
  }, [projetos]);

  /**
   * Grava a ordem nova, uma linha por projeto do cliente.
   *
   * Reescreve TODAS as posicoes daquele cliente, e nao so as que mudaram: sao
   * poucas, e assim uma base que tenha ficado com posicoes repetidas — dois
   * projetos em 3, por exemplo — se conserta no primeiro arrasto.
   */
  const ordenarProjetos = async (ordenados: Projeto[]) => {
    const posicoes = new Map(ordenados.map((p, i) => [p.id, i]));
    /* Otimista: a linha ja fica no lugar novo, e o banco confirma depois. */
    setProjetos((antes) =>
      antes.map((p) =>
        posicoes.has(p.id) ? { ...p, position: posicoes.get(p.id) } : p
      )
    );

    const respostas = await Promise.all(
      ordenados.map((p, i) =>
        supabase
          .from("projetos")
          .update({ position: i })
          .eq("id", p.id)
          .select("id")
      )
    );

    const comErro = respostas.find((r) => r.error);
    if (comErro?.error) {
      /* 42703 e "coluna nao existe": o SQL da ordem ainda nao foi rodado. */
      notice.show(
        comErro.error.code === "42703"
          ? "A ordem ainda nao existe no banco. Rode supabase/ORDEM-PROJETOS.sql no Supabase."
          : `Nao consegui gravar a ordem: ${comErro.error.message}`
      );
      return carregar();
    }
    if (respostas.some((r) => !r.data?.length)) {
      notice.show(NADA_GRAVADO);
      carregar();
    }
  };

  /* ------------------------------ cliente ------------------------------ */

  const novoCliente = () => {
    setEditando(null);
    setForm(VAZIO_CLIENTE);
    setErro("");
    setAbertoCliente(true);
  };

  const editarCliente = (c: Cliente) => {
    setEditando(c);
    setForm({ nome: c.nome });
    setErro("");
    setAbertoCliente(true);
  };

  const salvarCliente = async () => {
    const nome = form.nome.trim();
    if (!nome) return setErro("Dê um nome ao cliente.");
    setSalvando(true);
    setErro("");

    /* So o nome. A coluna `cor` continua no banco, com o padrao dela, e
       nao e mais escrita daqui: apagar coluna e irreversivel, e ela nao
       atrapalha ninguem parada. */
    const campos = { nome };
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
                  {/* Uma cor por cliente virou seis escolhas na hora de
                      cadastrar, para uma bolinha de 10px que ninguem usa para
                      achar nada — a ficha e ordenada por nome. Agora ela e a
                      cor de destaque do app, como o resto. */}
                  <span className="mt-1 h-2.5 w-2.5 shrink-0 rounded-full bg-brand-500" />
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
                    <ListaProjetos
                      projetos={meus}
                      abertas={contagem.porProjeto}
                      onOrdenar={ordenarProjetos}
                      onRenomear={(p) => {
                        setEditandoProjeto(p);
                        setNomeProjeto(p.nome);
                        setProjetoDe(null);
                      }}
                      onExcluir={excluirProjeto}
                    />
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

/* ------------------------- lista de projetos ------------------------- */

/**
 * Os projetos de um cliente, arrastáveis pelo punho.
 *
 * É um componente separado, e não um trecho do `map` acima, por um motivo de
 * regra: cada lista precisa do próprio `useListaOrdenavel`, e gancho não pode
 * ser chamado dentro de laço. Uma lista por cartão, um componente por lista.
 *
 * O punho substitui o ícone de pasta em vez de entrar ao lado dele. A pasta
 * não dizia nada que o cartão já não diga — estes SÃO os projetos do cliente
 * —, e mais um ícone por linha numa linha de cinco elementos é o que deixa a
 * ficha parecendo um painel de controle.
 *
 * Com um projeto só o punho some e a pasta volta: não há para onde arrastar,
 * e um punho que não faz nada é pior que nenhum.
 */
function ListaProjetos({
  projetos,
  abertas,
  onOrdenar,
  onRenomear,
  onExcluir,
}: {
  projetos: Projeto[];
  abertas: Map<string, number>;
  onOrdenar: (ordenados: Projeto[]) => void;
  onRenomear: (p: Projeto) => void;
  onExcluir: (p: Projeto) => void;
}) {
  const { refLista, arrastando, estilo, punho } = useListaOrdenavel(
    projetos,
    onOrdenar
  );
  const daParaArrastar = projetos.length > 1;

  return (
    <ul ref={refLista} className="mb-2">
      {projetos.map((p, i) => (
        <li
          key={p.id}
          data-ordenavel
          style={estilo(i)}
          className={cx(
            "flex items-center gap-2 border-b border-line-soft py-1.5 last:border-0",
            /* Enquanto uma linha viaja, a borda dela atrapalha: ela corta o
               desenho no meio das duas vagas. O fundo sólido é o que faz a
               linha parecer estar POR CIMA da lista, e não dentro dela. */
            arrastando === i &&
              "rounded-lg border-transparent bg-ink-800 shadow-[var(--elev-2)]"
          )}
        >
          {daParaArrastar ? (
            <button
              type="button"
              {...punho(i)}
              aria-label={`Mover ${p.nome}`}
              title="Arraste para mudar a ordem"
              className={cx(
                "grid h-6 w-4 shrink-0 cursor-grab place-items-center rounded text-fg-mute transition-colors hover:text-fg active:cursor-grabbing",
                arrastando === i && "cursor-grabbing text-fg"
              )}
            >
              <GripVertical size={12} />
            </button>
          ) : (
            <FolderOpen size={12} className="shrink-0 text-fg-mute" />
          )}
          <span className="min-w-0 flex-1 truncate text-[12.5px]">
            {p.nome}
          </span>
          <span className="shrink-0 text-[11px] text-fg-mute tnum">
            {abertas.get(p.id) ?? 0}
          </span>
          <button
            type="button"
            onClick={() => onRenomear(p)}
            aria-label={`Renomear ${p.nome}`}
            className="grid h-6 w-6 shrink-0 place-items-center rounded text-fg-mute transition-colors hover:text-fg"
          >
            <Pencil size={11} />
          </button>
          <button
            type="button"
            onClick={() => onExcluir(p)}
            aria-label={`Excluir ${p.nome}`}
            className="grid h-6 w-6 shrink-0 place-items-center rounded text-fg-mute transition-colors hover:text-neg"
          >
            <Trash2 size={11} />
          </button>
        </li>
      ))}
    </ul>
  );
}
