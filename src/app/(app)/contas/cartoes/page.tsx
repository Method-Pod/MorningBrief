"use client";

import * as React from "react";
import Link from "next/link";
import { ArrowLeft, Check, CreditCard, Pencil, Plus, Trash2 } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { currentUserId, SESSION_EXPIRED } from "@/lib/session";
import { NADA_GRAVADO } from "@/lib/erros";
import { useEstadoCacheado, temCache } from "@/lib/cachePagina";
import { COR_PADRAO, corDoRotulo, NOTE_COLORS, type Cartao } from "@/lib/types";
import { brl, valorDigitado } from "@/lib/format";
import {
  Button,
  Card,
  Field,
  Input,
  Modal,
  cx,
  useConfirm,
  useNotice,
  EsqueletoPagina,
} from "@/components/ui";

/**
 * Os cartões: onde ficam banco, bandeira, fechamento e vencimento.
 *
 * Existe porque um cartão é uma coisa que vive fora da fatura. O dia em que
 * ele fecha vale para todas as faturas dele, de todos os meses; guardado na
 * conta, seria recopiado doze vezes por ano e divergiria na primeira vez que
 * o banco mudasse o vencimento.
 *
 * O que esta tela **não** faz: lançar a fatura. Quem lança é a conta, em
 * Contas a pagar, marcada como "o valor muda todo mês" e apontando para um
 * cartão daqui. Este cadastro é a ficha do cartão, não o extrato dele.
 */

const VAZIO = {
  nome: "",
  banco: "",
  bandeira: "",
  fecha_dia: "1",
  vence_dia: "10",
  limite: "",
  cor: COR_PADRAO,
};

/** Traz um dia digitado para dentro de 1–31, que é o que o banco aceita. */
const diaValido = (v: string) => {
  const n = Number(v);
  if (!Number.isFinite(n)) return 1;
  return Math.min(31, Math.max(1, Math.round(n)));
};

