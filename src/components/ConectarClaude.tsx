"use client";

import * as React from "react";
import { Check, ClipboardCopy, KeyRound, ShieldOff } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { dateTimeBR } from "@/lib/format";
import { naoExiste } from "@/lib/saudeDoBanco";
import { Button, cx, useConfirm } from "./ui";

/*
 * Conta > Claude: liga o Claude Code ao Morning Brief (rota /api/mcp).
 *
 * Gera uma chave pessoal, mostra uma única vez junto com o comando pronto
 * para colar no terminal, e lista as chaves para revogar. Ver
 * lib/chavesDoClaude e lib/mcp/ferramentas.
 */

type Chave = {
  id: string;
  nome: string;
  prefixo: string;
  criada_em: string;
  usada_em: string | null;
  revogada_em: string | null;
};

/** O comando do Claude Code, com a chave e o endereço deste app. */
export const comandoDoClaude = (origem: string, chave: string) =>
  `claude mcp add --scope user --transport http morning-brief ${origem}/api/mcp --header "Authorization: Bearer ${chave}"`;

function Titulo({ titulo, sub }: { titulo: string; sub?: string }) {
  return (
    <div>
      <h2 className="text-[16px] font-semibold text-fg">{titulo}</h2>
      {sub && <p className="mt-1 max-w-[62ch] text-[12.5px] leading-relaxed text-fg-mute">{sub}</p>}
    </div>
  );
}

export function ConectarClaude() {
  const supabase = React.useMemo(() => createClient(), []);
  const confirm = useConfirm();
  const [chaves, setChaves] = React.useState<Chave[] | null>(null);
  const [semTabela, setSemTabela] = React.useState(false);
  const [nova, setNova] = React.useState<string | null>(null);
  const [copiado, setCopiado] = React.useState(false);
  const [erro, setErro] = React.useState("");
  const [gerando, setGerando] = React.useState(false);

  const carregar = React.useCallback(async () => {
    const { data, error } = await supabase
      .from("chaves_do_claude")
      .select("id, nome, prefixo, criada_em, usada_em, revogada_em")
      .order("criada_em", { ascending: false });
    if (error) {
      if (naoExiste(error)) setSemTabela(true);
      else setErro(error.message);
      setChaves([]);
      return;
    }
    setChaves((data as Chave[]) ?? []);
  }, [supabase]);

  React.useEffect(() => {
    carregar();
  }, [carregar]);

  const gerar = async () => {
    setGerando(true);
    setErro("");
    setCopiado(false);
    try {
      const r = await fetch("/api/chaves", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ nome: "Claude Code" }),
      });
      const j = (await r.json()) as { chave?: string; erro?: string };
      if (!r.ok || !j.chave) throw new Error(j.erro ?? `erro ${r.status}`);
      setNova(j.chave);
      await carregar();
    } catch (e) {
      setErro(e instanceof Error ? e.message : String(e));
    } finally {
      setGerando(false);
    }
  };

  const comando = nova ? comandoDoClaude(location.origin, nova) : "";

  const copiar = async () => {
    try {
      await navigator.clipboard.writeText(comando);
      setCopiado(true);
    } catch {
      setErro("O navegador não deixou copiar. Selecione o comando e copie à mão.");
    }
  };

  const revogar = (c: Chave) =>
    confirm.ask(
      `Revogar a chave ${c.prefixo}…? O Claude Code que usa ela para de conseguir acessar o app na hora.`,
      async () => {
        const { error } = await supabase
          .from("chaves_do_claude")
          .update({ revogada_em: new Date().toISOString() })
          .eq("id", c.id);
        if (error) setErro(error.message);
        carregar();
      },
      { titulo: "Revogar chave", rotulo: "Revogar" }
    );

  const ativas = (chaves ?? []).filter((c) => !c.revogada_em);

  return (
    <div className="flex flex-col gap-6">
      <Titulo
        titulo="Claude Code"
        sub="Liga o Claude Code ao Morning Brief: numa sessão, peça “cria demanda thumb do Papo de Elite pra amanhã” ou “o que vence essa semana?” e ele faz aqui. Ele pode ler, criar e editar. Apagar, nunca."
      />

      {semTabela ? (
        <p className="rounded-[14px] bg-warn/12 px-3.5 py-3 text-xs font-medium text-warn">
          Falta rodar <b>supabase/CLAUDE-REVISAO-E-MODELOS.sql</b> no Supabase.
        </p>
      ) : (
        <>
          {nova ? (
            <div className="rounded-[20px] border border-brand-500/40 bg-brand-500/10 p-4">
              <p className="text-[13px] font-semibold text-fg">Chave criada. Ela aparece só agora.</p>
              <p className="mt-1 text-[12.5px] text-fg-mute">
                Cole este comando no terminal do computador (uma vez só). Depois, abra uma sessão nova do Claude
                Code.
              </p>
              <pre className="mt-3 overflow-x-auto whitespace-pre-wrap break-all rounded-[14px] border border-line bg-ink-900 p-3 text-[11.5px] leading-relaxed text-fg">
                {comando}
              </pre>
              <div className="mt-3 flex flex-wrap gap-2.5">
                <Button variant="primary" onClick={copiar}>
                  {copiado ? <Check size={15} /> : <ClipboardCopy size={15} />}
                  {copiado ? "Copiado" : "Copiar comando"}
                </Button>
                <Button onClick={() => setNova(null)}>Já colei</Button>
              </div>
              <p className="mt-3 text-[11.5px] leading-relaxed text-fg-mute">
                Não mande esta chave em conversa nenhuma. Quem tiver ela lê e edita o seu app. Perdeu ou vazou?
                Revogue abaixo e gere outra.
              </p>
            </div>
          ) : (
            <div>
              <Button variant="primary" onClick={gerar} disabled={gerando}>
                <KeyRound size={15} />
                {gerando ? "Gerando..." : ativas.length ? "Gerar outra chave" : "Gerar chave"}
              </Button>
            </div>
          )}

          {erro && (
            <p className="rounded-[14px] bg-neg/12 px-3.5 py-3 text-xs font-medium text-neg">{erro}</p>
          )}

          {chaves && chaves.length > 0 && (
            <ul className="flex flex-col overflow-hidden rounded-[16px] border border-line">
              {chaves.map((c) => (
                <li
                  key={c.id}
                  className={cx(
                    "flex items-center gap-3 border-b border-line-soft bg-ink-800 px-4 py-3 last:border-0",
                    c.revogada_em && "opacity-60"
                  )}
                >
                  <KeyRound size={15} className={c.revogada_em ? "text-fg-mute" : "text-brand-400"} />
                  <span className="min-w-0 flex-1">
                    <b className="block truncate text-[13px] tnum">
                      {c.nome} · {c.prefixo}…
                    </b>
                    <span className="block truncate text-[11.5px] text-fg-mute">
                      {c.revogada_em
                        ? `revogada em ${dateTimeBR(c.revogada_em)}`
                        : `criada em ${dateTimeBR(c.criada_em)} · ${
                            c.usada_em ? `usada em ${dateTimeBR(c.usada_em)}` : "ainda não usada"
                          }`}
                    </span>
                  </span>
                  {!c.revogada_em && (
                    <button
                      type="button"
                      onClick={() => revogar(c)}
                      className="inline-flex h-8 shrink-0 items-center gap-1.5 rounded-full px-3 text-[12.5px] font-semibold text-neg transition-colors hover:bg-neg/12"
                    >
                      <ShieldOff size={14} /> Revogar
                    </button>
                  )}
                </li>
              ))}
            </ul>
          )}
        </>
      )}
      {confirm.node}
    </div>
  );
}
