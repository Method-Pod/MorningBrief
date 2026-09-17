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
} from "lucide-react";
import { createClient } from "@/lib/supabase/client";

type Modo = "entrar" | "criar" | "recuperar";

const MENSAGENS: Record<string, string> = {
  "Invalid login credentials": "E-mail ou senha incorretos.",
  "Email not confirmed":
    "Confirme seu e-mail pelo link que enviamos antes de entrar.",
  "User already registered": "Esse e-mail já tem conta. Tente entrar.",
  "Password should be at least 6 characters":
    "A senha precisa ter no mínimo 6 caracteres.",
  "Signup requires a valid password": "Informe uma senha válida.",
  "Unable to validate email address: invalid format":
    "Formato de e-mail inválido.",
  "For security purposes, you can only request this after 60 seconds.":
    "Aguarde um minuto antes de tentar de novo.",
};

const traduz = (m: string) => MENSAGENS[m] ?? m;

const TEXTOS: Record<Modo, { titulo: string; sub: string; acao: string }> = {
  entrar: {
    titulo: "Bom te ver",
    sub: "Entre para ver o brief de hoje.",
    acao: "Entrar",
  },
  criar: {
    titulo: "Criar conta",
    sub: "Leva menos de um minuto.",
    acao: "Criar conta",
  },
  recuperar: {
    titulo: "Recuperar acesso",
    sub: "Enviamos um link para você definir uma senha nova.",
    acao: "Enviar link",
  },
};

const campo =
  "h-12 w-full rounded-[14px] border border-line bg-ink-900 text-[15px] outline-none transition-colors focus:border-brand-500";

