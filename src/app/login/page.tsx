"use client";

import * as React from "react";
import { useRouter, useSearchParams } from "next/navigation";
import {
  AlertTriangle,
  ArrowRight,
  CheckCircle2,
  Eye,
  EyeOff,
  Loader2,
  Lock,
  Mail,
  Sunrise,
} from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { Button, Input } from "@/components/ui";

type Mode = "signin" | "signup" | "reset";

const MESSAGES: Record<string, string> = {
  "Invalid login credentials": "E-mail ou senha incorretos.",
  "Email not confirmed":
    "Confirme seu e-mail pelo link que enviamos antes de entrar.",
  "User already registered": "Esse e-mail já tem conta. Tente entrar.",
  "Password should be at least 6 characters":
    "A senha precisa ter no mínimo 6 caracteres.",
  "Signup requires a valid password": "Informe uma senha válida.",
  "Unable to validate email address: invalid format":
    "Formato de e-mail inválido.",
};

const translate = (m: string) => MESSAGES[m] ?? m;

function LoginForm() {
  const router = useRouter();
  const params = useSearchParams();
  const next = params.get("next") || "/";

  const configured =
    !!process.env.NEXT_PUBLIC_SUPABASE_URL &&
    !!process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  const [mode, setMode] = React.useState<Mode>("signin");
  const [email, setEmail] = React.useState("");
  const [password, setPassword] = React.useState("");
  const [show, setShow] = React.useState(false);
  const [busy, setBusy] = React.useState(false);
  const [error, setError] = React.useState("");
  const [ok, setOk] = React.useState("");

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    setOk("");
    setBusy(true);
    const supabase = createClient();

    try {
      if (mode === "signin") {
        const { error } = await supabase.auth.signInWithPassword({
          email: email.trim(),
          password,
        });
        if (error) throw error;
        router.replace(next);
        router.refresh();
        return;
      }

      if (mode === "signup") {
        const { data, error } = await supabase.auth.signUp({
          email: email.trim(),
          password,
        });
        if (error) throw error;
        if (data.session) {
          router.replace(next);
          router.refresh();
          return;
        }
        setOk(
          "Conta criada. Verifique seu e-mail e clique no link de confirmação para entrar."
        );
        setMode("signin");
      }

      if (mode === "reset") {
        const { error } = await supabase.auth.resetPasswordForEmail(
          email.trim(),
          { redirectTo: `${window.location.origin}/login` }
        );
        if (error) throw error;
        setOk("Enviamos um link de redefinição para o seu e-mail.");
      }
    } catch (err) {
      setError(translate(err instanceof Error ? err.message : String(err)));
    } finally {
      setBusy(false);
    }
  };

  const titles: Record<Mode, { h: string; s: string; cta: string }> = {
    signin: {
      h: "Bem-vindo de volta",
      s: "Entre para ver seu brief de hoje.",
      cta: "Entrar",
    },
    signup: {
      h: "Criar sua conta",
      s: "Leva 20 segundos. Seus dados ficam só com você.",
      cta: "Criar conta",
    },
    reset: {
      h: "Redefinir senha",
      s: "Enviamos um link para o seu e-mail.",
      cta: "Enviar link",
    },
  };
  const t = titles[mode];

  return (
    <div className="flex min-h-dvh items-center justify-center p-4 sm:p-6">
      <div className="w-full max-w-[880px] overflow-hidden rounded-[26px] bg-white shadow-[0_24px_70px_-24px_rgb(20_24_26/0.22)] rise">
        <div className="grid lg:grid-cols-[1.05fr_1fr]">
          {/* ---------- painel esquerdo ---------- */}
          <div className="relative hidden flex-col justify-between bg-brand-500/[0.07] p-9 lg:flex">

            <div className="relative">
              <div className="flex items-center gap-2.5">
                <div className="grid h-9 w-9 place-items-center rounded-xl bg-brand-500 text-on-brand">
                  <Sunrise size={19} />
                </div>
                <span className="text-base font-semibold tracking-tight">
                  Morning<span className="text-brand-400">Brief</span>
                </span>
              </div>
              <h1 className="mt-10 text-[28px] font-semibold leading-[1.15] tracking-tight">
                Tudo que importa
                <br />
                antes do primeiro café.
              </h1>
              <p className="mt-3 max-w-[300px] text-sm leading-relaxed text-fg-dim">
                Contas a pagar, demandas do dia, recorrências e agenda em uma
                única tela.
              </p>
            </div>

            <ul className="relative mt-10 space-y-2.5">
              {[
                "Contas a pagar com vencimento e status",
                "Demandas em kanban com prioridade",
                "Recorrentes que geram tarefas sozinhas",
                "Anotações fixáveis e calendário mensal",
              ].map((f) => (
                <li key={f} className="flex items-start gap-2.5 text-[13px] text-fg-dim">
                  <CheckCircle2
                    size={15}
                    className="mt-0.5 shrink-0 text-brand-400"
                  />
                  {f}
                </li>
              ))}
            </ul>
          </div>

          {/* ---------- formulário ---------- */}
          <div className="p-7 sm:p-9">
            <div className="mb-7 flex items-center gap-2.5 lg:hidden">
              <div className="grid h-9 w-9 place-items-center rounded-xl bg-brand-500 text-on-brand">
                <Sunrise size={19} />
              </div>
              <span className="text-base font-semibold tracking-tight">
                Morning<span className="text-brand-400">Brief</span>
              </span>
            </div>

            <h2 className="text-xl font-semibold tracking-tight">{t.h}</h2>
            <p className="mt-1 text-sm text-fg-mute">{t.s}</p>

            {!configured && (
              <div className="mt-5 flex gap-2.5 rounded-xl border border-warn/30 bg-warn/10 p-3.5 text-xs leading-relaxed text-warn">
                <AlertTriangle size={15} className="mt-0.5 shrink-0" />
                <div>
                  <strong className="font-semibold">Supabase não configurado.</strong>
                  <br />
                  Defina <code>NEXT_PUBLIC_SUPABASE_URL</code> e{" "}
                  <code>NEXT_PUBLIC_SUPABASE_ANON_KEY</code> nas variáveis de
                  ambiente e faça um novo deploy.
                </div>
              </div>
            )}

            <form onSubmit={submit} className="mt-6 space-y-4">
              <div>
                <label
                  htmlFor="email"
                  className="mb-1.5 block text-[11px] font-medium uppercase tracking-wider text-fg-mute"
                >
                  E-mail
                </label>
                <div className="relative">
                  <Mail
                    size={15}
                    className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-fg-mute"
                  />
                  <Input
                    id="email"
                    type="email"
                    autoComplete="email"
                    required
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    placeholder="voce@empresa.com"
                    className="pl-10"
                  />
                </div>
              </div>

              {mode !== "reset" && (
                <div>
                  <div className="mb-1.5 flex items-baseline justify-between">
                    <label
                      htmlFor="password"
                      className="text-[11px] font-medium uppercase tracking-wider text-fg-mute"
                    >
                      Senha
                    </label>
                    {mode === "signin" && (
                      <button
                        type="button"
                        onClick={() => {
                          setMode("reset");
                          setError("");
                          setOk("");
                        }}
                        className="text-[11px] text-brand-400 hover:text-brand-500"
                      >
                        Esqueci a senha
                      </button>
                    )}
                  </div>
                  <div className="relative">
                    <Lock
                      size={15}
                      className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-fg-mute"
                    />
                    <Input
                      id="password"
                      type={show ? "text" : "password"}
                      autoComplete={
                        mode === "signup" ? "new-password" : "current-password"
                      }
                      required
                      minLength={6}
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                      placeholder="••••••••"
                      className="pl-10 pr-10"
                    />
                    <button
                      type="button"
                      onClick={() => setShow((v) => !v)}
                      aria-label={show ? "Ocultar senha" : "Mostrar senha"}
                      className="absolute right-3 top-1/2 -translate-y-1/2 text-fg-mute transition-colors hover:text-fg-dim"
                    >
                      {show ? <EyeOff size={15} /> : <Eye size={15} />}
                    </button>
                  </div>
                  {mode === "signup" && (
                    <p className="mt-1.5 text-[11px] text-fg-mute">
                      Mínimo 6 caracteres.
                    </p>
                  )}
                </div>
              )}

              {error && (
                <div className="flex gap-2 rounded-xl border border-neg/30 bg-neg/10 p-3 text-xs text-neg">
                  <AlertTriangle size={14} className="mt-0.5 shrink-0" />
                  {error}
                </div>
              )}
              {ok && (
                <div className="flex gap-2 rounded-xl border border-pos/30 bg-pos/10 p-3 text-xs text-pos">
                  <CheckCircle2 size={14} className="mt-0.5 shrink-0" />
                  {ok}
                </div>
              )}

              <Button
                type="submit"
                variant="primary"
                disabled={busy || !configured}
                className="w-full"
              >
                {busy ? (
                  <Loader2 size={15} className="animate-spin" />
                ) : (
                  <>
                    {t.cta}
                    <ArrowRight size={15} />
                  </>
                )}
              </Button>
            </form>

            <div className="mt-6 border-t border-line-soft pt-5 text-center text-xs text-fg-mute">
              {mode === "signin" ? (
                <>
                  Não tem conta?{" "}
                  <button
                    onClick={() => {
                      setMode("signup");
                      setError("");
                      setOk("");
                    }}
                    className="font-medium text-brand-400 hover:text-brand-500"
                  >
                    Criar agora
                  </button>
                </>
              ) : (
                <>
                  Já tem conta?{" "}
                  <button
                    onClick={() => {
                      setMode("signin");
                      setError("");
                      setOk("");
                    }}
                    className="font-medium text-brand-400 hover:text-brand-500"
                  >
                    Entrar
                  </button>
                </>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

export default function LoginPage() {
  return (
    <React.Suspense
      fallback={
        <div className="grid min-h-dvh place-items-center">
          <Loader2 className="animate-spin text-brand-400" />
        </div>
      }
    >
      <LoginForm />
    </React.Suspense>
  );
}
