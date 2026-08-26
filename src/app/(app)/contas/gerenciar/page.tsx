"use client";

import * as React from "react";
import Link from "next/link";
import {
  ArrowLeft,
  CreditCard,
  Dumbbell,
  GraduationCap,
  HandCoins,
  Home,
  Landmark,
  Megaphone,
  Package,
  Pencil,
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
import { brl, dataCurta } from "@/lib/format";
import { useCategorias } from "@/components/Categorias";
import {
  Button,
  Field,
  Input,
  Modal,
  Select,
  cx,
  useConfirm,
  useNotice,
} from "@/components/ui";

/* ícone por categoria; cai em carteira quando não há correspondência */
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

type Serie = {
  chave: string;
  descricao: string;
  categoria: string;
  valor: number;
  contas: Bill[];
  emAberto: number;
  pagas: number;
  /** dia do mês do lançamento mais recente */
  dia: number;
  parcelaAtual: number | null;
  parcelaTotal: number | null;
};

const ultimoDiaDoMes = (ano: number, mes1: number) =>
  new Date(ano, mes1, 0).getDate();

export default function GerenciarPage() {
  const supabase = React.useMemo(() => createClient(), []);
  const [rows, setRows] = React.useState<Bill[]>([]);
  const [carregando, setCarregando] = React.useState(true);
  const [busca, setBusca] = React.useState("");
  const [categoria, setCategoria] = React.useState("todas");
  const [editando, setEditando] = React.useState<Serie | null>(null);
  const confirm = useConfirm();
  const notice = useNotice();
  const categorias = useCategorias(supabase);

  const carregar = React.useCallback(async () => {
    const { data } = await supabase.from("bills").select("*").order("due_date");
    setRows(
      ((data as Bill[]) ?? []).map((b) => ({
        ...b,
        amount: Number(b.amount),
        paid_amount: b.paid_amount == null ? null : Number(b.paid_amount),
      }))
    );
    setCarregando(false);
  }, [supabase]);

  React.useEffect(() => {
    carregar();
  }, [carregar]);

  /**
   * Agrupa por descrição.
   *
   * É o que identifica uma série neste modelo: uma conta recorrente é a mesma
   * descrição repetida mês a mês. O limite conhecido: duas contas diferentes
   * com descrição idêntica caem no mesmo grupo.
   */
  const agrupar = React.useCallback(
    (lista: Bill[]): Serie[] => {
      const mapa = new Map<string, Bill[]>();
      lista.forEach((b) => {
        const atual = mapa.get(b.description) ?? [];
        atual.push(b);
        mapa.set(b.description, atual);
      });
      return [...mapa.entries()]
        .map(([descricao, contas]) => {
          const ordenadas = [...contas].sort((a, b) =>
            b.due_date.localeCompare(a.due_date)
          );
          const recente = ordenadas[0];
          return {
            chave: descricao,
            descricao,
            categoria: recente.category,
            valor: recente.amount,
            contas: ordenadas,
            emAberto: contas.filter((b) => b.status === "pending").length,
            pagas: contas.filter((b) => b.status === "paid").length,
            dia: Number(recente.due_date.slice(8, 10)),
            parcelaAtual: ordenadas.reduce<number | null>(
              (m, b) =>
                b.installment_no != null
                  ? Math.max(m ?? 0, b.installment_no)
                  : m,
              null
            ),
            parcelaTotal: recente.installment_total,
          };
        })
        .sort((a, b) => a.descricao.localeCompare(b.descricao, "pt-BR"));
    },
    []
  );

  const filtradas = React.useMemo(() => {
    const termo = busca.trim().toLowerCase();
    return rows
      .filter((b) => categoria === "todas" || b.category === categoria)
      .filter(
        (b) =>
          !termo ||
          b.description.toLowerCase().includes(termo) ||
          b.category.toLowerCase().includes(termo)
      );
  }, [rows, busca, categoria]);

  const recorrentes = React.useMemo(
    () => agrupar(filtradas.filter((b) => b.recurring)),
    [filtradas, agrupar]
  );
  const parceladas = React.useMemo(
    () => agrupar(filtradas.filter((b) => b.installment_total != null)),
    [filtradas, agrupar]
  );
  const abatidas = React.useMemo(
    () => agrupar(filtradas.filter((b) => ehAbatida(b))),
    [filtradas, agrupar]
  );

  /* ------------------------------ excluir série ------------------------------ */

  const excluirSerie = (s: Serie) => {
    const n = s.contas.length;
    const detalhe =
      s.pagas > 0
        ? ` Isso inclui ${s.pagas} já paga${s.pagas > 1 ? "s" : ""}, e o histórico vai junto.`
        : "";
    confirm.ask(
      `Excluir "${s.descricao}"? São ${n} lançamento${n > 1 ? "s" : ""}.${detalhe}`,
      async () => {
        const { error } = await supabase
          .from("bills")
          .delete()
          .in("id", s.contas.map((b) => b.id));
        if (!notice.check(error, "excluir a série")) carregar();
      }
    );
  };

  if (carregando) return null;

  const vazio =
    !recorrentes.length && !parceladas.length && !abatidas.length;

  return (
    <div className="rise max-w-[900px]">
      <div className="mb-5 flex flex-wrap items-start justify-between gap-3.5">
        <div className="flex items-start gap-3">
          <Link
            href="/contas"
            aria-label="Voltar para contas a pagar"
            className="mt-1 grid h-8 w-8 shrink-0 place-items-center rounded-[12px] text-fg-dim transition-colors hover:bg-ink-800 hover:text-fg"
          >
            <ArrowLeft size={18} />
          </Link>
          <div>
            <h1 className="text-[26px] font-bold tracking-[-0.03em]">
              Gerenciar contas
            </h1>
            <p className="mt-1 text-sm text-fg-mute">
              Edite ou exclua séries inteiras, sem mexer conta por conta.
            </p>
          </div>
        </div>
        <Link href="/contas">
          <Button variant="primary">
            <Wallet size={15} />
            Nova conta
          </Button>
        </Link>
      </div>

      {/* ------------------------------ filtros ------------------------------ */}
      <div className="mb-4 flex flex-wrap gap-2.5">
        <div className="relative w-full flex-1 sm:min-w-[220px]">
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
          className="w-full sm:w-[210px]"
        >
          <option value="todas">Todas categorias</option>
          {categorias.nomes.map((c) => (
            <option key={c}>{c}</option>
          ))}
        </Select>
      </div>

      {vazio ? (
        <div className="rounded-[22px] bg-white p-10 text-center shadow-[0_1px_2px_rgb(20_24_26/0.05)]">
          <div className="mx-auto mb-3 grid h-11 w-11 place-items-center rounded-[14px] bg-ink-800 text-fg-mute">
            <Repeat2 size={19} />
          </div>
          <p className="text-[13.5px] font-semibold text-fg-dim">
            Nada para gerenciar
          </p>
          <p className="mx-auto mt-1 max-w-[360px] text-xs text-fg-mute">
            Aqui aparecem contas marcadas como fixa, parceladas e abatidas. As
            contas de pagamento único ficam na lista principal.
          </p>
        </div>
      ) : (
        <div className="flex flex-col gap-6">
          <Grupo
            icone={Repeat2}
            titulo="Contas recorrentes"
            series={recorrentes}
            meta={(s) => `Todo dia ${s.dia}`}
            selo={(s) =>
              `${s.contas.length} ${s.contas.length === 1 ? "mês" : "meses"}`
            }
            onEditar={setEditando}
            onExcluir={excluirSerie}
          />
          <Grupo
            icone={CreditCard}
            titulo="Contas parceladas"
            series={parceladas}
            meta={(s) =>
              s.parcelaTotal
                ? `${s.parcelaAtual ?? 0} de ${s.parcelaTotal} parcelas`
                : "parcelada"
            }
            selo={(s) => `${s.contas.length} lançada${s.contas.length > 1 ? "s" : ""}`}
            onEditar={setEditando}
            onExcluir={excluirSerie}
          />
          <Grupo
            icone={HandCoins}
            titulo="Contas abatidas"
            series={abatidas}
            meta={(s) => {
              const falta = s.contas.reduce((t, b) => t + restanteDe(b), 0);
              return falta > 0 ? `falta ${brl(falta)}` : "quitada";
            }}
            selo={(s) => dataCurta(s.contas[0].due_date)}
            onEditar={setEditando}
            onExcluir={excluirSerie}
          />
        </div>
      )}

      <EditarSerie
        serie={editando}
        categorias={categorias.nomes}
        supabase={supabase}
        onFechar={() => setEditando(null)}
        onSalvo={() => {
          setEditando(null);
          carregar();
        }}
        notice={notice}
      />

      {confirm.node}
      {notice.node}
    </div>
  );
}

/* ------------------------------ grupo ------------------------------ */

function Grupo({
  icone: Icone,
  titulo,
  series,
  meta,
  selo,
  onEditar,
  onExcluir,
}: {
  icone: React.ElementType;
  titulo: string;
  series: Serie[];
  meta: (s: Serie) => string;
  selo: (s: Serie) => string;
  onEditar: (s: Serie) => void;
  onExcluir: (s: Serie) => void;
}) {
  if (!series.length) return null;

  return (
    <section>
      <h2 className="mb-2.5 flex items-center gap-2 px-1 text-[14px] font-bold">
        <Icone size={16} className="text-brand-400" />
        {titulo}
        <span className="font-semibold text-fg-mute tnum">({series.length})</span>
      </h2>

      <ul className="flex flex-col gap-2">
        {series.map((s) => {
          const Cat = ICONES[s.categoria] ?? Wallet;
          return (
            <li
              key={s.chave}
              className="group flex items-center gap-3 rounded-[18px] bg-white p-3.5 shadow-[0_1px_2px_rgb(20_24_26/0.05)]"
            >
              <span className="grid h-10 w-10 shrink-0 place-items-center rounded-[12px] bg-brand-500/12 text-brand-400">
                <Cat size={18} />
              </span>

              <div className="min-w-0 flex-1">
                <p className="truncate text-[13.5px] font-bold">{s.descricao}</p>
                <p className="mt-0.5 flex flex-wrap items-center gap-x-2 text-[11.5px] text-fg-mute">
                  <span className="font-bold text-fg tnum">{brl(s.valor)}</span>
                  <span>· {meta(s)}</span>
                  <span className="inline-flex items-center gap-1 rounded-full bg-brand-500/12 px-1.5 font-semibold text-brand-400">
                    {selo(s)}
                  </span>
                  {s.emAberto > 0 && (
                    <span className="text-warn">
                      {s.emAberto} em aberto
                    </span>
                  )}
                </p>
              </div>

              <div className="flex shrink-0 gap-0.5 transition-opacity lg:opacity-0 lg:group-hover:opacity-100 lg:focus-within:opacity-100">
                <button
                  onClick={() => onEditar(s)}
                  aria-label={`Editar ${s.descricao}`}
                  className="grid h-8 w-8 place-items-center rounded-[10px] text-fg-mute transition-colors hover:bg-ink-800 hover:text-fg"
                >
                  <Pencil size={15} />
                </button>
                <button
                  onClick={() => onExcluir(s)}
                  aria-label={`Excluir ${s.descricao}`}
                  className="grid h-8 w-8 place-items-center rounded-[10px] text-fg-mute transition-colors hover:bg-neg/15 hover:text-neg"
                >
                  <Trash2 size={15} />
                </button>
              </div>
            </li>
          );
        })}
      </ul>
    </section>
  );
}

/* ------------------------------ editar série ------------------------------ */

function EditarSerie({
  serie,
  categorias,
  supabase,
  onFechar,
  onSalvo,
  notice,
}: {
  serie: Serie | null;
  categorias: string[];
  supabase: ReturnType<typeof createClient>;
  onFechar: () => void;
  onSalvo: () => void;
  notice: { check: (e: { message: string } | null, q: string) => boolean };
}) {
  const [descricao, setDescricao] = React.useState("");
  const [valor, setValor] = React.useState("");
  const [categoria, setCategoria] = React.useState("Outros");
  const [dia, setDia] = React.useState(1);
  const [incluirPagas, setIncluirPagas] = React.useState(false);
  const [ocupado, setOcupado] = React.useState(false);
  const [erro, setErro] = React.useState("");

  React.useEffect(() => {
    if (!serie) return;
    setDescricao(serie.descricao);
    setValor(String(serie.valor).replace(".", ","));
    setCategoria(serie.categoria);
    setDia(serie.dia);
    setIncluirPagas(false);
    setErro("");
  }, [serie]);

  if (!serie) return null;

  const alvos = incluirPagas
    ? serie.contas
    : serie.contas.filter((b) => b.status === "pending");

  const salvar = async () => {
    setErro("");
    const desc = descricao.trim();
    const v = parseFloat(String(valor).replace(/\./g, "").replace(",", "."));
    if (!desc) return setErro("Informe a descrição.");
    if (!Number.isFinite(v) || v <= 0)
      return setErro("Informe um valor maior que zero.");
    if (!alvos.length)
      return setErro("Nada para alterar: a série não tem conta em aberto.");

    setOcupado(true);

    /*
     * Uma requisição por lançamento, porque o dia do mês depende da data de
     * cada um: 31 em fevereiro tem de virar 28, ou 29 em ano bissexto. Um
     * update único não conseguiria calcular isso por linha.
     */
    const erros: string[] = [];
    for (const b of alvos) {
      const ano = Number(b.due_date.slice(0, 4));
      const mes = Number(b.due_date.slice(5, 7));
      const diaFinal = Math.min(dia, ultimoDiaDoMes(ano, mes));
      const { error } = await supabase
        .from("bills")
        .update({
          description: desc,
          amount: v,
          category: categoria,
          due_date: `${ano}-${String(mes).padStart(2, "0")}-${String(
            diaFinal
          ).padStart(2, "0")}`,
        })
        .eq("id", b.id);
      if (error) erros.push(error.message);
    }

    setOcupado(false);
    if (erros.length) return setErro(erros[0]);
    onSalvo();
  };

  return (
    <Modal
      open={!!serie}
      onClose={onFechar}
      title="Editar série"
      sub={`${serie.contas.length} lançamento${serie.contas.length > 1 ? "s" : ""} com esta descrição.`}
      footer={
        <>
          <Button onClick={onFechar}>Cancelar</Button>
          <Button variant="primary" onClick={salvar} disabled={ocupado}>
            {ocupado ? "Salvando..." : `Aplicar em ${alvos.length}`}
          </Button>
        </>
      }
    >
      <div className="flex flex-col gap-3.5">
        <Field label="Descrição">
          <Input
            value={descricao}
            onChange={(e) => setDescricao(e.target.value)}
          />
        </Field>

        <div className="grid gap-3.5 sm:grid-cols-2">
          <Field label="Valor (R$)">
            <Input
              inputMode="decimal"
              value={valor}
              onChange={(e) => setValor(e.target.value)}
            />
          </Field>
          <Field label="Categoria">
            <Select
              value={categoria}
              onChange={(e) => setCategoria(e.target.value)}
            >
              {(categorias.includes(categoria)
                ? categorias
                : [categoria, ...categorias]
              ).map((c) => (
                <option key={c}>{c}</option>
              ))}
            </Select>
          </Field>
        </div>

        <Field
          label="Dia do mês"
          hint="Em meses curtos, cai no último dia disponível."
        >
          <Input
            type="number"
            min={1}
            max={31}
            value={dia}
            onChange={(e) => setDia(Number(e.target.value))}
          />
        </Field>

        <label
          className={cx(
            "flex cursor-pointer items-start gap-2.5 rounded-[14px] px-3.5 py-3",
            incluirPagas ? "bg-warn/12" : "bg-ink-800"
          )}
        >
          <input
            type="checkbox"
            checked={incluirPagas}
            onChange={(e) => setIncluirPagas(e.target.checked)}
            className="mt-0.5 h-4 w-4 accent-[var(--a)]"
          />
          <span className="text-sm text-fg-dim">
            <span className="font-semibold text-fg">
              Alterar também as já pagas
            </span>
            <span className="mt-0.5 block text-[11.5px] text-fg-mute">
              Por padrão só os {serie.emAberto} lançamento
              {serie.emAberto === 1 ? "" : "s"} em aberto mudam. Incluir as pagas
              reescreve histórico do que já saiu do bolso.
            </span>
          </span>
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
