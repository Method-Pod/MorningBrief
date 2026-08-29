"use client";

import * as React from "react";
import Link from "next/link";
import {
  AlertCircle,
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
  Clock,
  PartyPopper,
  Pencil,
  Repeat2,
  HandCoins,
  Search,
  SlidersHorizontal,
  Tag,
  Trash2,
  Wallet,
} from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import {
  limparPagasDeMesesAnteriores,
  MESES_RETENCAO_PAGAS,
} from "@/lib/limpeza";
import { sugerirCategoria } from "@/lib/categoriaSugerida";
import { currentUserId, SESSION_EXPIRED } from "@/lib/session";
import {
  ehAbatida,
  restanteDe,
  type Bill,
  type BillStatus,
} from "@/lib/types";
import {
  GerenciarCategorias,
  useCategorias,
} from "@/components/Categorias";
import { AbaterModal, ProgressoAbatida } from "@/components/ContasLote";
import { brl, dataCurta, daysUntil, rotuloMes, todayISO } from "@/lib/format";
import {
  EditorParcelas,
  MAX_PARCELAS,
  parcelasIguais,
  repartir,
  type Parcela,
} from "@/components/Parcelamento";
import {
  CalendarioPagamentos,
  ContasFixas,
  mesesAdiante,
  proximoMes,
} from "@/components/ContasExtras";
import {
  EvolucaoMensal,
  PagoPendenteCategoria,
  ParticipacaoCategoria,
  type PontoMes,
} from "@/components/charts";
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

/* ------------------------------ filtros e ordem ------------------------------ */

type Filtro = "todas" | "hoje" | "semana" | "atrasadas" | "pendentes" | "pagas";
type Ordem = "vencimento" | "maior" | "menor" | "nome" | "recente";

const FILTROS: { v: Filtro; label: string }[] = [
  { v: "todas", label: "Todas" },
  { v: "hoje", label: "Hoje" },
  { v: "semana", label: "Semana" },
  { v: "atrasadas", label: "Atrasadas" },
  { v: "pendentes", label: "Pendentes" },
  { v: "pagas", label: "Pagas" },
];

/** Categoria de uma conta nova enquanto nada foi sugerido nem escolhido. */
const CATEGORIA_PADRAO = "Outros";

const ORDENS: { v: Ordem; label: string }[] = [
  { v: "vencimento", label: "Próximo vencimento" },
  { v: "maior", label: "Maior valor" },
  { v: "menor", label: "Menor valor" },
  { v: "nome", label: "Nome (A-Z)" },
  { v: "recente", label: "Mais recente" },
];

const vazio = () => ({
  description: "",
  amount: "",
  due_date: todayISO(),
  category: CATEGORIA_PADRAO,
  status: "pending" as BillStatus,
  recurring: false,
  notes: "",
  parcelado: false,
  installment_no: 1,
  installment_total: 2,
  /** false: o valor digitado é de cada parcela. true: é o total a dividir. */
  valorTotal: false,
  /** true quando a pessoa mexeu na categoria: o palpite para de mandar. */
  categoriaEscolhida: false,
  /** "iguais": mesma data e valor todo mês. "variaveis": cada parcela por si. */
  modoParcelas: "iguais" as "iguais" | "variaveis",
  parcelas: [] as Parcela[],
  // conta paga aos poucos, sem data marcada
  abatida: false,
  paid_amount: "0",
});

