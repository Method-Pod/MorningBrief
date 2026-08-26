"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import * as React from "react";
import {
  CalendarDays,
  ChevronRight,
  ListChecks,
  Repeat2,
  LayoutDashboard,
  LogOut,
  Menu,
  StickyNote,
  Wallet,
  X,
} from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { ACCENTS, useAccent } from "./accent";
import { Iniciais, useAvatar } from "./Avatar";
import { IdentityProvider } from "./identity";
import { cx } from "./ui";

/*
 * Recorrentes saiu da navegação lateral: a regra agora é criada pela caixa
 * "Demanda recorrente" dentro de Nova demanda. A rota /recorrentes continua
 * existindo para pausar, editar e excluir — chega-se a ela pelo card do Início
 * e pelo aviso de demanda gerada.
 */
const NAV = [
  { href: "/", label: "Início", icon: LayoutDashboard },
  { href: "/demandas", label: "Demandas", icon: ListChecks },
  { href: "/habitos", label: "Hábitos", icon: Repeat2 },
  { href: "/contas", label: "Contas a pagar", icon: Wallet },
  { href: "/anotacoes", label: "Anotações", icon: StickyNote },
  { href: "/calendario", label: "Calendário", icon: CalendarDays },
];

function CaixaTema() {
  const { accent, setAccent } = useAccent();
  /* Fechada por padrão: a cor se troca raramente, não precisa ocupar a
     barra lateral o tempo todo. Fechada, ainda mostra qual está ativa. */
  const [aberta, setAberta] = React.useState(false);
  const atual = ACCENTS.find((a) => a.key === accent) ?? ACCENTS[1];

  return (
    <section className="overflow-hidden rounded-[16px] bg-ink-800">
      <button
        onClick={() => setAberta((v) => !v)}
        aria-expanded={aberta}
        className="flex w-full items-center gap-2 px-3.5 py-3 text-left transition-colors hover:bg-black/[0.03]"
      >
        <span className="flex-1 text-[10px] font-bold uppercase tracking-[0.1em] text-fg-mute">
          Tema
        </span>
        {!aberta && (
          <span
            className="h-4 w-4 shrink-0 rounded-full ring-1 ring-black/10"
            style={{ background: atual.hex }}
            title={atual.name}
          />
        )}
        <ChevronRight
          size={13}
          className={cx(
            "shrink-0 text-fg-mute transition-transform",
            aberta && "rotate-90"
          )}
        />
      </button>

      {aberta && (
        <div className="px-3.5 pb-3.5">
          <p className="mb-2.5 text-[11.5px] text-fg-dim">Cor principal</p>
          <div className="flex gap-2">
            {ACCENTS.map((a) => (
              <button
                key={a.key}
                onClick={() => setAccent(a.key)}
                title={a.name}
                aria-label={`Cor ${a.name}`}
                aria-pressed={accent === a.key}
                style={{ background: a.hex }}
                className={cx(
                  "h-6 w-6 rounded-full transition-transform hover:scale-110",
                  accent === a.key &&
                    "ring-2 ring-fg-dim ring-offset-2 ring-offset-ink-800"
                )}
              />
            ))}
          </div>
        </div>
      )}
    </section>
  );
}

function CaixaConta({
  email,
  onSair,
  ativo,
}: {
  email: string;
  onSair: () => void;
  ativo: boolean;
}) {
  const nome = email.split("@")[0] || "você";
  const { url: foto } = useAvatar();

  return (
    <section
      className={cx(
        "rounded-[16px] p-3.5 transition-colors",
        ativo ? "bg-brand-500/12" : "bg-ink-800"
      )}
    >
      <p className="mb-2.5 text-[10px] font-bold uppercase tracking-[0.1em] text-fg-mute">
        Conta
      </p>
      <Link
        href="/conta"
        className="flex items-center gap-2.5 rounded-[12px] transition-opacity hover:opacity-80"
      >
        <Iniciais nome={nome} url={foto} tamanho={32} />
        <span className="min-w-0 flex-1">
          <span
            className={cx(
              "block truncate text-[12.5px] font-semibold",
              ativo ? "text-brand-400" : "text-fg"
            )}
          >
            {nome}
          </span>
          <span className="block truncate text-[10.5px] text-fg-mute">
            {email}
          </span>
        </span>
        <ChevronRight size={14} className="shrink-0 text-fg-mute" />
      </Link>
      <button
        onClick={onSair}
        className="mt-2.5 flex w-full items-center justify-center gap-2 rounded-[12px] bg-white py-2 text-[11.5px] font-semibold text-fg-mute shadow-[0_1px_2px_rgb(20_24_26/0.05)] transition-colors hover:text-neg"
      >
        <LogOut size={13} />
        Sair
      </button>
    </section>
  );
}

