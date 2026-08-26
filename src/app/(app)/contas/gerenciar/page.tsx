"use client";

import * as React from "react";
import Link from "next/link";
import {
  ArrowLeft,
  ChevronRight,
  CreditCard,
  Dumbbell,
  GraduationCap,
  HandCoins,
  Home,
  Landmark,
  Megaphone,
  Package,
  Pencil,
  Receipt,
  Repeat2,
  Search,
  Trash2,
  Tv,
  Users,
  Wallet,
  Wifi,
} from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { ehAbatida, restanteDe, type Bill } from "@/lib/types";
import { brl, dataCurta, rotuloMes } from "@/lib/format";
import { useCategorias } from "@/components/Categorias";
import {
  Button,
  Field,
  Input,
  Modal,
  Select,
  Textarea,
  cx,
  useConfirm,
  useNotice,
} from "@/components/ui";

/** Ícone por categoria; cai em carteira quando não há correspondência. */
const ICONES: Record<string, React.ElementType> = {
  Moradia: Home,
  Impostos: Landmark,
  Fornecedores: Package,
  Software: Tv,
  Marketing: Megaphone,
  Equipe: Users,
  Saúde: Dumbbell,
  Educação: GraduationCap,
  Internet: Wifi,
  Cartão: CreditCard,
};

type Tipo = "parcelada" | "abatida" | "recorrente" | "avulsa";

/**
 * Cada conta entra em um tipo só.
 *
 * Uma conta pode ser recorrente e abatida ao mesmo tempo; sem uma ordem fixa,
 * ela apareceria em duas seções e as contagens do cabeçalho somariam mais que o
 * total de contas.
 */
const tipoDe = (b: Bill): Tipo =>
  b.installment_total != null
    ? "parcelada"
    : ehAbatida(b)
      ? "abatida"
      : b.recurring
        ? "recorrente"
        : "avulsa";

type Grupo = {
  chave: string;
  descricao: string;
  categoria: string;
  valor: number;
  dia: number;
  contas: Bill[];
  emAberto: number;
  parcelaAtual: number | null;
  parcelaTotal: number | null;
  falta: number;
};

const numero = (b: Bill): Bill => ({
  ...b,
  amount: Number(b.amount),
  paid_amount: b.paid_amount == null ? null : Number(b.paid_amount),
});