export default function ContasPage() {
  const supabase = React.useMemo(() => createClient(), []);
  const [rows, setRows] = React.useState<Bill[]>([]);
  const [loading, setLoading] = React.useState(true);
  const [filtro, setFiltro] = React.useState<Filtro>("todas");
  const [ordem, setOrdem] = React.useState<Ordem>("vencimento");
  const [q, setQ] = React.useState("");
  const [dia, setDia] = React.useState<string | null>(null);
  /** "AAAA-MM" em foco. A lista, o resumo, os gráficos e o calendário seguem. */
  const [mes, setMes] = React.useState(() => todayISO().slice(0, 7));
  const [lancando, setLancando] = React.useState<string | null>(null);
  /* Pagas nasce fechado: é o grupo que só cresce e não pede ação. */
  const [fechados, setFechados] = React.useState<Set<string>>(
    () => new Set(["Pagas"])
  );

  const alternarGrupo = (titulo: string) =>
    setFechados((v) => {
      const n = new Set(v);
      if (n.has(titulo)) n.delete(titulo);
      else n.add(titulo);
      return n;
    });
  const [open, setOpen] = React.useState(false);
  const [editing, setEditing] = React.useState<Bill | null>(null);
  const [form, setForm] = React.useState(vazio());
  const [busy, setBusy] = React.useState(false);
  const [err, setErr] = React.useState("");
  const confirm = useConfirm();
  const notice = useNotice();
  const categorias = useCategorias(supabase);
  const [gerindoCategorias, setGerindoCategorias] = React.useState(false);
  const [abatendo, setAbatendo] = React.useState<Bill | null>(null);
  const [emLote, setEmLote] = React.useState(false);

  const load = React.useCallback(async () => {
    const { data } = await supabase.from("bills").select("*").order("due_date");
    // numeric do Postgres chega como string no JSON
    setRows(
      ((data as Bill[]) ?? []).map((b) => ({
        ...b,
        amount: Number(b.amount),
        paid_amount: b.paid_amount == null ? null : Number(b.paid_amount),
      }))
    );
    setLoading(false);
  }, [supabase]);

  React.useEffect(() => {
    (async () => {
      /*
       * A listagem vem primeiro; a limpeza corre atrás.
       *
       * Ela ficava em série, antes do load, para a tela não exibir por um
       * instante uma conta a caminho de ser apagada. Com a retenção em 12
       * meses isso deixou de existir: o que ela apaga tem mais de um ano e não
       * aparece no recorte de mês nenhum. O que sobrava era uma ida de rede
       * inteira na frente da lista, na página mais pesada do app.
       *
       * Só relê se algo saiu de fato — o que, com o cron diário, é raro.
       */
      await load();
      const apagadas = await limparPagasDeMesesAnteriores(supabase);
      if (apagadas && apagadas > 0) load();
    })();
  }, [load, supabase]);

  /* ------------------------------ ações ------------------------------ */

  const novo = () => {
    setEditing(null);
    setForm(vazio());
    setErr("");
    setOpen(true);
  };

  const editar = (b: Bill) => {
    setEditing(b);
    setForm({
      description: b.description,
      amount: String(b.amount),
      due_date: b.due_date.slice(0, 10),
      category: b.category,
      status: b.status,
      recurring: b.recurring,
      notes: b.notes,
      parcelado: b.installment_total != null,
      installment_no: b.installment_no ?? 1,
      installment_total: b.installment_total ?? 2,
      /* Ao editar, o valor na tela é sempre o da parcela: é o que está gravado.
         Editar mexe numa conta só, então o parcelamento em lote não se aplica. */
      valorTotal: false,
      /* A conta já tem categoria gravada; palpite não tem o que fazer aqui. */
      categoriaEscolhida: true,
      modoParcelas: "iguais" as const,
      parcelas: [],
      abatida: ehAbatida(b),
      paid_amount: String(b.paid_amount ?? 0),
    });
    setErr("");
    setOpen(true);
  };

  const salvar = async (e: React.FormEvent) => {
    e.preventDefault();
    setErr("");
    const desc = form.description.trim();
    const valor = parseFloat(
      String(form.amount).replace(/\./g, "").replace(",", ".")
    );
    if (!desc) return setErr("Informe a descrição.");
    if (!Number.isFinite(valor) || valor <= 0)
      return setErr("Informe um valor maior que zero.");
    if (!form.due_date) return setErr("Informe a data de vencimento.");
    if (form.parcelado && form.installment_no > form.installment_total)
      return setErr("A parcela atual não pode ser maior que o total.");
    /* O total vira uma linha por mês, e um número digitado errado geraria
       centenas de lançamentos de uma vez. */
    if (form.parcelado && form.installment_total > MAX_PARCELAS)
      return setErr(`O total de parcelas vai até ${MAX_PARCELAS}.`);
    if (
      form.parcelado &&
      form.modoParcelas === "variaveis" &&
      form.parcelas.some((x) => !(Number(x.amount) > 0) || !x.due_date)
    )
      return setErr("Toda parcela precisa de data e valor maior que zero.");

    setBusy(true);
    const temAbatimento = form.abatida || editing?.paid_amount != null;
    const payload = {
      description: desc,
      amount: valor,
      due_date: form.due_date,
      category: form.category,
      status: form.status,
      notes: form.notes.trim(),
      recurring: form.recurring,
      /* Mesma razão do completed_at em demandas: reescrever aqui apagava
         quando a conta foi realmente paga. */
      paid_at:
        form.status === "paid"
          ? (editing?.paid_at ?? new Date().toISOString())
          : null,
      /*
       * As colunas de parcela vêm da migration-003. Só entram no payload
       * quando a conta é parcelada: assim, num banco onde a migração ainda
       * não rodou, contas simples continuam sendo criadas normalmente em vez
       * de todas falharem com "could not find the column".
       */
      /* paid_amount vem de ABATIDAS.sql. Só entra no payload quando a conta é
         abatida, para o banco sem a migração continuar aceitando conta comum. */
      ...(temAbatimento
        ? {
            paid_amount: form.abatida
              ? Math.min(
                  valor,
                  Math.max(
                    0,
                    parseFloat(
                      String(form.paid_amount).replace(/\./g, "").replace(",", ".")
                    ) || 0
                  )
                )
              : null,
          }
        : {}),
      ...(form.parcelado || editing?.installment_total != null
        ? {
            installment_no: form.parcelado ? Number(form.installment_no) : null,
            installment_total: form.parcelado
              ? Number(form.installment_total)
              : null,
          }
        : {}),
    };

    let error;
    if (editing) {
      ({ error } = await supabase
        .from("bills")
        .update(payload)
        .eq("id", editing.id));
    } else {
      const uid = await currentUserId(supabase);
      if (!uid) {
        setBusy(false);
        return setErr(SESSION_EXPIRED);
      }
      /*
       * Parcelada lança todas as parcelas de uma vez, uma por mês.
       *
       * Era o trabalho manual que sobrava: uma conta de 10 parcelas exigia
       * criar dez contas à mão, mês a mês.
       */
      /*
       * A lista de parcelas vem do editor quando o modo é variável, e do
       * cálculo automático quando é iguais. Nos dois casos é a mesma estrutura,
       * então a montagem das linhas não precisa saber de qual veio.
       */
      const lista: Parcela[] =
        form.modoParcelas === "variaveis" && form.parcelas.length
          ? form.parcelas
          : parcelasIguais({
              primeiroVencimento: form.due_date,
              valor,
              valorTotal: form.valorTotal,
              de: Number(form.installment_no),
              total: Number(form.installment_total),
            });

      const linhas = form.parcelado
        ? lista.map((parcela, i) => ({
            ...payload,
            user_id: uid,
            installment_no: Number(form.installment_no) + i,
            amount: parcela.amount,
            due_date: parcela.due_date,
            /*
             * Só a primeira parcela recebe a situação escolhida. As seguintes
             * entram em aberto: marcar como paga o que ainda não venceu seria
             * inventar pagamento.
             */
            ...(i === 0
              ? {}
              : {
                  status: "pending" as BillStatus,
                  paid_at: null,
                  ...(temAbatimento ? { paid_amount: 0 } : {}),
                }),
          }))
        : [{ ...payload, user_id: uid }];

      ({ error } = await supabase.from("bills").insert(linhas));
      if (!error && linhas.length > 1)
        notice.show(
          `${linhas.length} parcelas lançadas, de ${rotuloMes(
            linhas[0].due_date
          )} a ${rotuloMes(linhas[linhas.length - 1].due_date)}.`
        );
    }
    setBusy(false);
    if (error) {
      // PGRST204: coluna inexistente — quase sempre a migração 003 pendente
      if (error.code === "PGRST204" && error.message.includes("installment"))
        return setErr(
          "Parcelamento precisa da migração 003 no banco. Rode supabase/migration-003.sql ou desmarque \"Parcelada\"."
        );
      if (error.code === "PGRST204" && error.message.includes("paid_amount"))
        return setErr(
          "Conta abatida precisa de supabase/ABATIDAS.sql no banco. Rode o arquivo ou desmarque \"Conta abatida\"."
        );
      return setErr(error.message);
    }
    setOpen(false);
    load();
  };

  const alternar = async (b: Bill) => {
    const proximo: BillStatus = b.status === "paid" ? "pending" : "paid";
    setRows((r) => r.map((x) => (x.id === b.id ? { ...x, status: proximo } : x)));
    const { error } = await supabase
      .from("bills")
      .update({
        status: proximo,
        paid_at: proximo === "paid" ? new Date().toISOString() : null,
      })
      .eq("id", b.id);
    if (
      notice.check(
        error,
        proximo === "paid" ? "marcar como paga" : "reabrir a conta"
      )
    )
      load();
  };

  /** Duplica a conta fixa para o mês seguinte, já em aberto. */
  const lancarProximo = async (b: Bill) => {
    setLancando(b.id);
    const uid = await currentUserId(supabase);
    if (!uid) {
      setLancando(null);
      return notice.show(SESSION_EXPIRED);
    }
    const { error } = await supabase.from("bills").insert({
      user_id: uid,
      description: b.description,
      amount: b.amount,
      due_date: proximoMes(b.due_date),
      category: b.category,
      status: "pending",
      notes: b.notes,
      recurring: true,
      paid_at: null,
    });
    setLancando(null);
    if (!notice.check(error, "lançar a próxima parcela")) load();
  };

  /*
   * Grava o novo total abatido e quita a conta quando cobre o valor.
   *
   * Sem virar `paid` ao cobrir, a conta ficaria como dívida do mês para sempre,
   * já que é justamente o resto em aberto que a mantém no recorte do mês.
   */
  const abater = async (novoTotalPago: number) => {
    if (!abatendo) return;
    setEmLote(true);
    const quitou = novoTotalPago >= Number(abatendo.amount) - 0.001;
    const { error } = await supabase
      .from("bills")
      .update({
        paid_amount: novoTotalPago,
        status: quitou ? "paid" : "pending",
        paid_at: quitou ? new Date().toISOString() : null,
      })
      .eq("id", abatendo.id);
    setEmLote(false);
    if (notice.check(error, "abater o pagamento")) return;
    setAbatendo(null);
    load();
  };

  const excluir = (b: Bill) =>
    confirm.ask(`Excluir "${b.description}"? Não pode ser desfeito.`, async () => {
      const { error } = await supabase.from("bills").delete().eq("id", b.id);
      if (!notice.check(error, "excluir a conta")) load();
    });

  /* ------------------------------ derivados ------------------------------ */

  const atrasada = (b: Bill) =>
    b.status === "pending" && daysUntil(b.due_date) < 0;

  /*
   * Trocar o mês limpa o dia escolhido no calendário.
   *
   * O dia manda por cima do recorte do mês, então mantê-lo deixaria a lista
   * presa num dia de setembro depois de voltar para agosto.
   */
  const trocarMes = (novo: string) => {
    setMes(novo);
    setDia(null);
  };

  const mesVizinho = (n: number) => {
    const d = new Date(Number(mes.slice(0, 4)), Number(mes.slice(5, 7)) - 1 + n, 1);
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
  };

  const mesAtual = todayISO().slice(0, 7);
  const noMesAtual = mes === mesAtual;

  /*
   * Recorte do mês, para o resumo e os gráficos: só o que vence no mês.
   *
   * Conta abatida em aberto entra à força quando o mês em foco é o atual: ela
   * não tem data marcada e segue sendo dívida de hoje até o abatimento cobrir
   * o total.
   */
  const doMesEstrito = React.useCallback(
    (b: Bill) =>
      b.due_date.startsWith(mes) ||
      (noMesAtual && ehAbatida(b) && b.status === "pending" && restanteDe(b) > 0),
    [mes, noMesAtual]
  );

  /*
   * Recorte da lista: o mês em foco e, no mês atual, também o que venceu antes
   * e não foi pago.
   *
   * Sem essa segunda parte, uma conta vencida em julho desapareceria da tela em
   * agosto — o recorte por mês esconderia justamente a dívida que mais precisa
   * aparecer. Ela entra no grupo "Vencidas", com a data à mostra.
   */
  const naLista = React.useCallback(
    (b: Bill) => doMesEstrito(b) || (noMesAtual && atrasada(b)),
    [doMesEstrito, noMesAtual]
  );

  /*
   * Contadores dos chips no mesmo recorte da lista.
   *
   * Contados sobre `rows` inteiro, o chip dizia "Pendentes 18" e mostrava 6:
   * era o mesmo desencontro entre cabeçalho e lista que o recorte por mês veio
   * resolver.
   */
  const contagens = React.useMemo(() => {
    const noMes = rows.filter(naLista);
    const pend = noMes.filter((b) => b.status === "pending");
    return {
      todas: noMes.length,
      // pendentes, como "semana" e "atrasadas": misturar pagas fazia o
      // contador do chip discordar da lista que ele filtra
      hoje: pend.filter((b) => b.due_date.slice(0, 10) === todayISO()).length,
      semana: pend.filter((b) => {
        const d = daysUntil(b.due_date);
        return d >= 0 && d <= 7;
      }).length,
      atrasadas: pend.filter(atrasada).length,
      pendentes: pend.length,
      pagas: noMes.filter((b) => b.status === "paid").length,
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [rows, naLista]);

  const filtradas = React.useMemo(() => {
    const termo = q.trim().toLowerCase();
    const hoje = todayISO();
    const passa = (b: Bill) => {
      // dia escolhido no calendário manda em cima dos chips
      if (dia) return b.due_date.slice(0, 10) === dia;
      switch (filtro) {
        case "hoje":
          return b.status === "pending" && b.due_date.slice(0, 10) === hoje;
        case "semana": {
          const d = daysUntil(b.due_date);
          return b.status === "pending" && d >= 0 && d <= 7;
        }
        case "atrasadas":
          return atrasada(b);
        case "pendentes":
          return b.status === "pending";
        case "pagas":
          return b.status === "paid";
        default:
          return true;
      }
    };
    const lista = rows
      /* Dia escolhido no calendário passa por cima do recorte do mês: o clique
         é explícito e pode cair na borda de outro mês. */
      .filter((b) => (dia ? true : naLista(b)))
      .filter(passa)
      .filter(
        (b) =>
          !termo ||
          b.description.toLowerCase().includes(termo) ||
          b.category.toLowerCase().includes(termo) ||
          b.notes.toLowerCase().includes(termo)
      );

    const ordenada = [...lista];
    ordenada.sort((a, b) => {
      switch (ordem) {
        case "maior":
          return b.amount - a.amount;
        case "menor":
          return a.amount - b.amount;
        case "nome":
          return a.description.localeCompare(b.description, "pt-BR");
        case "recente":
          return b.created_at.localeCompare(a.created_at);
        default:
          return a.due_date.localeCompare(b.due_date);
      }
    });
    return ordenada;
  }, [rows, filtro, ordem, q, dia, naLista]);

  /** Grupos por situação, na ordem em que pedem atenção. */
  const grupos = React.useMemo(() => {
    const g: { titulo: string; itens: Bill[]; tom: string }[] = [
      {
        titulo: "Vencidas",
        tom: "text-neg",
        itens: filtradas.filter(atrasada),
      },
      {
        titulo: "Pendentes",
        tom: "text-warn",
        itens: filtradas.filter((b) => b.status === "pending" && !atrasada(b)),
      },
      {
        titulo: "Pagas",
        tom: "text-pos",
        itens: filtradas.filter((b) => b.status === "paid"),
      },
    ];
    return g.filter((x) => x.itens.length > 0);
  }, [filtradas]);

  /*
   * O resumo e as categorias são do mês em foco, e não do filtro.
   *
   * Deixá-los seguir os chips fazia os quatro números mudarem a cada clique, e
   * o card Total perdia utilidade como referência. A soma do que está na tela
   * existe no pé da lista, que é onde ela pertence. Trocar o mês, por outro
   * lado, tem de mover tudo junto — é o recorte da tela inteira.
   *
   * Diferente de `naLista`: aqui não entra o vencido de meses anteriores, que
   * somado inflaria o total do mês com dívida que é de outro.
   */
  const doMes = React.useMemo(
    () => rows.filter(doMesEstrito),
    [rows, doMesEstrito]
  );

  const resumoMes = React.useMemo(() => {
    const pend = doMes.filter((b) => b.status === "pending");
    const pagas = doMes.filter((b) => b.status === "paid");
    const venc = pend.filter(atrasada);

    /*
     * Numa conta abatida, a parte já abatida é dinheiro pago e só o resto é
     * dívida. Somar o valor cheio em "Pendentes" mostraria como dívida algo
     * que já saiu do bolso.
     */
    const emAberto = (l: Bill[]) => l.reduce((s, b) => s + restanteDe(b), 0);
    const quitado = (l: Bill[]) =>
      l.reduce(
        (s, b) => s + (b.status === "paid" ? b.amount : Number(b.paid_amount ?? 0)),
        0
      );

    return {
      total: doMes.reduce((s, b) => s + b.amount, 0),
      qtdTotal: doMes.length,
      pagas: quitado(doMes),
      qtdPagas: pagas.length,
      pendentes: emAberto(pend),
      qtdPendentes: pend.length,
      vencidas: emAberto(venc),
      qtdVencidas: venc.length,
    };
  }, [doMes]);

  /** Soma do que está na tela, para o pé da lista. */
  const somaFiltro = React.useMemo(
    () => filtradas.reduce((s, b) => s + b.amount, 0),
    [filtradas]
  );

  /** Uso por categoria em TODAS as contas, não só no filtro: o aviso antes de
      excluir precisa contar tudo, senão diria "sem uso" para categoria em uso
      fora do recorte visível. */
  /**
   * Monta a lista do editor a partir dos campos de cima.
   *
   * Ao entrar no modo variável a lista vem preenchida com o cálculo automático,
   * então ajustar uma parcela não obriga a digitar as outras. `forcar` é o
   * "recalcular iguais": só ele sobrescreve valores já editados à mão.
   */
  const trocarModoParcelas = (
    modo: "iguais" | "variaveis",
    forcar = false
  ) => {
    if (modo === "iguais") return setForm({ ...form, modoParcelas: "iguais" });

    const valor = parseFloat(
      String(form.amount).replace(/\./g, "").replace(",", ".")
    );
    const de = Number(form.installment_no);
    const total = Number(form.installment_total);
    if (
      !Number.isFinite(valor) ||
      valor <= 0 ||
      !/^\d{4}-\d{2}-\d{2}$/.test(form.due_date) ||
      total - de + 1 < 1 ||
      total > MAX_PARCELAS
    ) {
      setErr("Informe valor, vencimento e o total de parcelas antes de ajustar.");
      return;
    }

    setErr("");
    const base = parcelasIguais({
      primeiroVencimento: form.due_date,
      valor,
      valorTotal: form.valorTotal,
      de,
      total,
    });
    setForm({
      ...form,
      modoParcelas: "variaveis",
      /* Sem forçar, preserva o que já foi ajustado e só completa o que falta. */
      parcelas:
        forcar || !form.parcelas.length
          ? base
          : base.map((b, i) => form.parcelas[i] ?? b),
    });
  };

  /*
   * Mexer em "Parcela" ou "De" muda quantas linhas a lista precisa ter.
   * Estender ou cortar aqui evita gravar uma quantidade diferente da que está
   * na tela, e preserva as linhas já ajustadas.
   */
  React.useEffect(() => {
    if (form.modoParcelas !== "variaveis" || !form.parcelas.length) return;
    const alvo = Number(form.installment_total) - Number(form.installment_no) + 1;
    if (alvo < 1 || alvo === form.parcelas.length) return;

    const valor = parseFloat(
      String(form.amount).replace(/\./g, "").replace(",", ".")
    );
    if (!Number.isFinite(valor) || valor <= 0) return;
    const base = parcelasIguais({
      primeiroVencimento: form.due_date,
      valor,
      valorTotal: form.valorTotal,
      de: Number(form.installment_no),
      total: Number(form.installment_total),
    });
    setForm((f) => ({
      ...f,
      parcelas: base.map((b, i) => f.parcelas[i] ?? b),
    }));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [form.installment_no, form.installment_total, form.modoParcelas]);

  /**
   * Prévia do parcelamento, com os mesmos cálculos da gravação.
   *
   * Refaz repartir e mesesAdiante em vez de reaproveitar valores da gravação
   * porque a gravação só roda depois; o que importa é que use as mesmas
   * funções, para a prévia não prometer algo diferente do que será criado.
   */
  const previaParcelas = React.useMemo(() => {
    if (!form.parcelado) return null;
    const total = Number(form.installment_total);
    const de = Number(form.installment_no);
    const v = parseFloat(String(form.amount).replace(/\./g, "").replace(",", "."));
    const quantas = total - de + 1;
    if (
      !Number.isFinite(total) ||
      !Number.isFinite(de) ||
      quantas < 1 ||
      total > 120 ||
      !Number.isFinite(v) ||
      v <= 0 ||
      !/^\d{4}-\d{2}-\d{2}$/.test(form.due_date)
    )
      return null;

    const parcelas = form.valorTotal ? repartir(v, total) : null;
    const primeiro = parcelas ? parcelas[de - 1] : v;
    const ultimo = parcelas ? parcelas[total - 1] : v;
    const dia = Number(form.due_date.slice(8, 10));

    /*
     * Soma do que vai ser criado, sempre.
     *
     * Assim tanto faz por qual dos dois lados a pessoa digitou: quem informou o
     * valor da parcela confere o total aqui, e quem informou o total confere a
     * parcela. Some as parcelas de fato, em vez de multiplicar, porque a sobra
     * de centavos da divisão está na primeira.
     */
    const soma = parcelas
      ? parcelas.slice(de - 1).reduce((t, x) => t + x, 0)
      : v * quantas;

    return {
      quantas,
      rotuloValor:
        primeiro === ultimo ? brl(primeiro) : `${brl(primeiro)} + ${brl(ultimo)}`,
      soma,
      parcial: parcelas != null && de > 1,
      doMes: rotuloMes(form.due_date),
      aoMes: rotuloMes(mesesAdiante(form.due_date, quantas - 1)),
      dia,
      /* Só avisa do encolhimento quando ele pode acontecer de fato. */
      diaCurto: dia > 28,
    };
  }, [
    form.parcelado,
    form.installment_no,
    form.installment_total,
    form.amount,
    form.due_date,
    form.valorTotal,
  ]);

  const usoPorCategoria = React.useMemo(() => {
    const m: Record<string, number> = {};
    rows.forEach((b) => {
      m[b.category] = (m[b.category] ?? 0) + 1;
    });
    return m;
  }, [rows]);

  const porCategoria = React.useMemo(() => {
    const mapa = new Map<string, { pago: number; pendente: number }>();
    doMes.forEach((b) => {
      const c = mapa.get(b.category) ?? { pago: 0, pendente: 0 };
      if (b.status === "paid") c.pago += b.amount;
      else c.pendente += b.amount;
      mapa.set(b.category, c);
    });
    const lista = [...mapa.entries()].map(([categoria, v]) => ({
      categoria,
      ...v,
      total: v.pago + v.pendente,
    }));
    lista.sort((a, b) => b.total - a.total);
    return lista;
  }, [doMes]);

  /**
   * Doze pontos, sempre sobre todas as contas — é tendência, não filtro.
   *
   * Para trás vai só até onde a retenção guarda as pagas, e não um número fixo:
   * olhar mais longe que a retenção mostraria meses zerados porque o dado foi
   * apagado, não porque não houve gasto — o gráfico mentiria justamente na parte
   * mais antiga. Com a retenção em doze meses, os doze pontos são todos passado.
   *
   * Se a retenção diminuir algum dia, o espaço que sobra vai para a frente, onde
   * há dado real: parcelas e contas fixas já lançadas.
   */
  const evolucao = React.useMemo<PontoMes[]>(() => {
    const hoje = new Date(todayISO() + "T00:00:00");
    const atras = MESES_RETENCAO_PAGAS - 1;
    const aFrente = 12 - MESES_RETENCAO_PAGAS;
    const pontos: PontoMes[] = [];
    for (let i = atras; i >= -aFrente; i--) {
      const d = new Date(hoje.getFullYear(), hoje.getMonth() - i, 1);
      const ym = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
      pontos.push({
        rotulo: rotuloMes(ym),
        valor: rows
          .filter((b) => b.due_date.startsWith(ym))
          .reduce((s, b) => s + b.amount, 0),
        mesAtual: i === 0,
      });
    }
    return pontos;
  }, [rows]);

  /*
   * Dois rótulos do mesmo mês.
   *
   * `nomeMes` acompanha os títulos e traz o ano só quando não é o ano corrente:
   * "Resumo de agosto" lê melhor que "Resumo de agosto de 2026", mas em 2025 o
   * ano é a diferença entre dois agostos.
   *
   * `nomeMesAno` é do seletor, onde o ano aparece sempre: é ele que navega para
   * dezembro e cai no ano seguinte, e sem o ano o salto passaria batido.
   */
  const nomeMes = new Date(mes + "-01T00:00:00").toLocaleDateString("pt-BR", {
    month: "long",
    ...(Number(mes.slice(0, 4)) !== new Date().getFullYear()
      ? { year: "numeric" }
      : {}),
  });

  const nomeMesAno = new Date(mes + "-01T00:00:00").toLocaleDateString("pt-BR", {
    month: "long",
    year: "numeric",
  });

  const nadaPendente =
    !loading && rows.length > 0 && contagens.pendentes === 0;

  if (loading) return null;

  return (
    <div className="rise">
      <div className="mb-5 flex flex-wrap items-end justify-between gap-3.5">
        <div>
          <h1 className="text-[26px] font-bold tracking-[-0.03em]">
            Contas a pagar
          </h1>
          <p className="mt-1 text-sm text-fg-mute">
            {contagens.pendentes} em aberto
            {contagens.atrasadas > 0 && (
              <span className="text-neg">
                {" "}
                · {contagens.atrasadas} vencida
                {contagens.atrasadas > 1 ? "s" : ""}
              </span>
            )}
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Link href="/contas/gerenciar">
            <Button>
              <SlidersHorizontal size={15} />
              Gerenciar
            </Button>
          </Link>
          <Button onClick={() => setGerindoCategorias(true)}>
            <Tag size={15} />
            Categorias
          </Button>
          <Button variant="primary" onClick={novo}>
            <Wallet size={15} />
            Nova conta
          </Button>
        </div>
      </div>

      {nadaPendente && (
        <div className="mb-4 flex items-center gap-3 rounded-[18px] bg-pos/12 px-4 py-3.5">
          <PartyPopper size={18} className="shrink-0 text-pos" />
          <div>
            <p className="text-[13.5px] font-bold text-pos">Tudo em dia</p>
            <p className="text-[12px] text-fg-dim">
              Nenhuma conta pendente. Só as pagas na lista.
            </p>
          </div>
        </div>
      )}

      {/* ------------------------------ resumo do mês ------------------------------ */}
      <p className="mb-2.5 text-[11px] font-semibold uppercase tracking-[0.1em] text-fg-mute">
        Resumo de {nomeMes}
      </p>
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <Numero rotulo="Total" valor={resumoMes.total} qtd={resumoMes.qtdTotal} />
        <Numero
          rotulo="Pagas"
          valor={resumoMes.pagas}
          qtd={resumoMes.qtdPagas}
          tom="text-pos"
        />
        <Numero
          rotulo="Pendentes"
          valor={resumoMes.pendentes}
          qtd={resumoMes.qtdPendentes}
          tom="text-warn"
        />
        <Numero
          rotulo="Vencidas"
          valor={resumoMes.vencidas}
          qtd={resumoMes.qtdVencidas}
          tom="text-neg"
        />
      </div>

      {/* ------------------------------ lista ------------------------------ */}
      <Card className="mt-4 overflow-hidden">
        <div className="flex flex-wrap items-center gap-2.5 px-[18px] pt-[18px]">
          {/*
            Seletor do mês em foco, antes dos chips: ele recorta tudo o que vem
            depois — chips, contadores, lista, resumo, gráficos e calendário.
            É o mesmo estado do calendário, então virar o mês num lugar move o
            outro.
          */}
          <div className="flex items-center gap-0.5 rounded-full bg-ink-800 p-0.5">
            <button
              onClick={() => trocarMes(mesVizinho(-1))}
              aria-label={`Ver ${rotuloMes(mesVizinho(-1) + "-01")}`}
              className="grid h-7 w-7 place-items-center rounded-full text-fg-mute transition-colors hover:bg-white hover:text-fg"
            >
              <ChevronLeft size={15} />
            </button>
            <span className="w-[132px] text-center text-[12.5px] font-bold capitalize">
              {nomeMesAno}
            </span>
            <button
              onClick={() => trocarMes(mesVizinho(1))}
              aria-label={`Ver ${rotuloMes(mesVizinho(1) + "-01")}`}
              className="grid h-7 w-7 place-items-center rounded-full text-fg-mute transition-colors hover:bg-white hover:text-fg"
            >
              <ChevronRight size={15} />
            </button>
          </div>

          {!noMesAtual && (
            <button
              onClick={() => trocarMes(mesAtual)}
              className="h-8 rounded-full bg-brand-500/12 px-3 text-[12px] font-bold text-brand-400 transition-colors hover:bg-brand-500/20"
            >
              voltar para {rotuloMes(mesAtual + "-01")}
            </button>
          )}

          <div className="flex flex-wrap gap-1.5">
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
                <span className="ml-1.5 opacity-60 tnum">
                  {contagens[f.v]}
                </span>
              </button>
            ))}
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2.5 px-[18px] pb-3.5 pt-3">
          <div className="relative w-full flex-1 sm:min-w-[180px]">
            <Search
              size={15}
              className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-fg-mute"
            />
            <Input
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder="Buscar conta..."
              aria-label="Buscar conta"
              className="pl-9"
            />
          </div>
          <Select
            value={ordem}
            onChange={(e) => setOrdem(e.target.value as Ordem)}
            aria-label="Ordenar por"
            className="w-full sm:w-[196px]"
          >
            {ORDENS.map((o) => (
              <option key={o.v} value={o.v}>
                {o.label}
              </option>
            ))}
          </Select>
        </div>

        {filtradas.length === 0 ? (
          <div className="flex flex-col items-center px-6 py-14 text-center">
            <div className="mb-3 grid h-11 w-11 place-items-center rounded-[14px] bg-ink-800 text-fg-mute">
              <Wallet size={19} />
            </div>
            <p className="text-[13.5px] font-semibold text-fg-dim">
              {rows.length ? "Nada neste filtro" : "Nenhuma conta cadastrada"}
            </p>
            <p className="mt-1 max-w-[330px] text-xs text-fg-mute">
              {rows.length
                ? "Troque o filtro ou limpe a busca."
                : "Lance suas contas para acompanhar vencimentos e totais."}
            </p>
            {!rows.length && (
              <Button variant="primary" size="sm" className="mt-4" onClick={novo}>
                Nova conta
              </Button>
            )}
          </div>
        ) : (
          <div className="border-t border-line-soft">
            <p className="px-[18px] pt-3 text-[11.5px] font-semibold text-fg-mute">
              {filtradas.length} conta{filtradas.length === 1 ? "" : "s"}
              {dia ? ` em ${dataCurta(dia)}` : ` em ${nomeMes}`}
            </p>
            {grupos.map((g) => {
              const aberto = !fechados.has(g.titulo);
              const soma = g.itens.reduce((t, b) => t + b.amount, 0);
              return (
                <section key={g.titulo}>
                  <h2>
                    <button
                      onClick={() => alternarGrupo(g.titulo)}
                      aria-expanded={aberto}
                      className="flex w-full items-center gap-2 px-[18px] pb-1.5 pt-4 text-left transition-colors hover:bg-ink-800/60"
                    >
                      <ChevronRight
                        size={13}
                        className={cx(
                          "shrink-0 text-fg-mute transition-transform",
                          aberto && "rotate-90"
                        )}
                      />
                      <span
                        className={cx(
                          "text-[10.5px] font-bold uppercase tracking-[0.1em]",
                          g.tom
                        )}
                      >
                        {g.titulo}
                      </span>
                      <span className="text-[10.5px] font-bold text-fg-mute tnum">
                        ({g.itens.length})
                      </span>
                      <span className="ml-auto text-[12px] font-semibold text-fg-mute tnum">
                        {brl(soma)}
                      </span>
                    </button>
                  </h2>
                  {aberto && (
                    <ul className="px-2.5 pb-1">
                      {g.itens.map((b) => (
                        <Linha
                          key={b.id}
                          b={b}
                          atrasada={atrasada(b)}
                          onAlternar={() => alternar(b)}
                          onAbater={() => setAbatendo(b)}
                          onEditar={() => editar(b)}
                          onExcluir={() => excluir(b)}
                        />
                      ))}
                    </ul>
                  )}
                </section>
              );
            })}
            <div className="mt-1 flex items-baseline justify-between border-t border-line-soft px-[18px] py-3.5">
              <span className="text-[12px] text-fg-mute">
                Soma do filtro
              </span>
              <span className="text-[16px] font-bold tracking-[-0.02em] tnum">
                {brl(somaFiltro)}
              </span>
            </div>
          </div>
        )}
      </Card>

      {/* -------------------- calendário + contas fixas -------------------- */}
      <div className="mt-4 grid gap-4 xl:grid-cols-[minmax(0,360px)_minmax(0,1fr)]">
        <Card>
          <Cabeca titulo="Calendário de pagamentos" sub="Clique num dia para filtrar" />
          <div className="px-[18px] pb-[18px] pt-3">
            <CalendarioPagamentos
              contas={rows}
              dia={dia}
              onDia={setDia}
              mes={mes}
              onMes={trocarMes}
            />
          </div>
        </Card>

        <Card>
          <Cabeca
            titulo="Contas fixas"
            sub="Lance o mês seguinte com um clique"
          />
          <div className="px-[18px] pb-[18px] pt-3">
            <ContasFixas contas={rows} onLancar={lancarProximo} ocupado={lancando} />
          </div>
        </Card>
      </div>

      {/* ------------------------------ análises ------------------------------ */}
      <div className="mt-4 grid gap-4 xl:grid-cols-2">
        <Card>
          <Cabeca titulo="Gastos por categoria" sub={`Vencimentos de ${nomeMes}`} />
          <div className="px-[18px] pb-[18px] pt-3">
            <ParticipacaoCategoria
              dados={porCategoria.map((c) => ({
                categoria: c.categoria,
                valor: c.total,
              }))}
              total={resumoMes.total}
            />
          </div>
        </Card>

        <Card>
          <Cabeca
            titulo="Pago vs pendente por categoria"
            sub={`Vencimentos de ${nomeMes}`}
          />
          <div className="px-[18px] pb-[18px] pt-3">
            <PagoPendenteCategoria dados={porCategoria} />
          </div>
        </Card>
      </div>

      <Card className="mt-4">
        <Cabeca
          titulo="Evolução dos gastos"
          sub={
            12 - MESES_RETENCAO_PAGAS > 0
              ? `${MESES_RETENCAO_PAGAS} meses para trás e ${
                  12 - MESES_RETENCAO_PAGAS
                } à frente, todas as contas`
              : "Últimos 12 meses, todas as contas"
          }
        />
        <div className="px-2 pb-4 pt-3">
          <EvolucaoMensal dados={evolucao} />
        </div>
      </Card>

      {/* ------------------------------ modal ------------------------------ */}
      <Modal
        open={open}
        onClose={() => setOpen(false)}
        title={editing ? "Editar conta" : "Nova conta"}
        sub="Vencimento, valor e categoria."
        footer={
          <>
            <Button onClick={() => setOpen(false)}>Cancelar</Button>
            <Button variant="primary" onClick={salvar} disabled={busy}>
              {busy ? "Salvando..." : "Salvar"}
            </Button>
          </>
        }
      >
        <form onSubmit={salvar} className="flex flex-col gap-3.5">
          <Field label="Descrição">
            <Input
              autoFocus
              value={form.description}
              onChange={(e) => {
                const description = e.target.value;
                /*
                 * O palpite acompanha a digitação e para no instante em que a
                 * pessoa mexe no select. Sem esse freio, terminar de digitar
                 * depois de escolher a categoria desfaria a escolha.
                 */
                if (form.categoriaEscolhida) {
                  setForm({ ...form, description });
                  return;
                }
                /*
                 * Sem correspondência, volta para o padrão em vez de manter o
                 * palpite anterior: digitar "Perfumes" e depois trocar por algo
                 * que não casa deixava "Cuidados Pessoais" no campo, sem a dica
                 * e sem ninguém ter escolhido — um palpite velho virava a
                 * categoria da conta nova.
                 */
                const palpite = sugerirCategoria(description, categorias.nomes);
                setForm({
                  ...form,
                  description,
                  category: palpite ?? CATEGORIA_PADRAO,
                });
              }}
              placeholder="Aluguel do escritório"
            />
          </Field>

          <div className="grid gap-3.5 sm:grid-cols-2">
            <Field label="Valor (R$)">
              <Input
                inputMode="decimal"
                value={form.amount}
                onChange={(e) => setForm({ ...form, amount: e.target.value })}
                placeholder="1500,00"
              />
            </Field>
            <Field
              label={form.abatida ? "Data de referência" : "Vencimento"}
              hint={
                form.abatida
                  ? "Conta abatida não tem vencimento; serve só para ordenar."
                  : undefined
              }
            >
              <Input
                type="date"
                value={form.due_date}
                onChange={(e) => setForm({ ...form, due_date: e.target.value })}
              />
            </Field>
          </div>

          <div className="grid gap-3.5 sm:grid-cols-2">
            <Field
              label="Categoria"
              hint={
                !editing &&
                !form.categoriaEscolhida &&
                sugerirCategoria(form.description, categorias.nomes) ===
                  form.category
                  ? "sugerida pela descrição · troque se quiser"
                  : undefined
              }
            >
              <Select
                value={form.category}
                onChange={(e) =>
                  setForm({
                    ...form,
                    category: e.target.value,
                    categoriaEscolhida: true,
                  })
                }
              >
                {/* a categoria da conta em edição pode não estar mais na lista,
                    se foi excluída; incluí-la evita o select cair no primeiro
                    item e trocar a categoria sem a pessoa pedir */}
                {(categorias.nomes.includes(form.category)
                  ? categorias.nomes
                  : [form.category, ...categorias.nomes]
                ).map((c) => (
                  <option key={c}>{c}</option>
                ))}
              </Select>
            </Field>
            <Field label="Status">
              <Select
                value={form.status}
                onChange={(e) =>
                  setForm({ ...form, status: e.target.value as BillStatus })
                }
              >
                <option value="pending">Em aberto</option>
                <option value="paid">Paga</option>
              </Select>
            </Field>
          </div>

          <Field label="Observações">
            <Textarea
              rows={2}
              value={form.notes}
              onChange={(e) => setForm({ ...form, notes: e.target.value })}
              placeholder="Boleto no e-mail, pagar via PIX..."
            />
          </Field>

          <label className="flex cursor-pointer items-center gap-2.5 rounded-[14px] bg-ink-800 px-3.5 py-3">
            <input
              type="checkbox"
              checked={form.recurring}
              onChange={(e) => setForm({ ...form, recurring: e.target.checked })}
              className="h-4 w-4 accent-[var(--a)]"
            />
            <span className="text-sm text-fg-dim">
              Conta fixa
              <span className="ml-1 text-[11px] text-fg-mute">
                (marca como recorrente; não duplica)
              </span>
            </span>
          </label>

          <div className="rounded-[14px] bg-ink-800 p-3.5">
            <label className="flex cursor-pointer items-start gap-2.5">
              <input
                type="checkbox"
                checked={form.abatida}
                onChange={(e) =>
                  setForm({ ...form, abatida: e.target.checked })
                }
                className="mt-0.5 h-4 w-4 accent-[var(--a)]"
              />
              <span className="text-sm text-fg-dim">
                <span className="font-semibold text-fg">Conta abatida</span>
                <span className="mt-0.5 block text-[11.5px] text-fg-mute">
                  Paga aos poucos, sem data marcada. Fica como dívida do mês
                  atual até o abatimento cobrir o total.
                </span>
              </span>
            </label>
            {form.abatida && (
              <div className="mt-3.5 border-t border-line-soft pt-3.5">
                <Field label="Já abatido (R$)" hint="Depois, use o botão Abater na lista para somar cada pagamento.">
                  <Input
                    inputMode="decimal"
                    value={form.paid_amount}
                    onChange={(e) =>
                      setForm({ ...form, paid_amount: e.target.value })
                    }
                    placeholder="0,00"
                  />
                </Field>
              </div>
            )}
          </div>

          <div className="rounded-[14px] bg-ink-800 p-3.5">
            <label className="flex cursor-pointer items-center gap-2.5">
              <input
                type="checkbox"
                checked={form.parcelado}
                onChange={(e) =>
                  setForm({ ...form, parcelado: e.target.checked })
                }
                className="h-4 w-4 accent-[var(--a)]"
              />
              <span className="text-sm text-fg-dim">
                <span className="font-semibold text-fg">Parcelada</span>
                <span className="ml-1 text-[11px] text-fg-mute">
                  (mostra 2/4 na lista)
                </span>
              </span>
            </label>
            {form.parcelado && (
              <div className="mt-3.5 border-t border-line-soft pt-3.5">
                {!editing && (
                  <div className="mb-3.5">
                    <span className="mb-1.5 block text-[11px] font-medium uppercase tracking-wider text-fg-mute">
                      O valor de R$ {form.amount || "0,00"} é
                    </span>
                    <div className="flex gap-1.5">
                      {[
                        { v: false, label: "de cada parcela" },
                        { v: true, label: "o total a dividir" },
                      ].map((op) => (
                        <button
                          key={String(op.v)}
                          type="button"
                          onClick={() => setForm({ ...form, valorTotal: op.v })}
                          className={cx(
                            "h-8 flex-1 rounded-full px-3 text-[12px] font-semibold transition-colors",
                            form.valorTotal === op.v
                              ? "bg-brand-500 text-on-brand"
                              : "bg-ink-750 text-fg-mute hover:text-fg-dim"
                          )}
                        >
                          {op.label}
                        </button>
                      ))}
                    </div>
                  </div>
                )}

                <div className="grid gap-3.5 sm:grid-cols-2">
                  <Field label="Parcela">
                  <Input
                    type="number"
                    min={1}
                    value={form.installment_no}
                    onChange={(e) =>
                      setForm({ ...form, installment_no: Number(e.target.value) })
                    }
                  />
                </Field>
                  <Field label="De">
                    <Input
                      type="number"
                      min={1}
                      value={form.installment_total}
                      onChange={(e) =>
                        setForm({
                          ...form,
                          installment_total: Number(e.target.value),
                        })
                      }
                    />
                  </Field>
                </div>

                {!editing && (
                  <div className="mt-3.5">
                    <span className="mb-1.5 block text-[11px] font-medium uppercase tracking-wider text-fg-mute">
                      Datas e valores
                    </span>
                    <div className="flex gap-1.5">
                      {[
                        { v: "iguais" as const, label: "iguais todo mês" },
                        { v: "variaveis" as const, label: "ajustar cada uma" },
                      ].map((op) => (
                        <button
                          key={op.v}
                          type="button"
                          onClick={() => trocarModoParcelas(op.v)}
                          className={cx(
                            "h-8 flex-1 rounded-full px-3 text-[12px] font-semibold transition-colors",
                            form.modoParcelas === op.v
                              ? "bg-brand-500 text-on-brand"
                              : "bg-ink-750 text-fg-mute hover:text-fg-dim"
                          )}
                        >
                          {op.label}
                        </button>
                      ))}
                    </div>
                  </div>
                )}

                {!editing &&
                  form.modoParcelas === "variaveis" &&
                  form.parcelas.length > 0 && (
                    <EditorParcelas
                      parcelas={form.parcelas}
                      de={Number(form.installment_no)}
                      onChange={(parcelas) => setForm({ ...form, parcelas })}
                      onRecalcular={() => trocarModoParcelas("variaveis", true)}
                    />
                  )}

                {/* Prévia do que será criado: quantas linhas, com que valor e
                    em que meses. É a única forma de conferir antes de gravar
                    dez lançamentos de uma vez. */}
                {!editing && form.modoParcelas === "iguais" && previaParcelas && (
                  <p className="mt-3.5 rounded-[12px] bg-brand-500/10 px-3 py-2.5 text-[11.5px] leading-relaxed text-fg-dim">
                    Vão ser criados{" "}
                    <span className="font-bold text-fg tnum">
                      {previaParcelas.quantas}
                    </span>{" "}
                    {previaParcelas.quantas === 1 ? "lançamento" : "lançamentos"} de{" "}
                    <span className="font-bold text-fg tnum">
                      {previaParcelas.rotuloValor}
                    </span>
                    , de{" "}
                    <span className="font-bold text-fg">{previaParcelas.doMes}</span>{" "}
                    a <span className="font-bold text-fg">{previaParcelas.aoMes}</span>.
                    <span className="mt-1 block">
                      {previaParcelas.parcial ? "Somam" : "Soma"}{" "}
                      <span className="font-bold text-fg tnum">
                        {brl(previaParcelas.soma)}
                      </span>
                      {previaParcelas.diaCurto && (
                        <>
                          {" "}
                          · nos meses sem dia {previaParcelas.dia}, cai no último
                          dia
                        </>
                      )}
                      .
                    </span>
                  </p>
                )}
              </div>
            )}
          </div>

          {err && (
            <p className="rounded-[14px] bg-neg/12 px-3.5 py-3 text-xs font-medium text-neg">
              {err}
            </p>
          )}
        </form>
      </Modal>

      <GerenciarCategorias
        aberto={gerindoCategorias}
        onFechar={() => setGerindoCategorias(false)}
        supabase={supabase}
        estado={categorias}
        usoPorNome={usoPorCategoria}
        onMudou={load}
      />

      <AbaterModal
        conta={abatendo}
        onFechar={() => setAbatendo(null)}
        onAbater={abater}
        ocupado={emLote}
      />

      {confirm.node}
      {notice.node}
    </div>
  );
}