export default function CartoesPage() {
  const supabase = React.useMemo(() => createClient(), []);
  const [rows, setRows] = useEstadoCacheado<Cartao[]>("cartoes", []);
  const [loading, setLoading] = React.useState(() => !temCache("cartoes"));
  const [aberto, setAberto] = React.useState(false);
  const [editando, setEditando] = React.useState<Cartao | null>(null);
  const [form, setForm] = React.useState(VAZIO);
  const [salvando, setSalvando] = React.useState(false);
  const [erro, setErro] = React.useState("");
  const confirm = useConfirm();
  const notice = useNotice();

  const load = React.useCallback(async () => {
    const { data, error } = await supabase
      .from("cartoes")
      .select("*")
      .order("nome");
    /*
     * Erro aqui quase sempre é a tabela que ainda não existe — quem não rodou
     * CARTOES.sql. A tela mostra o aviso e segue viva, como as outras fazem
     * com tabela nova.
     */
    if (error) setErro(NAO_RODOU_SQL);
    else setRows((data as Cartao[]) ?? []);
    setLoading(false);
  }, [supabase, setRows]);

  React.useEffect(() => {
    load();
  }, [load]);

  const abrirNovo = () => {
    setEditando(null);
    setForm(VAZIO);
    setErro("");
    setAberto(true);
  };

  const abrirEdicao = (c: Cartao) => {
    setEditando(c);
    setForm({
      nome: c.nome,
      banco: c.banco ?? "",
      bandeira: c.bandeira ?? "",
      fecha_dia: String(c.fecha_dia),
      vence_dia: String(c.vence_dia),
      limite: c.limite == null ? "" : String(c.limite),
      cor: c.cor || COR_PADRAO,
    });
    setErro("");
    setAberto(true);
  };

  const salvar = async () => {
    const nome = form.nome.trim();
    if (!nome) return setErro("Dê um nome ao cartão.");

    setSalvando(true);
    setErro("");

    const campos = {
      nome,
      banco: form.banco.trim(),
      bandeira: form.bandeira.trim(),
      fecha_dia: diaValido(form.fecha_dia),
      vence_dia: diaValido(form.vence_dia),
      /*
       * `valorDigitado` e nao `Number`.
       *
       * O campo e de dinheiro e aceita o que se escreve: "5.000" e
       * "5.000,00". `Number("5.000")` da 5 — cinco reais de limite —, e
       * `Number("5000,00")` da NaN, que o banco recusa. O mesmo conserto
       * que ja foi feito nos outros campos de valor.
       */
      limite: (() => {
        if (!form.limite.trim()) return null;
        const n = valorDigitado(form.limite);
        /* Texto sem numero nenhum vira nulo, e nao NaN: NaN no corpo do
           insert vira `null` no JSON de qualquer jeito, mas por acidente. */
        return Number.isFinite(n) ? n : null;
      })(),
      cor: form.cor,
    };

    let falha: { code?: string; message?: string } | null = null;

    if (editando) {
      /* `select("id")` porque o PostgREST responde 204 sem erro quando o `eq`
         não casa com nada — o formulário fecharia dizendo "salvo" e o cartão
         voltaria como estava no próximo carregamento. */
      const { data: gravadas, error } = await supabase
        .from("cartoes")
        .update(campos)
        .eq("id", editando.id)
        .select("id");
      falha = error ?? (gravadas?.length ? null : { message: NADA_GRAVADO });
    } else {
      const uid = await currentUserId(supabase);
      if (!uid) {
        setSalvando(false);
        return setErro(SESSION_EXPIRED);
      }
      const { error } = await supabase
        .from("cartoes")
        .insert({ ...campos, user_id: uid });
      falha = error;
    }

    setSalvando(false);

    if (falha) {
      /* 23505 é o índice de nome único. A mensagem crua do Postgres não diz
         isso para quem está olhando um formulário. */
      setErro(
        falha.code === "23505"
          ? "Já existe um cartão com esse nome."
          : falha.code === "42P01"
            ? NAO_RODOU_SQL
            : "Não deu para salvar o cartão."
      );
      return;
    }

    setAberto(false);
    load();
  };

  const remover = (c: Cartao) => {
    /* O texto diz o que acontece com as faturas porque é a primeira dúvida de
       quem clica: `on delete set null` preserva o histórico. */
    confirm.ask(
      `Excluir "${c.nome}"? As faturas já lançadas continuam onde estão — elas só deixam de apontar para este cartão.`,
      async () => {
        const { error } = await supabase.from("cartoes").delete().eq("id", c.id);
        if (error) return notice.show("Não deu para excluir o cartão.");
        setRows((r) => r.filter((x) => x.id !== c.id));
      }
    );
  };

  if (loading) return <EsqueletoPagina blocos={2} />;

  return (
    <div className="rise">
      <div className="flex items-start gap-3">
        <Link
          href="/contas"
          aria-label="Voltar para o Financeiro"
          className="mt-1 grid h-8 w-8 shrink-0 place-items-center rounded-[12px] text-fg-dim transition-colors hover:bg-ink-800 hover:text-fg"
        >
          <ArrowLeft size={18} />
        </Link>
        <div className="min-w-0 flex-1">
          <h1 className="titulo-pagina">
            Meus cartões
          </h1>
          <p className="mt-1 text-sm text-fg-mute">
            O dia do fechamento é o que diz quando o app pede o valor da fatura.
          </p>
        </div>
        <Button onClick={abrirNovo}>
          <Plus size={15} />
          Novo cartão
        </Button>
      </div>

      {erro && (
        <p className="mt-4 rounded-[14px] bg-neg/10 px-3.5 py-3 text-xs text-neg">
          {erro}
        </p>
      )}

      {rows.length === 0 && !erro ? (
        <Card className="mt-4 px-[18px] py-10 text-center">
          <CreditCard size={22} className="mx-auto text-fg-mute" />
          <p className="mt-2.5 text-[13px] font-semibold text-fg-dim">
            Nenhum cartão cadastrado.
          </p>
          <p className="mx-auto mt-1 max-w-[380px] text-[12.5px] leading-relaxed text-fg-mute">
            Cadastre e depois marque a conta da fatura como “o valor muda todo
            mês”. Ela passa a nascer vazia todo mês, esperando o valor, em vez
            de repetir o do mês passado.
          </p>
        </Card>
      ) : (
        <div className="mt-4 grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
          {rows.map((c) => (
            <Card key={c.id} className="group p-3">
              {/* O cartão desenhado, o mesmo do painel de edição. */}
              <CartaoDesenhado
                nome={c.nome}
                banco={c.banco}
                bandeira={c.bandeira}
                fecha={String(c.fecha_dia)}
                vence={String(c.vence_dia)}
                limite={c.limite != null ? Number(c.limite) : null}
                cor={c.cor}
              />
              <div className="flex items-center justify-end gap-1.5 px-1 pt-3">
                <button
                  onClick={() => abrirEdicao(c)}
                  aria-label={`Editar ${c.nome}`}
                  className="grid h-9 w-9 shrink-0 place-items-center rounded-full border border-[var(--vidro-borda)] text-fg-dim transition-colors hover:bg-fg/[0.08] hover:text-fg"
                >
                  <Pencil size={14} />
                </button>
                <button
                  onClick={() => remover(c)}
                  aria-label={`Excluir ${c.nome}`}
                  className="grid h-9 w-9 shrink-0 place-items-center rounded-full border border-[var(--vidro-borda)] text-fg-dim transition-colors hover:bg-neg/15 hover:text-neg"
                >
                  <Trash2 size={14} />
                </button>
              </div>
            </Card>
          ))}
        </div>
      )}

      <Modal
        open={aberto}
        onClose={() => setAberto(false)}
        title={editando ? "Editar cartão" : "Novo cartão"}
        sub="Fechamento, vencimento e a cor na lista."
        /* O cartão desenhado no topo, como o resumo dos outros painéis: ele
           acompanha o que se digita, então mostra o cartão como vai ficar. */
        topo={
          <CartaoDesenhado
            nome={form.nome}
            banco={form.banco}
            bandeira={form.bandeira}
            fecha={form.fecha_dia}
            vence={form.vence_dia}
            limite={form.limite.trim() ? valorDigitado(form.limite) : null}
            cor={form.cor}
          />
        }
        footer={
          <>
            <Button onClick={() => setAberto(false)}>Cancelar</Button>
            <Button variant="primary" onClick={salvar} disabled={salvando}>
              {salvando ? "Salvando..." : "Salvar"}
            </Button>
          </>
        }
      >
        <div className="grid gap-4">
          <Field label="Nome">
            <Input
              value={form.nome}
              onChange={(e) => setForm({ ...form, nome: e.target.value })}
              placeholder="Nubank"
              autoFocus
            />
          </Field>

          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Banco">
              <Input
                value={form.banco}
                onChange={(e) => setForm({ ...form, banco: e.target.value })}
                placeholder="Nu Pagamentos"
              />
            </Field>
            <Field label="Bandeira">
              <Input
                value={form.bandeira}
                onChange={(e) => setForm({ ...form, bandeira: e.target.value })}
                placeholder="Mastercard"
              />
            </Field>
          </div>

          <div className="grid gap-4 border-t border-line-soft pt-4 sm:grid-cols-3">
            <Field label="Fecha dia" hint="Dia em que a fatura fecha.">
              <Input
                type="number"
                min={1}
                max={31}
                value={form.fecha_dia}
                onChange={(e) => setForm({ ...form, fecha_dia: e.target.value })}
              />
            </Field>
            <Field label="Vence dia" hint="Dia de pagar.">
              <Input
                type="number"
                min={1}
                max={31}
                value={form.vence_dia}
                onChange={(e) => setForm({ ...form, vence_dia: e.target.value })}
              />
            </Field>
            <Field label="Limite (R$)" hint="Opcional.">
              <Input
                type="number"
                step="0.01"
                value={form.limite}
                onChange={(e) => setForm({ ...form, limite: e.target.value })}
                placeholder="5000"
              />
            </Field>
          </div>

          <div className="border-t border-line-soft pt-4">
            <span className="mb-2 block text-[11px] font-medium uppercase tracking-wider text-fg-mute">
              Cor
            </span>
            <div className="flex flex-wrap gap-2.5">
              {NOTE_COLORS.map((c) => (
                <button
                  key={c}
                  type="button"
                  onClick={() => setForm({ ...form, cor: c })}
                  aria-label={`Cor ${c}`}
                  aria-pressed={form.cor === c}
                  style={{ background: corDoRotulo(c) }}
                  /* A marca da escolhida é um anel por fora, da cor do texto:
                     o `ring-offset-white` de antes desenhava uma moldura
                     branca no tema escuro. */
                  className={cx(
                    "grid h-9 w-9 place-items-center rounded-full text-white transition-transform hover:scale-110",
                    form.cor === c && "outline outline-2 outline-offset-[3px] outline-fg"
                  )}
                >
                  {form.cor === c && <Check size={15} strokeWidth={3} />}
                </button>
              ))}
            </div>
          </div>

          {erro && (
            <p className="rounded-[14px] bg-neg/12 px-3.5 py-3 text-xs font-medium text-neg">{erro}</p>
          )}
        </div>
      </Modal>

      {confirm.node}
      {notice.node}
    </div>
  );
}

