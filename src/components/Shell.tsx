"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import * as React from "react";
import {
  CalendarDays,
  ListChecks,
  LayoutDashboard,
  LogOut,
  Menu,
  Repeat2,
  StickyNote,
  Wallet,
  X,
} from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { cx } from "./ui";

const NAV = [
  { href: "/", label: "Início", icon: LayoutDashboard },
  { href: "/demandas", label: "Demandas", icon: ListChecks },
  { href: "/recorrentes", label: "Recorrentes", icon: Repeat2 },
  { href: "/contas", label: "Contas a pagar", icon: Wallet },
  { href: "/anotacoes", label: "Anotações", icon: StickyNote },
  { href: "/calendario", label: "Calendário", icon: CalendarDays },
];

const ACCENTS = [
  { key: "red", hex: "#e72828", name: "Vermelho" },
  { key: "blue", hex: "#287ee7", name: "Azul" },
  { key: "green", hex: "#28e75e", name: "Verde" },
  { key: "yellow", hex: "#e7e128", name: "Amarelo" },
] as const;

type AccentKey = (typeof ACCENTS)[number]["key"];

function AccentPicker() {
  const [accent, setAccent] = React.useState<AccentKey>("blue");

  React.useEffect(() => {
    const el = document.documentElement.dataset.accent;
    if (ACCENTS.some((a) => a.key === el)) setAccent(el as AccentKey);
  }, []);

  const pick = (key: AccentKey) => {
    setAccent(key);
    document.documentElement.dataset.accent = key;
    try {
      localStorage.setItem("mb.accent", key);
    } catch {
      // navegação privada: a escolha vale só nesta aba
    }
  };

  return (
    <div className="px-2.5 pt-4">
      <p className="mb-2.5 text-[10px] font-bold uppercase tracking-[0.1em] text-fg-mute">
        Cor principal
      </p>
      <div className="flex gap-2">
        {ACCENTS.map((a) => (
          <button
            key={a.key}
            onClick={() => pick(a.key)}
            title={a.name}
            aria-label={`Cor ${a.name}`}
            aria-pressed={accent === a.key}
            style={{ background: a.hex }}
            className={cx(
              "h-6 w-6 rounded-full transition-transform hover:scale-110",
              accent === a.key &&
                "ring-2 ring-fg-dim ring-offset-2 ring-offset-white"
            )}
          />
        ))}
      </div>
    </div>
  );
}

export function Shell({
  email,
  children,
}: {
  email: string;
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

  const name = email.split("@")[0] || "você";

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
              "flex items-center gap-3 rounded-[14px] px-3 py-2.5 text-sm font-medium transition-all duration-150",
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

  const account = (
    <div className="px-2.5 pt-3.5">
      <p className="truncate px-1 text-[11px] text-fg-mute">{name}</p>
      <button
        onClick={signOut}
        className="mt-2 flex w-full items-center justify-center gap-2 rounded-[14px] py-2.5 text-xs font-medium text-fg-mute transition-colors hover:bg-ink-800 hover:text-neg"
      >
        <LogOut size={13} />
        Sair
      </button>
    </div>
  );

  return (
    <div className="flex min-h-dvh">
      {/* -------- sidebar desktop -------- */}
      <aside className="hidden w-[224px] shrink-0 flex-col bg-white pt-6 pb-5 lg:flex">
        <div className="mb-6">{wordmark}</div>
        {nav}
        <div className="mt-auto">
          <AccentPicker />
          {account}
        </div>
      </aside>

      {/* -------- drawer mobile -------- */}
      {open && (
        <div className="fixed inset-0 z-50 lg:hidden">
          <div
            className="absolute inset-0 bg-fg/35 fade"
            onClick={() => setOpen(false)}
          />
          <aside className="relative flex h-full w-[262px] flex-col bg-white pt-6 pb-5 rise">
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
            <div className="mt-auto">
              <AccentPicker />
              {account}
            </div>
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
        {children}
      </main>
    </div>
  );
}
