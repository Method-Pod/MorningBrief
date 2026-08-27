"use client";

import * as React from "react";
import Link from "next/link";
import { ArrowLeft, Pencil, Plus, Search, Trash2 } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { currentUserId, SESSION_EXPIRED } from "@/lib/session";
import { mesesAdiante } from "@/components/ContasExtras";
import { ehAbatida, restanteDe, type Bill } from "@/lib/types";
import { brl, dataCurta, rotuloMes } from "@/lib/format";
import { useCategorias } from "@/components/Categorias";
import {
  Button,
  Card,
  Field,
  Input,
  Modal,
  Select,
  Textarea,
  cx,
  useConfirm,
  useNotice,
} from "@/components/ui";

type Tipo = "fixa" | "parcelada" | "abatida" | "avulsa";
type Filtro = "todas" | Tipo;

const FILTROS: { v: Filtro; label: string }[] = [
  { v: "todas", label: "Todas" },
  { v: "fixa", label: "Fixas" },
  { v: "parcelada", label: "Parceladas" },
  { v: "abatida", label: "Abatidas" },
  { v: "avulsa", label: "Avulsas" },
];

/**
 * Cada conta entra em um tipo só.
 *
 * Uma conta pode ser fixa e abatida ao mesmo tempo; sem uma ordem fixa ela
 * apareceria em dois filtros e as contagens dos chips somariam mais que o
 * total de contas.
 */
const tipoDe = (b: Bill): Tipo =>
  b.installment_total != null
    ? "parcelada"
    : ehAbatida(b)
      ? "abatida"
      : b.recurring
        ? "fixa"
        : "avulsa";

/** "ago/26" → "ago". A faixa já está em ordem, o ano só polui. */
const mesCurto = (iso: string) => rotuloMes(iso).split("/")[0];

const ultimoDiaDoMes = (ano: number, mes1: number) =>
  new Date(ano, mes1, 0).getDate();

