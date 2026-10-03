"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import {
  AlertTriangle,
  Bell,
  Check,
  Download,
  KeyRound,
  LogOut,
  Mail,
  Monitor,
  Moon,
  ShieldCheck,
  Sun,
  User,
} from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { currentUserId } from "@/lib/session";
import {
  desligarPush,
  ligarPush,
  situacaoPush,
  type SituacaoPush,
} from "@/lib/push";
import { dateTimeBR } from "@/lib/format";
import { sairDaConta } from "@/lib/sair";
import { TEMAS, useTema } from "@/components/tema";
import { TrocarFoto, useAvatar } from "@/components/Avatar";
import { Button, Card, Input, cx } from "@/components/ui";

type Perfil = {
  email: string;
  id: string;
  confirmado: boolean;
  criadoEm: string | null;
  ultimoAcesso: string | null;
  apelido: string;
};

export default function ContaPage() {
  const supabase = React.useMemo(() => createClient(), []);
  const router = useRouter();
  const [perfil, setPerfil] = React.useState<Perfil | null>(null);
  const [enviando, setEnviando] = React.useState(false);
  const [apelido, setApelido] = React.useState("");
  const [salvandoNome, setSalvandoNome] = React.useState(false);
  const [nomeOk, setNomeOk] = React.useState("");
  const [aviso, setAviso] = React.useState("");
  const [erro, setErro] = React.useState("");
  const { tema, setTema } = useTema();
  const { url: foto, setUrl: setFoto } = useAvatar();

  React.useEffect(() => {
    (async () => {
      const { data } = await supabase.auth.getUser();
      const u = data.user;
      if (!u) return;
      const guardado = u.user_metadata?.nome;
      const inicial = typeof guardado === "string" ? guardado : "";
      setPerfil({
        email: u.email ?? "",
        id: u.id,
        confirmado: !!u.email_confirmed_at,
        criadoEm: u.created_at ?? null,
        ultimoAcesso: u.last_sign_in_at ?? null,
        apelido: inicial,
      });
      setApelido(inicial);
    })();
  }, [supabase]);

  /*
   * Troca de senha por link no e-mail, não por campo aqui.
   * O link leva a /auth/nova-senha, que é onde a senha nova é escrita. Antes
   * ele voltava para /login, que não tinha esse campo — o link não servia.
   */
  const trocarSenha = async () => {
    if (!perfil?.email) return;
    setErro("");
    setAviso("");
    setEnviando(true);
    const { error } = await supabase.auth.resetPasswordForEmail(perfil.email, {
      redirectTo: `${window.location.origin}/auth/nova-senha`,
    });
    setEnviando(false);
    if (error) return setErro(error.message);
    setAviso(`Link enviado para ${perfil.email}. Confira a caixa de entrada.`);
  };

  /*
   * Salva o nome e faz a saudação enxergar a mudança.
   *
   * Três passos, e nenhum é dispensável: updateUser grava o metadata, mas o
   * access_token não é reemitido — e o layout, que monta a saudação, lê o nome
   * de dentro do JWT. refreshSession pede o token novo; router.refresh manda o
   * servidor renderizar o layout outra vez com ele.
   */
  const salvarNome = async () => {
    const valor = apelido.trim().slice(0, 40);
    setErro("");
    setNomeOk("");
    setSalvandoNome(true);
    const { error } = await supabase.auth.updateUser({
      data: { nome: valor || null },
    });
    if (error) {
      setSalvandoNome(false);
      return setErro(error.message);
    }
    try {
      await supabase.auth.refreshSession();
    } catch {
      // sem token novo a saudação atualiza no próximo login
    }
    setSalvandoNome(false);
    setPerfil((p) => (p ? { ...p, apelido: valor } : p));
    setNomeOk(valor ? "Pronto." : "Voltamos a usar seu e-mail.");
    router.refresh();
  };

  /*
   * Sair passa pelo `sairDaConta`, que também esquece a memória de página.
   *
   * Antes esta tela só chamava `signOut`, e a limpeza da memória estava
   * escrita no botão da barra lateral — duas saídas que tinham deixado de
   * fazer a mesma coisa. Quem saísse por aqui deixava os próprios dados
   * guardados na aba, e eles apareceriam por um instante para quem entrasse
   * depois. Agora só existe esta saída, e ela é a certa.
   */
  const sair = async () => {
    await sairDaConta();
    router.replace("/login");
    router.refresh();
  };

  if (!perfil) return null;

  // as iniciais do avatar seguem o nome escolhido, não o handle do e-mail
  const nome = perfil.apelido || perfil.email.split("@")[0] || "você";

  return (
    <div className="rise max-w-[760px]">
      <div className="mb-5">
        <h1 className="titulo-pagina">Conta</h1>
        <p className="mt-1 text-sm text-fg-mute">
          Seus dados de acesso e a aparência do app.
        </p>
      </div>

      <div className="flex flex-col gap-4">
        {/* ------------------------------ perfil ------------------------------ */}
        <Card>
          <Cabeca icon={<User size={14} />} titulo="Perfil" />
          <div className="px-[18px] pb-[18px] pt-3">
            <TrocarFoto nome={nome} url={foto} onTrocou={setFoto} />

            <div className="mt-4 border-t border-line-soft pt-4">
              <label className="block">
                <span className="block text-[13px] font-semibold">
                  Como quer ser chamado
                </span>
                <span className="mt-0.5 block text-[11.5px] text-fg-mute">
                  É o nome que aparece na saudação do Início. Em branco, usamos
                  a primeira parte do seu e-mail.
                </span>
                <div className="mt-2.5 flex flex-wrap gap-2">
                  <Input
                    value={apelido}
                    maxLength={40}
                    onChange={(e) => {
                      setApelido(e.target.value);
                      setNomeOk("");
                    }}
                    placeholder={perfil.email.split("@")[0] || "Seu nome"}
                    className="min-w-[180px] flex-1"
                  />
                  <Button
                    onClick={salvarNome}
                    disabled={salvandoNome || apelido.trim() === perfil.apelido}
                  >
                    {salvandoNome ? "Salvando..." : "Salvar"}
                  </Button>
                </div>
              </label>

              {nomeOk && (
                <p className="mt-2.5 rounded-[14px] bg-pos/12 px-3.5 py-2.5 text-xs font-medium text-pos">
                  {nomeOk}
                </p>
              )}
            </div>

            <dl className="mt-4 flex flex-col gap-0 border-t border-line-soft pt-1">
              <Linha
                rotulo="E-mail"
                valor={perfil.email}
                icone={<Mail size={13} />}
              />
              <Linha
                rotulo="E-mail confirmado"
                icone={<ShieldCheck size={13} />}
                valor={
                  perfil.confirmado ? (
                    <span className="inline-flex items-center gap-1 font-semibold text-pos">
                      <Check size={13} /> sim
                    </span>
                  ) : (
                    <span className="inline-flex items-center gap-1 font-semibold text-warn">
                      <AlertTriangle size={13} /> pendente
                    </span>
                  )
                }
              />
              <Linha rotulo="Conta criada em" valor={dateTimeBR(perfil.criadoEm)} />
              <Linha
                rotulo="Último acesso"
                valor={dateTimeBR(perfil.ultimoAcesso)}
              />
            </dl>
          </div>
        </Card>

        {/* --------------------------- claro e escuro --------------------------- */}
        <Card>
          <Cabeca icon={<Sun size={14} />} titulo="Claro ou escuro" />
          <div className="px-[18px] pb-[18px] pt-3">
            <p className="text-[13px] text-fg-mute">
              No automático, o app segue o que estiver no seu celular ou
              computador — inclusive quando ele troca sozinho ao anoitecer. A
              escolha fica salva neste navegador.
            </p>
            <div className="mt-3.5 flex flex-wrap gap-2.5">
              {TEMAS.map((t) => (
                <button
                  key={t.key}
                  onClick={() => setTema(t.key)}
                  aria-pressed={tema === t.key}
                  className={cx(
                    "flex items-center gap-2.5 rounded-[14px] px-3 py-2.5 text-[13px] font-medium transition-colors",
                    tema === t.key
                      ? "bg-brand-500/12 text-brand-400"
                      : "bg-ink-800 text-fg-dim hover:text-fg"
                  )}
                >
                  {t.key === "claro" ? (
                    <Sun size={15} />
                  ) : t.key === "escuro" ? (
                    <Moon size={15} />
                  ) : (
                    <Monitor size={15} />
                  )}
                  {t.name}
                  {tema === t.key && <Check size={14} />}
                </button>
              ))}
            </div>
          </div>
        </Card>

        {/* ------------------------- notificação da manhã ------------------------- */}
        <NotificacaoDaManha />

        {/* ------------------------------ seus dados ------------------------------ */}
        <ExportarDados />

        {/* ------------------------------ segurança ------------------------------ */}
        <Card>
          <Cabeca icon={<KeyRound size={14} />} titulo="Acesso" />
          <div className="px-[18px] pb-[18px] pt-3">
            <p className="text-[13px] text-fg-mute">
              A senha é trocada por link no e-mail — ela não passa por esta
              tela.
            </p>

            {aviso && (
              <p className="mt-3 rounded-[14px] bg-pos/12 px-3.5 py-3 text-xs font-medium text-pos">
                {aviso}
              </p>
            )}
            {erro && (
              <p className="mt-3 rounded-[14px] bg-neg/12 px-3.5 py-3 text-xs font-medium text-neg">
                {erro}
              </p>
            )}

            <div className="mt-4 flex flex-wrap gap-2.5">
              <Button onClick={trocarSenha} disabled={enviando}>
                <KeyRound size={15} />
                {enviando ? "Enviando..." : "Enviar link de nova senha"}
              </Button>
              <Button variant="danger" onClick={sair}>
                <LogOut size={15} />
                Sair da conta
              </Button>
            </div>
          </div>
        </Card>
      </div>
    </div>
  );
}

