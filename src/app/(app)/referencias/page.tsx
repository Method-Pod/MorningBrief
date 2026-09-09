"use client";

import * as React from "react";
import {
  ExternalLink,
  FolderOpen,
  ImagePlus,
  Library,
  Link2,
  Loader2,
  Pencil,
  Plus,
  RotateCw,
  Trash2,
} from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { currentUserId, SESSION_EXPIRED } from "@/lib/session";
import { temCache, useEstadoCacheado } from "@/lib/cachePagina";
import { NADA_GRAVADO, recadoDeErro } from "@/lib/erros";
import {
  BUCKET_REFERENCIAS,
  type Colecao,
  type Referencia,
  type ReferenciaColecao,
} from "@/lib/types";
import { GerenciarColecoes, Pastilha, SUGESTOES } from "@/components/Colecoes";
import {
  Button,
  Card,
  Empty,
  Field,
  Input,
  Modal,
  Textarea,
  cx,
  useConfirm,
  useNotice,
} from "@/components/ui";

/**
 * Referências: os links que valem voltar a olhar.
 *
 * Duas coisas moram aqui, e é por isso que a coleção existe em vez de uma lista
 * só: o site onde se **procura** referência (Dribbble, Land-book) e o exemplo
 * **específico** que se guardou (aquela landing que ficou boa). O primeiro se
 * abre para garimpar, o segundo para comparar — e um site pode ser os dois, daí
 * um link poder estar em várias coleções.
 */

const TIPOS_IMAGEM = ["image/jpeg", "image/png", "image/webp"];
const LIMITE_MB = 3;

const extDe = (tipo: string) =>
  tipo === "image/png" ? "png" : tipo === "image/webp" ? "webp" : "jpg";

/** Normaliza o que foi colado: quase ninguém digita o esquema. */
const normalizarUrl = (v: string) => {
  const t = v.trim();
  if (!t) return "";
  return /^[a-z][a-z0-9+.-]*:\/\//i.test(t) ? t : `https://${t}`;
};

/** "dribbble.com" — o domínio serve de rótulo e de nome de reserva. */
const dominioDe = (url: string) => {
  try {
    return new URL(normalizarUrl(url)).hostname.replace(/^www\./, "");
  } catch {
    return url;
  }
};

const vazio = () => ({
  url: "",
  name: "",
  description: "",
  image_url: "",
  image_own: false,
  notes: "",
  colecoes: [] as string[],
});

const semTabela = (m: string) => /find the table|does not exist/i.test(m);

