"use client";

import * as React from "react";
import {
  Check,
  ExternalLink,
  GraduationCap,
  Loader2,
  Plus,
  Send,
  Trash2,
  Youtube,
} from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { currentUserId, SESSION_EXPIRED } from "@/lib/session";
import { FONTE_AULA_LABEL, type FonteAula, type Lesson } from "@/lib/types";
import { dataCurta } from "@/lib/format";
import { DIAS_RETENCAO_AULAS } from "@/lib/limpeza";
import {
  dadosDoLink,
  duracaoCurta,
  fonteDoLink,
  normalizarUrl,
  pctAssistido,
} from "@/lib/aulas";
import { temCache, useEstadoCacheado } from "@/lib/cachePagina";
import {
  Badge,
  Button,
  Card,
  Empty,
  Field,
  Input,
  Modal,
  Segmented,
  Textarea,
  cx,
  useConfirm,
  useNotice,
} from "@/components/ui";

/** "Todas" é filtro de tela; as outras duas são o estado da aula. */
type Aba = "fila" | "feitas" | "todas";

const ABAS: { valor: Aba; rotulo: string }[] = [
  { valor: "fila", rotulo: "Para assistir" },
  { valor: "feitas", rotulo: "Assistidas" },
  { valor: "todas", rotulo: "Todas" },
];

const SEM_ASSUNTO = "::sem-assunto::";

const ICONE: Record<FonteAula, typeof Youtube> = {
  youtube: Youtube,
  telegram: Send,
  outro: ExternalLink,
};

const vazio = () => ({
  url: "",
  title: "",
  canal: "",
  assunto: "",
  minutos: "",
  thumb_url: "",
  fonte: "outro" as FonteAula,
});