/* ------------------------- notificação da manhã ------------------------- */

/*
 * Liga o brief das 6h neste aparelho.
 *
 * Cada aparelho liga o seu: a inscrição de push é do navegador, não da conta.
 * No iPhone ela só existe no app adicionado à tela de início — a tela explica
 * o caminho em vez de mostrar um botão que não funcionaria.
 */
function NotificacaoDaManha() {
  const supabase = React.useMemo(() => createClient(), []);
  const [situacao, setSituacao] = React.useState<SituacaoPush | null>(null);
  const [ocupado, setOcupado] = React.useState(false);
  const [recado, setRecado] = React.useState<{ ok: boolean; texto: string } | null>(null);

  const reler = React.useCallback(async () => {
    try {
      setSituacao(await situacaoPush());
    } catch {
      setSituacao("sem-suporte");
    }
  }, []);
  React.useEffect(() => {
    reler();
  }, [reler]);

  const ligar = async () => {
    setOcupado(true);
    setRecado(null);
    try {
      const uid = await currentUserId(supabase);
      if (!uid) return setRecado({ ok: false, texto: "Sua sessão expirou. Entre de novo." });
      const r = await ligarPush(supabase, uid);
      setRecado(
        r.ok
          ? { ok: true, texto: "Ligada. Amanhã às 6h o brief chega neste aparelho." }
          : { ok: false, texto: r.erro }
      );
    } catch (e) {
      setRecado({ ok: false, texto: e instanceof Error ? e.message : String(e) });
    } finally {
      setOcupado(false);
      reler();
    }
  };

  const desligar = async () => {
    setOcupado(true);
    setRecado(null);
    try {
      await desligarPush(supabase);
      setRecado({ ok: true, texto: "Desligada neste aparelho." });
    } finally {
      setOcupado(false);
      reler();
    }
  };

  const testar = async () => {
    setOcupado(true);
    setRecado(null);
    try {
      const resp = await fetch("/api/brief", { method: "POST" });
      const dados = (await resp.json()) as { enviados?: number; erro?: string };
      setRecado(
        resp.ok
          ? { ok: true, texto: `Enviado para ${dados.enviados} aparelho${dados.enviados === 1 ? "" : "s"}.` }
          : { ok: false, texto: dados.erro ?? "Não deu para enviar." }
      );
    } catch {
      setRecado({ ok: false, texto: "Sem conexão com o app." });
    } finally {
      setOcupado(false);
    }
  };

  return (
    <Card>
      <Cabeca icon={<Bell size={14} />} titulo="Notificação da manhã" />
      <div className="px-[18px] pb-[18px] pt-3">
        <p className="text-[13px] text-fg-mute">
          Todo dia às 6h chega um resumo no celular: demandas do dia, contas que
          vencem e a agenda. No dia 1º, também como o mês anterior fechou.
        </p>

        {situacao === "precisa-instalar" && (
          <div className="mt-3 rounded-[14px] bg-ink-800 px-3.5 py-3 text-[12.5px] leading-relaxed text-fg-dim">
            <p className="font-semibold text-fg">No iPhone, primeiro adicione o app à tela de início:</p>
            <ol className="mt-1.5 list-decimal space-y-0.5 pl-4">
              <li>No Safari, toque em Compartilhar (o quadrado com a seta).</li>
              <li>Escolha &ldquo;Adicionar à Tela de Início&rdquo;.</li>
              <li>Abra o Morning Brief pelo ícone novo e volte aqui em Conta.</li>
            </ol>
            <p className="mt-1.5 text-fg-mute">Precisa do iOS 16.4 ou mais novo.</p>
          </div>
        )}
        {situacao === "sem-suporte" && (
          <p className="mt-3 text-[12.5px] text-fg-mute">
            Este navegador não recebe notificação. Abra o app pelo celular.
          </p>
        )}
        {situacao === "bloqueada" && (
          <p className="mt-3 text-[12.5px] text-warn">
            A notificação está bloqueada para o app.{" "}
            {/iphone|ipad/i.test(typeof navigator === "undefined" ? "" : navigator.userAgent)
              ? "Libere em Ajustes → Notificações → Morning Brief."
              : "Libere nas permissões do navegador para este site e recarregue."}
          </p>
        )}

        {recado && (
          <p
            className={cx(
              "mt-3 rounded-[14px] px-3.5 py-3 text-xs font-medium",
              recado.ok ? "bg-pos/12 text-pos" : "bg-neg/12 text-neg"
            )}
          >
            {recado.texto}
          </p>
        )}

        <div className="mt-4 flex flex-wrap gap-2.5">
          {situacao === "desligada" && (
            <Button variant="primary" onClick={ligar} disabled={ocupado}>
              <Bell size={15} />
              {ocupado ? "Ligando..." : "Ligar neste aparelho"}
            </Button>
          )}
          {situacao === "ligada" && (
            <>
              <Button onClick={testar} disabled={ocupado}>
                {ocupado ? "Enviando..." : "Receber agora"}
              </Button>
              <Button variant="ghost" onClick={desligar} disabled={ocupado}>
                Desligar neste aparelho
              </Button>
            </>
          )}
        </div>
      </div>
    </Card>
  );
}

