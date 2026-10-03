"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import {
  AlertTriangle,
  ArrowRight,
  CheckCircle2,
  Eye,
  EyeOff,
  Loader2,
} from "lucide-react";
import { createClient } from "@/lib/supabase/client";

/*
 * A tela que faltava no "Esqueci a senha".
 *
 * Antes o link do e-mail voltava para /login, e ali não existia lugar para
 * escrever a senha nova: quem esquecesse a senha ficava trancado fora. O link
 * agora chega aqui com `?code=` na URL; o cliente do Supabase troca esse
 * código por uma sessão de recuperação sozinho ao iniciar, e é com ela que o
 * `updateUser({ password })` funciona.
 *
 * `getSession()` espera essa troca terminar antes de responder, então ele é a
 * pergunta certa para saber se o link valeu: com sessão, mostra o formulário;
 * sem, o link expirou ou já foi usado e a saída é pedir outro.
 */

const campo =
  "h-12 w-full rounded-[14px] border border-line bg-ink-900 text-[15px] outline-none transition-colors focus:border-brand-500 focus-visible:ring-2 focus-visible:ring-brand-500/40";

type Estado = "verificando" | "pronto" | "sem-link" | "feito";

export default function NovaSenhaPage() {
  const router = useRouter();
  const supabase = React.useMemo(() => createClient(), []);
  const [estado, setEstado] = React.useState<Estado>("verificando");
  const [senha, setSenha] = React.useState("");
  const [repete, setRepete] = React.useState("");
  const [vendo, setVendo] = React.useState(false);
  const [ocupado, setOcupado] = React.useState(false);
  const [erro, setErro] = React.useState("");

  React.useEffect(() => {
    let vivo = true;
    const { data: sub } = supabase.auth.onAuthStateChange((evento, sessao) => {
      if (!vivo) return;
      if (evento === "PASSWORD_RECOVERY" || sessao) setEstado("pronto");
    });
    supabase.auth.getSession().then(({ data }) => {
      if (!vivo) return;
      setEstado((e) => (e === "verificando" ? (data.session ? "pronto" : "sem-link") : e));
    });
    return () => {
      vivo = false;
      sub.subscription.unsubscribe();
    };
  }, [supabase]);

  const salvar = async (e: React.FormEvent) => {
    e.preventDefault();
    setErro("");
    if (senha.length < 6) return setErro("A senha precisa ter no mínimo 6 caracteres.");
    if (senha !== repete) return setErro("As duas senhas não são iguais.");
    setOcupado(true);
    const { error } = await supabase.auth.updateUser({ password: senha });
    setOcupado(false);
    if (error) {
      setErro(
        error.message.includes("different from the old")
          ? "A senha nova precisa ser diferente da antiga."
          : error.message
      );
      return;
    }
    setEstado("feito");
    setTimeout(() => {
      router.replace("/");
      router.refresh();
    }, 1200);
  };

  return (
    <div className="flex min-h-dvh items-center justify-center p-4">
      <div className="w-full max-w-[420px] rounded-[24px] bg-ink-900 p-7 shadow-[var(--elev-4)] sm:p-9">
        <h1 className="text-[22px] font-bold tracking-[-0.03em]">Senha nova</h1>

        {estado === "verificando" && (
          <p className="mt-6 flex items-center gap-2 text-[13.5px] text-fg-mute">
            <Loader2 size={16} className="girar-lento" /> Conferindo o link…
          </p>
        )}

        {estado === "sem-link" && (
          <>
            <p className="mt-2 text-[13.5px] leading-relaxed text-fg-mute">
              Este link expirou ou já foi usado. Peça outro na tela de entrada,
              em <strong className="text-fg">Esqueci</strong>.
            </p>
            <button
              onClick={() => router.replace("/login")}
              className="mt-6 flex h-12 w-full items-center justify-center gap-2 rounded-[14px] bg-brand-500 text-[15px] font-bold text-on-brand transition-[filter] hover:brightness-95"
            >
              Ir para a entrada <ArrowRight size={17} />
            </button>
          </>
        )}

        {estado === "feito" && (
          <p className="mt-6 flex gap-2 rounded-[14px] bg-pos/12 p-3 text-[13px] font-medium text-pos">
            <CheckCircle2 size={16} className="mt-px shrink-0" />
            Senha trocada. Entrando…
          </p>
        )}

        {estado === "pronto" && (
          <form onSubmit={salvar} className="mt-6 flex flex-col gap-4">
            <p className="-mt-4 text-[13.5px] text-fg-mute">
              Escolha a senha que vai usar daqui para frente.
            </p>
            <label className="block">
              <span className="mb-1.5 block text-[12.5px] font-semibold text-fg-dim">
                Senha nova
              </span>
              <span className="relative block">
                <input
                  type={vendo ? "text" : "password"}
                  autoComplete="new-password"
                  required
                  minLength={6}
                  value={senha}
                  onChange={(e) => setSenha(e.target.value)}
                  className={`${campo} pl-4 pr-11`}
                />
                <button
                  type="button"
                  onClick={() => setVendo((v) => !v)}
                  aria-label={vendo ? "Ocultar senha" : "Mostrar senha"}
                  className="absolute right-2 top-1/2 grid h-9 w-9 -translate-y-1/2 place-items-center rounded-lg text-fg-mute transition-colors hover:text-fg-dim"
                >
                  {vendo ? <EyeOff size={17} /> : <Eye size={17} />}
                </button>
              </span>
              <span className="mt-1.5 block text-[11.5px] text-fg-mute">
                Mínimo 6 caracteres.
              </span>
            </label>
            <label className="block">
              <span className="mb-1.5 block text-[12.5px] font-semibold text-fg-dim">
                Repita a senha
              </span>
              <input
                type={vendo ? "text" : "password"}
                autoComplete="new-password"
                required
                minLength={6}
                value={repete}
                onChange={(e) => setRepete(e.target.value)}
                className={`${campo} px-4`}
              />
            </label>

            {erro && (
              <p className="flex gap-2 rounded-[14px] bg-neg/12 p-3 text-xs font-medium text-neg">
                <AlertTriangle size={14} className="mt-px shrink-0" />
                {erro}
              </p>
            )}

            <button
              type="submit"
              disabled={ocupado}
              className="mt-1 flex h-12 w-full items-center justify-center gap-2 rounded-[14px] bg-brand-500 text-[15px] font-bold text-on-brand transition-[filter] hover:brightness-95 disabled:opacity-45"
            >
              {ocupado ? <Loader2 size={17} className="girar-lento" /> : "Salvar senha"}
            </button>
          </form>
        )}
      </div>
    </div>
  );
}
