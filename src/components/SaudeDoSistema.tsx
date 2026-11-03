"use client";

import * as React from "react";
import { AlertTriangle, Check, ClipboardCopy, DatabaseBackup, Download, Trash2 } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { dateTimeBR } from "@/lib/format";
import { ARQUIVOS_SQL, conferirArquivo, naoExiste, type Situacao } from "@/lib/saudeDoBanco";
import { Button, cx, useConfirm } from "./ui";

/*
 * A saúde do sistema, em Conta > Dados: as cópias automáticas, os erros
 * guardados e os SQLs que faltam rodar. São as três coisas que, quando dão
 * errado, não aparecem em tela nenhuma -- por isso estão juntas aqui.
 */
export function SaudeDoSistema() {
  return (
    <div className="mt-8 flex flex-col gap-8 border-t border-line-soft pt-6">
      <CopiasAutomaticas />
      <ErrosRecentes />
      <BancoDeDados />
    </div>
  );
}

function Titulo({ titulo, sub }: { titulo: string; sub?: string }) {
  return (
    <div>
      <h2 className="text-[16px] font-semibold text-fg">{titulo}</h2>
      {sub && <p className="mt-1 max-w-[62ch] text-[12.5px] leading-relaxed text-fg-mute">{sub}</p>}
    </div>
  );
}

function Recado({ tom, children }: { tom: "pos" | "warn" | "neg"; children: React.ReactNode }) {
  return (
    <p
      className={cx(
        "mt-3 rounded-[14px] px-3.5 py-3 text-xs font-medium",
        tom === "pos" && "bg-pos/12 text-pos",
        tom === "warn" && "bg-warn/12 text-warn",
        tom === "neg" && "bg-neg/12 text-neg"
      )}
    >
      {children}
    </p>
  );
}

/* ------------------------------ cópias ------------------------------ */

type Copia = { dia: string; bytes: number | null; url: string | null };

const FMT_DIA = new Intl.DateTimeFormat("pt-BR", {
  weekday: "short",
  day: "2-digit",
  month: "2-digit",
  year: "numeric",
  timeZone: "UTC",
});
const diaDaCopia = (iso: string) => {
  const d = new Date(`${iso}T12:00:00Z`);
  return Number.isNaN(d.getTime()) ? iso : FMT_DIA.format(d);
};
const tamanho = (b: number | null) =>
  b == null ? "" : b < 1024 * 1024 ? `${Math.max(1, Math.round(b / 1024))} KB` : `${(b / 1024 / 1024).toFixed(1).replace(".", ",")} MB`;

function CopiasAutomaticas() {
  const [copias, setCopias] = React.useState<Copia[] | null>(null);
  const [erro, setErro] = React.useState("");
  const [fazendo, setFazendo] = React.useState(false);
  const [feita, setFeita] = React.useState("");

  const carregar = React.useCallback(async () => {
    setErro("");
    try {
      const r = await fetch("/api/copias", { cache: "no-store" });
      const j = (await r.json()) as { copias?: Copia[]; erro?: string };
      if (!r.ok) throw new Error(j.erro ?? `erro ${r.status}`);
      setCopias(j.copias ?? []);
    } catch (e) {
      setErro(e instanceof Error ? e.message : String(e));
      setCopias([]);
    }
  }, []);

  React.useEffect(() => {
    carregar();
  }, [carregar]);

  const fazerAgora = async () => {
    setFazendo(true);
    setErro("");
    setFeita("");
    try {
      const r = await fetch("/api/copias", { method: "POST" });
      const j = (await r.json()) as { linhas?: number; falhas?: string[]; erro?: string };
      if (!r.ok) throw new Error(j.erro ?? `erro ${r.status}`);
      setFeita(
        `Cópia feita: ${(j.linhas ?? 0).toLocaleString("pt-BR")} registros.` +
          (j.falhas?.length ? ` Não deu para ler: ${j.falhas.join(", ")}.` : "")
      );
      await carregar();
    } catch (e) {
      setErro(e instanceof Error ? e.message : String(e));
    } finally {
      setFazendo(false);
    }
  };

  return (
    <section>
      <Titulo
        titulo="Cópias automáticas"
        sub="Todo dia, antes da limpeza das 6h, o app guarda uma cópia de tudo. Ficam as dos últimos 14 dias e a do dia 1º dos últimos 6 meses. As imagens entram só como endereço; para uma cópia fora do app, use Exportar tudo, acima."
      />
      {erro && <Recado tom="neg">Não deu para ler as cópias: {erro}</Recado>}
      {feita && <Recado tom="pos">{feita}</Recado>}

      {copias === null ? (
        <div className="mt-4 h-12 animate-pulse rounded-[16px] bg-ink-800" />
      ) : copias.length === 0 ? (
        !erro && (
          <p className="mt-4 rounded-[16px] border border-line bg-ink-800 px-4 py-3.5 text-[12.5px] text-fg-mute">
            Nenhuma cópia ainda. A primeira sai na manutenção das 6h, ou agora, pelo botão.
          </p>
        )
      ) : (
        <ul className="mt-4 flex flex-col overflow-hidden rounded-[16px] border border-line">
          {copias.map((c, i) => (
            <li
              key={c.dia}
              className="flex items-center gap-3 border-b border-line-soft bg-ink-800 px-4 py-2.5 last:border-0"
            >
              <DatabaseBackup size={15} className={i === 0 ? "text-pos" : "text-fg-mute"} />
              <span className="min-w-0 flex-1 truncate text-[13px] font-medium">
                {diaDaCopia(c.dia)}
                {i === 0 && <span className="ml-2 text-[11.5px] font-semibold text-pos">mais recente</span>}
              </span>
              <span className="text-[12px] text-fg-mute tnum">{tamanho(c.bytes)}</span>
              {c.url && (
                <a
                  href={c.url}
                  className="inline-flex h-8 items-center gap-1.5 rounded-full px-3 text-[12.5px] font-semibold text-brand-400 transition-colors hover:bg-brand-500/12"
                >
                  <Download size={14} /> Baixar
                </a>
              )}
            </li>
          ))}
        </ul>
      )}

      <div className="mt-4">
        <Button onClick={fazerAgora} disabled={fazendo}>
          <DatabaseBackup size={15} />
          {fazendo ? "Fazendo a cópia..." : "Fazer uma cópia agora"}
        </Button>
      </div>
    </section>
  );
}

