"use client";

import * as React from "react";
import {
  Compass,
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

/**
 * "dribbble.com" — o domínio serve de rótulo e de nome de reserva.
 *
 * Devolve vazio quando não há endereço: referência que é só imagem não tem
 * domínio, e escrever "null" embaixo do nome seria pior que não escrever nada.
 */
const dominioDe = (url: string | null | undefined) => {
  if (!url) return "";
  try {
    return new URL(normalizarUrl(url)).hostname.replace(/^www\./, "");
  } catch {
    return url;
  }
};

/**
 * O que o clique abre.
 *
 * O endereço quando existe; a própria imagem quando a referência é só uma
 * imagem — ver um print em tamanho cheio é justamente o que se quer dele. Sem
 * isto, um cartão sem link viraria um cartão que não faz nada ao ser clicado.
 */
const aberturaDe = (r: Referencia) => r.url ?? r.image_url ?? undefined;

const vazio = () => ({
  url: "",
  name: "",
  description: "",
  image_url: "",
  icon_url: "",
  image_own: false,
  busca: false,
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
  /*
   * Imagens que falharam ao carregar.
   *
   * Ter endereço não é ter imagem: o site pode ter trocado o arquivo, o
   * endereço pode expirar, e um print gerado sob demanda pode voltar 404. Sem
   * isto o navegador desenha o próprio ícone de imagem quebrada — que foi
   * exatamente o que apareceu na tela.
   */
  /*
   * Quantas imagens já falharam em cada link.
   *
   * Contador e não sim/não porque a lista tenta em degraus: primeiro o ícone
   * que o site declara, depois o `/favicon.ico` do domínio, e só então a
   * bússola. Com um booleano, a primeira falha derrubaria os dois degraus
   * seguintes de uma vez. Ver `iconeDaLista`.
   */
  const [quebradas, setQuebradas] = React.useState<Record<string, number>>({});
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

  /*
   * Busca o logo que falta nos sites de busca já salvos.
   *
   * Quem foi salvo antes da coluna `icon_url` existir ficou sem logo, e não há
   * o que fazer na tela além de reabrir e salvar cada um — trabalho manual por
   * uma coluna que nasceu depois. Esta passada faz isso sozinha, uma vez.
   *
   * Só para `busca`, porque só a lista usa logo; só quando está vazio, para
   * não reler o que já tem; e um por vez, para seis sites não virarem seis
   * leituras de página ao mesmo tempo.
   *
   * `tentados` é por sessão: um site que não devolve logo nenhum não fica
   * sendo relido a cada render, e também não gasta uma coluna gravando
   * "tentei e não achei".
   */
  const tentados = React.useRef(new Set<string>());

  React.useEffect(() => {
    const faltando = rows.filter(
      (r) =>
        r.busca &&
        !!r.url &&
        !r.icon_url &&
        /* Quem já tem logo seu não precisa: ele vence o automático na tela, e
           buscar um que nunca vai aparecer é ida de rede por nada. */
        !(r.image_own && r.image_url) &&
        !tentados.current.has(r.id)
    );
    if (!faltando.length) return;

    let vivo = true;
    (async () => {
      for (const r of faltando) {
        if (!vivo) return;
        tentados.current.add(r.id);
        try {
          const resp = await fetch(
            `/api/link?url=${encodeURIComponent(r.url!)}`
          );
          const d = await resp.json();
          if (!vivo) return;
          if (typeof d?.icon_url !== "string" || !d.icon_url) continue;

          const { data } = await supabase
            .from("referencias")
            .update({ icon_url: d.icon_url })
            .eq("id", r.id)
            .select("id")
            .maybeSingle();
          if (!vivo || !data) continue;
          /* Troca só na memória: o resto da linha não mudou, e uma releitura
             completa por logo seria a tabela inteira pela rede. */
          setRows((v) =>
            v.map((x) => (x.id === r.id ? { ...x, icon_url: d.icon_url } : x))
          );
        } catch {
          /* Sem logo é sem logo: a linha cai no /favicon.ico e depois na
             bússola. Não é motivo para avisar nada. */
        }
      }
    })();
    return () => {
      vivo = false;
    };
  }, [rows, supabase, setRows]);

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

  /*
   * Contagem por coleção — contando só o que a parede mostra.
   *
   * Um site de busca que também esteja numa coleção faria a pastilha dizer
   * "3" e a parede mostrar dois, porque ele não está lá.
   */
  const usos = React.useMemo(() => {
    const naParede = new Set(rows.filter((r) => !r.busca).map((r) => r.id));
    const m: Record<string, number> = {};
    ligacoes.forEach((x) => {
      if (naParede.has(x.referencia_id))
        m[x.colecao_id] = (m[x.colecao_id] ?? 0) + 1;
    });
    return m;
  }, [ligacoes, rows]);

  /* O gerenciador de coleções conta tudo, inclusive site de busca: lá a
     pergunta é "quantos links perdem esta coleção se eu apagar". */
  const usosTotais = React.useMemo(() => {
    const m: Record<string, number> = {};
    ligacoes.forEach((x) => {
      m[x.colecao_id] = (m[x.colecao_id] ?? 0) + 1;
    });
    return m;
  }, [ligacoes]);

  /*
   * Os sites de busca saem da parede e ganham faixa própria.
   *
   * São de natureza diferente do resto: o site de busca se abre para procurar,
   * e o exemplo guardado se abre para comparar. Um quadro grande com a capa do
   * Dribbble não ajuda a garimpar — o que se quer dele é o nome e o clique.
   * Por isso lista em cima, e quadros embaixo.
   */
  const sitesDeBusca = React.useMemo(
    () => rows.filter((r) => r.busca),
    [rows]
  );

  const exemplos = React.useMemo(() => rows.filter((r) => !r.busca), [rows]);

  const lista = React.useMemo(
    () =>
      filtro === "all"
        ? exemplos
        : exemplos.filter((r) => (doLink.get(r.id) ?? []).includes(filtro)),
    [exemplos, filtro, doLink]
  );

  /* ------------------------------ formulário ------------------------------ */

  const abrir = (r?: Referencia) => {
    setEditando(r ?? null);
    setForm(
      r
        ? {
            url: r.url ?? "",
            name: r.name,
            description: r.description ?? "",
            image_url: r.image_url ?? "",
            icon_url: r.icon_url ?? "",
            image_own: r.image_own,
            busca: r.busca,
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
        /* O ícone sempre vem do site: não há como subir um à mão, e nem
           precisa — quando ele falta, o domínio serve de reserva. */
        icon_url: d?.icon_url ?? f.icon_url,
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

  /*
   * Colar a imagem direto no formulário.
   *
   * É o gesto de "gostei dessa imagem": copiar de um site, de uma conversa, ou
   * um print recém-tirado, e colar. Sem isso, o caminho seria salvar em
   * arquivo, achar a pasta e escolher — três passos para o que o Ctrl+V
   * resolve.
   *
   * Escuta no modal inteiro, e não só num campo, porque não há onde clicar
   * antes de colar: a intenção é colar na janela.
   */
  const aoColar = React.useCallback((e: ClipboardEvent) => {
    const itens = e.clipboardData?.items;
    if (!itens) return;
    for (const it of itens) {
      if (it.kind !== "file" || !it.type.startsWith("image/")) continue;
      const f = it.getAsFile();
      if (!f) continue;
      e.preventDefault();
      escolherArquivo(f);
      return;
    }
  }, []);

  React.useEffect(() => {
    if (!aberto) return;
    document.addEventListener("paste", aoColar);
    return () => document.removeEventListener("paste", aoColar);
  }, [aberto, aoColar]);

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
    const temImagem = !!arquivo || !!form.image_url;
    const name = form.name.trim() || dominioDe(url);

    /*
     * Um dos dois basta, e um dos dois é obrigatório.
     *
     * Referência é ou uma página que se volta a olhar, ou uma imagem que se
     * gostou. Sem nenhuma das duas não há o que guardar; exigir as duas
     * obrigaria a inventar um endereço para um print.
     */
    if (!url && !temImagem)
      return setErro(
        "Cole o endereço do site, ou suba uma imagem — uma das duas."
      );
    if (!name)
      return setErro(
        url ? "Dê um nome à referência." : "Dê um nome a essa imagem."
      );

    setSalvando(true);
    setErro("");

    const uid = await currentUserId(supabase);
    if (!uid) {
      setSalvando(false);
      return setErro(SESSION_EXPIRED);
    }

    const dados = {
      /* Vazio vira nulo, e não string vazia: o índice único trata dois NULL
         como distintos, então várias referências sem link convivem — duas
         strings vazias colidiriam. */
      url: url || null,
      name,
      description: form.description.trim() || null,
      notes: form.notes.trim() || null,
      busca: form.busca,
    };

    let id = editando?.id ?? "";
    if (editando) {
      const { data, error } = await supabase
        .from("referencias")
        .update({
          ...dados,
          image_url: form.image_url || null,
          icon_url: form.icon_url || null,
          image_own: form.image_own,
        })
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
          icon_url: form.icon_url || null,
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
            : (recadoDeErro(envio)?.texto ?? envio.message)
        );
      }
      const { data: pub } = supabase.storage
        .from(BUCKET_REFERENCIAS)
        .getPublicUrl(caminho);
      /* ?v= força o navegador a buscar de novo: o caminho é o mesmo a cada
         troca, e sem isso a imagem antiga ficaria em cache. */
      const imagem = `${pub.publicUrl}?v=${Date.now()}`;

      /*
       * O erro deste update era descartado.
       *
       * É a linha que faz a referência apontar para o arquivo que acabou de
       * subir. Falhando em silêncio, o arquivo ficava no bucket e a referência
       * continuava com a imagem antiga — ou sem nenhuma — e nada dizia por quê.
       * `select("id")` porque um update que não acha linha volta 204 sem erro.
       */
      const { data: apontou, error: erroImagem } = await supabase
        .from("referencias")
        .update({ image_url: imagem, image_own: true })
        .eq("id", id)
        .select("id")
        .maybeSingle();
      if (erroImagem || !apontou) {
        setSalvando(false);
        return setErro(
          erroImagem
            ? `A imagem subiu, mas a referência não passou a usá-la: ${recadoDoBanco(erroImagem)}`
            : `A imagem subiu, mas ${NADA_GRAVADO.toLowerCase()}`
        );
      }
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
        return setErro(
          `A referência foi salva, mas as coleções não: ${recadoDoBanco(erroLig)}`
        );
      }
    }

    setSalvando(false);
    /* Releitura completa aqui, e não remendo local: mudou a linha e as
       ligações, e reconstruir os dois à mão daria mais chance de divergir do
       banco do que a ida de rede economiza. */
    await load();
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

      /*
       * A imagem própria sai junto.
       *
       * A linha do banco morre com o `delete`, mas o arquivo no bucket não —
       * e sem isto cada referência apagada deixaria a sua imagem lá para
       * sempre, ocupando espaço que nada mais aponta. Mesmo cuidado que as
       * capas de livro têm em `apagarCapa`.
       *
       * As três extensões possíveis, porque o caminho não guarda com qual foi
       * enviada. Sem esperar e sem avisar de falha: o que importava — a
       * referência sair da tela — já aconteceu, e um erro de limpeza não pode
       * transformar uma exclusão bem-sucedida em recado de erro.
       */
      if (r.image_own) {
        const uid = await currentUserId(supabase);
        if (uid)
          void supabase.storage
            .from(BUCKET_REFERENCIAS)
            .remove([
              `${uid}/${r.id}.jpg`,
              `${uid}/${r.id}.png`,
              `${uid}/${r.id}.webp`,
            ]);
      }

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

      {/* ------------------------- sites de busca ------------------------- */}
      {/*
        Fixa e em lista, acima de tudo.
        
        Não é filtro nem coleção: é o lugar onde se começa. Uma coleção
        chamada "Sites de busca" teria que ser escolhida antes de aparecer, e
        o gesto aqui é o contrário — abrir o app e clicar no site para
        garimpar. Em lista porque de um site de busca se quer o nome e o
        clique, não a capa: uma parede de quadros grandes atrasa o mesmo
        gesto.
      */}
      {sitesDeBusca.length > 0 && (
        <div className="space-y-2">
          <h2 className="text-[10px] font-medium uppercase tracking-wider text-fg-mute">
            Onde buscar
            <span className="ml-1.5 normal-case text-fg-mute/70">
              · {sitesDeBusca.length}
            </span>
          </h2>
          <Card className="px-3 sm:px-4">
            <ul className="divide-y divide-line-soft">
              {sitesDeBusca.map((r, i) => (
                <li
                  key={r.id}
                  className="entra group flex items-center gap-2.5 py-2"
                  style={{ "--i": i } as React.CSSProperties}
                >
                  {/*
                    O logo do site, não o banner.
                    
                    O banner recortado em 32px entrega um pedaço do meio de um
                    print, que não identifica nada. `contain` e não `cover`
                    porque logo cortado deixa de ser logo.
                    
                    Três degraus: o ícone que o site declara, o /favicon.ico do
                    domínio, e a bússola. Ver `iconeDaLista`.
                  */}
                  <span className="grid h-8 w-8 shrink-0 place-items-center overflow-hidden rounded-[9px] bg-white ring-1 ring-line-soft">
                    {iconeDaLista(r, quebradas[r.id]) ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img
                        src={iconeDaLista(r, quebradas[r.id])!}
                        alt=""
                        loading="lazy"
                        onError={() =>
                          setQuebradas((q) => ({
                            ...q,
                            [r.id]: (q[r.id] ?? 0) + 1,
                          }))
                        }
                        className="h-[22px] w-[22px] object-contain"
                      />
                    ) : (
                      <Compass size={14} className="text-brand-400/60" />
                    )}
                  </span>

                  <a
                    href={aberturaDe(r)}
                    target="_blank"
                    rel="noopener noreferrer"
                    title={[r.name, r.url, r.notes].filter(Boolean).join("\n")}
                    className="min-w-0 flex-1"
                  >
                    <span className="block truncate text-[12.5px] font-semibold leading-tight hover:text-brand-400">
                      {r.name}
                    </span>
                    <span className="mt-0.5 block truncate text-[10px] text-fg-mute">
                      {r.notes || dominioDe(r.url)}
                    </span>
                  </a>

                  <span className="flex shrink-0 items-center gap-0.5 transition-opacity lg:opacity-0 lg:group-hover:opacity-100 lg:focus-within:opacity-100">
                    <a
                      href={aberturaDe(r)}
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
                </li>
              ))}
            </ul>
          </Card>
        </div>
      )}

      {colecoes.length > 0 && exemplos.length > 0 && (
        <div className="flex flex-wrap gap-1.5">
          <button
            type="button"
            onClick={() => setFiltro("all")}
            className={pilula(filtro === "all")}
          >
            Todas
            <span className="ml-1.5 opacity-60 tnum">{exemplos.length}</span>
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
        /* Mais colunas, cartão mais estreito. Em três colunas cada cartão
           ficava largo o bastante para o nome caber em duas linhas, e aí a
           altura dobrava sem o cartão dizer mais nada. */
        <div className="grid gap-2.5 grid-cols-2 md:grid-cols-3 xl:grid-cols-4">
          {lista.map((r, i) => (
            <Card
              key={r.id}
              className="entra group flex flex-col overflow-hidden p-2"
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
                href={aberturaDe(r)}
                target="_blank"
                rel="noopener noreferrer"
                title={r.url ?? undefined}
                className="relative block aspect-video w-full shrink-0 overflow-hidden rounded-xl bg-ink-800"
              >
                {r.image_url && !quebradas[r.id] ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={r.image_url}
                    alt=""
                    loading="lazy"
                    decoding="async"
                    /* Falhou? Cai no ícone, como um cartão sem imagem. */
                    onError={() =>
                      setQuebradas((q) => ({ ...q, [r.id]: (q[r.id] ?? 0) + 1 }))
                    }
                    className="h-full w-full object-cover transition-transform duration-300 group-hover:scale-[1.03]"
                  />
                ) : (
                  <span className="grid h-full w-full place-items-center text-brand-400/40">
                    <Link2 size={22} />
                  </span>
                )}
              </a>

              {/*
                Duas linhas de texto, não quatro.
                
                Antes eram nome (em duas linhas), domínio, anotação e
                pastilhas empilhados, com pesos parecidos — a mesma confusão
                que a linha da aula tinha. Agora o nome é a única coisa em
                peso forte, numa linha só, e embaixo dele vem uma faixa fraca
                com o domínio e as coleções. A anotação inteira fica no `title`
                do cartão: ela é o motivo de ter salvo, não o que se lê ao
                varrer a parede com o olho.
              */}
              <div
                className="mt-2 flex min-w-0 flex-1 flex-col"
                title={[r.name, r.url, r.notes ?? r.description]
                  .filter(Boolean)
                  .join("\n")}
              >
                <div className="flex items-center justify-between gap-1">
                  <a
                    href={aberturaDe(r)}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="min-w-0 flex-1 truncate text-[12px] font-semibold leading-tight hover:text-brand-400"
                  >
                    {r.name}
                  </a>

                  {/*
                    As ações somem quando o ponteiro não está no cartão, e num
                    cartão estreito elas não podem empurrar o nome: por isso
                    largura zero até o hover, em vez de só opacidade.
                  */}
                  <span className="flex shrink-0 items-center gap-0.5 overflow-hidden transition-[max-width,opacity] duration-150 lg:max-w-0 lg:opacity-0 lg:group-hover:max-w-[76px] lg:group-hover:opacity-100 lg:group-focus-within:max-w-[76px] lg:group-focus-within:opacity-100">
                    <a
                      href={aberturaDe(r)}
                      target="_blank"
                      rel="noopener noreferrer"
                      aria-label={`Abrir ${r.name}`}
                      className="grid h-6 w-6 shrink-0 place-items-center rounded-md text-fg-mute hover:bg-brand-500/15 hover:text-brand-400"
                    >
                      <ExternalLink size={12} />
                    </a>
                    <button
                      type="button"
                      onClick={() => abrir(r)}
                      aria-label={`Editar ${r.name}`}
                      className="grid h-6 w-6 shrink-0 place-items-center rounded-md text-fg-mute hover:bg-ink-750 hover:text-fg"
                    >
                      <Pencil size={12} />
                    </button>
                    <button
                      type="button"
                      onClick={() => remover(r)}
                      aria-label={`Tirar ${r.name}`}
                      className="grid h-6 w-6 shrink-0 place-items-center rounded-md text-fg-mute hover:bg-neg/15 hover:text-neg"
                    >
                      <Trash2 size={12} />
                    </button>
                  </span>
                </div>

                {/* Domínio e coleções na mesma linha fraca: são os dois
                    rótulos do cartão, e separá-los em duas linhas fazia a
                    altura crescer para dizer o mesmo. */}
                <div className="mt-1 flex min-w-0 items-center gap-1.5 overflow-hidden">
                  <span className="shrink-0 text-[10px] text-fg-mute">
                    {dominioDe(r.url)}
                  </span>
                  {(doLink.get(r.id) ?? []).slice(0, 2).map((cid) => (
                    <Pastilha
                      key={cid}
                      nome={nomeDaColecao.get(cid)}
                      className="shrink-0"
                    />
                  ))}
                  {/* Passando de duas coleções, o resto vira um número: três
                      pastilhas não cabem e a terceira sairia cortada. */}
                  {(doLink.get(r.id) ?? []).length > 2 && (
                    <span className="shrink-0 text-[10px] text-fg-mute tnum">
                      +{(doLink.get(r.id) ?? []).length - 2}
                    </span>
                  )}
                </div>
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
        sub="Cole um link e o resto vem do site — ou cole uma imagem que você gostou."
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

          <Field
            label="Link"
            hint="Opcional. Sem link, a imagem abaixo é a referência."
          >
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

          {/*
            A primeira pergunta, logo depois do link.
            
            Ela decide o sentido de tudo o que vem abaixo: o campo de imagem
            vira "logo" e a prévia vira quadrada, as coleções desaparecem, e a
            anotação troca de "por que salvei" para "o que se acha aqui".
            Estava na penúltima posição, e aí quem abria o formulário via
            "Imagem própria" com prévia de banner e só descobria três campos
            depois que existia outro modo. Pergunta que muda o resto vem
            primeiro.
          */}
          <label className="flex cursor-pointer items-start gap-2.5 rounded-[14px] bg-ink-800 p-3">
            <input
              type="checkbox"
              checked={form.busca}
              onChange={(e) => setForm({ ...form, busca: e.target.checked })}
              className="mt-[2px] h-4 w-4 shrink-0 accent-[var(--color-brand-500)]"
            />
            <span className="min-w-0">
              <span className="block text-[12.5px] font-semibold">
                É um site para buscar referência
              </span>
              <span className="mt-0.5 block text-[11px] text-fg-mute">
                Dribbble, Mobbin, Awwwards — lugar onde você garimpa. Vai para a
                lista <b>Onde buscar</b>, no topo, em vez da parede de quadros.
              </span>
            </span>
          </label>


          {(previa || form.image_url) && (
            <div className="overflow-hidden rounded-[14px] bg-ink-800">
              {/*
                A prévia imita onde a imagem vai aparecer.
                
                Site de busca usa a imagem como logo numa caixinha quadrada, com
                `contain`; exemplo usa como banner 16:9, com `cover`. Mostrar
                sempre o banner fazia a prévia prometer um enquadramento e a
                lista entregar outro.
              */}
              {form.busca ? (
                <div className="flex items-center gap-3 p-3">
                  <span className="grid h-12 w-12 shrink-0 place-items-center overflow-hidden rounded-[11px] bg-white ring-1 ring-line-soft">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img
                      src={previa ?? form.image_url}
                      alt=""
                      className="h-9 w-9 object-contain"
                    />
                  </span>
                  <span className="text-[11px] text-fg-mute">
                    {previa
                      ? "Logo seu — é o que a lista vai mostrar."
                      : form.image_own
                        ? "Logo seu, já salvo."
                        : "Imagem do site. Suba um logo se preferir."}
                  </span>
                </div>
              ) : (
                <>
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
                </>
              )}
            </div>
          )}

          <Field
            label={form.busca ? "Logo próprio" : "Imagem"}
            hint={
              form.busca
                ? "Aparece na lista Onde buscar, no lugar do logo do site. JPG, PNG ou WebP, até 3 MB."
                : "Pode colar com Ctrl+V. JPG, PNG ou WebP, até 3 MB."
            }
          >
            <label className="flex h-10 cursor-pointer items-center gap-2 rounded-[14px] border border-line bg-white px-3.5 text-[12.5px] text-fg-mute transition-colors hover:border-brand-400 hover:text-fg-dim">
              <ImagePlus size={15} />
              {arquivo
                ? arquivo.name
                : form.busca
                  ? "Escolher logo"
                  : "Escolher arquivo"}
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

          {!form.busca && (
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
          )}

          {/* O motivo de estar salvo. É isto que faz a parede continuar
              dizendo alguma coisa daqui a três meses. */}
          <Field
            label={form.busca ? "O que se acha aqui" : "Por que salvei"}
            hint="Opcional"
          >
            <Textarea
              rows={2}
              value={form.notes}
              onChange={(e) => setForm({ ...form, notes: e.target.value })}
              placeholder={
                form.busca
                  ? "Padrões de app mobile, telas reais de produto"
                  : "O hero com vídeo de fundo e o preço em três colunas"
              }
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
        usos={usosTotais}
      />

      {confirm.node}
      {notice.node}
    </div>
  );
}

/**
 * O ícone da linha, no degrau em que estamos.
 *
 * Duas fontes em ordem, porque nenhuma cobre todos os sites — medido em sete:
 * cinco declaram ícone no HTML, cinco servem `/favicon.ico`, e as duas listas
 * não são a mesma. O Behance declara e não serve; o land-book serve e não
 * deixa ler a página.
 *
 * A lista é montada primeiro e só então indexada por `falhas`. Escrito como
 * uma sequência de `if`, a versão anterior devolvia o **mesmo** endereço nos
 * degraus 0 e 1 quando não havia `icon_url` — e endereço repetido não dispara
 * `onError` de novo, porque o navegador já tem o 404 em cache. O resultado era
 * a linha travada no ícone de imagem quebrada, que é o que apareceu na tela.
 *
 * Devolver null é a bússola.
 */
function iconeDaLista(r: Referencia, falhas = 0): string | null {
  /* Sem endereço não há domínio de onde tirar favicon: referência que é só
     imagem cai direto na imagem dela, que já é o primeiro degrau. */
  let doDominio: string | null = null;
  if (r.url) {
    try {
      doDominio = `https://${new URL(r.url).hostname}/favicon.ico`;
    } catch {
      doDominio = null;
    }
  }

  const fontes = [
    /*
     * A imagem que você subiu vem primeiro.
     *
     * Ela mora em `image_url` com `image_own`, e a lista só olhava `icon_url` —
     * então subir um logo para um site de busca não mudava nada na tela. Uma
     * escolha explícita tem que vencer qualquer coisa automática; era o
     * contrário, e por isso a imagem enviada não aparecia.
     */
    r.image_own ? r.image_url : null,
    r.icon_url,
    doDominio,
  ].filter(Boolean) as string[];

  return fontes[falhas] ?? null;
}

/**
 * Recado de erro do banco.
 *
 * Dois casos merecem texto próprio: a tabela que ainda não existe (é um arquivo
 * para rodar, não um defeito) e o link repetido, que o índice único recusa e que
 * sem tradução chegaria como "duplicate key value".
 */
const recadoDoBanco = (e: { code?: string; message: string }) => {
  /* PGRST204 nesta coluna é a migração do site de busca ainda pendente — um
     arquivo para rodar, não um defeito. */
  if (/icon_url/.test(e.message))
    return "O ícone do site precisa de supabase/ICONE-DO-SITE.sql no banco. Rode o arquivo e recarregue.";
  if (/busca/.test(e.message))
    return "A lista de sites de busca precisa de supabase/SITE-DE-BUSCA.sql no banco. Rode o arquivo e recarregue.";
  if (e.code === "PGRST205" || semTabela(e.message))
    return "As referências precisam de supabase/REFERENCIAS.sql no banco. Rode o arquivo e recarregue.";
  if (e.code === "23505" || /duplicate|unique/i.test(e.message))
    return "Esse link já está salvo nas referências.";
  return recadoDeErro(e)?.texto ?? e.message;
};