export default function GerenciarPage() {
  const supabase = React.useMemo(() => createClient(), []);
  const [rows, setRows] = React.useState<Bill[]>([]);
  const [carregando, setCarregando] = React.useState(true);
  const [busca, setBusca] = React.useState("");
  const [categoria, setCategoria] = React.useState("todas");
  const [situacao, setSituacao] = React.useState("todas");
  const [abertos, setAbertos] = React.useState<Set<string>>(new Set());
  const [editando, setEditando] = React.useState<Bill | null>(null);
  const confirm = useConfirm();
  const notice = useNotice();
  const categorias = useCategorias(supabase);

  const carregar = React.useCallback(async () => {
    const { data } = await supabase
      .from("bills")
      .select("*")
      .order("due_date", { ascending: false });
    setRows(((data as Bill[]) ?? []).map(numero));
    setCarregando(false);
  }, [supabase]);

  React.useEffect(() => {
    carregar();
  }, [carregar]);

  const filtradas = React.useMemo(() => {
    const termo = busca.trim().toLowerCase();
    return rows
      .filter((b) => categoria === "todas" || b.category === categoria)
      .filter((b) => situacao === "todas" || b.status === situacao)
      .filter(
        (b) =>
          !termo ||
          b.description.toLowerCase().includes(termo) ||
          b.category.toLowerCase().includes(termo)
      );
  }, [rows, busca, categoria, situacao]);

  /**
   * Agrupa por descrição dentro do tipo.
   *
   * É o que identifica uma série neste modelo: uma conta recorrente é a mesma
   * descrição repetida mês a mês. Limite conhecido: duas contas diferentes com
   * descrição idêntica caem no mesmo grupo — abrir o grupo mostra cada uma
   * separada, e a edição é sempre de uma conta só, então nada é alterado em
   * bloco por engano.
   */
  const grupos = React.useMemo(() => {
    const porTipo: Record<Tipo, Map<string, Bill[]>> = {
      parcelada: new Map(),
      abatida: new Map(),
      recorrente: new Map(),
      avulsa: new Map(),
    };
    filtradas.forEach((b) => {
      const mapa = porTipo[tipoDe(b)];
      const lista = mapa.get(b.description) ?? [];
      lista.push(b);
      mapa.set(b.description, lista);
    });

    const montar = (tipo: Tipo): Grupo[] =>
      [...porTipo[tipo].entries()]
        .map(([descricao, contas]) => {
          const ordenadas = [...contas].sort((a, b) =>
            b.due_date.localeCompare(a.due_date)
          );
          const recente = ordenadas[0];
          return {
            chave: `${tipo}:${descricao}`,
            descricao,
            categoria: recente.category,
            valor: recente.amount,
            dia: Number(recente.due_date.slice(8, 10)),
            contas: ordenadas,
            emAberto: contas.filter((b) => b.status === "pending").length,
            parcelaAtual: ordenadas.reduce<number | null>(
              (m, b) =>
                b.installment_no != null ? Math.max(m ?? 0, b.installment_no) : m,
              null
            ),
            parcelaTotal: recente.installment_total,
            falta: contas.reduce((t, b) => t + restanteDe(b), 0),
          };
        })
        .sort((a, b) => a.descricao.localeCompare(b.descricao, "pt-BR"));

    return {
      recorrente: montar("recorrente"),
      parcelada: montar("parcelada"),
      abatida: montar("abatida"),
      avulsa: montar("avulsa"),
    };
  }, [filtradas]);

  const alternar = (chave: string) =>
    setAbertos((s) => {
      const novo = new Set(s);
      if (novo.has(chave)) novo.delete(chave);
      else novo.add(chave);
      return novo;
    });

  const excluirConta = (b: Bill) =>
    confirm.ask(
      `Excluir "${b.description}" de ${dataCurta(b.due_date)}?${
        b.status === "paid"
          ? " Esta conta já está paga, e o histórico vai com ela."
          : ""
      }`,
      async () => {
        const { error } = await supabase.from("bills").delete().eq("id", b.id);
        if (!notice.check(error, "excluir a conta")) carregar();
      }
    );

  const vazio = !filtradas.length;

  return (
    <div className="rise max-w-[900px]">
      <div className="mb-5 flex items-start gap-3">
        <Link
          href="/contas"
          aria-label="Voltar para contas a pagar"
          className="mt-1 grid h-8 w-8 shrink-0 place-items-center rounded-[12px] text-fg-dim transition-colors hover:bg-ink-800 hover:text-fg"
        >
          <ArrowLeft size={18} />
        </Link>
        <div className="min-w-0">
          <h1 className="text-[26px] font-bold tracking-[-0.03em]">
            Gerenciar contas
          </h1>
          <p className="mt-1 text-sm text-fg-mute">
            Abra uma série e altere conta por conta: data, valor, categoria ou
            situação.
          </p>
        </div>
      </div>

      {/* ------------------------------ filtros ------------------------------ */}
      <div className="mb-4 flex flex-wrap gap-2.5">
        <div className="relative w-full min-w-[180px] flex-1">
          <Search
            size={15}
            className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-fg-mute"
          />
          <Input
            value={busca}
            onChange={(e) => setBusca(e.target.value)}
            placeholder="Buscar conta..."
            aria-label="Buscar conta"
            className="pl-9"
          />
        </div>
        <Select
          value={categoria}
          onChange={(e) => setCategoria(e.target.value)}
          aria-label="Filtrar por categoria"
          className="w-[calc(50%-5px)] sm:w-[180px]"
        >
          <option value="todas">Todas categorias</option>
          {categorias.nomes.map((c) => (
            <option key={c}>{c}</option>
          ))}
        </Select>
        <Select
          value={situacao}
          onChange={(e) => setSituacao(e.target.value)}
          aria-label="Filtrar por situação"
          className="w-[calc(50%-5px)] sm:w-[150px]"
        >
          <option value="todas">Todas situações</option>
          <option value="pending">Em aberto</option>
          <option value="paid">Pagas</option>
        </Select>
      </div>

      {carregando ? null : vazio ? (
        <div className="rounded-[22px] bg-white p-10 text-center shadow-[0_1px_2px_rgb(20_24_26/0.05)]">
          <div className="mx-auto mb-3 grid h-11 w-11 place-items-center rounded-[14px] bg-ink-800 text-fg-mute">
            <Search size={19} />
          </div>
          <p className="text-[13.5px] font-semibold text-fg-dim">
            {rows.length
              ? "Nenhuma conta com esses filtros"
              : "Nenhuma conta ainda"}
          </p>
          <p className="mx-auto mt-1 max-w-[340px] text-xs text-fg-mute">
            {rows.length
              ? "Limpe a busca ou troque os filtros."
              : "Crie a primeira em Contas a pagar."}
          </p>
        </div>
      ) : (
        <div className="flex flex-col gap-6">
          <Secao
            icone={Repeat2}
            titulo="Contas recorrentes"
            grupos={grupos.recorrente}
            resumo={(g) => `Todo dia ${g.dia}`}
            selo={(g) =>
              `${g.contas.length} ${g.contas.length === 1 ? "mês" : "meses"}`
            }
            abertos={abertos}
            alternar={alternar}
            setEditando={setEditando}
            excluirConta={excluirConta}
          />
          <Secao
            icone={CreditCard}
            titulo="Contas parceladas"
            grupos={grupos.parcelada}
            resumo={(g) =>
              g.parcelaTotal
                ? `${g.parcelaAtual ?? 0} de ${g.parcelaTotal} parcelas`
                : "parcelada"
            }
            selo={(g) =>
              `${g.contas.length} lançada${g.contas.length > 1 ? "s" : ""}`
            }
            abertos={abertos}
            alternar={alternar}
            setEditando={setEditando}
            excluirConta={excluirConta}
          />
          <Secao
            icone={HandCoins}
            titulo="Contas abatidas"
            grupos={grupos.abatida}
            resumo={(g) => (g.falta > 0 ? `falta ${brl(g.falta)}` : "quitada")}
            selo={(g) => `${g.contas.length} conta${g.contas.length > 1 ? "s" : ""}`}
            abertos={abertos}
            alternar={alternar}
            setEditando={setEditando}
            excluirConta={excluirConta}
          />
          <Secao
            icone={Receipt}
            titulo="Contas avulsas"
            grupos={grupos.avulsa}
            resumo={(g) => dataCurta(g.contas[0].due_date)}
            selo={(g) => (g.contas.length > 1 ? `${g.contas.length} lançamentos` : "")}
            abertos={abertos}
            alternar={alternar}
            setEditando={setEditando}
            excluirConta={excluirConta}
          />
        </div>
      )}

      <EditarConta
        conta={editando}
        categorias={categorias.nomes}
        supabase={supabase}
        onFechar={() => setEditando(null)}
        onSalvo={() => {
          setEditando(null);
          carregar();
        }}
      />

      {confirm.node}
      {notice.node}
    </div>
  );
}

