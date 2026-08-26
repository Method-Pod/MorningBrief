"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import {
  AlertTriangle,
  Check,
  KeyRound,
  LogOut,
  Mail,
  Palette,
  ShieldCheck,
  User,
} from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { dateTimeBR } from "@/lib/format";
import { ACCENTS, useAccent } from "@/components/accent";
import { Button, Card, Skeleton, cx } from "@/components/ui";

type Perfil = {
  email: string;
  id: string;
  confirmado: boolean;
  criadoEm: string | null;
  ultimoAcesso: string | null;
};

export default function ContaPage() {
  const supabase = React.useMemo(() => createClient(), []);
  const router = useRouter();
  const [perfil, setPerfil] = React.useState<Perfil | null>(null);
  const [enviando, setEnviando] = React.useState(false);
  const [aviso, setAviso] = React.useState("");
  const [erro, setErro] = React.useState("");
  const { accent, setAccent } = useAccent();

  React.useEffect(() => {
    (async () => {
      const { data } = await supabase.auth.getUser();
      const u = data.user;
      if (!u) return;
      setPerfil({
        email: u.email ?? "",
        id: u.id,
        confirmado: !!u.email_confirmed_at,
        criadoEm: u.created_at ?? null,
        ultimoAcesso: u.last_sign_in_at ?? null,
      });
    })();
  }, [supabase]);

  /*
   * Troca de senha por link no e-mail, não por campo aqui.
   * A senha nova nunca passa por esta tela: o Supabase manda o link e a
   * pessoa define no fluxo dele.
   */
  const trocarSenha = async () => {
    if (!perfil?.email) return;
    setErro("");
    setAviso("");
    setEnviando(true);
    const { error } = await supabase.auth.resetPasswordForEmail(perfil.email, {
      redirectTo: `${window.location.origin}/login`,
    });
    setEnviando(false);
    if (error) return setErro(error.message);
    setAviso(`Link enviado para ${perfil.email}. Confira a caixa de entrada.`);
  };

  const sair = async () => {
    await supabase.auth.signOut();
    router.replace("/login");
    router.refresh();
  };

  if (!perfil)
    return (
      <div className="space-y-4">
        <Skeleton className="h-10 w-48" />
        <Skeleton className="h-[220px] rounded-[22px]" />
        <Skeleton className="h-[180px] rounded-[22px]" />
      </div>
    );

  const nome = perfil.email.split("@")[0] || "você";
  const iniciais = nome.slice(0, 2).toUpperCase();

  return (
    <div className="rise max-w-[760px]">
      <div className="mb-5">
        <h1 className="text-[26px] font-bold tracking-[-0.03em]">Conta</h1>
        <p className="mt-1 text-sm text-fg-mute">
          Seus dados de acesso e a aparência do app.
        </p>
      </div>

      <div className="flex flex-col gap-4">
        {/* ------------------------------ perfil ------------------------------ */}
        <Card>
          <Cabeca icon={<User size={14} />} titulo="Perfil" />
          <div className="px-[18px] pb-[18px] pt-3">
            <div className="flex items-center gap-3.5">
              <div className="grid h-12 w-12 shrink-0 place-items-center rounded-full bg-brand-500 text-sm font-bold text-on-brand">
                {iniciais}
              </div>
              <div className="min-w-0">
                <p className="truncate text-[15px] font-semibold">{nome}</p>
                <p className="truncate text-[13px] text-fg-mute">{perfil.email}</p>
              </div>
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

        {/* ------------------------------ tema ------------------------------ */}
        <Card>
          <Cabeca icon={<Palette size={14} />} titulo="Tema" />
          <div className="px-[18px] pb-[18px] pt-3">
            <p className="text-[13px] text-fg-mute">
              A cor escolhida fica salva neste navegador.
            </p>
            <div className="mt-3.5 flex flex-wrap gap-2.5">
              {ACCENTS.map((a) => (
                <button
                  key={a.key}
                  onClick={() => setAccent(a.key)}
                  aria-pressed={accent === a.key}
                  className={cx(
                    "flex items-center gap-2.5 rounded-[14px] px-3 py-2.5 text-[13px] font-medium transition-all",
                    accent === a.key
                      ? "bg-brand-500/12 text-brand-400"
                      : "bg-ink-800 text-fg-dim hover:text-fg"
                  )}
                >
                  <span
                    className="h-4 w-4 rounded-full"
                    style={{ background: a.hex }}
                  />
                  {a.name}
                  {accent === a.key && <Check size={14} />}
                </button>
              ))}
            </div>
          </div>
        </Card>

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
