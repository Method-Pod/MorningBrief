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
            Marca em cima, frase embaixo, e nada entre as duas.

            O painel E a cor escolhida: era um quase-preto, o que funcionava
            sobre o cartao branco — ali ele era o contraste da tela — e virava
            um cinza a dois passos do fundo no tema escuro, sem separacao
            nenhuma. Sendo a cor, ele se distingue nos dois temas pelo mesmo
            motivo: e o unico bloco saturado da pagina.

            Os dois tons do degrade vem por accent, afundados ate o branco
            alcancar 4,6:1 no tom mais claro. Ver `--painel-1` em globals.css.

            O que houve aqui antes e o que nao pode voltar: pastilha de saudacao,
            tres cartoes numerados e um quadradinho com a inicial. Cada peca
            dessas e um movimento de pagina de produto, e juntas elas afogaram a
            unica coisa que o painel tem para dizer. O vazio entre a marca e a
            frase nao e espaco sobrando — e o que faz a frase ser lida.

            No telefone ele vira uma faixa em cima do formulario em vez de
            sumir: era a unica peca que dava identidade a tela.
          */}
          <aside
            className="relative flex flex-col overflow-hidden rounded-[20px] p-7 text-white sm:p-8 lg:min-h-[500px] lg:p-10"
            style={{
              background:
                "linear-gradient(155deg, var(--painel-1) 0%, var(--painel-2) 100%)",
            }}
          >
            {/* Uma luz so, no canto de cima. Duas ja seria textura, e textura
                aqui e enfeite: o degrade sozinho ja da a profundidade. */}
            <div
              aria-hidden
              className="pointer-events-none absolute inset-0"
              style={{
                background:
                  "radial-gradient(85% 55% at 15% -5%, rgb(255 255 255 / 0.20) 0%, transparent 60%)",
              }}
            />

            <p className="relative text-[17px] font-bold tracking-[-0.035em] lg:text-[18px]">
              morning<span className="font-normal text-white/60">brief</span>
            </p>

            {/* `mt-auto` empurra a frase para o pe: e ela que fecha o bloco, e
                a distancia ate a marca e o que da peso a ela. No telefone a
                folga e menor, senao a faixa empurraria o formulario para fora
                da tela. */}
            <div className="relative mt-14 lg:mt-auto">
              <h2 className="text-[24px] font-bold leading-[1.1] tracking-[-0.04em] sm:text-[31px] lg:text-[35px]">
                Tudo que importa
                <br />
                antes do primeiro café.
              </h2>
              <p className="mt-3.5 max-w-[320px] text-[13.5px] leading-relaxed text-white/70">
                Demandas, contas a pagar, hábitos, anotações e agenda numa só
                tela.
              </p>
            </div>
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