/* ------------------------------ seção ------------------------------ */

function Secao({
  icone: Icone,
  titulo,
  grupos,
  resumo,
  selo,
  abertos,
  alternar,
  setEditando,
  excluirConta,
}: {
  icone: React.ElementType;
  titulo: string;
  grupos: Grupo[];
  resumo: (g: Grupo) => string;
  selo: (g: Grupo) => string;
  abertos: Set<string>;
  alternar: (chave: string) => void;
  setEditando: (b: Bill) => void;
  excluirConta: (b: Bill) => void;
}) {
  if (!grupos.length) return null;

  return (
    <section>
      <h2 className="mb-2.5 flex items-center gap-2 px-1 text-[14px] font-bold">
        <Icone size={16} className="text-brand-400" />
        {titulo}
        <span className="font-semibold text-fg-mute tnum">({grupos.length})</span>
      </h2>

      <ul className="flex flex-col gap-2">
        {grupos.map((g) => {
          const Cat = ICONES[g.categoria] ?? Wallet;
          const unica = g.contas.length === 1;
          const aberto = abertos.has(g.chave);
          const marca = selo(g);

          return (
            <li
              key={g.chave}
              className="overflow-hidden rounded-[18px] bg-white shadow-[0_1px_2px_rgb(20_24_26/0.05)]"
            >
              <div className="group flex items-center gap-3 p-3.5">
                {/*
                  Grupo de uma conta só não expande: abrir para mostrar a mesma
                  linha de novo seria um clique sem resposta visível.
                */}
                {unica ? (
                  <span className="grid h-10 w-10 shrink-0 place-items-center rounded-[12px] bg-brand-500/12 text-brand-400">
                    <Cat size={18} />
                  </span>
                ) : (
                  <button
                    onClick={() => alternar(g.chave)}
                    aria-expanded={aberto}
                    aria-label={`${aberto ? "Fechar" : "Abrir"} ${g.descricao}`}
                    className="relative grid h-10 w-10 shrink-0 place-items-center rounded-[12px] bg-brand-500/12 text-brand-400 transition-colors hover:bg-brand-500/20"
                  >
                    <Cat size={18} />
                    <ChevronRight
                      size={12}
                      strokeWidth={3}
                      className={cx(
                        "absolute -bottom-0.5 -right-0.5 rounded-full bg-white text-fg-dim shadow-[0_1px_2px_rgb(20_24_26/0.14)]",
                        aberto && "rotate-90"
                      )}
                    />
                  </button>
                )}

                <button
                  onClick={() => (unica ? setEditando(g.contas[0]) : alternar(g.chave))}
                  className="min-w-0 flex-1 text-left"
                >
                  <p className="truncate text-[13.5px] font-bold">{g.descricao}</p>
                  <p className="mt-0.5 flex flex-wrap items-center gap-x-2 text-[11.5px] text-fg-mute">
                    <span className="font-bold text-fg tnum">{brl(g.valor)}</span>
                    <span>· {resumo(g)}</span>
                    {marca && (
                      <span className="rounded-full bg-brand-500/12 px-1.5 font-semibold text-brand-400">
                        {marca}
                      </span>
                    )}
                    {g.emAberto > 0 && (
                      <span className="font-semibold text-warn tnum">
                        {g.emAberto} em aberto
                      </span>
                    )}
                  </p>
                </button>

                <div className="flex shrink-0 gap-0.5 transition-opacity lg:opacity-0 lg:group-hover:opacity-100 lg:focus-within:opacity-100">
                  {unica ? (
                    <>
                      <button
                        onClick={() => setEditando(g.contas[0])}
                        aria-label={`Editar ${g.descricao}`}
                        className="grid h-8 w-8 place-items-center rounded-[10px] text-fg-mute transition-colors hover:bg-ink-800 hover:text-fg"
                      >
                        <Pencil size={15} />
                      </button>
                      <button
                        onClick={() => excluirConta(g.contas[0])}
                        aria-label={`Excluir ${g.descricao}`}
                        className="grid h-8 w-8 place-items-center rounded-[10px] text-fg-mute transition-colors hover:bg-neg/15 hover:text-neg"
                      >
                        <Trash2 size={15} />
                      </button>
                    </>
                  ) : (
                    <span className="pr-1 text-[11px] font-semibold text-fg-mute">
                      {aberto ? "fechar" : "abrir"}
                    </span>
                  )}
                </div>
              </div>

              {aberto && !unica && (
                <ul className="fade border-t border-line-soft bg-ink-900/40 px-3.5 py-1.5">
                  {g.contas.map((b) => (
                    <Ocorrencia
                      key={b.id}
                      conta={b}
                      onEditar={() => setEditando(b)}
                      onExcluir={() => excluirConta(b)}
                    />
                  ))}
                </ul>
              )}
            </li>
          );
        })}
      </ul>
    </section>
  );
}