/* ------------------------------ exportar ------------------------------ */

/*
 * Todas as tabelas do app. Uma tabela que ainda não exista no banco (SQL não
 * rodado) entra no arquivo como erro, sem impedir as outras.
 */
const TABELAS = [
  "bills",
  "cartoes",
  "bill_categories",
  "tasks",
  "task_items",
  "clientes",
  "projetos",
  "recurring_tasks",
  "events",
  "habits",
  "habit_logs",
  "notes",
  "note_categories",
  "note_in_category",
  "referencias",
  "colecoes",
  "referencia_colecao",
  "books",
  "reading_sessions",
  "reading_goals",
  "lessons",
  "courses",
  "subjects",
  "lesson_goals",
  "channels",
] as const;

/*
 * Cópia de tudo num arquivo .json, baixado no aparelho.
 *
 * Até aqui não havia como tirar os dados do app: sem lixeira, com a limpeza
 * das 6h apagando de verdade, um clique errado ou um defeito virava perda
 * sem volta. O arquivo é o backup que o próprio dono guarda. Lê de 1000 em
 * 1000 porque esse é o teto de linhas por consulta do Supabase.
 */
function ExportarDados() {
  const supabase = React.useMemo(() => createClient(), []);
  const [ocupado, setOcupado] = React.useState(false);
  const [resultado, setResultado] = React.useState<
    { ok: true; linhas: number; falhas: string[] } | { ok: false; erro: string } | null
  >(null);

  const exportar = async () => {
    setOcupado(true);
    setResultado(null);
    try {
      const tabelas: Record<string, unknown[] | { erro: string }> = {};
      const falhas: string[] = [];
      let linhas = 0;
      for (const t of TABELAS) {
        const todas: unknown[] = [];
        let erro = "";
        for (let de = 0; ; de += 1000) {
          const { data, error } = await supabase
            .from(t)
            .select("*")
            .range(de, de + 999);
          if (error) {
            erro = error.message;
            break;
          }
          todas.push(...(data ?? []));
          if (!data || data.length < 1000) break;
        }
        if (erro) {
          tabelas[t] = { erro };
          falhas.push(t);
        } else {
          tabelas[t] = todas;
          linhas += todas.length;
        }
      }
      const hoje = new Date().toISOString().slice(0, 10);
      const arquivo = new Blob(
        [
          JSON.stringify(
            { app: "morning-brief", exportado_em: new Date().toISOString(), tabelas },
            null,
            2
          ),
        ],
        { type: "application/json" }
      );
      const url = URL.createObjectURL(arquivo);
      const a = document.createElement("a");
      a.href = url;
      a.download = `morning-brief-${hoje}.json`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      setTimeout(() => URL.revokeObjectURL(url), 1000);
      setResultado({ ok: true, linhas, falhas });
    } catch (e) {
      setResultado({ ok: false, erro: e instanceof Error ? e.message : String(e) });
    } finally {
      setOcupado(false);
    }
  };

  return (
    <Card>
      <Cabeca icon={<Download size={14} />} titulo="Seus dados" />
      <div className="px-[18px] pb-[18px] pt-3">
        <p className="text-[13px] text-fg-mute">
          Baixa uma cópia de tudo — contas, demandas, agenda, notas, livros,
          aulas — num arquivo .json. Guarde num lugar seguro: é o seu backup.
        </p>

        {resultado?.ok && (
          <p
            className={cx(
              "mt-3 rounded-[14px] px-3.5 py-3 text-xs font-medium",
              resultado.falhas.length ? "bg-warn/12 text-warn" : "bg-pos/12 text-pos"
            )}
          >
            {resultado.linhas.toLocaleString("pt-BR")} registros exportados.
            {resultado.falhas.length > 0 &&
              ` Não deu para ler: ${resultado.falhas.join(", ")}.`}
          </p>
        )}
        {resultado && !resultado.ok && (
          <p className="mt-3 rounded-[14px] bg-neg/12 px-3.5 py-3 text-xs font-medium text-neg">
            A exportação falhou: {resultado.erro}
          </p>
        )}

        <div className="mt-4">
          <Button onClick={exportar} disabled={ocupado}>
            <Download size={15} />
            {ocupado ? "Exportando..." : "Exportar tudo"}
          </Button>
        </div>
      </div>
    </Card>
  );
}

/* ------------------------------ peças ------------------------------ */

function Cabeca({ icon, titulo }: { icon: React.ReactNode; titulo: string }) {
  return (
    <div className="px-[18px] pt-[17px]">
      <span className="flex items-center gap-2 text-[11px] font-semibold uppercase tracking-[0.1em] text-fg-mute">
        {icon}
        {titulo}
      </span>
    </div>
  );
}

function Linha({
  rotulo,
  valor,
  icone,
}: {
  rotulo: string;
  valor: React.ReactNode;
  icone?: React.ReactNode;
}) {
  return (
    <div className="flex items-center justify-between gap-4 border-b border-line-soft py-2.5 last:border-0">
      <dt className="flex items-center gap-2 text-[12.5px] text-fg-mute">
        {icone}
        {rotulo}
      </dt>
      <dd className="min-w-0 truncate text-[12.5px] font-medium tnum">{valor}</dd>
    </div>
  );
}
