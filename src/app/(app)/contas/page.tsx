"use client";

import * as React from "react";
import {
  AlertCircle,
  CheckCircle2,
  Clock,
  PartyPopper,
  Pencil,
  Repeat2,
  Search,
  Trash2,
  Wallet,
} from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { currentUserId, SESSION_EXPIRED } from "@/lib/session";
import { BILL_CATEGORIES, type Bill, type BillStatus } from "@/lib/types";
import { brl, dataCurta, daysUntil, rotuloMes, todayISO } from "@/lib/format";
import {
  CalendarioPagamentos,
  ContasFixas,
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
  Skeleton,
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
  category: "Outros",
  status: "pending" as BillStatus,
  recurring: false,
  notes: "",
  parcelado: false,
  installment_no: 1,
  installment_total: 2,
});

export default function ContasPage() {
  const supabase = React.useMemo(() => createClient(), []);
  const [rows, setRows] = React.useState<Bill[]>([]);
  const [loading, setLoading] = React.useState(true);
  const [filtro, setFiltro] = React.useState<Filtro>("todas");
  const [ordem, setOrdem] = React.useState<Ordem>("vencimento");
  const [q, setQ] = React.useState("");
  const [dia, setDia] = React.useState<string | null>(null);
  const [lancando, setLancando] = React.useState<string | null>(null);
  const [open, setOpen] = React.useState(false);
  const [editing, setEditing] = React.useState<Bill | null>(null);
  const [form, setForm] = React.useState(vazio());
  const [busy, setBusy] = React.useState(false);
  const [err, setErr] = React.useState("");
  const confirm = useConfirm();
  const notice = useNotice();

  const load = React.useCallback(async () => {
    const { data } = await supabase.from("bills").select("*").order("due_date");
    // numeric do Postgres chega como string no JSON
    setRows(
      ((data as Bill[]) ?? []).map((b) => ({ ...b, amount: Number(b.amount) }))
    );
    setLoading(false);
  }, [supabase]);

  React.useEffect(() => {
    load();
  }, [load]);

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

    setBusy(true);
    const payload = {
      description: desc,
      amount: valor,
      due_date: form.due_date,
      category: form.category,
      status: form.status,
      notes: form.notes.trim(),
      recurring: form.recurring,
      paid_at: form.status === "paid" ? new Date().toISOString() : null,
      /*
       * As colunas de parcela vêm da migration-003. Só entram no payload
       * quando a conta é parcelada: assim, num banco onde a migração ainda
       * não rodou, contas simples continuam sendo criadas normalmente em vez
       * de todas falharem com "could not find the column".
       */
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
      ({ error } = await supabase
        .from("bills")
        .insert({ ...payload, user_id: uid }));
    }
    setBusy(false);
    if (error) {
      // PGRST204: coluna inexistente — quase sempre a migração 003 pendente
      if (error.code === "PGRST204" && error.message.includes("installment"))
        return setErr(
          "Parcelamento precisa da migração 003 no banco. Rode supabase/migration-003.sql ou desmarque \"Parcelada\"."
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
    notice.check(error, proximo === "paid" ? "marcar como paga" : "reabrir a conta");
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

  const excluir = (b: Bill) =>
    confirm.ask(`Excluir "${b.description}"? Não pode ser desfeito.`, async () => {
      const { error } = await supabase.from("bills").delete().eq("id", b.id);
      if (!notice.check(error, "excluir a conta")) load();
    });

  /* ------------------------------ derivados ------------------------------ */

  const atrasada = (b: Bill) =>
    b.status === "pending" && daysUntil(b.due_date) < 0;

  const contagens = React.useMemo(() => {
    const pend = rows.filter((b) => b.status === "pending");
    return {
      todas: rows.length,
      hoje: rows.filter((b) => b.due_date.slice(0, 10) === todayISO()).length,
      semana: pend.filter((b) => {
        const d = daysUntil(b.due_date);
        return d >= 0 && d <= 7;
      }).length,
      atrasadas: pend.filter(atrasada).length,
      pendentes: pend.length,
      pagas: rows.filter((b) => b.status === "paid").length,
    };
  }, [rows]);

  const filtradas = React.useMemo(() => {
    const termo = q.trim().toLowerCase();
    const hoje = todayISO();
    const passa = (b: Bill) => {
      // dia escolhido no calendário manda em cima dos chips
      if (dia) return b.due_date.slice(0, 10) === dia;
      switch (filtro) {
        case "hoje":
          return b.due_date.slice(0, 10) === hoje;
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
  }, [rows, filtro, ordem, q, dia]);

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

  /* Resumo e categorias refletem o filtro na tela, não o mês inteiro:
     assim os números sempre explicam o que está sendo mostrado. */
  const resumo = React.useMemo(() => {
    const soma = (l: Bill[]) => l.reduce((s, b) => s + b.amount, 0);
    const pend = filtradas.filter((b) => b.status === "pending");
    const pagas = filtradas.filter((b) => b.status === "paid");
    const venc = pend.filter(atrasada);
    return {
      total: soma(filtradas),
      qtdTotal: filtradas.length,
      pagas: soma(pagas),
      qtdPagas: pagas.length,
      pendentes: soma(pend),
      qtdPendentes: pend.length,
      vencidas: soma(venc),
      qtdVencidas: venc.length,
    };
  }, [filtradas]);

  const porCategoria = React.useMemo(() => {
    const mapa = new Map<string, { pago: number; pendente: number }>();
    filtradas.forEach((b) => {
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
  }, [filtradas]);

  /** Últimos 12 meses, sempre sobre todas as contas — é tendência, não filtro. */
  const evolucao = React.useMemo<PontoMes[]>(() => {
    const hoje = new Date(todayISO() + "T00:00:00");
    const pontos: PontoMes[] = [];
    for (let i = 11; i >= 0; i--) {
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

  const nadaPendente =
    !loading && rows.length > 0 && contagens.pendentes === 0;

  if (loading)
    return (
      <div className="flex flex-col gap-4">
        <Skeleton className="h-10 w-56" />
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
          {Array.from({ length: 4 }).map((_, i) => (
            <Skeleton key={i} className="h-[104px] rounded-[22px]" />
          ))}
        </div>
        <Skeleton className="h-[420px] rounded-[22px]" />
      </div>
    );

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
        <Button variant="primary" onClick={novo}>
          <Wallet size={15} />
          Nova conta
        </Button>
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

      {/* ------------------------------ resumo ------------------------------ */}
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <Numero rotulo="Total" valor={resumo.total} qtd={resumo.qtdTotal} />
        <Numero rotulo="Pagas" valor={resumo.pagas} qtd={resumo.qtdPagas} tom="text-pos" />
        <Numero
          rotulo="Pendentes"
          valor={resumo.pendentes}
          qtd={resumo.qtdPendentes}
          tom="text-warn"
        />
        <Numero
          rotulo="Vencidas"
          valor={resumo.vencidas}
          qtd={resumo.qtdVencidas}
          tom="text-neg"
        />
      </div>

      {/* ------------------------------ lista ------------------------------ */}
      <Card className="mt-4 overflow-hidden">
        <div className="flex flex-wrap items-center gap-2.5 px-[18px] pt-[18px]">
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
            </p>
            {grupos.map((g) => (
              <section key={g.titulo}>
                <h2
                  className={cx(
                    "px-[18px] pb-1.5 pt-4 text-[10.5px] font-bold uppercase tracking-[0.1em]",
                    g.tom
                  )}
                >
                  {g.titulo}{" "}
                  <span className="text-fg-mute tnum">({g.itens.length})</span>
                </h2>
                <ul className="px-2.5 pb-1">
                  {g.itens.map((b) => (
                    <Linha
                      key={b.id}
                      b={b}
                      atrasada={atrasada(b)}
                      onAlternar={() => alternar(b)}
                      onEditar={() => editar(b)}
                      onExcluir={() => excluir(b)}
                    />
                  ))}
                </ul>
              </section>
            ))}
            <div className="mt-1 flex items-baseline justify-between border-t border-line-soft px-[18px] py-3.5">
              <span className="text-[12px] text-fg-mute">
                Soma do filtro
              </span>
              <span className="text-[16px] font-bold tracking-[-0.02em] tnum">
                {brl(resumo.total)}
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
            <CalendarioPagamentos contas={rows} dia={dia} onDia={setDia} />
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
          <Cabeca titulo="Gastos por categoria" />
          <div className="px-[18px] pb-[18px] pt-3">
            <ParticipacaoCategoria
              dados={porCategoria.map((c) => ({
                categoria: c.categoria,
                valor: c.total,
              }))}
              total={resumo.total}
            />
          </div>
        </Card>

        <Card>
          <Cabeca titulo="Pago vs pendente por categoria" />
          <div className="px-[18px] pb-[18px] pt-3">
            <PagoPendenteCategoria dados={porCategoria} />
          </div>
        </Card>
      </div>

      <Card className="mt-4">
        <Cabeca
          titulo="Evolução dos gastos"
          sub="Últimos 12 meses, todas as contas"
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
              onChange={(e) => setForm({ ...form, description: e.target.value })}
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
            <Field label="Vencimento">
              <Input
                type="date"
                value={form.due_date}
                onChange={(e) => setForm({ ...form, due_date: e.target.value })}
              />
            </Field>
          </div>

          <div className="grid gap-3.5 sm:grid-cols-2">
            <Field label="Categoria">
              <Select
                value={form.category}
                onChange={(e) => setForm({ ...form, category: e.target.value })}
              >
                {BILL_CATEGORIES.map((c) => (
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
              <div className="mt-3.5 grid gap-3.5 border-t border-line-soft pt-3.5 sm:grid-cols-2">
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
            )}
          </div>

          {err && (
            <p className="rounded-[14px] bg-neg/12 px-3.5 py-3 text-xs font-medium text-neg">
              {err}
            </p>
          )}
        </form>
      </Modal>

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
  onEditar,
  onExcluir,
}: {
  b: Bill;
  atrasada: boolean;
  onAlternar: () => void;
  onEditar: () => void;
  onExcluir: () => void;
}) {
  const d = daysUntil(b.due_date);
  const paga = b.status === "paid";

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
          <span className="tnum">{dataCurta(b.due_date)}</span>
          <span className="opacity-40">·</span>
          <span>{b.category}</span>
          {b.installment_total != null && (
            <span className="rounded-full bg-brand-500/12 px-1.5 font-semibold text-brand-400 tnum">
              {b.installment_no}/{b.installment_total}
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
          {!paga && d > 0 && d <= 7 && (
            <span className="font-bold text-warn">em {d}d</span>
          )}
        </div>
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