/** Mesma data, outro dia do mês, encolhido quando o mês é curto. */
const trocarDia = (iso: string, dia: number) => {
  const ano = Number(iso.slice(0, 4));
  const mes = Number(iso.slice(5, 7));
  const d = Math.min(dia, ultimoDiaDoMes(ano, mes));
  return `${ano}-${String(mes).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
};

/**
 * Quantas parcelas do total ainda não foram lançadas.
 *
 * Conta a partir da maior parcela existente, e não de `total - linhas`: uma
 * parcela 5 de 5 lançada sozinha é a quinta e não falta nenhuma, enquanto
 * subtrair linhas diria que faltam quatro.
 */
const faltamDe = (contas: Bill[], total: number | null) => {
  if (total == null) return 0;
  const maior = contas.reduce(
    (m, b) => (b.installment_no != null ? Math.max(m, b.installment_no) : m),
    0
  );
  return Math.max(0, total - Math.max(maior, contas.length));
};

type Serie = {
  chave: string;
  descricao: string;
  categoria: string;
  tipo: Tipo;
  valor: number;
  dia: number;
  /** ordem cronológica, do mais antigo para o mais novo */
  contas: Bill[];
  emAberto: Bill[];
  falta: number;
  parcelaTotal: number | null;
  /** maior installment_no presente, para dizer em que parcela a conta está */
  parcelaAtual: number | null;
  /** parcelas do total que ainda não têm lançamento */
  faltam: number;
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
  const [filtro, setFiltro] = React.useState<Filtro>("todas");
  const [busca, setBusca] = React.useState("");
  const [categoria, setCategoria] = React.useState("todas");
  const [edicao, setEdicao] = React.useState<{ conta: Bill; serie: Serie } | null>(
    null
  );
  const confirm = useConfirm();
  const notice = useNotice();
  const categorias = useCategorias(supabase);

  const carregar = React.useCallback(async () => {
    const { data } = await supabase.from("bills").select("*").order("due_date");
    setRows(((data as Bill[]) ?? []).map(numero));
    setCarregando(false);
  }, [supabase]);

  React.useEffect(() => {
    carregar();
  }, [carregar]);

  /**
   * Uma série é a mesma descrição repetida — é o que liga os lançamentos neste
   * modelo, onde cada mês é uma linha própria. O tipo entra na chave para que
   * uma parcelada e uma fixa de mesmo nome não virem a mesma série.
   */
  const series = React.useMemo(() => {
    const mapa = new Map<string, Bill[]>();
    rows.forEach((b) => {
      const chave = `${tipoDe(b)}:${b.description}`;
      const lista = mapa.get(chave) ?? [];
      lista.push(b);
      mapa.set(chave, lista);
    });

    return [...mapa.entries()]
      .map(([chave, contas]) => {
        const ordenadas = [...contas].sort((a, b) =>
          a.due_date.localeCompare(b.due_date)
        );
        const recente = ordenadas[ordenadas.length - 1];
        return {
          chave,
          descricao: recente.description,
          categoria: recente.category,
          tipo: tipoDe(recente),
          valor: recente.amount,
          dia: Number(recente.due_date.slice(8, 10)),
          contas: ordenadas,
          emAberto: ordenadas.filter((b) => b.status === "pending"),
          falta: ordenadas.reduce((t, b) => t + restanteDe(b), 0),
          parcelaTotal: recente.installment_total,
          /*
           * Vem de installment_no, não da contagem de linhas: uma parcela 5 de
           * 5 lançada sozinha é a quinta parcela, e contar linhas diria "1 de
           * 5" — o oposto do que a conta é.
           */
          parcelaAtual: ordenadas.reduce<number | null>(
            (m, b) =>
              b.installment_no != null ? Math.max(m ?? 0, b.installment_no) : m,
            null
          ),
          faltam: faltamDe(ordenadas, recente.installment_total),
        };
      })
      .sort((a, b) => a.descricao.localeCompare(b.descricao, "pt-BR"));
  }, [rows]);

  const contagens = React.useMemo(() => {
    const c: Record<Filtro, number> = {
      todas: series.length,
      fixa: 0,
      parcelada: 0,
      abatida: 0,
      avulsa: 0,
    };
    series.forEach((s) => (c[s.tipo] += 1));
    return c;
  }, [series]);

  const visiveis = React.useMemo(() => {
    const termo = busca.trim().toLowerCase();
    return series
      .filter((s) => filtro === "todas" || s.tipo === filtro)
      .filter((s) => categoria === "todas" || s.categoria === categoria)
      .filter(
        (s) =>
          !termo ||
          s.descricao.toLowerCase().includes(termo) ||
          s.categoria.toLowerCase().includes(termo)
      );
  }, [series, filtro, categoria, busca]);

  /** Abre o editor no lançamento em aberto mais próximo, ou no último. */
  const editarSerie = (s: Serie) =>
    setEdicao({ conta: s.emAberto[0] ?? s.contas[s.contas.length - 1], serie: s });

  /**
   * Lança as parcelas que faltam da série, uma por mês.
   *
   * Serve para as parceladas criadas antes de a criação passar a lançar tudo
   * de uma vez, e para as que foram lançadas à mão pela metade. As datas saem
   * de mesesAdiante a partir da última parcela existente, então o dia da série
   * é preservado mesmo passando por fevereiro.
   */
  const gerarParcelas = (s: Serie) => {
    const ultima = s.contas[s.contas.length - 1];
    const de = (s.parcelaAtual ?? s.contas.length) + 1;
    confirm.ask(
      `Lançar as ${s.faltam} parcelas que faltam de "${s.descricao}", da ${de}ª à ${s.parcelaTotal}ª, uma por mês a partir de ${rotuloMes(mesesAdiante(ultima.due_date, 1))}?`,
      async () => {
        const uid = await currentUserId(supabase);
        if (!uid) return notice.show(SESSION_EXPIRED);
        const linhas = Array.from({ length: s.faltam }, (_, i) => ({
          user_id: uid,
          description: ultima.description,
          amount: ultima.amount,
          due_date: mesesAdiante(ultima.due_date, i + 1),
          category: ultima.category,
          status: "pending",
          notes: ultima.notes,
          recurring: ultima.recurring,
          paid_at: null,
          installment_no: de + i,
          installment_total: s.parcelaTotal,
        }));
        const { error } = await supabase.from("bills").insert(linhas);
        if (!notice.check(error, "lançar as parcelas que faltam")) carregar();
      }
    );
  };

  const excluirSerie = (s: Serie) => {
    const n = s.contas.length;
    const pagas = s.contas.filter((b) => b.status === "paid").length;
    confirm.ask(
      `Excluir "${s.descricao}" e ${n === 1 ? "seu único lançamento" : `seus ${n} lançamentos`}?` +
        (pagas ? ` ${pagas} já ${pagas === 1 ? "está paga" : "estão pagas"}, e o histórico vai junto.` : ""),
      async () => {
        const { error } = await supabase
          .from("bills")
          .delete()
          .in("id", s.contas.map((b) => b.id));
        if (!notice.check(error, "excluir a série")) carregar();
      }
    );
  };

  return (
    <div className="rise">
      <div className="flex items-start gap-3">
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
            Altere um lançamento e os outros em aberto da mesma conta acompanham.
          </p>
        </div>
      </div>

      <Card className="mt-4 overflow-hidden">
        <div className="flex flex-wrap gap-1.5 px-[18px] pt-[18px]">
          {FILTROS.map((f) => (
            <button
              key={f.v}
              onClick={() => setFiltro(f.v)}
              className={cx(
                "h-8 rounded-full px-3.5 text-[12.5px] font-semibold transition-colors",
                filtro === f.v
                  ? "bg-brand-500 text-on-brand"
                  : "bg-ink-800 text-fg-mute hover:text-fg-dim"
              )}
            >
              {f.label}
              <span className="ml-1.5 opacity-60 tnum">{contagens[f.v]}</span>
            </button>
          ))}
        </div>

        <div className="flex flex-wrap items-center gap-2.5 px-[18px] pb-3.5 pt-3">
          <div className="relative w-full flex-1 sm:min-w-[180px]">
            <Search
              size={15}
              className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-fg-mute"
            />
            <Input
              value={busca}
              onChange={(e) => setBusca(e.target.value)}
              placeholder="Buscar conta..."
              aria-label="Buscar conta"
              className="h-9 pl-9"
            />
          </div>
          <Select
            value={categoria}
            onChange={(e) => setCategoria(e.target.value)}
            aria-label="Filtrar por categoria"
            className="h-9 w-full sm:w-[190px]"
          >
            <option value="todas">Todas as categorias</option>
            {categorias.nomes.map((c) => (
              <option key={c}>{c}</option>
            ))}
          </Select>
        </div>

        {carregando ? null : !visiveis.length ? (
          <p className="border-t border-line-soft px-[18px] py-10 text-center text-[13px] text-fg-mute">
            {rows.length
              ? "Nenhuma conta com esses filtros."
              : "Nenhuma conta ainda. Crie a primeira em Contas a pagar."}
          </p>
        ) : (
          <ul className="border-t border-line-soft">
            {visiveis.map((s) => (
              <LinhaSerie
                key={s.chave}
                serie={s}
                onEditarSerie={() => editarSerie(s)}
                onEditarConta={(b) => setEdicao({ conta: b, serie: s })}
                onExcluir={() => excluirSerie(s)}
                onGerarParcelas={() => gerarParcelas(s)}
              />
            ))}
          </ul>
        )}
      </Card>

      <p className="mt-3 px-1 text-[11.5px] leading-relaxed text-fg-mute">
        Cada bolha é um mês da conta:{" "}
        <span className="font-semibold text-warn">em aberto</span> ou{" "}
        <span className="font-semibold text-pos">paga</span>. Clique numa bolha
        para abrir aquele mês. Lançamentos já pagos não são alterados junto —
        são histórico.
      </p>

      <Editor
        alvo={edicao}
        categorias={categorias.nomes}
        supabase={supabase}
        onFechar={() => setEdicao(null)}
        onSalvo={() => {
          setEdicao(null);
          carregar();
        }}
      />

      {confirm.node}
      {notice.node}
    </div>
  );
}

/* ------------------------------ linha da série ------------------------------ */

function LinhaSerie({
  serie: s,
  onEditarSerie,
  onEditarConta,
  onExcluir,
  onGerarParcelas,
}: {
  serie: Serie;
  onEditarSerie: () => void;
  onEditarConta: (b: Bill) => void;
  onExcluir: () => void;
  onGerarParcelas: () => void;
}) {
  const cadencia =
    s.tipo === "fixa"
      ? `Todo dia ${s.dia}`
      : s.tipo === "parcelada"
        ? `Parcela ${s.parcelaAtual ?? s.contas.length} de ${s.parcelaTotal ?? "?"}`
        : s.tipo === "abatida"
          ? s.falta > 0
            ? `falta ${brl(s.falta)}`
            : "quitada"
          : dataCurta(s.contas[0].due_date);

  return (
    <li
      className={cx(
        "group grid items-start gap-x-3 gap-y-2.5 border-b border-line-soft px-[18px] py-3.5 last:border-0",
        // Até 1279px: nome e valor na primeira linha, bolhas e ações na segunda.
        "grid-cols-[minmax(0,1fr)_auto]",
        /*
         * Quatro colunas só a partir de 1280px. Em 1024 a barra lateral come
         * 224px e sobram 736 para o cartão: a coluna do nome fica em 244px e a
         * linha de meta quebra em duas, deixando uma linha de 86px entre linhas
         * de 69px. Empilhado nessa faixa há espaço para tudo em uma linha só.
         */
        "xl:grid-cols-[minmax(0,520px)_minmax(212px,1fr)_132px_68px] xl:items-center xl:gap-x-4 xl:gap-y-0"
      )}
    >
      <div className="min-w-0 xl:col-start-1 xl:row-start-1">
        <p className="truncate text-[13.5px] font-semibold">{s.descricao}</p>
        <p className="mt-1 flex flex-wrap items-center gap-x-2 text-[11px] text-fg-mute">
          <span>{cadencia}</span>
          <span className="opacity-40">·</span>
          <span>{s.categoria}</span>
          {s.emAberto.length > 0 && (
            <>
              <span className="opacity-40">·</span>
              <span className="font-bold text-warn tnum">
                {s.emAberto.length} em aberto
              </span>
            </>
          )}
        </p>
      </div>

      <p className="text-right text-[13.5px] font-bold tnum xl:col-start-3 xl:row-start-1">
        {brl(s.valor)}
      </p>

      {/*
        Faixa de meses: um botão por lançamento, na ordem do calendário.
        Mostra a série inteira sem precisar expandir nada, e é por onde se abre
        um mês específico quando ele foge do padrão dos outros.
      */}
      <div className="flex flex-wrap items-center gap-1 xl:col-start-2 xl:row-start-1">
        {s.contas.map((b) => {
          const paga = b.status === "paid";
          const falta = restanteDe(b);
          return (
            <button
              key={b.id}
              onClick={() => onEditarConta(b)}
              title={`${dataCurta(b.due_date)} · ${brl(b.amount)} · ${
                paga ? "paga" : "em aberto"
              }`}
              aria-label={`Editar ${s.descricao} de ${dataCurta(b.due_date)}, ${
                paga ? "paga" : "em aberto"
              }`}
              className={cx(
                "h-8 rounded-full px-2.5 text-[10.5px] font-bold uppercase tracking-wide transition-colors tnum lg:h-[26px] lg:px-2",
                paga
                  ? "bg-pos/14 text-pos hover:bg-pos/24"
                  : "bg-warn/14 text-warn ring-1 ring-inset ring-warn/25 hover:bg-warn/24"
              )}
            >
              {mesCurto(b.due_date)}
              {ehAbatida(b) && falta > 0 && (
                <span className="ml-1 font-semibold opacity-70">
                  {Math.round((1 - falta / Number(b.amount)) * 100)}%
                </span>
              )}
            </button>
          );
        })}

        {/*
          Vaga tracejada no fim da faixa: as parcelas que existem no total mas
          não têm lançamento. Fica no mesmo lugar onde elas vão aparecer, então
          o que falta se lê junto com o que já está lá.
        */}
        {s.faltam > 0 && (
          <button
            onClick={onGerarParcelas}
            title={`Lançar as ${s.faltam} parcelas que faltam`}
            aria-label={`Lançar as ${s.faltam} parcelas que faltam de ${s.descricao}`}
            className="inline-flex h-8 items-center gap-0.5 rounded-full border border-dashed border-brand-500/45 px-2.5 text-[10.5px] font-bold text-brand-400 transition-colors hover:bg-brand-500/12 lg:h-[26px] lg:px-2"
          >
            <Plus size={11} strokeWidth={3} />
            <span className="tnum">{s.faltam}</span>
          </button>
        )}
      </div>

      <div className="flex shrink-0 justify-end gap-0.5 transition-opacity xl:col-start-4 xl:row-start-1 lg:opacity-0 lg:group-hover:opacity-100 lg:focus-within:opacity-100">
        <button
          onClick={onEditarSerie}
          aria-label={`Editar ${s.descricao}`}
          className="grid h-8 w-8 place-items-center rounded-[10px] text-fg-mute transition-colors hover:bg-ink-800 hover:text-fg"
        >
          <Pencil size={15} />
        </button>
        <button
          onClick={onExcluir}
          aria-label={`Excluir ${s.descricao}`}
          className="grid h-8 w-8 place-items-center rounded-[10px] text-fg-mute transition-colors hover:bg-neg/15 hover:text-neg"
        >
          <Trash2 size={15} />
        </button>
      </div>
    </li>
  );
}

/* ------------------------------ editor ------------------------------ */

const paraCampo = (n: number) => String(n).replace(".", ",");
const paraNumero = (s: string) =>
  parseFloat(String(s).replace(/\./g, "").replace(",", "."));

function Editor({
  alvo,
  categorias,
  supabase,
  onFechar,
  onSalvo,
}: {
  alvo: { conta: Bill; serie: Serie } | null;
  categorias: string[];
  supabase: ReturnType<typeof createClient>;
  onFechar: () => void;
  onSalvo: () => void;
}) {
  const [descricao, setDescricao] = React.useState("");
  const [valor, setValor] = React.useState("");
  const [categoria, setCategoria] = React.useState("Outros");
  const [observacoes, setObservacoes] = React.useState("");
  const [parcelaTotal, setParcelaTotal] = React.useState("");
  const [fixa, setFixa] = React.useState(false);
  const [vencimento, setVencimento] = React.useState("");
  const [status, setStatus] = React.useState("pending");
  const [abatido, setAbatido] = React.useState("");
  const [soEste, setSoEste] = React.useState(false);
  const [ocupado, setOcupado] = React.useState(false);
  const [erro, setErro] = React.useState("");

  const conta = alvo?.conta;
  const serie = alvo?.serie;

  React.useEffect(() => {
    if (!conta) return;
    setDescricao(conta.description);
    setValor(paraCampo(Number(conta.amount)));
    setCategoria(conta.category);
    setObservacoes(conta.notes ?? "");
    setParcelaTotal(
      conta.installment_total == null ? "" : String(conta.installment_total)
    );
    setFixa(conta.recurring);
    setVencimento(conta.due_date.slice(0, 10));
    setStatus(conta.status);
    setAbatido(conta.paid_amount == null ? "" : paraCampo(Number(conta.paid_amount)));
    setSoEste(false);
    setErro("");
  }, [conta]);

  if (!alvo || !conta || !serie) return null;

  /*
   * Alvos da propagação: o lançamento aberto no editor mais os outros em aberto
   * da mesma série. Os pagos ficam de fora — mudar o valor de uma conta que já
   * saiu do bolso reescreve histórico, e isso não pode acontecer sem pedido.
   */
  const outros = serie.emAberto.filter((b) => b.id !== conta.id);
  const alvos = soEste ? [conta] : [conta, ...outros];
  const pagasDeFora = serie.contas.length - serie.emAberto.length;

  const salvar = async () => {
    setErro("");
    const desc = descricao.trim();
    const v = paraNumero(valor);
    if (!desc) return setErro("Informe a descrição.");
    if (!Number.isFinite(v) || v <= 0)
      return setErro("Informe um valor maior que zero.");
    if (!/^\d{4}-\d{2}-\d{2}$/.test(vencimento))
      return setErro("Informe o vencimento deste lançamento.");

    const temAbatido = abatido.trim() !== "";
    const pago = temAbatido ? paraNumero(abatido) : null;
    if (pago != null && (!Number.isFinite(pago) || pago < 0))
      return setErro("O valor já abatido não pode ser negativo.");
    if (pago != null && pago > v + 0.001)
      return setErro(`O já abatido (${brl(pago)}) passa do valor (${brl(v)}).`);

    const total = parcelaTotal.trim() === "" ? null : Number(parcelaTotal);
    if (total != null && (!Number.isFinite(total) || total < 1))
      return setErro("O total de parcelas precisa ser 1 ou mais.");

    setOcupado(true);

    /* O que vale para a série inteira. */
    const comuns = {
      description: desc,
      amount: v,
      category: categoria,
      notes: observacoes.trim(),
      recurring: fixa,
      installment_total: total,
    };

    /*
     * Uma requisição por lançamento, e não um update em lote, porque o dia do
     * mês depende da data de cada um: dia 31 tem de virar 28 em fevereiro, e 29
     * em ano bissexto. Um update único não calcula isso por linha.
     */
    const falhas: string[] = [];
    for (const b of alvos) {
      const ehOEditado = b.id === conta.id;
      const proprios = ehOEditado
        ? {
            due_date: vencimento,
            status,
            paid_amount: pago,
            paid_at:
              status === "paid" ? (conta.paid_at ?? new Date().toISOString()) : null,
          }
        : {
            /*
             * O dia sai do vencimento escolhido, e só o dia: cada mês guarda o
             * seu. Havia um campo "Dia do mês" separado aqui, e ele disputava a
             * mesma coluna com o vencimento — mudar o dia movia os outros meses
             * e deixava justamente o lançamento aberto no editor para trás.
             */
            due_date: trocarDia(b.due_date, Number(vencimento.slice(8, 10))),
          };

      const { error } = await supabase
        .from("bills")
        .update({ ...comuns, ...proprios })
        .eq("id", b.id);
      if (error) falhas.push(error.message);
    }

    setOcupado(false);
    if (falhas.length) {
      const m = falhas[0];
      if (m.includes("paid_amount"))
        return setErro(
          "A coluna de abatimento ainda não existe. Rode supabase/ABATIDAS.sql no SQL Editor."
        );
      return setErro(m);
    }
    onSalvo();
  };

  const listaCategorias = categorias.includes(categoria)
    ? categorias
    : [categoria, ...categorias];

  return (
    <Modal
      open
      onClose={onFechar}
      title={descricao || conta.description}
      sub={`Lançamento de ${dataCurta(conta.due_date)}`}
      footer={
        <>
          <Button onClick={onFechar}>Cancelar</Button>
          <Button variant="primary" onClick={salvar} disabled={ocupado}>
            {ocupado
              ? "Salvando..."
              : alvos.length > 1
                ? `Salvar nos ${alvos.length}`
                : "Salvar"}
          </Button>
        </>
      }
    >
      <div className="flex flex-col gap-4">
        {/*
          O aviso vem antes dos campos porque a propagação é o padrão: gravar em
          seis lançamentos de uma vez não se desfaz, e quem abre o editor tem de
          saber disso antes de digitar, não depois.
        */}
        {outros.length > 0 && (
          <div
            className={cx(
              "rounded-[14px] px-3.5 py-3 text-[12px] leading-relaxed transition-colors",
              soEste ? "bg-ink-800 text-fg-dim" : "bg-brand-500/10 text-fg-dim"
            )}
          >
            {soEste ? (
              <>
                Alterando <span className="font-bold text-fg">só este mês</span>.
                Os outros {outros.length} em aberto ficam como estão.
              </>
            ) : (
              <>
                O que estiver em{" "}
                <span className="font-bold text-fg">Vale para a conta toda</span>{" "}
                será gravado também nos outros{" "}
                <span className="font-bold text-fg tnum">{outros.length}</span>{" "}
                {outros.length === 1 ? "mês em aberto" : "meses em aberto"}
                {pagasDeFora > 0 && (
                  <>
                    {" "}
                    · {pagasDeFora} {pagasDeFora === 1 ? "já paga fica" : "já pagas ficam"}{" "}
                    de fora
                  </>
                )}
                .
              </>
            )}
            <button
              onClick={() => setSoEste((s) => !s)}
              className="ml-1.5 font-bold text-brand-400 underline decoration-brand-400/30 underline-offset-2 transition-colors hover:decoration-brand-400"
            >
              {soEste ? "voltar a alterar todos" : "alterar só este mês"}
            </button>
          </div>
        )}

        <section className="flex flex-col gap-3.5">
          {outros.length > 0 && !soEste && (
            <p className="text-[10.5px] font-bold uppercase tracking-wider text-brand-400">
              Vale para a conta toda
            </p>
          )}

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
            <Field label="Categoria">
              <Select
                value={categoria}
                onChange={(e) => setCategoria(e.target.value)}
              >
                {listaCategorias.map((c) => (
                  <option key={c}>{c}</option>
                ))}
              </Select>
            </Field>
          </div>

          <Field label="Total de parcelas" hint="Vazio se não for parcelada.">
            <Input
              type="number"
              min={1}
              value={parcelaTotal}
              onChange={(e) => setParcelaTotal(e.target.value)}
              placeholder="vazio"
            />
          </Field>

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
              checked={fixa}
              onChange={(e) => setFixa(e.target.checked)}
              className="h-4 w-4 accent-[var(--a)]"
            />
            <span className="text-sm font-semibold text-fg-dim">Conta fixa</span>
          </label>
        </section>

        {/*
          Campos de um mês só. Vencimento exato, situação e abatimento variam de
          mês para mês por natureza: propagar "paga" para os outros marcaria como
          pago o que ninguém pagou.
        */}
        <section className="flex flex-col gap-3.5 border-t border-line-soft pt-4">
          <p className="text-[10.5px] font-bold uppercase tracking-wider text-fg-mute">
            Só do mês de {mesCurto(conta.due_date)}
          </p>

          <div className="grid gap-3.5 sm:grid-cols-2">
            <Field
              label="Vencimento"
              hint={
                outros.length && !soEste
                  ? "O dia escolhido passa a valer nos outros meses em aberto."
                  : undefined
              }
            >
              <Input
                type="date"
                value={vencimento}
                onChange={(e) => setVencimento(e.target.value)}
              />
            </Field>
            <Field label="Situação">
              <Select value={status} onChange={(e) => setStatus(e.target.value)}>
                <option value="pending">Em aberto</option>
                <option value="paid">Paga</option>
              </Select>
            </Field>
          </div>

          <Field
            label="Já abatido (R$)"
            hint="Preenchido, a conta passa a ser abatida aos poucos."
          >
            <Input
              inputMode="decimal"
              value={abatido}
              onChange={(e) => setAbatido(e.target.value)}
              placeholder="vazio"
            />
          </Field>
        </section>

        {erro && (
          <p className="rounded-[14px] bg-neg/12 px-3.5 py-3 text-xs font-medium text-neg">
            {erro}
          </p>
        )}
      </div>
    </Modal>
  );
}