export default function ReferenciasPage() {
  const supabase = React.useMemo(() => createClient(), []);

  const [rows, setRows] = useEstadoCacheado<Referencia[]>("referencias", []);
  const [colecoes, setColecoes] = useEstadoCacheado<Colecao[]>("colecoes", []);
  const [ligacoes, setLigacoes] = useEstadoCacheado<ReferenciaColecao[]>(
    "referencia_colecao",
    []
  );
  const [loading, setLoading] = React.useState(
    () => !temCache("referencias", "colecoes", "referencia_colecao")
  );
  const [falta, setFalta] = React.useState<{ texto: string } | null>(null);

  const [filtro, setFiltro] = React.useState<"all" | string>("all");
  const [gerindo, setGerindo] = React.useState(false);

  /* modal de cadastro */
  const [aberto, setAberto] = React.useState(false);
  const [editando, setEditando] = React.useState<Referencia | null>(null);
  const [form, setForm] = React.useState(vazio());
  const [lendo, setLendo] = React.useState(false);
  const [salvando, setSalvando] = React.useState(false);
  const [erro, setErro] = React.useState("");
  const [arquivo, setArquivo] = React.useState<File | null>(null);
  const [previa, setPrevia] = React.useState<string | null>(null);

  const confirm = useConfirm();
  const notice = useNotice();

  const load = React.useCallback(async () => {
    const [r, c, l] = await Promise.all([
      supabase
        .from("referencias")
        .select("*")
        .order("created_at", { ascending: false }),
      supabase.from("colecoes").select("*").order("name"),
      supabase.from("referencia_colecao").select("*"),
    ]);

    const problema = r.error ?? c.error ?? l.error;
    if (problema) {
      setFalta(
        semTabela(problema.message)
          ? {
              texto:
                "As referências precisam de supabase/REFERENCIAS.sql no banco. Rode o arquivo e recarregue.",
            }
          : (recadoDeErro(problema) ?? { texto: problema.message })
      );
      setLoading(false);
      return;
    }
    setFalta(null);
    setRows((r.data as Referencia[]) ?? []);
    setColecoes((c.data as Colecao[]) ?? []);
    setLigacoes((l.data as ReferenciaColecao[]) ?? []);
    setLoading(false);
  }, [supabase, setRows, setColecoes, setLigacoes]);

  React.useEffect(() => {
    load();
  }, [load]);

  /* ------------------------------ derivados ------------------------------ */

  /** Coleções de cada link, por id, para a tela não varrer a lista por cartão. */
  const doLink = React.useMemo(() => {
    const m = new Map<string, string[]>();
    ligacoes.forEach((x) => {
      const atual = m.get(x.referencia_id);
      if (atual) atual.push(x.colecao_id);
      else m.set(x.referencia_id, [x.colecao_id]);
    });
    return m;
  }, [ligacoes]);

  const nomeDaColecao = React.useMemo(() => {
    const m = new Map<string, string>();
    colecoes.forEach((c) => m.set(c.id, c.name));
    return m;
  }, [colecoes]);

  const usos = React.useMemo(() => {
    const m: Record<string, number> = {};
    ligacoes.forEach((x) => {
      m[x.colecao_id] = (m[x.colecao_id] ?? 0) + 1;
    });
    return m;
  }, [ligacoes]);

  const lista = React.useMemo(
    () =>
      filtro === "all"
        ? rows
        : rows.filter((r) => (doLink.get(r.id) ?? []).includes(filtro)),
    [rows, filtro, doLink]
  );

  /* ------------------------------ formulário ------------------------------ */

  const abrir = (r?: Referencia) => {
    setEditando(r ?? null);
    setForm(
      r
        ? {
            url: r.url,
            name: r.name,
            description: r.description ?? "",
            image_url: r.image_url ?? "",
            image_own: r.image_own,
            notes: r.notes ?? "",
            colecoes: doLink.get(r.id) ?? [],
          }
        : vazio()
    );
    setArquivo(null);
    setPrevia(null);
    setErro("");
    setAberto(true);
  };

  const fechar = () => {
    setAberto(false);
    setEditando(null);
    setForm(vazio());
    setArquivo(null);
    setPrevia(null);
    setErro("");
    ultimoLink.current = "";
    setLendo(false);
  };

  /*
   * Lê o site ao colar o link.
   *
   * `ultimoLink` guarda qual está valendo: colar um link, ver que era o errado
   * e colar o certo dispara duas leituras, e a primeira pode voltar depois —
   * preenchendo o formulário com o nome do site errado.
   */
  const ultimoLink = React.useRef("");

  const lerLink = async (cru: string) => {
    const limpo = normalizarUrl(cru);
    if (!limpo) return;
    ultimoLink.current = limpo;
    setLendo(true);
    try {
      const r = await fetch(`/api/link?url=${encodeURIComponent(limpo)}`);
      const d = await r.json();
      if (ultimoLink.current !== limpo) return;
      setLendo(false);
      if (d?.erro) return setErro(d.recado ?? "Não reconheci esse endereço.");
      setErro("");
      setForm((f) => ({
        ...f,
        url: typeof d?.url === "string" ? d.url : f.url,
        /* Não sobrescreve o que você já digitou. Sem nome do site, o domínio
           serve — é melhor que um cartão sem título. */
        name: f.name.trim() || d?.nome || dominioDe(limpo),
        description: f.description.trim() || d?.descricao || "",
        /* Imagem que você subiu vence a do site: foi escolha sua. */
        image_url: f.image_own ? f.image_url : (d?.image_url ?? f.image_url),
      }));
      if (!d?.leu)
        setErro(
          "Esse site não devolveu prévia — alguns bloqueiam. Confira o nome e, se quiser imagem, suba uma abaixo."
        );
    } catch {
      if (ultimoLink.current === limpo) {
        setLendo(false);
        setErro("Não consegui ler o site agora. Preencha o nome à mão.");
      }
    }
  };

  const escolherArquivo = (f: File | null) => {
    setErro("");
    if (!f) return;
    if (!TIPOS_IMAGEM.includes(f.type)) return setErro("Use JPG, PNG ou WebP.");
    if (f.size > LIMITE_MB * 1024 * 1024)
      return setErro(`A imagem precisa ter menos de ${LIMITE_MB} MB.`);
    setArquivo(f);
    setPrevia(URL.createObjectURL(f));
  };

  const alternarColecao = (id: string) =>
    setForm((f) => ({
      ...f,
      colecoes: f.colecoes.includes(id)
        ? f.colecoes.filter((x) => x !== id)
        : [...f.colecoes, id],
    }));

  /**
   * Grava a referência e refaz as ligações.
   *
   * As ligações são apagadas e reinseridas em vez de comparadas uma a uma:
   * são poucas por link, e um `delete` seguido de `insert` não tem como deixar
   * uma sobra que a comparação erraria.
   */
  const salvar = async () => {
    const url = normalizarUrl(form.url);
    const name = form.name.trim() || (url ? dominioDe(url) : "");
    if (!url) return setErro("Cole o endereço do site.");
    if (!name) return setErro("Dê um nome à referência.");

    setSalvando(true);
    setErro("");

    const uid = await currentUserId(supabase);
    if (!uid) {
      setSalvando(false);
      return setErro(SESSION_EXPIRED);
    }

    const dados = {
      url,
      name,
      description: form.description.trim() || null,
      notes: form.notes.trim() || null,
    };

    let id = editando?.id ?? "";
    if (editando) {
      const { data, error } = await supabase
        .from("referencias")
        .update({ ...dados, image_url: form.image_url || null, image_own: form.image_own })
        .eq("id", editando.id)
        .select("id")
        .maybeSingle();
      if (error) {
        setSalvando(false);
        return setErro(recadoDoBanco(error));
      }
      if (!data) {
        setSalvando(false);
        return setErro(NADA_GRAVADO);
      }
    } else {
      const { data, error } = await supabase
        .from("referencias")
        .insert({
          ...dados,
          user_id: uid,
          image_url: form.image_url || null,
          image_own: form.image_own,
        })
        .select("id")
        .maybeSingle();
      if (error || !data) {
        setSalvando(false);
        return setErro(error ? recadoDoBanco(error) : NADA_GRAVADO);
      }
      id = data.id as string;
    }

    /* A imagem sobe depois de existir o id, porque o caminho no bucket usa ele
       — um arquivo por referência, então trocar substitui em vez de acumular. */
    let imagem = form.image_url || null;
    let propria = form.image_own;
    if (arquivo) {
      const caminho = `${uid}/${id}.${extDe(arquivo.type)}`;
      const { error: envio } = await supabase.storage
        .from(BUCKET_REFERENCIAS)
        .upload(caminho, arquivo, { upsert: true, contentType: arquivo.type });
      if (envio) {
        setSalvando(false);
        return setErro(
          envio.message.toLowerCase().includes("bucket")
            ? "O bucket de referências ainda não existe. Rode supabase/REFERENCIAS.sql no SQL Editor."
            : envio.message
        );
      }
      const { data: pub } = supabase.storage
        .from(BUCKET_REFERENCIAS)
        .getPublicUrl(caminho);
      /* ?v= força o navegador a buscar de novo: o caminho é o mesmo a cada
         troca, e sem isso a imagem antiga ficaria em cache. */
      imagem = `${pub.publicUrl}?v=${Date.now()}`;
      propria = true;
      await supabase
        .from("referencias")
        .update({ image_url: imagem, image_own: true })
        .eq("id", id);
    }

    /* Refaz as ligações. */
    await supabase.from("referencia_colecao").delete().eq("referencia_id", id);
    if (form.colecoes.length) {
      const { error: erroLig } = await supabase.from("referencia_colecao").insert(
        form.colecoes.map((colecao_id) => ({
          referencia_id: id,
          colecao_id,
          user_id: uid,
        }))
      );
      if (erroLig) {
        setSalvando(false);
        return setErro(`A referência foi salva, mas as coleções não: ${erroLig.message}`);
      }
    }

    setSalvando(false);
    /* Releitura completa aqui, e não remendo local: mudou a linha e as
       ligações, e reconstruir os dois à mão daria mais chance de divergir do
       banco do que a ida de rede economiza. */
    await load();
    void propria;
    fechar();
  };

  const remover = (r: Referencia) =>
    confirm.ask(`Tirar "${r.name}" das referências?`, async () => {
      const { data: saiu, error } = await supabase
        .from("referencias")
        .delete()
        .eq("id", r.id)
        .select("id");
      if (notice.check(error, "tirar a referência")) return;
      if (!saiu?.length) return notice.show(NADA_GRAVADO);
      setRows((v) => v.filter((x) => x.id !== r.id));
      setLigacoes((v) => v.filter((x) => x.referencia_id !== r.id));
    });

  /* ------------------------------ tela ------------------------------ */

  const pilula = (ativa: boolean) =>
    cx(
      "h-8 shrink-0 rounded-full px-3 text-[11.5px] font-medium transition-colors",
      ativa
        ? "bg-brand-500 text-on-brand"
        : "bg-ink-800 text-fg-mute hover:text-fg-dim"
    );

  if (loading) return null;

  return (
    <div className="space-y-5 rise">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Referências</h1>
          <p className="mt-1 text-sm text-fg-mute">
            {rows.length === 0
              ? "Sites para garimpar e exemplos para comparar"
              : `${rows.length} link${rows.length === 1 ? "" : "s"}${
                  colecoes.length
                    ? ` · ${colecoes.length} coleç${colecoes.length === 1 ? "ão" : "ões"}`
                    : ""
                }`}
          </p>
        </div>
        <div className="flex w-full items-center gap-2 sm:w-auto">
          <Button
            onClick={() => setGerindo(true)}
            className="shrink-0"
            title="Gerenciar coleções"
          >
            <FolderOpen size={15} />
            <span className="hidden sm:inline">Coleções</span>
          </Button>
          <Button
            variant="primary"
            onClick={() => abrir()}
            className="min-w-0 flex-1 sm:flex-none"
          >
            <Plus size={15} className="shrink-0" />
            <span className="truncate">Referência</span>
          </Button>
        </div>
      </div>

      {falta && (
        <Card className="flex flex-wrap items-center justify-between gap-3 border-warn/40 bg-warn/10 px-5 py-4">
          <p className="min-w-0 flex-1 text-[12.5px] text-fg-dim">{falta.texto}</p>
          <Button
            size="sm"
            onClick={() => {
              setFalta(null);
              setLoading(true);
              load();
            }}
          >
            <RotateCw size={13} />
            Tentar de novo
          </Button>
        </Card>
      )}

      {colecoes.length > 0 && (
        <div className="flex flex-wrap gap-1.5">
          <button
            type="button"
            onClick={() => setFiltro("all")}
            className={pilula(filtro === "all")}
          >
            Todas
            <span className="ml-1.5 opacity-60 tnum">{rows.length}</span>
          </button>
          {colecoes.map((c) => (
            <button
              key={c.id}
              type="button"
              onClick={() => setFiltro(c.id)}
              className={pilula(filtro === c.id)}
            >
              {c.name}
              <span className="ml-1.5 opacity-60 tnum">{usos[c.id] ?? 0}</span>
            </button>
          ))}
        </div>
      )}

      {lista.length === 0 ? (
        <Card>
          <Empty
            icon={<Library size={18} />}
            title={rows.length ? "Nada nesta coleção" : "Nenhuma referência ainda"}
            sub={
              rows.length
                ? "Edite um link para colocá-lo aqui, ou salve um novo."
                : `Cole o link e o nome, a descrição e a imagem vêm do próprio site. Comece pelas coleções ${SUGESTOES.join(", ")}.`
            }
            action={
              <div className="flex flex-wrap justify-center gap-2">
                <Button variant="primary" size="sm" onClick={() => abrir()}>
                  <Plus size={14} />
                  Salvar referência
                </Button>
                {colecoes.length === 0 && (
                  <Button size="sm" onClick={() => setGerindo(true)}>
                    <FolderOpen size={14} />
                    Criar coleções
                  </Button>
                )}
              </div>
            }
          />
        </Card>
      ) : (
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {lista.map((r, i) => (
            <Card
              key={r.id}
              className="entra group flex flex-col overflow-hidden p-3"
              style={{ "--i": i } as React.CSSProperties}
            >
              {/*
                A imagem primeiro, e 16:9 fixo.

                Fixo porque a prévia de cada site vem numa proporção diferente,
                e sem trava a grade dançaria a cada linha. Quem não devolveu
                imagem fica com o ícone, na mesma altura — o cartão sem foto não
                encolhe e não desalinha o vizinho.
              */}
              <a
                href={r.url}
                target="_blank"
                rel="noopener noreferrer"
                title={r.url}
                className="relative block aspect-video w-full shrink-0 overflow-hidden rounded-xl bg-ink-800"
              >
                {r.image_url ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={r.image_url}
                    alt=""
                    loading="lazy"
                    decoding="async"
                    className="h-full w-full object-cover transition-transform duration-300 group-hover:scale-[1.03]"
                  />
                ) : (
                  <span className="grid h-full w-full place-items-center text-brand-400/40">
                    <Link2 size={24} />
                  </span>
                )}
              </a>

              <div className="mt-2.5 flex min-w-0 flex-1 flex-col">
                <div className="flex items-start justify-between gap-1.5">
                  <a
                    href={r.url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="min-w-0 flex-1 text-[13px] font-semibold leading-snug hover:text-brand-400"
                  >
                    {r.name}
                  </a>
                  <span className="flex shrink-0 items-center gap-0.5 transition-opacity lg:opacity-0 lg:group-hover:opacity-100 lg:focus-within:opacity-100">
                    <a
                      href={r.url}
                      target="_blank"
                      rel="noopener noreferrer"
                      aria-label={`Abrir ${r.name}`}
                      className="grid h-7 w-7 place-items-center rounded-md text-fg-mute hover:bg-brand-500/15 hover:text-brand-400"
                    >
                      <ExternalLink size={13} />
                    </a>
                    <button
                      type="button"
                      onClick={() => abrir(r)}
                      aria-label={`Editar ${r.name}`}
                      className="grid h-7 w-7 place-items-center rounded-md text-fg-mute hover:bg-ink-750 hover:text-fg"
                    >
                      <Pencil size={13} />
                    </button>
                    <button
                      type="button"
                      onClick={() => remover(r)}
                      aria-label={`Tirar ${r.name}`}
                      className="grid h-7 w-7 place-items-center rounded-md text-fg-mute hover:bg-neg/15 hover:text-neg"
                    >
                      <Trash2 size={13} />
                    </button>
                  </span>
                </div>

                <p className="mt-0.5 truncate text-[10.5px] text-fg-mute">
                  {dominioDe(r.url)}
                </p>

                {r.notes && (
                  <p className="mt-1.5 line-clamp-2 text-[11.5px] text-fg-dim">
                    {r.notes}
                  </p>
                )}

                {!r.notes && r.description && (
                  <p className="mt-1.5 line-clamp-2 text-[11.5px] text-fg-mute">
                    {r.description}
                  </p>
                )}

                {(doLink.get(r.id) ?? []).length > 0 && (
                  <div className="mt-2 flex flex-wrap gap-1">
                    {(doLink.get(r.id) ?? []).map((cid) => (
                      <Pastilha key={cid} nome={nomeDaColecao.get(cid)} />
                    ))}
                  </div>
                )}
              </div>
            </Card>
          ))}
        </div>
      )}

      {/* ------------------------------ cadastro ------------------------------ */}
      <Modal
        open={aberto}
        onClose={fechar}
        title={editando ? "Editar referência" : "Salvar referência"}
        sub="Cole o link. Nome, descrição e imagem vêm do próprio site."
        size="lg"
        footer={
          <>
            <Button onClick={fechar}>Cancelar</Button>
            <Button variant="primary" onClick={salvar} disabled={salvando}>
              {salvando ? "Salvando..." : editando ? "Salvar" : "Salvar referência"}
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

          <Field label="Link" hint="dribbble.com, ou o endereço daquela página específica">
            <div className="relative">
              <Input
                autoFocus
                type="url"
                inputMode="url"
                value={form.url}
                onChange={(e) => setForm({ ...form, url: e.target.value })}
                /* No `blur` e no Enter, não a cada tecla: o link é colado de
                   uma vez, e ler por caractere seria uma chamada por letra. */
                onBlur={(e) => lerLink(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") {
                    e.preventDefault();
                    lerLink((e.target as HTMLInputElement).value);
                  }
                }}
                placeholder="https://..."
              />
              {lendo && (
                <Loader2
                  size={14}
                  className="absolute right-3.5 top-1/2 -translate-y-1/2 animate-spin text-fg-mute"
                />
              )}
            </div>
          </Field>

          {(previa || form.image_url) && (
            <div className="overflow-hidden rounded-[14px] bg-ink-800">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={previa ?? form.image_url}
                alt=""
                className="aspect-video w-full object-cover"
              />
              <p className="px-3 py-2 text-[11px] text-fg-mute">
                {previa
                  ? "Imagem sua — entra no lugar da do site."
                  : form.image_own
                    ? "Imagem sua, já salva."
                    : "Imagem do site, veio do link."}
              </p>
            </div>
          )}

          <Field
            label="Imagem própria"
            hint="Para os sites que bloqueiam a leitura, como o Dribbble. JPG, PNG ou WebP, até 3 MB."
          >
            <label className="flex h-10 cursor-pointer items-center gap-2 rounded-[14px] border border-line bg-white px-3.5 text-[12.5px] text-fg-mute transition-colors hover:border-brand-400 hover:text-fg-dim">
              <ImagePlus size={15} />
              {arquivo ? arquivo.name : "Escolher arquivo"}
              <input
                type="file"
                accept={TIPOS_IMAGEM.join(",")}
                className="hidden"
                onChange={(e) => escolherArquivo(e.target.files?.[0] ?? null)}
              />
            </label>
          </Field>

          <Field label="Nome">
            <Input
              value={form.name}
              onChange={(e) => setForm({ ...form, name: e.target.value })}
              placeholder="Como você reconhece essa referência"
            />
          </Field>

          <Field label="Coleções" hint="Pode marcar mais de uma. Crie novas no botão Coleções.">
            {colecoes.length === 0 ? (
              <p className="text-[11.5px] text-fg-mute">
                Nenhuma coleção ainda — salve assim e organize depois, ou feche e
                crie em <b>Coleções</b>.
              </p>
            ) : (
              <div className="flex flex-wrap gap-1.5">
                {colecoes.map((c) => {
                  const marcada = form.colecoes.includes(c.id);
                  return (
                    <button
                      key={c.id}
                      type="button"
                      onClick={() => alternarColecao(c.id)}
                      aria-pressed={marcada}
                      className={cx(
                        "h-8 rounded-full border px-3 text-[11.5px] font-medium transition-colors",
                        marcada
                          ? "border-brand-500 bg-brand-500/12 text-brand-400"
                          : "border-line bg-white text-fg-mute hover:border-brand-400"
                      )}
                    >
                      {c.name}
                    </button>
                  );
                })}
              </div>
            )}
          </Field>

          {/* O motivo de estar salvo. É isto que faz a parede continuar
              dizendo alguma coisa daqui a três meses. */}
          <Field label="Por que salvei" hint="Opcional">
            <Textarea
              rows={2}
              value={form.notes}
              onChange={(e) => setForm({ ...form, notes: e.target.value })}
              placeholder="O hero com vídeo de fundo e o preço em três colunas"
            />
          </Field>
        </div>
      </Modal>

      <GerenciarColecoes
        aberto={gerindo}
        onFechar={() => setGerindo(false)}
        supabase={supabase}
        colecoes={colecoes}
        onMudou={load}
        usos={usos}
      />

      {confirm.node}
      {notice.node}
    </div>
  );
}

/**
 * Recado de erro do banco.
 *
 * Dois casos merecem texto próprio: a tabela que ainda não existe (é um arquivo
 * para rodar, não um defeito) e o link repetido, que o índice único recusa e que
 * sem tradução chegaria como "duplicate key value".
 */
const recadoDoBanco = (e: { code?: string; message: string }) => {
  if (e.code === "PGRST205" || semTabela(e.message))
    return "As referências precisam de supabase/REFERENCIAS.sql no banco. Rode o arquivo e recarregue.";
  if (e.code === "23505" || /duplicate|unique/i.test(e.message))
    return "Esse link já está salvo nas referências.";
  return recadoDeErro(e)?.texto ?? e.message;
};