export function Shell({
  email,
  nome,
  children,
}: {
  email: string;
  nome: string;
  children: React.ReactNode;
}) {
  const path = usePathname();
  const router = useRouter();
  const [open, setOpen] = React.useState(false);

  React.useEffect(() => setOpen(false), [path]);

  const signOut = async () => {
    await createClient().auth.signOut();
    router.replace("/login");
    router.refresh();
  };

  const wordmark = (
    <Link
      href="/"
      className="block px-2.5 text-[21px] font-bold tracking-[-0.035em] text-fg"
    >
      morning<span className="font-normal text-fg-mute">brief</span>
    </Link>
  );

  const nav = (
    <nav className="flex flex-col gap-[3px] px-2.5">
      {NAV.map(({ href, label, icon: Icon }) => {
        const active = href === "/" ? path === "/" : path.startsWith(href);
        return (
          <Link
            key={href}
            href={href}
            className={cx(
              "flex items-center gap-3 rounded-[14px] px-3 py-2.5 text-sm font-medium transition-colors duration-150",
              active
                ? "bg-brand-500 text-on-brand"
                : "text-fg-dim hover:bg-ink-800 hover:text-fg"
            )}
          >
            <Icon size={17} className={active ? "" : "opacity-80"} />
            <span className="truncate">{label}</span>
          </Link>
        );
      })}
    </nav>
  );

  const rodape = (
    <div className="mt-auto flex flex-col gap-2.5 px-2.5 pt-4">
      <CaixaTema />
      <CaixaConta
        email={email}
        onSair={signOut}
        ativo={path.startsWith("/conta")}
      />
    </div>
  );

  return (
    <div className="flex min-h-dvh">
      {/* -------- barra lateral, desktop -------- */}
      {/*
        sticky em vez de fixed: o aside continua no fluxo, então mantém a
        largura na grade flex sem precisar de margem compensatória no <main>.
        h-dvh dá altura definida para o mt-auto do rodapé funcionar, e o
        overflow-y-auto salva a barra em tela baixa, onde nav + tema + conta
        passam da altura da janela.
      */}
      <aside className="camada-fixa sticky top-0 hidden h-dvh w-[224px] shrink-0 flex-col overflow-y-auto bg-white pt-6 pb-5 lg:flex">
        <div className="mb-6">{wordmark}</div>
        {nav}
        {rodape}
      </aside>

      {/* -------- gaveta, mobile -------- */}
      {open && (
        <div className="fixed inset-0 z-50 lg:hidden">
          <div
            className="absolute inset-0 bg-fg/35 fade"
            onClick={() => setOpen(false)}
          />
          <aside className="relative flex h-full w-[262px] flex-col overflow-y-auto bg-white pt-6 pb-5 rise">
            <div className="mb-6 flex items-center justify-between pr-3">
              {wordmark}
              <button
                onClick={() => setOpen(false)}
                aria-label="Fechar menu"
                className="grid h-7 w-7 place-items-center rounded-[10px] text-fg-mute hover:bg-ink-800 hover:text-fg"
              >
                <X size={17} />
              </button>
            </div>
            {nav}
            {rodape}
          </aside>
        </div>
      )}

      {/* -------- conteúdo -------- */}
      <main className="min-w-0 flex-1 px-5 pb-14 pt-6 sm:px-8 sm:pt-8 lg:px-8">
        <div className="mb-5 flex items-center gap-3 lg:hidden">
          <button
            onClick={() => setOpen(true)}
            aria-label="Abrir menu"
            className="grid h-[38px] w-[38px] place-items-center rounded-[14px] bg-white text-fg-dim shadow-[0_1px_2px_rgb(20_24_26/0.05)]"
          >
            <Menu size={17} />
          </button>
          <span className="text-[18px] font-bold tracking-[-0.035em]">
            morning<span className="font-normal text-fg-mute">brief</span>
          </span>
        </div>
        <IdentityProvider value={{ email, nome }}>{children}</IdentityProvider>
      </main>
    </div>
  );
}
