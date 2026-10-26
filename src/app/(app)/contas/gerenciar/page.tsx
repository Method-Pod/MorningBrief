"use client";

import * as React from "react";
import Link from "next/link";
import { ArrowLeft, Pencil, Plus, Repeat2, Search, Trash2 } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { currentUserId, SESSION_EXPIRED } from "@/lib/session";
import { NADA_GRAVADO } from "@/lib/erros";
import { mesesAdiante } from "@/components/ContasExtras";
import { ehAbatida, restanteDe, type Bill } from "@/lib/types";
import { brl, dataCurta, rotuloMes, todayISO, valorDigitado } from "@/lib/format";
import { avisoDeExclusao, repartirSerie } from "@/lib/serieDeContas";
import { useCategorias } from "@/components/Categorias";
import {
  Button,
  Card,
  Field,
  Input,
  Modal,
  Segmented,
  Select,
  Textarea,
  cx,
  useConfirm,
  useNotice,
  ErroDeCarga,
} from "@/components/ui";
import { SeletorDeData } from "@/components/SeletorDeData";
import { EditorParcelas } from "@/components/Parcelamento";
import { editarGrade, type Ajuste } from "@/lib/ajusteDeParcelas";
import {
  ajustarTotal,
  aplicarValor,
  aplicarVencimento,
  editadasDentro,
  montarGrade,
  type LinhaDaGrade,
} from "@/lib/edicaoDeSerie";

type Tipo = "fixa" | "parcelada" | "abatida" | "avulsa";
type Filtro = "todas" | Tipo;