/** Uma conta dentro da série, com edição e exclusão próprias. */
function Ocorrencia({
  conta,
  onEditar,
  onExcluir,
}: {
  conta: Bill;
  onEditar: () => void;
  onExcluir: () => void;
}) {
  const paga = conta.status === "paid";
  const falta = restanteDe(conta);

  return (
    <li className="group/o flex items-center gap-2.5 border-b border-line-soft py-2 last:border-0">
      <span
        className={cx("h-1.5 w-1.5 shrink-0 rounded-full", paga ? "bg-pos" : "bg-warn")}
        aria-hidden
      />
      <button
        onClick={onEditar}
        className="flex min-w-0 flex-1 flex-wrap items-baseline gap-x-2 text-left"
      >
        <span className="text-[12.5px] font-semibold tnum">
          {dataCurta(conta.due_date)}
        </span>
        <span className="text-[11px] text-fg-mute">{rotuloMes(conta.due_date)}</span>
        <span className="text-[12.5px] font-bold tnum">{brl(conta.amount)}</span>
        {conta.installment_no != null && conta.installment_total != null && (
          <span className="text-[11px] text-fg-mute tnum">
            {conta.installment_no}/{conta.installment_total}
          </span>
        )}
        {ehAbatida(conta) && falta > 0 && (
          <span className="text-[11px] font-semibold text-warn tnum">
            falta {brl(falta)}
          </span>
        )}
        <span
          className={cx(
            "rounded-full px-1.5 text-[10.5px] font-bold",
            paga ? "bg-pos/12 text-pos" : "bg-warn/12 text-warn"
          )}
        >
          {paga ? "paga" : "em aberto"}
        </span>
      </button>

      <div className="flex shrink-0 gap-0.5 transition-opacity lg:opacity-0 lg:group-hover/o:opacity-100 lg:focus-within:opacity-100">
        <button
          onClick={onEditar}
          aria-label={`Editar ${conta.description} de ${dataCurta(conta.due_date)}`}
          className="grid h-7 w-7 place-items-center rounded-lg text-fg-mute transition-colors hover:bg-ink-800 hover:text-fg"
        >
          <Pencil size={13} />
        </button>
        <button
          onClick={onExcluir}
          aria-label={`Excluir ${conta.description} de ${dataCurta(conta.due_date)}`}
          className="grid h-7 w-7 place-items-center rounded-lg text-fg-mute transition-colors hover:bg-neg/15 hover:text-neg"
        >
          <Trash2 size={13} />
        </button>
      </div>
    </li>
  );
}

