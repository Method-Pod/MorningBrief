"use client";

import * as React from "react";
import Link from "next/link";
import { ArrowLeft, CreditCard, Pencil, Plus, Trash2 } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { currentUserId, SESSION_EXPIRED } from "@/lib/session";
import { useEstadoCacheado, temCache } from "@/lib/cachePagina";
import { CORES_HEX, NOTE_COLORS, type Cartao } from "@/lib/types";
import { brl } from "@/lib/format";
import {
  Button,
  Card,
  Field,
  Input,
  Modal,
  cx,
  useConfirm,
  useNotice,
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
  cor: "blue",
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
      cor: c.cor || "blue",
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
      limite: form.limite.trim() ? Number(form.limite) : null,
      cor: form.cor,
    };

    let falha: { code?: string; message?: string } | null = null;

    if (editando) {
      const { error } = await supabase
        .from("cartoes")
        .update(campos)
        .eq("id", editando.id);
      falha = error;
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

  if (loading) return null;

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
        <div className="min-w-0 flex-1">
          <h1 className="text-[26px] font-bold tracking-[-0.03em]">
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
            <Card key={c.id} className="p-[18px]">
              <div className="flex items-start gap-2.5">
                <span
                  className="mt-0.5 h-8 w-8 shrink-0 rounded-[10px]"
                  style={{ background: CORES_HEX[c.cor] ?? CORES_HEX.blue }}
                />
                <div className="min-w-0 flex-1">
                  <p className="truncate text-[14px] font-bold tracking-[-0.01em]">
                    {c.nome}
                  </p>
                  <p className="truncate text-[11.5px] text-fg-mute">
                    {[c.banco, c.bandeira].filter(Boolean).join(" · ") ||
                      "Sem detalhes"}
                  </p>
                </div>
                <button
                  onClick={() => abrirEdicao(c)}
                  aria-label={`Editar ${c.nome}`}
                  className="grid h-8 w-8 shrink-0 place-items-center rounded-lg text-fg-mute transition-colors hover:bg-ink-800 hover:text-fg"
                >
                  <Pencil size={14} />
                </button>
                <button
                  onClick={() => remover(c)}
                  aria-label={`Excluir ${c.nome}`}
                  className="grid h-8 w-8 shrink-0 place-items-center rounded-lg text-fg-mute transition-colors hover:bg-neg/15 hover:text-neg"
                >
                  <Trash2 size={14} />
                </button>
              </div>

              <div className="mt-3.5 flex items-end gap-4 border-t border-line-soft pt-3">
                <Dado rotulo="Fecha" valor={`dia ${c.fecha_dia}`} />
                <Dado rotulo="Vence" valor={`dia ${c.vence_dia}`} />
                {c.limite != null && (
                  <Dado rotulo="Limite" valor={brl(Number(c.limite))} />
                )}
              </div>
            </Card>
          ))}
        </div>
      )}

      <Modal
        open={aberto}
        onClose={() => setAberto(false)}
        title={editando ? "Editar cartão" : "Novo cartão"}
      >
        <div className="grid gap-3.5">
          <Field label="Nome">
            <Input
              value={form.nome}
              onChange={(e) => setForm({ ...form, nome: e.target.value })}
              placeholder="Nubank"
              autoFocus
            />
          </Field>

          <div className="grid gap-3.5 sm:grid-cols-2">
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

          <div className="grid gap-3.5 sm:grid-cols-3">
            <Field label="Fecha dia">
              <Input
                type="number"
                min={1}
                max={31}
                value={form.fecha_dia}
                onChange={(e) => setForm({ ...form, fecha_dia: e.target.value })}
              />
            </Field>
            <Field label="Vence dia">
              <Input
                type="number"
                min={1}
                max={31}
                value={form.vence_dia}
                onChange={(e) => setForm({ ...form, vence_dia: e.target.value })}
              />
            </Field>
            <Field label="Limite (opcional)">
              <Input
                type="number"
                step="0.01"
                value={form.limite}
                onChange={(e) => setForm({ ...form, limite: e.target.value })}
                placeholder="5000"
              />
            </Field>
          </div>

          <Field label="Cor">
            <div className="flex flex-wrap gap-2">
              {NOTE_COLORS.map((c) => (
                <button
                  key={c}
                  type="button"
                  onClick={() => setForm({ ...form, cor: c })}
                  aria-label={`Cor ${c}`}
                  aria-pressed={form.cor === c}
                  style={{ background: CORES_HEX[c] }}
                  className={cx(
                    "h-7 w-7 rounded-full transition-transform hover:scale-110",
                    form.cor === c &&
                      "ring-2 ring-fg-dim ring-offset-2 ring-offset-white"
                  )}
                />
              ))}
            </div>
          </Field>

          {erro && <p className="text-xs text-neg">{erro}</p>}

          <div className="mt-1 flex justify-end gap-2">
            <Button variant="ghost" onClick={() => setAberto(false)}>
              Cancelar
            </Button>
            <Button onClick={salvar} disabled={salvando}>
              {salvando ? "Salvando..." : "Salvar"}
            </Button>
          </div>
        </div>
      </Modal>

      {confirm.node}
      {notice.node}
    </div>
  );
}

const NAO_RODOU_SQL =
  "A tabela de cartões ainda não existe no banco. Rode supabase/CARTOES.sql no Supabase.";

const Dado = ({ rotulo, valor }: { rotulo: string; valor: string }) => (
  <div className="min-w-0">
    <p className="text-[10px] font-bold uppercase tracking-[0.1em] text-fg-mute">
      {rotulo}
    </p>
    <p className="truncate text-[13px] font-semibold text-fg-dim tnum">
      {valor}
    </p>
  </div>
);