const FILTROS: { v: Filtro; label: string }[] = [
  { v: "todas", label: "Todas" },
  { v: "fixa", label: "Recorrentes" },
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

  const [erroCarga, setErroCarga] = React.useState("");

  const carregar = React.useCallback(async () => {
    const { data, error } = await supabase
      .from("bills")
      .select("*")
      .order("due_date");
    /* Falha não vira "nenhuma conta ainda": mantém a lista e avisa. */
    if (error) {
      setErroCarga(error.message);
      setCarregando(false);
      return;
    }
    setErroCarga("");
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
      /*
       * Conta que já acabou sai daqui: parcelada com todas as parcelas pagas,
       * avulsa paga, abatida quitada. Ela continua em Contas a pagar, no mês
       * dela, como histórico — esta tela é para o que ainda vai acontecer.
       * Fixa fica sempre: ela não acaba sozinha.
       */
      .filter((s) => s.tipo === "fixa" || s.emAberto.length > 0)
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

  /**
   * Excluir daqui apaga o que ainda vai vencer, e só isso.
   *
   * Antes apagava a série inteira, pagas inclusive — pedido dele: "contas
   * pagas e passadas devem manter no histórico". A régua e a frase do aviso
   * estão em `lib/serieDeContas`, as duas sob teste, para que o que a caixa
   * promete e o que a gravação faz não possam discordar.
   *
   * As duas gravações são em ordem, e a segunda só acontece se a primeira
   * passar: parar a repetição sem ter apagado o futuro deixaria a conta
   * existindo e sem se renovar, que é um terceiro estado que ninguém pediu.
   */
  const excluirSerie = (s: Serie) => {
    const reparticao = repartirSerie(s.contas, todayISO());
    const { pararRepeticao, excluir } = reparticao;
    const aviso = avisoDeExclusao(s.descricao, reparticao);

    if (aviso.acao === "nada") return notice.show(aviso.texto);

    const parar = async () => {
      const { data, error } = await supabase
        .from("bills")
        .update({ recurring: false })
        .in("id", pararRepeticao.map((b) => b.id))
        .select("id");
      if (notice.check(error, "parar a repetição")) return false;
      if (!data?.length) {
        notice.show(NADA_GRAVADO);
        return false;
      }
      return true;
    };

    if (aviso.acao === "parar")
      return confirm.ask(aviso.texto, async () => {
        if (await parar()) carregar();
      });

    confirm.ask(aviso.texto, async () => {
      const { data: saiu, error } = await supabase
        .from("bills")
        .delete()
        .in("id", excluir.map((b) => b.id))
        .select("id");
      if (notice.check(error, "excluir os lançamentos futuros")) return;
      if (!saiu?.length) return notice.show(NADA_GRAVADO);
      if (pararRepeticao.length) await parar();
      carregar();
    });
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
          <h1 className="titulo-pagina">
            Gerenciar contas
          </h1>
          <p className="mt-1 text-sm text-fg-mute">
            No lápis você edita a conta inteira: datas, valores e parcelas.
          </p>
        </div>
      </div>

      {erroCarga && (
        <ErroDeCarga detalhe={erroCarga} onTentar={carregar} className="mt-4" />
      )}

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
            {series.length
              ? "Nenhuma conta com esses filtros."
              : rows.length
                ? "Nada em andamento: as contas que restam já foram pagas."
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
        Contas recorrentes entram sozinhas todo dia 1º do mês. Nas parceladas,
        cada bolha é uma parcela:{" "}
        <span className="font-semibold text-warn">em aberto</span> ou{" "}
        <span className="font-semibold text-pos">paga</span> — clique para abrir
        aquele mês. Contas já quitadas saem desta lista e continuam no histórico
        de Contas a pagar.
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
        ? /* A parcela da vez — a primeira em aberto —, e não a maior lançada:
             "Parcela 10 de 10 · 9 em aberto" fazia parecer que faltava uma. */
          `Parcela ${s.emAberto[0]?.installment_no ?? s.parcelaAtual ?? s.contas.length} de ${s.parcelaTotal ?? "?"}`
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
        {/*
          Recorrente é uma área só, e não um mês por bolha. A fila de bolhas
          de uma fixa só cresce — ago, set, out, nov... — e não diz nada que
          "Recorrente" não diga melhor: ela se repete e não tem fim. O mês
          em aberto mais próximo é o que importa, e é ele que o clique abre.
        */}
        {s.tipo === "fixa" ? (
          <button
            onClick={onEditarSerie}
            aria-label={`Editar a recorrência de ${s.descricao}`}
            className="inline-flex h-8 items-center gap-1.5 rounded-full bg-brand-500/12 px-3 text-[11px] font-bold uppercase tracking-wide text-brand-400 transition-colors hover:bg-brand-500/20 lg:h-[26px]"
          >
            <Repeat2 size={12} strokeWidth={2.5} />
            Recorrente
          </button>
        ) : s.contas.map((b) => {
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
          aria-label={`Excluir os lançamentos futuros de ${s.descricao}`}
          title="Exclui o que ainda vai vencer. O histórico fica."
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

/** "3/4, 4/4 e 5/4": vírgula entre os primeiros, "e" antes do último. */
const emLista = (itens: string[]) =>
  itens.length < 2 ? itens.join("") : `${itens.slice(0, -1).join(", ")} e ${itens[itens.length - 1]}`;
const paraNumero = (s: string) =>
  valorDigitado(s);

/* O tipo daqui no vocabulário do seletor da Nova conta. */
const NO_SELETOR: Record<Tipo, "unica" | "fixa" | "parcelada" | "abatida"> = {
  avulsa: "unica",
  fixa: "fixa",
  parcelada: "parcelada",
  abatida: "abatida",
};

/**
 * A conta inteira aberta para edição, com a cara da Nova conta.
 *
 * Era um formulário em duas metades -- "Vale para a conta toda" e "Só do mês
 * de nov" -- com dois botões de salvar, e não havia como mudar a data ou o
 * valor de UMA parcela, nem o tamanho do parcelamento. Pedido dele: editar a
 * conta em geral, "desde data das parcelas, valores, e tudo". Agora valor e
 * vencimento são a base, cada lançamento em aberto tem a sua linha na grade, e
 * mudar o total cria ou tira parcelas. Um botão só: a grade já diz o que muda
 * em cada mês. A regra das contas está em `lib/edicaoDeSerie`, sob teste.
 */
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
  const [total, setTotal] = React.useState("");
  const [fixa, setFixa] = React.useState(false);
  const [vencimento, setVencimento] = React.useState("");
  const [status, setStatus] = React.useState("pending");
  const [abatido, setAbatido] = React.useState("");
  /* A grade: o que se edita, o que só se vê, e o que sai ao salvar. */
  const [linhas, setLinhas] = React.useState<LinhaDaGrade[]>([]);
  const [pagas, setPagas] = React.useState<LinhaDaGrade[]>([]);
  const [removidas, setRemovidas] = React.useState<LinhaDaGrade[]>([]);
  const [editadas, setEditadas] = React.useState<Ajuste[]>([]);
  const [erroTotal, setErroTotal] = React.useState("");
  const [ocupado, setOcupado] = React.useState(false);
  const [erro, setErro] = React.useState("");
  const confirm = useConfirm();

  const conta = alvo?.conta;
  const serie = alvo?.serie;

  React.useEffect(() => {
    if (!conta || !serie) return;
    const g = montarGrade(serie.contas, conta.id, serie.tipo === "parcelada");
    const primeira = g.editaveis[0];
    setLinhas(g.editaveis);
    setPagas(g.pagas);
    setRemovidas([]);
    setEditadas([]);
    setErroTotal("");
    setDescricao(conta.description);
    setValor(paraCampo(primeira ? primeira.amount : Number(conta.amount)));
    setVencimento(primeira?.due_date ?? conta.due_date.slice(0, 10));
    setCategoria(conta.category);
    setObservacoes(conta.notes ?? "");
    setTotal(conta.installment_total == null ? "" : String(conta.installment_total));
    setFixa(conta.recurring);
    setStatus(conta.status);
    setAbatido(conta.paid_amount == null ? "" : paraCampo(Number(conta.paid_amount)));
    setErro("");
  }, [conta, serie]);

  if (!alvo || !conta || !serie) return null;

  const parcelada = serie.tipo === "parcelada";
  const totalN = Number(total);
  const totalRotulo = Number.isInteger(totalN) && totalN > 0 ? totalN : conta.installment_total;
  const original = new Map(serie.contas.map((b) => [b.id, b]));
  const emAberto = serie.emAberto.length;
  const pagasNaSerie = serie.contas.length - emAberto;

  /* ---------------------------- base e grade ---------------------------- */

  const mudarValor = (s: string) => {
    setValor(s);
    setLinhas((l) => aplicarValor(l, paraNumero(s), editadas));
  };

  const mudarVencimento = (v: string) => {
    setVencimento(v);
    setLinhas((l) => aplicarVencimento(l, v, editadas));
  };

  /*
   * As tiradas ficam guardadas e voltam se o total subir de novo: digitar
   * "12" passa por "1" no meio, e sem isso a 2ª tecla apagaria dez parcelas
   * de verdade para recriar dez novas.
   */
  const mudarTotal = (s: string) => {
    setTotal(s);
    if (s.trim() === "") return setErroTotal("Informe o total de parcelas.");
    const todas = [...linhas, ...removidas].sort((a, b) => (a.no ?? 0) - (b.no ?? 0));
    const r = ajustarTotal(todas, pagas, Number(s), {
      vencimento,
      valor: paraNumero(valor),
    });
    if ("erro" in r) return setErroTotal(r.erro);
    setErroTotal("");
    setLinhas(r.linhas);
    setRemovidas(r.removidas);
    setEditadas((e) => editadasDentro(e, r.linhas.length));
  };

  /* A 1ª linha é o vencimento: mexer nela move o vencimento e as não mexidas. */
  const mudarGrade = (novas: LinhaDaGrade[]) => {
    const g = editarGrade(linhas, novas, editadas, vencimento);
    setEditadas(g.editadas);
    setVencimento(g.vencimento);
    setLinhas(
      g.vencimento !== vencimento
        ? aplicarVencimento(g.parcelas, g.vencimento, g.editadas)
        : g.parcelas
    );
  };

  const recalcular = () => {
    setEditadas([]);
    setLinhas((l) => aplicarVencimento(aplicarValor(l, paraNumero(valor), []), vencimento, []));
  };

  const rotuloDa = (l: LinhaDaGrade) =>
    l.no != null ? `${l.no}/${totalRotulo ?? "?"}` : mesCurto(l.due_date);

  /* ------------------------------- gravar ------------------------------- */

  const salvar = () => {
    setErro("");
    const desc = descricao.trim();
    if (!desc) return setErro("Informe a descrição.");
    if (parcelada && erroTotal) return setErro(erroTotal);

    /* Fatura e afins (valor variável) aceitam zero: é o "a informar" delas. */
    const variavel = !!conta.valor_variavel;
    for (const l of linhas) {
      const v = Number(l.amount);
      if (!Number.isFinite(v) || v < 0 || (v === 0 && !variavel))
        return setErro(
          linhas.length > 1
            ? `Informe um valor maior que zero em ${rotuloDa(l)}.`
            : "Informe um valor maior que zero."
        );
      if (!/^\d{4}-\d{2}-\d{2}$/.test(l.due_date))
        return setErro(
          linhas.length > 1 ? `Informe a data de ${rotuloDa(l)}.` : "Informe o vencimento."
        );
    }

    const daConta = linhas.find((l) => l.id === conta.id);
    const valorDaConta = daConta ? Number(daConta.amount) : Number(conta.amount);
    const pago = abatido.trim() !== "" ? paraNumero(abatido) : null;
    if (pago != null && (!Number.isFinite(pago) || pago < 0))
      return setErro("O valor já abatido não pode ser negativo.");
    if (pago != null && pago > valorDaConta + 0.001)
      return setErro(`O já abatido (${brl(pago)}) passa do valor (${brl(valorDaConta)}).`);

    /*
     * O banco não aceita valor menor do que o já abatido (ABATIDAS.sql). Recusa
     * antes, dizendo qual mês, em vez de deixar metade das gravações falhar.
     */
    const barrada = linhas.find((l) => {
      const b = l.id ? original.get(l.id) : null;
      return (
        b && b.id !== conta.id && b.paid_amount != null &&
        Number(b.paid_amount) > Number(l.amount) + 0.001
      );
    });
    if (barrada) {
      const b = original.get(barrada.id!)!;
      return setErro(
        `${dataCurta(barrada.due_date)} já tem ${brl(Number(b.paid_amount))} abatidos, mais que o valor novo dele.`
      );
    }

    /* Apagar parcela não se desfaz: pergunta antes, dizendo quais. */
    if (removidas.length)
      return confirm.ask(
        `Salvar com ${totalN} parcelas apaga ${
          removidas.length === 1 ? "a parcela" : "as parcelas"
        } ${emLista(removidas.map((l) => `${l.no}/${conta.installment_total}`))}, que estão em aberto. Continuar?`,
        () => gravar(desc, pago),
        { titulo: "Apagar parcelas", rotulo: "Salvar e apagar" }
      );
    gravar(desc, pago);
  };

  const gravar = async (desc: string, pago: number | null) => {
    setOcupado(true);
    const uid = await currentUserId(supabase);
    if (!uid) {
      setOcupado(false);
      return setErro(SESSION_EXPIRED);
    }

    /* O que vale para a conta inteira. */
    const comuns = {
      description: desc,
      category: categoria,
      notes: observacoes.trim(),
      ...(serie.tipo === "fixa" ? { recurring: fixa } : {}),
      ...(parcelada ? { installment_total: totalN } : {}),
    };

    /*
     * Uma gravação por lançamento, em paralelo: cada um tem data e valor
     * próprios, e nenhuma depende da outra. `select("id")` porque um update
     * que não casa com nada responde sem erro (ver NADA_GRAVADO).
     */
    const proprios = {
      status,
      paid_amount: pago,
      paid_at: status === "paid" ? (conta.paid_at ?? new Date().toISOString()) : null,
    };
    type Resposta = { data: unknown[] | null; error: { message: string } | null };
    const gravacoes: PromiseLike<Resposta>[] = linhas.map((l) => {
      if (!l.id)
        return supabase
          .from("bills")
          .insert({
            ...comuns,
            user_id: uid,
            amount: Number(l.amount),
            due_date: l.due_date,
            status: "pending",
            paid_at: null,
            recurring: false,
            installment_no: l.no,
          })
          .select("id");
      return supabase
        .from("bills")
        .update({
          ...comuns,
          amount: Number(l.amount),
          due_date: l.due_date,
          ...(l.id === conta.id ? proprios : {}),
        })
        .eq("id", l.id)
        .select("id");
    });

    /* A paga clicada fica fora da grade, mas a situação dela é daqui. */
    if (!linhas.some((l) => l.id === conta.id))
      gravacoes.push(
        supabase.from("bills").update(proprios).eq("id", conta.id).select("id")
      );

    /* Só apaga o que continua em aberto: a trava vale também no banco. */
    if (removidas.length)
      gravacoes.push(
        supabase
          .from("bills")
          .delete()
          .in("id", removidas.map((l) => l.id!))
          .eq("status", "pending")
          .select("id")
      );

    /*
     * As pagas acompanham em pouca coisa: o nome, o total do parcelamento e,
     * na fixa, deixar de repetir. Valor, data e categoria delas são
     * histórico. Renomear só as abertas partia a conta em duas na lista.
     */
    const nasPagas = {
      ...(desc !== conta.description ? { description: desc } : {}),
      ...(parcelada && totalN !== conta.installment_total
        ? { installment_total: totalN }
        : {}),
      ...(serie.tipo === "fixa" && !fixa ? { recurring: false } : {}),
    };
    if (pagas.length && Object.keys(nasPagas).length)
      gravacoes.push(
        supabase
          .from("bills")
          .update(nasPagas)
          .in("id", pagas.map((l) => l.id!))
          .select("id")
      );

    const resultados = await Promise.all(gravacoes);
    setOcupado(false);

    const falha = resultados.find((r) => r.error || !r.data?.length);
    if (falha) {
      const m = falha.error?.message ?? NADA_GRAVADO;
      if (m.includes("paid_amount") && /column|could not find/i.test(m))
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
  const comGrade = linhas.length > 1 || parcelada;

  return (
    <>
      <Modal
        open
        onClose={onFechar}
        title={descricao || conta.description}
        sub={`${emAberto} em aberto${
          pagasNaSerie ? ` · ${pagasNaSerie} ${pagasNaSerie === 1 ? "paga" : "pagas"}` : ""
        }`}
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

          {/* O tipo à vista, sem trocar: virar uma parcelada em fixa exigiria
              apagar e recriar meses, e isso não é edição. */}
          <div>
            <Segmented
              travado
              value={NO_SELETOR[serie.tipo]}
              onChange={() => {}}
              options={[
                { value: "unica", label: "Única" },
                { value: "fixa", label: "Fixa" },
                { value: "parcelada", label: "Parcelada" },
                { value: "abatida", label: "Abatida" },
              ]}
            />
            <p className="mt-1.5 text-[11.5px] text-fg-mute">
              O tipo de uma conta que já existe não muda aqui.
            </p>
          </div>

          <div className="flex flex-col gap-3.5 border-t border-line-soft pt-4">
            <div className="grid gap-3.5 sm:grid-cols-2">
              <Field
                label={parcelada ? "Valor da parcela (R$)" : "Valor (R$)"}
                hint={comGrade ? "Vai para as linhas que você não ajustou." : undefined}
              >
                <Input
                  inputMode="decimal"
                  value={valor}
                  onChange={(e) => mudarValor(e.target.value)}
                />
              </Field>
              <Field
                label="Vencimento"
                hint={comGrade ? "É a data da 1ª linha da lista." : undefined}
              >
                <SeletorDeData value={vencimento} onChange={mudarVencimento} />
              </Field>
            </div>

            <div className="grid gap-3.5 sm:grid-cols-2">
              <Field label="Categoria" className={parcelada ? undefined : "sm:col-span-2"}>
                <Select value={categoria} onChange={(e) => setCategoria(e.target.value)}>
                  {listaCategorias.map((c) => (
                    <option key={c}>{c}</option>
                  ))}
                </Select>
              </Field>
              {parcelada && (
                <Field label="Total de parcelas">
                  <Input
                    type="number"
                    min={1}
                    value={total}
                    onChange={(e) => mudarTotal(e.target.value)}
                  />
                  {erroTotal && (
                    <span role="status" className="mt-1.5 block text-[11.5px] font-medium text-warn">
                      {erroTotal}
                    </span>
                  )}
                </Field>
              )}
            </div>

            {serie.tipo === "fixa" && (
              <label className="flex cursor-pointer items-start gap-2.5 rounded-[14px] bg-ink-800 p-3.5">
                <input
                  type="checkbox"
                  checked={fixa}
                  onChange={(e) => setFixa(e.target.checked)}
                  className="mt-0.5 h-4 w-4 accent-[var(--a)]"
                />
                <span className="text-sm text-fg-dim">
                  <span className="font-semibold text-fg">Continua todo mês</span>
                  <span
                    className={cx(
                      "mt-0.5 block text-[11.5px]",
                      fixa ? "text-fg-mute" : "text-warn"
                    )}
                  >
                    {fixa
                      ? "Entra sozinha todo dia 1º do mês."
                      : "Desmarcada, a conta acaba: o próximo mês não entra mais."}
                  </span>
                </span>
              </label>
            )}

            {comGrade && (
              <div className="rounded-[14px] bg-ink-800 p-3.5">
                {pagas.length > 0 && (
                  <p className="text-[11.5px] leading-relaxed text-fg-mute">
                    {parcelada ? (
                      <>
                        <span className="font-semibold text-pos">
                          {pagas.length === 1 ? "Paga" : "Pagas"}:
                        </span>{" "}
                        {pagas
                          .map((p) => `${rotuloDa(p)} (${dataCurta(p.due_date)})`)
                          .join(", ")}
                        . Ficam como estão.
                      </>
                    ) : (
                      <>
                        {pagas.length} {pagas.length === 1 ? "mês pago fica" : "meses pagos ficam"}{" "}
                        como {pagas.length === 1 ? "está" : "estão"}.
                      </>
                    )}
                  </p>
                )}
                {linhas.length > 0 && (
                  <EditorParcelas
                    parcelas={linhas}
                    de={linhas[0].no ?? 1}
                    total={totalRotulo ?? undefined}
                    rotulos={linhas.map(rotuloDa)}
                    onChange={(novas) => mudarGrade(novas as LinhaDaGrade[])}
                    onRecalcular={recalcular}
                  />
                )}
                {removidas.length > 0 && (
                  <p className="mt-2.5 rounded-[12px] bg-warn/12 px-3 py-2 text-[11.5px] text-warn">
                    Ao salvar, {removidas.length === 1 ? "sai a parcela" : "saem as parcelas"}{" "}
                    {emLista(removidas.map((l) => `${l.no}/${conta.installment_total}`))}.
                  </p>
                )}
              </div>
            )}
          </div>

          <div className="border-t border-line-soft pt-4">
            <Field label="Observações">
              <Textarea
                rows={2}
                value={observacoes}
                onChange={(e) => setObservacoes(e.target.value)}
              />
            </Field>
          </div>

          {/*
            Situação e abatimento são do lançamento clicado, e de nenhum outro:
            marcar "paga" em todos marcaria como pago o que ninguém pagou.
          */}
          <section className="flex flex-col gap-3.5 border-t border-line-soft pt-4">
            <p className="text-[10.5px] font-bold uppercase tracking-wider text-fg-mute">
              Só do lançamento de {rotuloMes(conta.due_date.slice(0, 7))}
            </p>
            <div className="grid gap-3.5 sm:grid-cols-2">
              <Field label="Situação">
                <Select value={status} onChange={(e) => setStatus(e.target.value)}>
                  <option value="pending">Em aberto</option>
                  <option value="paid">Paga</option>
                </Select>
              </Field>
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
            </div>
          </section>

          {erro && (
            <p className="rounded-[14px] bg-neg/12 px-3.5 py-3 text-xs font-medium text-neg">
              {erro}
            </p>
          )}
        </div>
      </Modal>
      {confirm.node}
    </>
  );
}