export default function AulasPage() {
  const supabase = React.useMemo(() => createClient(), []);
  const [rows, setRows] = useEstadoCacheado<Lesson[]>("lessons", []);
  const [loading, setLoading] = React.useState(() => !temCache("lessons"));
  const [falta, setFalta] = React.useState("");
  const [aba, setAba] = React.useState<Aba>("fila");
  const [assunto, setAssunto] = React.useState<"all" | string>("all");
  const [marcando, setMarcando] = React.useState<string | null>(null);
  const [minutoEmEdicao, setMinutoEmEdicao] = React.useState<
    Record<string, string>
  >({});

  /* adicionar */
  const [add, setAdd] = React.useState(false);
  const [form, setForm] = React.useState(vazio());
  const [buscando, setBuscando] = React.useState(false);
  const [salvando, setSalvando] = React.useState(false);
  const [erro, setErro] = React.useState("");

  const confirm = useConfirm();
  const notice = useNotice();

  const load = React.useCallback(async () => {
    const { data, error } = await supabase
      .from("lessons")
      .select("*")
      .order("created_at", { ascending: false });

    /* Tabela que falta é recado que fica na tela, não aviso que passa — e usar
       `notice` aqui obrigaria a entrar nas dependências e refazer a consulta a
       cada render. */
    if (error) {
      setFalta(
        /lessons/.test(error.message)
          ? "As aulas precisam de supabase/AULAS.sql no banco. Rode o arquivo e recarregue."
          : error.message
      );
      setLoading(false);
      return;
    }
    setFalta("");
    setRows((data as Lesson[]) ?? []);
    setLoading(false);
  }, [supabase, setRows]);

  React.useEffect(() => {
    load();
  }, [load]);

  const patch = React.useCallback(
    (id: string, mudanca: Partial<Lesson>) =>
      setRows((v) => v.map((l) => (l.id === id ? { ...l, ...mudanca } : l))),
    [setRows]
  );

  /* ------------------------------ adicionar ------------------------------ */

  /**
   * Ao colar o link, tenta preencher sozinho.
   *
   * Só o YouTube responde: ele tem oEmbed público, sem chave, e o navegador
   * chama direto. Telegram não tem equivalente — canal privado não expõe
   * metadado — então lá o título fica para você digitar, e o campo já vem
   * aberto em vez de esperar uma busca que nunca viria.
   */
  const lerLink = async (url: string) => {
    const limpo = normalizarUrl(url);
    if (!limpo) return;
    setBuscando(true);
    const d = await dadosDoLink(limpo);
    setBuscando(false);
    setForm((f) => ({
      ...f,
      fonte: d.fonte,
      /* Não sobrescreve o que você já digitou: se o título está preenchido, foi
         escolha sua, e a API não tem por que vencer. */
      title: f.title.trim() || d.title || "",
      canal: f.canal.trim() || d.canal || "",
      thumb_url: d.thumb_url ?? f.thumb_url,
    }));
  };

  const fecharAdd = () => {
    setAdd(false);
    setForm(vazio());
    setErro("");
  };

  const adicionar = async () => {
    const title = form.title.trim();
    if (!title) return setErro("Dê um nome à aula.");

    const cru = form.minutos.trim();
    const minutos = cru ? Number(cru) : null;
    if (cru && (!Number.isFinite(minutos) || (minutos ?? 0) <= 0))
      return setErro("A duração precisa ser um número de minutos maior que zero.");

    setErro("");
    setSalvando(true);
    const uid = await currentUserId(supabase);
    if (!uid) {
      setSalvando(false);
      return notice.show(SESSION_EXPIRED);
    }

    const ou = (v: string) => v.trim() || null;
    const { data, error } = await supabase
      .from("lessons")
      .insert({
        user_id: uid,
        title,
        url: ou(form.url) && normalizarUrl(form.url),
        fonte: form.url.trim() ? fonteDoLink(form.url) : "outro",
        canal: ou(form.canal),
        thumb_url: ou(form.thumb_url),
        assunto: ou(form.assunto),
        minutos,
        feita: false,
      })
      .select("*")
      .single();
    setSalvando(false);

    if (error) {
      if (/lessons/.test(error.message))
        return setErro(
          "As aulas precisam de supabase/AULAS.sql no banco. Rode o arquivo."
        );
      return setErro(error.message);
    }
    if (data) setRows((v) => [data as Lesson, ...v]);
    setAba("fila");
    fecharAdd();
  };

  /* ------------------------------ progresso ------------------------------ */

  /** Marca ou desmarca. Desmarcar limpa a data, senão a limpeza contaria dela. */
  const alternar = async (l: Lesson) => {
    const feita = !l.feita;
    const mudanca = {
      feita,
      feita_em: feita ? new Date().toISOString() : null,
    };
    setMarcando(l.id);
    /* Otimista: marcar aula é o gesto do dia, e esperar a ida de rede a cada
       clique tornaria a lista mais lenta que o hábito que ela acompanha. */
    patch(l.id, mudanca);
    const { error } = await supabase
      .from("lessons")
      .update(mudanca)
      .eq("id", l.id);
    setMarcando(null);
    if (notice.check(error, "marcar a aula")) load();
  };

  const gravarMinuto = async (l: Lesson) => {
    const cru = (minutoEmEdicao[l.id] ?? "").trim();
    const n = Number(cru);
    if (!cru || !Number.isFinite(n) || n < 0) return;
    if (l.minutos && n > l.minutos)
      return notice.show(`A aula tem ${l.minutos} minutos.`);

    const { error } = await supabase
      .from("lessons")
      .update({ em_minuto: Math.round(n) })
      .eq("id", l.id);
    setMinutoEmEdicao((r) => ({ ...r, [l.id]: "" }));
    if (!notice.check(error, "gravar o minuto"))
      patch(l.id, { em_minuto: Math.round(n) });
  };

  const remover = (l: Lesson) =>
    confirm.ask(`Tirar "${l.title}" da lista?`, async () => {
      const { error } = await supabase.from("lessons").delete().eq("id", l.id);
      if (notice.check(error, "tirar a aula")) return;
      setRows((v) => v.filter((x) => x.id !== l.id));
    });

  /* ------------------------------ derivados ------------------------------ */

  const contagem = (a: Aba) =>
    a === "todas"
      ? rows.length
      : rows.filter((l) => (a === "feitas" ? l.feita : !l.feita)).length;

  /** Os assuntos que existem, com quanto cada um tem na fila. */
  const assuntos = React.useMemo(() => {
    const m = new Map<string, { nome: string; naFila: number }>();
    rows.forEach((l) => {
      const chave = l.assunto || SEM_ASSUNTO;
      const g = m.get(chave) ?? {
        nome: l.assunto || "Sem assunto",
        naFila: 0,
      };
      if (!l.feita) g.naFila++;
      m.set(chave, g);
    });
    return [...m.entries()]
      .map(([chave, g]) => ({ chave, ...g }))
      .sort((a, b) => {
        /* "Sem assunto" por último: é o balaio, não um assunto. */
        if ((a.chave === SEM_ASSUNTO) !== (b.chave === SEM_ASSUNTO))
          return a.chave === SEM_ASSUNTO ? 1 : -1;
        if (a.naFila !== b.naFila) return b.naFila - a.naFila;
        return a.nome.localeCompare(b.nome, "pt-BR");
      });
  }, [rows]);

  const lista = React.useMemo(
    () =>
      rows
        .filter((l) => (aba === "todas" ? true : aba === "feitas" ? l.feita : !l.feita))
        .filter(
          (l) => assunto === "all" || (l.assunto || SEM_ASSUNTO) === assunto
        ),
    [rows, aba, assunto]
  );

  return (
    <div className="space-y-5 rise">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Aulas</h1>
          <p className="mt-1 text-sm text-fg-mute">
            {contagem("fila")} para assistir · {contagem("feitas")} assistida
            {contagem("feitas") === 1 ? "" : "s"}
          </p>
        </div>
        <Button variant="primary" onClick={() => setAdd(true)}>
          <Plus size={15} />
          Adicionar aula
        </Button>
      </div>

      {falta && (
        <Card className="border-warn/40 bg-warn/10 px-5 py-4">
          <p className="text-[12.5px] text-fg-dim">{falta}</p>
        </Card>
      )}

      <p className="flex items-center gap-1.5 text-[11px] text-fg-mute sm:text-[12px]">
        <Check size={12} className="shrink-0" />
        Assistidas saem da lista {DIAS_RETENCAO_AULAS} dias depois.
      </p>

      <div className="flex flex-wrap items-center gap-2.5 sm:gap-3">
        <div className="-mx-1 max-w-full overflow-x-auto px-1 pb-0.5">
          <Segmented
            value={aba}
            onChange={setAba}
            options={ABAS.map((a) => ({
              value: a.valor,
              label: a.rotulo,
              count: contagem(a.valor),
            }))}
          />
        </div>

        {/* Etiquetas de assunto. Só aparecem com mais de um: com um assunto só,
            o filtro seria um botão que não filtra nada. */}
        {assuntos.length > 1 && (
          <div className="-mx-1 flex max-w-full gap-1.5 overflow-x-auto px-1 pb-0.5">
            <button
              type="button"
              onClick={() => setAssunto("all")}
              className={cx(
                "h-8 shrink-0 rounded-full px-3 text-[11.5px] font-medium transition-colors",
                assunto === "all"
                  ? "bg-brand-500 text-on-brand"
                  : "bg-ink-800 text-fg-mute hover:text-fg-dim"
              )}
            >
              Todos
            </button>
            {assuntos.map((a) => (
              <button
                key={a.chave}
                type="button"
                onClick={() => setAssunto(a.chave)}
                className={cx(
                  "h-8 shrink-0 rounded-full px-3 text-[11.5px] font-medium transition-colors",
                  assunto === a.chave
                    ? "bg-brand-500 text-on-brand"
                    : "bg-ink-800 text-fg-mute hover:text-fg-dim"
                )}
              >
                {a.nome}
                {a.naFila > 0 && (
                  <span className="ml-1.5 opacity-60 tnum">{a.naFila}</span>
                )}
              </button>
            ))}
          </div>
        )}
      </div>

      {loading ? null : lista.length === 0 ? (
        <Card>
          <Empty
            icon={<GraduationCap size={18} />}
            title={rows.length ? "Nada aqui" : "Nenhuma aula ainda"}
            sub="Cole o link do YouTube e o título, o canal e a capa vêm junto. Do Telegram, é só dar um nome."
            action={
              <Button variant="primary" size="sm" onClick={() => setAdd(true)}>
                <Plus size={14} />
                Adicionar aula
              </Button>
            }
          />
        </Card>
      ) : (
        <Card className="overflow-hidden">
          <ul className="divide-y divide-line-soft">
            {lista.map((l, i) => {
              const Icone = ICONE[l.fonte];
              const pct = pctAssistido(l);
              return (
                <li
                  key={l.id}
                  className="entra group flex items-start gap-3 px-4 py-3.5 transition-colors hover:bg-ink-800/40 sm:px-5"
                  style={{ "--i": i } as React.CSSProperties}
                >
                  {/* A caixinha é o gesto principal, então vem primeiro e é
                      grande o suficiente para o dedo. */}
                  <button
                    type="button"
                    onClick={() => alternar(l)}
                    disabled={marcando === l.id}
                    aria-label={`${l.feita ? "Desmarcar" : "Marcar"} ${l.title}`}
                    aria-pressed={l.feita}
                    className={cx(
                      "mt-0.5 grid h-[19px] w-[19px] shrink-0 place-items-center rounded-[6px] border transition-[background-color,border-color] duration-[180ms] disabled:opacity-50",
                      l.feita
                        ? "border-pos bg-pos text-white"
                        : "border-line bg-white hover:border-brand-400"
                    )}
                  >
                    <Check
                      size={12}
                      strokeWidth={3.5}
                      className={cx(
                        "transition-[transform,opacity] duration-[180ms] ease-[cubic-bezier(0.34,1.4,0.64,1)]",
                        l.feita ? "scale-100 opacity-100" : "scale-50 opacity-0"
                      )}
                    />
                  </button>

                  {/* Miniatura do YouTube em 16:9, que é a proporção dela. */}
                  {l.thumb_url && (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img
                      src={l.thumb_url}
                      alt=""
                      loading="lazy"
                      decoding="async"
                      className="hidden aspect-video w-[88px] shrink-0 rounded-lg bg-ink-800 object-cover sm:block"
                    />
                  )}

                  <div className="min-w-0 flex-1">
                    <p
                      className={cx(
                        "text-[13px] font-semibold leading-snug",
                        l.feita && "text-fg-mute line-through"
                      )}
                    >
                      {l.title}
                    </p>

                    <div className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-1">
                      <span className="inline-flex items-center gap-1 text-[10.5px] text-fg-mute">
                        <Icone size={11} className="shrink-0" />
                        {l.canal || FONTE_AULA_LABEL[l.fonte]}
                      </span>
                      {l.assunto && (
                        <Badge tone="brand">{l.assunto}</Badge>
                      )}
                      {duracaoCurta(l.minutos) && (
                        <span className="text-[10.5px] text-fg-mute tnum">
                          {duracaoCurta(l.minutos)}
                        </span>
                      )}
                      {l.url && (
                        <a
                          href={l.url}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="inline-flex items-center gap-1 text-[10.5px] text-brand-400 hover:underline"
                        >
                          <ExternalLink size={10} />
                          abrir
                        </a>
                      )}
                      {l.feita && l.feita_em && (
                        <span className="text-[10.5px] text-pos">
                          visto {dataCurta(l.feita_em.slice(0, 10))}
                        </span>
                      )}
                    </div>

                    {/* Onde parou: só para aula não assistida e com duração. Numa
                        aula já vista o número não muda nada, e sem duração não
                        há barra que faça sentido. */}
                    {!l.feita && l.minutos && (
                      <div className="mt-2 flex flex-wrap items-center gap-2">
                        {pct !== null && (
                          <>
                            <span className="h-1 min-w-[48px] flex-1 overflow-hidden rounded-full bg-ink-800">
                              <span
                                className="block h-full w-full origin-left rounded-full bg-brand-500 transition-transform duration-300"
                                style={{ transform: `scaleX(${pct / 100})` }}
                              />
                            </span>
                            <span className="text-[10px] font-bold text-fg-mute tnum">
                              {l.em_minuto}/{l.minutos}min
                            </span>
                          </>
                        )}
                        <span className="flex items-center gap-1.5">
                          <span className="w-[62px]">
                            <Input
                              type="number"
                              min={0}
                              max={l.minutos}
                              value={minutoEmEdicao[l.id] ?? ""}
                              onChange={(e) =>
                                setMinutoEmEdicao((r) => ({
                                  ...r,
                                  [l.id]: e.target.value,
                                }))
                              }
                              onKeyDown={(e) => {
                                if (e.key === "Enter") {
                                  e.preventDefault();
                                  gravarMinuto(l);
                                }
                              }}
                              placeholder="min"
                              aria-label={`Minuto atual de ${l.title}`}
                              className="h-7 text-center text-[11px]"
                            />
                          </span>
                          <Button
                            size="sm"
                            onClick={() => gravarMinuto(l)}
                            disabled={!(minutoEmEdicao[l.id] ?? "").trim()}
                          >
                            Parei aqui
                          </Button>
                        </span>
                      </div>
                    )}
                  </div>

                  <button
                    type="button"
                    onClick={() => remover(l)}
                    aria-label={`Tirar ${l.title} da lista`}
                    className="grid h-8 w-8 shrink-0 place-items-center rounded-lg text-fg-mute transition-colors hover:bg-neg/15 hover:text-neg lg:opacity-0 lg:group-hover:opacity-100 lg:focus-visible:opacity-100"
                  >
                    <Trash2 size={14} />
                  </button>
                </li>
              );
            })}
          </ul>
        </Card>
      )}

      {/* ------------------------------ adicionar ------------------------------ */}
      <Modal
        open={add}
        onClose={fecharAdd}
        title="Adicionar aula"
        sub="Cole o link. Do YouTube vem título, canal e capa."
        size="lg"
        footer={
          <>
            <Button onClick={fecharAdd}>Cancelar</Button>
            <Button variant="primary" onClick={adicionar} disabled={salvando}>
              {salvando ? "Salvando..." : "Adicionar"}
            </Button>
          </>
        }
      >
        <div className="space-y-4">
          {erro && (
            <p className="rounded-[14px] bg-neg/10 px-3.5 py-3 text-xs text-neg">
              {erro}
            </p>
          )}

          <Field label="Link" hint="YouTube, Telegram, Drive — ou deixe vazio.">
            <div className="relative">
              <Input
                autoFocus
                type="url"
                inputMode="url"
                value={form.url}
                onChange={(e) => setForm({ ...form, url: e.target.value })}
                /* No `blur` e no Enter, não a cada tecla: o link é colado de uma
                   vez, e buscar a cada caractere seria uma chamada por letra. */
                onBlur={(e) => lerLink(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") {
                    e.preventDefault();
                    lerLink((e.target as HTMLInputElement).value);
                  }
                }}
                placeholder="youtube.com/watch?v=..."
              />
              {buscando && (
                <Loader2
                  size={14}
                  className="absolute right-3.5 top-1/2 -translate-y-1/2 animate-spin text-fg-mute"
                />
              )}
            </div>
          </Field>

          {form.thumb_url && (
            <div className="flex items-center gap-3 rounded-[14px] bg-ink-800 p-2.5">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={form.thumb_url}
                alt=""
                className="aspect-video w-[104px] shrink-0 rounded-lg object-cover"
              />
              <span className="text-[11.5px] text-fg-mute">
                Capa do vídeo, veio do link.
              </span>
            </div>
          )}

          <Field label="Nome da aula">
            <Input
              value={form.title}
              onChange={(e) => setForm({ ...form, title: e.target.value })}
              placeholder="Corte que retém nos 3 primeiros segundos"
            />
          </Field>

          <div className="grid gap-4 sm:grid-cols-[minmax(0,1fr)_minmax(0,1fr)_110px]">
            <Field label="Canal / autor">
              <Input
                value={form.canal}
                onChange={(e) => setForm({ ...form, canal: e.target.value })}
                placeholder="Opcional"
              />
            </Field>
            <Field label="Assunto" hint="Vira etiqueta de filtro.">
              <Input
                value={form.assunto}
                onChange={(e) => setForm({ ...form, assunto: e.target.value })}
                placeholder="edição, marketing..."
                list="assuntos-usados"
              />
              {/* Sugere o que você já usou, para não virar "edicao", "Edição" e
                  "edição" como três etiquetas diferentes. */}
              <datalist id="assuntos-usados">
                {assuntos
                  .filter((a) => a.chave !== SEM_ASSUNTO)
                  .map((a) => (
                    <option key={a.chave} value={a.nome} />
                  ))}
              </datalist>
            </Field>
            <Field label="Duração" hint="min">
              <Input
                type="number"
                min={1}
                value={form.minutos}
                onChange={(e) => setForm({ ...form, minutos: e.target.value })}
                placeholder="42"
              />
            </Field>
          </div>
        </div>
      </Modal>

      {confirm.node}
      {notice.node}
    </div>
  );
}