/* ------------------------------ erros ------------------------------ */

type ErroGuardado = {
  id: string;
  criado_em: string;
  mensagem: string;
  detalhe: string;
  pagina: string;
  aparelho: string;
  versao: string;
};

/** Curto o bastante para colar numa conversa, completo o bastante para achar a causa. */
function paraOClaude(erros: ErroGuardado[]) {
  return [
    `Erros guardados pelo Morning Brief (${erros.length}):`,
    ...erros.map((e) =>
      [
        `- ${dateTimeBR(e.criado_em)} · ${e.pagina} · versão ${e.versao}`,
        `  ${e.mensagem}`,
        e.detalhe ? `  ${e.detalhe.slice(0, 600).replace(/\n/g, "\n  ")}` : "",
        `  aparelho: ${e.aparelho}`,
      ]
        .filter(Boolean)
        .join("\n")
    ),
  ].join("\n");
}

function ErrosRecentes() {
  const supabase = React.useMemo(() => createClient(), []);
  const confirm = useConfirm();
  const [erros, setErros] = React.useState<ErroGuardado[] | null>(null);
  const [semTabela, setSemTabela] = React.useState(false);
  const [falha, setFalha] = React.useState("");
  const [copiado, setCopiado] = React.useState(false);

  const carregar = React.useCallback(async () => {
    const { data, error } = await supabase
      .from("app_erros")
      .select("id, criado_em, mensagem, detalhe, pagina, aparelho, versao")
      .order("criado_em", { ascending: false })
      .limit(30);
    if (error) {
      if (naoExiste(error)) setSemTabela(true);
      else setFalha(error.message);
      setErros([]);
      return;
    }
    setErros((data as ErroGuardado[]) ?? []);
  }, [supabase]);

  React.useEffect(() => {
    carregar();
  }, [carregar]);

  const copiar = async () => {
    if (!erros?.length) return;
    try {
      await navigator.clipboard.writeText(paraOClaude(erros));
      setCopiado(true);
      setTimeout(() => setCopiado(false), 2500);
    } catch {
      setFalha("O navegador não deixou copiar.");
    }
  };

  const limpar = () =>
    confirm.ask(
      "Apaga a lista de erros guardados. Os erros novos continuam sendo guardados.",
      async () => {
        const { error } = await supabase.from("app_erros").delete().not("id", "is", null);
        if (error) setFalha(error.message);
        carregar();
      },
      { titulo: "Limpar os erros", rotulo: "Limpar" }
    );

  return (
    <section>
      <Titulo
        titulo="Erros guardados"
        sub="Quando uma tela quebra ou algo não grava, o app guarda o que aconteceu: a mensagem, a tela, o aparelho e a versão. Copie e cole para o Claude, sem precisar descrever."
      />
      {semTabela && (
        <Recado tom="warn">
          Falta rodar <b>supabase/ERROS-DO-APP.sql</b> no Supabase. Até lá, os erros não ficam guardados.
        </Recado>
      )}
      {falha && <Recado tom="neg">{falha}</Recado>}

      {erros === null ? (
        <div className="mt-4 h-12 animate-pulse rounded-[16px] bg-ink-800" />
      ) : (
        !semTabela &&
        (erros.length === 0 ? (
          <p className="mt-4 flex items-center gap-2 rounded-[16px] border border-line bg-ink-800 px-4 py-3.5 text-[12.5px] text-fg-mute">
            <Check size={14} className="text-pos" /> Nenhum erro guardado.
          </p>
        ) : (
          <>
            <ul className="mt-4 flex max-h-[360px] flex-col overflow-y-auto rounded-[16px] border border-line">
              {erros.map((e) => (
                <li key={e.id} className="border-b border-line-soft bg-ink-800 px-4 py-3 last:border-0">
                  <p className="break-words text-[13px] font-medium text-fg">{e.mensagem}</p>
                  <p className="mt-1 text-[11.5px] text-fg-mute tnum">
                    {dateTimeBR(e.criado_em)} · {e.pagina || "—"} · versão {e.versao}
                  </p>
                </li>
              ))}
            </ul>
            <div className="mt-4 flex flex-wrap gap-2.5">
              <Button onClick={copiar}>
                {copiado ? <Check size={15} /> : <ClipboardCopy size={15} />}
                {copiado ? "Copiado" : "Copiar para o Claude"}
              </Button>
              <Button onClick={limpar}>
                <Trash2 size={15} /> Limpar
              </Button>
            </div>
          </>
        ))
      )}
      {confirm.node}
    </section>
  );
}