const NAO_RODOU_SQL =
  "A tabela de cartões ainda não existe no banco. Rode supabase/CARTOES.sql no Supabase.";

/**
 * Um cartão de crédito desenhado: a cor escolhida em degradê, o nome e o
 * banco em cima, fechamento, vencimento e limite embaixo, a bandeira no canto.
 * Ler a lista como uma carteira de cartões é mais rápido do que ler uma lista
 * de nomes -- e o painel de edição mostra o mesmo, para a cor ser escolhida
 * vendo o resultado.
 */
function CartaoDesenhado({
  nome,
  banco,
  bandeira,
  fecha,
  vence,
  limite,
  cor,
}: {
  nome: string;
  banco: string | null;
  bandeira: string | null;
  fecha: string;
  vence: string;
  limite: number | null;
  cor: string;
}) {
  const tom = corDoRotulo(cor);
  return (
    <div
      className="relative aspect-[1.7/1] w-full overflow-hidden rounded-[20px] p-4 text-white shadow-[inset_0_1px_0_rgb(255_255_255/0.25),0_18px_40px_-20px_rgb(0_0_0/0.6)] sm:p-5"
      style={{
        background: `linear-gradient(140deg, color-mix(in srgb, ${tom} 92%, #fff), color-mix(in srgb, ${tom} 70%, #000))`,
      }}
    >
      {/* Um brilho largo em diagonal, como o reflexo de um cartão de plástico. */}
      <span
        aria-hidden
        className="pointer-events-none absolute -right-1/4 -top-1/2 h-[140%] w-3/4 rotate-12 rounded-full bg-white/10 blur-2xl"
      />
      <div className="relative flex h-full flex-col">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <p className="truncate text-[17px] font-semibold tracking-[-0.01em]">
              {nome.trim() || "Novo cartão"}
            </p>
            <p className="truncate text-[12px] text-white/75">{banco?.trim() || "Banco"}</p>
          </div>
          <CreditCard size={22} className="shrink-0 text-white/80" />
        </div>
        {/* O chip do cartão. */}
        <span
          aria-hidden
          className="mt-3 block h-7 w-10 rounded-[6px] bg-gradient-to-br from-white/70 to-white/30"
        />
        <div className="mt-auto flex items-end justify-between gap-3">
          <div className="flex gap-4 text-[11px]">
            <span>
              <span className="block text-white/65">Fecha</span>
              <b className="text-[13px] font-semibold tnum">dia {fecha || "—"}</b>
            </span>
            <span>
              <span className="block text-white/65">Vence</span>
              <b className="text-[13px] font-semibold tnum">dia {vence || "—"}</b>
            </span>
            {limite != null && Number.isFinite(limite) && (
              <span>
                <span className="block text-white/65">Limite</span>
                <b className="text-[13px] font-semibold tnum">{brl(limite)}</b>
              </span>
            )}
          </div>
          <span className="shrink-0 text-[13px] font-bold italic tracking-wide text-white/90">
            {bandeira?.trim() || ""}
          </span>
        </div>
      </div>
    </div>
  );
}