function Formulario() {
  const router = useRouter();
  const params = useSearchParams();
  const proximo = params.get("next") || "/";

  const configurado =
    !!process.env.NEXT_PUBLIC_SUPABASE_URL &&
    !!process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  const [modo, setModo] = React.useState<Modo>("entrar");
  const [email, setEmail] = React.useState("");
  const [senha, setSenha] = React.useState("");
  const [vendo, setVendo] = React.useState(false);
  const [ocupado, setOcupado] = React.useState(false);
  const [erro, setErro] = React.useState("");
  const [ok, setOk] = React.useState("");

  const trocaModo = (m: Modo) => {
    setModo(m);
    setErro("");
    setOk("");
  };

  const enviar = async (e: React.FormEvent) => {
    e.preventDefault();
    setErro("");
    setOk("");
    setOcupado(true);
    const supabase = createClient();

    try {
      if (modo === "entrar") {
        const { error } = await supabase.auth.signInWithPassword({
          email: email.trim(),
          password: senha,
        });
        if (error) throw error;
        router.replace(proximo);
        router.refresh();
        return;
      }

      if (modo === "criar") {
        const { data, error } = await supabase.auth.signUp({
          email: email.trim(),
          password: senha,
        });
        if (error) throw error;
        if (data.session) {
          router.replace(proximo);
          router.refresh();
          return;
        }
        setOk(
          "Conta criada. Confirme pelo link que enviamos ao seu e-mail para entrar."
        );
        setModo("entrar");
      }

      if (modo === "recuperar") {
        const { error } = await supabase.auth.resetPasswordForEmail(
          email.trim(),
          { redirectTo: `${window.location.origin}/login` }
        );
        if (error) throw error;
        setOk("Link enviado. Confira sua caixa de entrada.");
      }
    } catch (err) {
      setErro(traduz(err instanceof Error ? err.message : String(err)));
    } finally {
      setOcupado(false);
    }
  };

  const t = TEXTOS[modo];

  return (
    <div className="flex min-h-dvh items-center justify-center p-3 sm:p-6">
      <div className="w-full max-w-[1040px] rounded-[24px] bg-ink-900 p-3 shadow-[var(--elev-4)] sm:rounded-[28px] sm:p-4">
        <div className="grid items-stretch gap-4 lg:grid-cols-2">
          {/* ---------------- painel de marca ---------------- */}
          {/*
            O painel É a cor escolhida, e nao um quase-preto ao lado dela.

            Era um bloco #16191b: sobre o cartao branco isso e o contraste da
            tela, e funcionava. Sobre o cartao ESCURO virou um cinza a dois
            passos do fundo — sem separacao, sem hierarquia, e com a aurora do
            accent lavada por cima. Sendo a cor, ele se distingue nos dois
            temas pelo mesmo motivo: e o unico bloco saturado da tela.

            Os dois tons do degrade vem por accent, afundados ate o branco
            alcancar 4,6:1 no tom mais claro. Ver `--painel-1` em globals.css.

            No telefone ele vira uma faixa em cima do formulario em vez de
            sumir: era a unica peca que dava identidade a tela.
          */}
          <aside
            className="relative flex flex-col overflow-hidden rounded-[20px] p-6 text-white sm:p-7 lg:min-h-[520px] lg:p-9"
            style={{
              background:
                "linear-gradient(155deg, var(--painel-1) 0%, var(--painel-2) 100%)",
            }}
          >
            {/*
              Duas luzes, e nao uma textura.

              A de cima da volume ao canto onde a marca fica; a de baixo levanta
              o chao atras dos cartoes. Sao o mesmo branco em opacidade baixa,
              entao acompanham a cor sem precisar de valor proprio por accent.
            */}
            <div
              aria-hidden
              className="pointer-events-none absolute inset-0"
              style={{
                background:
                  "radial-gradient(90% 60% at 12% 0%, rgb(255 255 255 / 0.22) 0%, transparent 62%), radial-gradient(70% 50% at 100% 100%, rgb(255 255 255 / 0.13) 0%, transparent 60%)",
              }}
            />

            <div className="relative flex items-center gap-2">
              <span className="grid h-7 w-7 place-items-center rounded-[9px] bg-white/15 text-[13px] font-black">
                m
              </span>
              <p className="text-[17px] font-bold tracking-[-0.035em]">
                morning<span className="font-normal text-white/60">brief</span>
              </p>
            </div>

            <div className="relative mt-8 lg:mt-auto lg:pt-10">
              {/* A pastilha e o que da um comeco a coluna antes da manchete —
                  sem ela o titulo nasce colado no topo da area vazia. */}
              <span className="inline-flex items-center gap-1.5 rounded-full bg-white/15 px-3 py-1 text-[11.5px] font-semibold">
                Bom dia ☕
              </span>
              <h2 className="mt-3.5 text-[26px] font-bold leading-[1.1] tracking-[-0.035em] sm:text-[30px] lg:text-[34px]">
                Tudo que importa
                <br />
                antes do primeiro café.
              </h2>
              <p className="mt-3 max-w-[340px] text-[13.5px] leading-relaxed text-white/75">
                Demandas, contas a pagar, hábitos, anotações e agenda numa só
                tela.
              </p>
            </div>

            {/*
              As tres pecas, no pe.

              Elas resolvem o vazio que sobrava embaixo da manchete e, de
              quebra, dizem o que o app faz antes de alguem entrar. Somem no
              telefone: ali o painel e uma faixa de identidade, e tres cartoes
              empurrariam o formulario para fora da tela.
            */}
            <ul className="relative mt-7 hidden gap-2.5 sm:grid sm:grid-cols-3 lg:mt-9">
              {[
                ["1", "Demandas", "e recorrências"],
                ["2", "Contas", "e cartões"],
                ["3", "Hábitos", "notas e agenda"],
              ].map(([n, titulo, sub]) => (
                <li
                  key={n}
                  className="rounded-[14px] border border-white/15 bg-white/10 p-3"
                >
                  <span className="grid h-5 w-5 place-items-center rounded-full bg-white/25 text-[10.5px] font-bold">
                    {n}
                  </span>
                  <p className="mt-2 text-[12.5px] font-bold leading-tight">
                    {titulo}
                  </p>
                  <p className="text-[11px] leading-tight text-white/70">{sub}</p>
                </li>
              ))}
            </ul>
          </aside>

          {/* ---------------- formulário ---------------- */}
          <div className="flex flex-col justify-center px-2 py-7 sm:px-8 sm:py-10 lg:px-10">
            {/* Menor que a manchete do painel, de proposito: aquela e a voz
                do produto, esta e o rotulo da acao. Iguais, as duas brigavam —
                e no telefone elas ficam uma embaixo da outra. */}
            <h1 className="text-[21px] font-bold tracking-[-0.03em] sm:text-[23px]">
              {t.titulo}
            </h1>
            <p className="mt-1 text-[13.5px] text-fg-mute">{t.sub}</p>

            {!configurado && (
              <div className="mt-5 flex gap-2.5 rounded-[14px] bg-warn/12 p-3.5 text-xs leading-relaxed text-warn">
                <AlertTriangle size={15} className="mt-0.5 shrink-0" />
                <span>
                  <strong className="font-bold">
                    Supabase não configurado.
                  </strong>{" "}
                  Defina as variáveis de ambiente e faça um novo deploy.
                </span>
              </div>
            )}

            <div className="my-5 h-px bg-line-soft sm:my-6" />

            <form onSubmit={enviar} className="flex flex-col gap-4">
              <label className="block">
                <span className="mb-1.5 block text-[12.5px] font-semibold text-fg-dim">
                  Seu e-mail
                </span>
                <input
                  type="email"
                  autoComplete="email"
                  required
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="voce@empresa.com"
                  className={`${campo} px-4`}
                />
              </label>

              {modo !== "recuperar" && (
                <label className="block">
                  <span className="mb-1.5 flex items-baseline justify-between">
                    <span className="text-[12.5px] font-semibold text-fg-dim">
                      {modo === "criar" ? "Crie uma senha" : "Sua senha"}
                    </span>
                    {modo === "entrar" && (
                      <button
                        type="button"
                        onClick={() => trocaModo("recuperar")}
                        className="text-[12px] font-semibold text-brand-400 hover:underline"
                      >
                        Esqueci
                      </button>
                    )}
                  </span>
                  <span className="relative block">
                    <input
                      type={vendo ? "text" : "password"}
                      autoComplete={
                        modo === "criar" ? "new-password" : "current-password"
                      }
                      required
                      minLength={6}
                      value={senha}
                      onChange={(e) => setSenha(e.target.value)}
                      placeholder="••••••••"
                      className={`${campo} pl-4 pr-11`}
                    />
                    <button
                      type="button"
                      onClick={() => setVendo((v) => !v)}
                      aria-label={vendo ? "Ocultar senha" : "Mostrar senha"}
                      className="absolute right-3 top-1/2 -translate-y-1/2 rounded-lg p-1 text-fg-mute transition-colors hover:text-fg-dim"
                    >
                      {vendo ? <EyeOff size={17} /> : <Eye size={17} />}
                    </button>
                  </span>
                  {modo === "criar" && (
                    <span className="mt-1.5 block text-[11.5px] text-fg-mute">
                      Mínimo 6 caracteres.
                    </span>
                  )}
                </label>
              )}

              {erro && (
                <p className="flex gap-2 rounded-[14px] bg-neg/12 p-3 text-xs font-medium text-neg">
                  <AlertTriangle size={14} className="mt-px shrink-0" />
                  {erro}
                </p>
              )}
              {ok && (
                <p className="flex gap-2 rounded-[14px] bg-pos/12 p-3 text-xs font-medium text-pos">
                  <CheckCircle2 size={14} className="mt-px shrink-0" />
                  {ok}
                </p>
              )}

              <button
                type="submit"
                disabled={ocupado || !configurado}
                className="mt-1 flex h-12 w-full items-center justify-center gap-2 rounded-[14px] bg-brand-500 shadow-[var(--brilho-largo)] text-[15px] font-bold text-on-brand transition-[filter] hover:brightness-95 disabled:opacity-45"
              >
                {ocupado ? (
                  <Loader2 size={17} className="girar-lento" />
                ) : (
                  <>
                    {t.acao}
                    <ArrowRight size={17} />
                  </>
                )}
              </button>
            </form>

            <p className="mt-7 text-center text-[13px] text-fg-mute">
              {modo === "entrar" ? (
                <>
                  Não tem conta?{" "}
                  <button
                    onClick={() => trocaModo("criar")}
                    className="font-bold text-fg underline"
                  >
                    Criar agora
                  </button>
                </>
              ) : (
                <>
                  Já tem conta?{" "}
                  <button
                    onClick={() => trocaModo("entrar")}
                    className="font-bold text-fg underline"
                  >
                    Entrar
                  </button>
                </>
              )}
            </p>
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
          <Loader2 className="girar-lento text-brand-400" />
        </div>
      }
    >
      <Formulario />
    </React.Suspense>
  );
}