/* ------------------------------ banco ------------------------------ */

function BancoDeDados() {
  const supabase = React.useMemo(() => createClient(), []);
  const [situacoes, setSituacoes] = React.useState<Situacao[] | null>(null);

  React.useEffect(() => {
    let vivo = true;
    Promise.all(ARQUIVOS_SQL.map((a) => conferirArquivo(supabase, a))).then((r) => {
      if (vivo) setSituacoes(r);
    });
    return () => {
      vivo = false;
    };
  }, [supabase]);

  const linhas = situacoes ? ARQUIVOS_SQL.map((a, i) => ({ ...a, s: situacoes[i] })) : [];
  const pendentes = linhas.filter((l) => l.s.estado === "pendente");
  const naoDeu = linhas.filter((l) => l.s.estado === "nao-deu");
  const aplicados = linhas.filter((l) => l.s.estado === "ok").length;
  const semComo = linhas.filter((l) => l.s.estado === "sem-como-conferir").length;

  return (
    <section>
      <Titulo
        titulo="Banco de dados"
        sub="O app pergunta ao banco se cada arquivo da pasta supabase/ já foi rodado, conferindo as tabelas e colunas que ele cria. Um SQL esquecido não quebra nada à vista: a função nova só não funciona, calada."
      />
      {situacoes === null ? (
        <div className="mt-4 h-12 animate-pulse rounded-[16px] bg-ink-800" />
      ) : (
        <>
          <p className="mt-4 text-[12.5px] text-fg-mute tnum">
            <b className="text-pos">{aplicados} rodados</b>
            {pendentes.length > 0 && (
              <>
                {" · "}
                <b className="text-warn">{pendentes.length} faltando</b>
              </>
            )}
            {naoDeu.length > 0 && ` · ${naoDeu.length} sem resposta`}
            {` · ${semComo} sem como conferir daqui`}
          </p>

          {pendentes.length > 0 && (
            <ul className="mt-3 flex flex-col overflow-hidden rounded-[16px] border border-warn/40">
              {pendentes.map((l) => (
                <li key={l.arquivo} className="flex gap-3 border-b border-line-soft bg-warn/8 px-4 py-3 last:border-0">
                  <AlertTriangle size={15} className="mt-0.5 shrink-0 text-warn" />
                  <span className="min-w-0">
                    <b className="block text-[13px] text-fg">supabase/{l.arquivo}</b>
                    <span className="text-[12px] text-fg-mute">
                      Falta {l.s.estado === "pendente" ? l.s.falta : ""}.
                    </span>
                  </span>
                </li>
              ))}
            </ul>
          )}

          <details className="group mt-3">
            <summary className="cursor-pointer select-none text-[12.5px] font-semibold text-brand-400">
              Ver todos os {linhas.length} arquivos
            </summary>
            <ul className="mt-2 flex flex-col overflow-hidden rounded-[16px] border border-line">
              {linhas.map((l) => (
                <li
                  key={l.arquivo}
                  className="flex items-center gap-3 border-b border-line-soft bg-ink-800 px-4 py-2 text-[12.5px] last:border-0"
                >
                  <span className="min-w-0 flex-1 truncate font-medium">{l.arquivo}</span>
                  <span
                    className={cx(
                      "shrink-0 text-right",
                      l.s.estado === "ok" && "font-semibold text-pos",
                      l.s.estado === "pendente" && "font-semibold text-warn",
                      l.s.estado === "nao-deu" && "text-neg",
                      l.s.estado === "sem-como-conferir" && "text-fg-mute"
                    )}
                  >
                    {l.s.estado === "ok"
                      ? "rodado"
                      : l.s.estado === "pendente"
                        ? "faltando"
                        : l.s.estado === "nao-deu"
                          ? "sem resposta"
                          : l.s.porque}
                  </span>
                </li>
              ))}
            </ul>
          </details>
        </>
      )}
    </section>
  );
}