/* ------------------------------ peças ------------------------------ */

function Cabeca({ titulo, sub }: { titulo: string; sub?: string }) {
  return (
    <div className="px-[18px] pt-[17px]">
      <h2 className="text-[11px] font-semibold uppercase tracking-[0.1em] text-fg-mute">
        {titulo}
      </h2>
      {sub && <p className="mt-0.5 text-[11.5px] text-fg-mute">{sub}</p>}
    </div>
  );
}

function Numero({
  rotulo,
  valor,
  qtd,
  tom,
}: {
  rotulo: string;
  valor: number;
  qtd: number;
  tom?: string;
}) {
  return (
    <Card className="p-[18px]">
      <p
        className={cx(
          "text-[10.5px] font-bold uppercase tracking-[0.1em]",
          tom ?? "text-fg-mute"
        )}
      >
        {rotulo}
      </p>
      <p className="mt-2.5 text-[20px] font-bold tracking-[-0.03em] tnum">
        {brl(valor)}
      </p>
      <p className="mt-1 text-[11.5px] text-fg-mute">
        {qtd} conta{qtd === 1 ? "" : "s"}
      </p>
    </Card>
  );
}

function Linha({
  b,
  atrasada,
  onAlternar,
  onAbater,
  onEditar,
  onExcluir,
}: {
  b: Bill;
  atrasada: boolean;
  onAlternar: () => void;
  onAbater: () => void;
  onEditar: () => void;
  onExcluir: () => void;
}) {
  const d = daysUntil(b.due_date);
  const paga = b.status === "paid";
  const abatida = ehAbatida(b);

  return (
    <li className="group flex items-center gap-3 rounded-[14px] px-3 py-2.5 transition-colors hover:bg-ink-800">
      <button
        onClick={onAlternar}
        aria-label={paga ? "Marcar em aberto" : "Marcar como paga"}
        className={cx(
          "grid h-[22px] w-[22px] shrink-0 place-items-center rounded-md border-[1.8px] transition-colors",
          paga
            ? "border-pos bg-pos text-white"
            : "border-ink-600 text-transparent hover:border-brand-500"
        )}
      >
        <CheckCircle2 size={13} />
      </button>

      <div className="min-w-0 flex-1">
        <p
          className={cx(
            "truncate text-[13.5px] font-semibold",
            paga && "text-fg-mute line-through"
          )}
        >
          {b.description}
        </p>
        <div className="mt-0.5 flex flex-wrap items-center gap-x-2 gap-y-1 text-[11px] text-fg-mute">
          <span className="tnum">
            {abatida ? "sem data" : dataCurta(b.due_date)}
          </span>
          <span className="opacity-40">·</span>
          <span>{b.category}</span>
          {b.installment_total != null && (
            <span className="rounded-full bg-brand-500/12 px-1.5 font-semibold text-brand-400 tnum">
              {b.installment_no}/{b.installment_total}
            </span>
          )}
          {abatida && (
            <span className="inline-flex items-center gap-1 rounded-full bg-warn/12 px-1.5 font-semibold text-warn">
              <HandCoins size={9} />
              abatida
            </span>
          )}
          {b.recurring && (
            <span className="inline-flex items-center gap-1 rounded-full bg-ink-750 px-1.5 font-semibold">
              <Repeat2 size={9} />
              recorrente
            </span>
          )}
          {!paga && atrasada && (
            <span className="inline-flex items-center gap-1 font-bold text-neg">
              <AlertCircle size={10} />
              {Math.abs(d)}d em atraso
            </span>
          )}
          {!paga && d === 0 && (
            <span className="inline-flex items-center gap-1 font-bold text-warn">
              <Clock size={10} />
              vence hoje
            </span>
          )}
          {!paga && !abatida && d > 0 && d <= 7 && (
            <span className="font-bold text-warn">em {d}d</span>
          )}
        </div>
        {abatida && <ProgressoAbatida conta={b} />}
      </div>

      <span
        className={cx(
          "shrink-0 text-[14.5px] font-bold tracking-[-0.02em] tnum",
          atrasada && "text-neg",
          paga && "text-fg-mute"
        )}
      >
        {brl(b.amount)}
      </span>

      <div className="flex shrink-0 gap-0.5 transition-opacity lg:opacity-0 lg:group-hover:opacity-100 lg:focus-within:opacity-100">
        {abatida && !paga && (
          <button
            onClick={onAbater}
            aria-label={`Abater pagamento de ${b.description}`}
            title="Abater pagamento"
            className="grid h-7 w-7 place-items-center rounded-lg text-warn transition-colors hover:bg-warn/15"
          >
            <HandCoins size={14} />
          </button>
        )}
        <button
          onClick={onEditar}
          aria-label="Editar"
          className="grid h-7 w-7 place-items-center rounded-lg text-fg-mute hover:bg-white hover:text-fg"
        >
          <Pencil size={14} />
        </button>
        <button
          onClick={onExcluir}
          aria-label="Excluir"
          className="grid h-7 w-7 place-items-center rounded-lg text-fg-mute hover:bg-neg/15 hover:text-neg"
        >
          <Trash2 size={14} />
        </button>
      </div>
    </li>
  );
}