/* ------------------------------ editar uma conta ------------------------------ */

const paraCampo = (n: number) => String(n).replace(".", ",");
const paraNumero = (s: string) =>
  parseFloat(String(s).replace(/\./g, "").replace(",", "."));

function EditarConta({
  conta,
  categorias,
  supabase,
  onFechar,
  onSalvo,
}: {
  conta: Bill | null;
  categorias: string[];
  supabase: ReturnType<typeof createClient>;
  onFechar: () => void;
  onSalvo: () => void;
}) {
  const [descricao, setDescricao] = React.useState("");
  const [valor, setValor] = React.useState("");
  const [vencimento, setVencimento] = React.useState("");
  const [categoria, setCategoria] = React.useState("Outros");
  const [status, setStatus] = React.useState("pending");
  const [recorrente, setRecorrente] = React.useState(false);
  const [abatido, setAbatido] = React.useState("");
  const [parcelaNo, setParcelaNo] = React.useState("");
  const [parcelaTotal, setParcelaTotal] = React.useState("");
  const [observacoes, setObservacoes] = React.useState("");
  const [ocupado, setOcupado] = React.useState(false);
  const [erro, setErro] = React.useState("");

  React.useEffect(() => {
    if (!conta) return;
    setDescricao(conta.description);
    setValor(paraCampo(Number(conta.amount)));
    setVencimento(conta.due_date.slice(0, 10));
    setCategoria(conta.category);
    setStatus(conta.status);
    setRecorrente(conta.recurring);
    setAbatido(conta.paid_amount == null ? "" : paraCampo(Number(conta.paid_amount)));
    setParcelaNo(conta.installment_no == null ? "" : String(conta.installment_no));
    setParcelaTotal(
      conta.installment_total == null ? "" : String(conta.installment_total)
    );
    setObservacoes(conta.notes ?? "");
    setErro("");
  }, [conta]);

  if (!conta) return null;

  const salvar = async () => {
    setErro("");
    const desc = descricao.trim();
    const v = paraNumero(valor);
    if (!desc) return setErro("Informe a descrição.");
    if (!Number.isFinite(v) || v <= 0)
      return setErro("Informe um valor maior que zero.");
    if (!/^\d{4}-\d{2}-\d{2}$/.test(vencimento))
      return setErro("Informe o vencimento.");

    const temAbatido = abatido.trim() !== "";
    const pago = temAbatido ? paraNumero(abatido) : null;
    if (pago != null && (!Number.isFinite(pago) || pago < 0))
      return setErro("O valor já abatido não pode ser negativo.");
    if (pago != null && pago > v + 0.001)
      return setErro(`O já abatido (${brl(pago)}) passa do valor total (${brl(v)}).`);

    const no = parcelaNo.trim() === "" ? null : Number(parcelaNo);
    const totalParcelas = parcelaTotal.trim() === "" ? null : Number(parcelaTotal);
    if (no != null && totalParcelas != null && no > totalParcelas)
      return setErro("O número da parcela é maior que o total de parcelas.");

    setOcupado(true);
    /*
     * paid_at acompanha o status: uma conta que volta para em aberto não pode
     * continuar com data de pagamento, e uma que passa a paga sem data ficaria
     * fora dos totais por período. Se já havia data e o status não mudou, a
     * data original é preservada.
     */
    const { error } = await supabase
      .from("bills")
      .update({
        description: desc,
        amount: v,
        due_date: vencimento,
        category: categoria,
        status,
        recurring: recorrente,
        notes: observacoes.trim(),
        paid_amount: pago,
        installment_no: no,
        installment_total: totalParcelas,
        paid_at:
          status === "paid" ? (conta.paid_at ?? new Date().toISOString()) : null,
      })
      .eq("id", conta.id);
    setOcupado(false);

    if (error) {
      if (error.code === "PGRST204" && error.message.includes("paid_amount"))
        return setErro(
          "A coluna de abatimento ainda não existe. Rode supabase/ABATIDAS.sql no SQL Editor."
        );
      return setErro(error.message);
    }
    onSalvo();
  };

  const listaCategorias = categorias.includes(categoria)
    ? categorias
    : [categoria, ...categorias];

  return (
    <Modal
      open={!!conta}
      onClose={onFechar}
      title="Editar conta"
      sub={`${conta.description} · ${dataCurta(conta.due_date)}`}
      footer={
        <>
          <Button onClick={onFechar}>Cancelar</Button>
          <Button variant="primary" onClick={salvar} disabled={ocupado}>
            {ocupado ? "Salvando..." : "Salvar"}
          </Button>
        </>
      }
    >
      <div className="flex flex-col gap-3.5">
        <Field label="Descrição">
          <Input value={descricao} onChange={(e) => setDescricao(e.target.value)} />
        </Field>

        <div className="grid gap-3.5 sm:grid-cols-2">
          <Field label="Valor (R$)">
            <Input
              inputMode="decimal"
              value={valor}
              onChange={(e) => setValor(e.target.value)}
            />
          </Field>
          <Field label="Vencimento">
            <Input
              type="date"
              value={vencimento}
              onChange={(e) => setVencimento(e.target.value)}
            />
          </Field>
        </div>

        <div className="grid gap-3.5 sm:grid-cols-2">
          <Field label="Categoria">
            <Select value={categoria} onChange={(e) => setCategoria(e.target.value)}>
              {listaCategorias.map((c) => (
                <option key={c}>{c}</option>
              ))}
            </Select>
          </Field>
          <Field label="Situação">
            <Select value={status} onChange={(e) => setStatus(e.target.value)}>
              <option value="pending">Em aberto</option>
              <option value="paid">Paga</option>
            </Select>
          </Field>
        </div>

        <Field label="Já abatido (R$)" hint="Deixe vazio para pagamento único.">
          <Input
            inputMode="decimal"
            value={abatido}
            onChange={(e) => setAbatido(e.target.value)}
            placeholder="vazio"
          />
        </Field>

        <div className="grid gap-3.5 sm:grid-cols-2">
          <Field label="Parcela nº">
            <Input
              type="number"
              min={1}
              value={parcelaNo}
              onChange={(e) => setParcelaNo(e.target.value)}
              placeholder="vazio"
            />
          </Field>
          <Field label="Total de parcelas">
            <Input
              type="number"
              min={1}
              value={parcelaTotal}
              onChange={(e) => setParcelaTotal(e.target.value)}
              placeholder="vazio"
            />
          </Field>
        </div>

        <Field label="Observações">
          <Textarea
            rows={2}
            value={observacoes}
            onChange={(e) => setObservacoes(e.target.value)}
          />
        </Field>

        <label className="flex cursor-pointer items-center gap-2.5 rounded-[14px] bg-ink-800 px-3.5 py-3">
          <input
            type="checkbox"
            checked={recorrente}
            onChange={(e) => setRecorrente(e.target.checked)}
            className="h-4 w-4 accent-[var(--a)]"
          />
          <span className="text-sm font-semibold text-fg-dim">Conta fixa</span>
        </label>

        {erro && (
          <p className="rounded-[14px] bg-neg/12 px-3.5 py-3 text-xs font-medium text-neg">
            {erro}
          </p>
        )}
      </div>
    </Modal>
  );
}
