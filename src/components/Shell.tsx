"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import * as React from "react";
import {
  CalendarDays,
  LayoutDashboard,
  ListChecks,
  LogOut,
  Menu,
  Repeat2,
  StickyNote,
  Sunrise,
  Wallet,
  X,
} from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { cx } from "./ui";

const NAV = [
  { href: "/", label: "Dashboard", icon: LayoutDashboard },
  { href: "/contas", label: "Contas a pagar", icon: Wallet },
  { href: "/demandas", label: "Demandas", icon: ListChecks },
  { href: "/recorrentes", label: "Recorrentes", icon: Repeat2 },
  { href: "/anotacoes", label: "Anotações", icon: StickyNote },
  { href: "/calendario", label: "Calendário", icon: CalendarDays },
];

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

  const name = email.split("@")[0] ?? "você";
  const initials = name.slice(0, 2).toUpperCase();

  const nav = (
    <nav className="flex flex-1 flex-col gap-1 px-3">
      <p className="mb-2 mt-1 px-3 text-[10px] font-semibold uppercase tracking-[0.14em] text-fg-mute">
        Menu principal
      </p>
      {NAV.map(({ href, label, icon: Icon }) => {
        const active = href === "/" ? path === "/" : path.startsWith(href);
        return (
          <Link
            key={href}
            href={href}
            className={cx(
              "group flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm transition-all duration-150",
              active
                ? "bg-brand-500 font-medium text-white shadow-[0_8px_24px_-10px_rgba(47,123,255,.9)]"
                : "text-fg-dim hover:bg-ink-800 hover:text-fg"
            )}
          >
            <Icon
              size={17}
              className={active ? "opacity-100" : "opacity-70 group-hover:opacity-100"}
            />
            <span className="truncate">{label}</span>
          </Link>
        );
      })}

      <div className="mt-auto pb-4">
        <p className="mb-2 px-3 text-[10px] font-semibold uppercase tracking-[0.14em] text-fg-mute">
          Conta
        </p>
        <div className="rounded-xl border border-line-soft bg-ink-900/60 p-3">
          <div className="flex items-center gap-2.5">
            <div className="grid h-8 w-8 shrink-0 place-items-center rounded-full bg-brand-500/15 text-[11px] font-semibold text-brand-400">
              {initials}
            </div>
            <div className="min-w-0">
              <p className="truncate text-xs font-medium text-fg-dim">{name}</p>
              <p className="truncate text-[10px] text-fg-mute">{email}</p>
            </div>
          </div>
          <button
            onClick={signOut}
            className="mt-3 flex w-full items-center justify-center gap-2 rounded-lg border border-line px-3 py-2 text-xs text-fg-mute transition-colors hover:border-neg/40 hover:bg-neg/10 hover:text-neg"
          >
            <LogOut size={13} />
            Sair
          </button>
        </div>
      </div>
    </nav>
  );

  return (
    <div className="mx-auto flex min-h-dvh w-full max-w-[1600px] gap-0 p-3 sm:p-5">
      <div className="flex min-h-[calc(100dvh-1.5rem)] w-full overflow-hidden rounded-3xl border border-line bg-ink-900/70 shadow-[0_50px_140px_-60px_rgba(0,0,0,1)] backdrop-blur-xl sm:min-h-[calc(100dvh-2.5rem)]">
        {/* -------- sidebar desktop -------- */}
        <aside className="hidden w-[236px] shrink-0 flex-col border-r border-line-soft bg-ink-950/60 py-5 lg:flex">
          <Link href="/" className="mb-6 flex items-center gap-2.5 px-6">
            <div className="grid h-8 w-8 place-items-center rounded-xl bg-brand-500 text-white shadow-[0_8px_22px_-8px_rgba(47,123,255,1)]">
              <Sunrise size={17} />
            </div>
            <span className="text-[15px] font-semibold tracking-tight">
              Morning<span className="text-brand-400">Brief</span>
            </span>
          </Link>
          {nav}
        </aside>

        {/* -------- sidebar mobile -------- */}
        {open && (
          <div className="fixed inset-0 z-50 lg:hidden">
            <div
              className="absolute inset-0 bg-ink-950/80 backdrop-blur-sm fade"
              onClick={() => setOpen(false)}
            />
            <aside className="relative flex h-full w-[260px] flex-col border-r border-line bg-ink-900 py-5 rise">
              <div className="mb-6 flex items-center justify-between px-5">
                <div className="flex items-center gap-2.5">
                  <div className="grid h-8 w-8 place-items-center rounded-xl bg-brand-500 text-white">
                    <Sunrise size={17} />
                  </div>
                  <span className="text-[15px] font-semibold tracking-tight">
                    Morning<span className="text-brand-400">Brief</span>
                  </span>
                </div>
                <button
                  onClick={() => setOpen(false)}
                  aria-label="Fechar menu"
                  className="rounded-lg p-1.5 text-fg-mute hover:bg-ink-800 hover:text-fg"
                >
                  <X size={17} />
                </button>
              </div>
              {nav}
            </aside>
          </div>
        )}

        {/* -------- conteúdo -------- */}
        <div className="flex min-w-0 flex-1 flex-col">
          <header className="flex items-center gap-3 border-b border-line-soft px-4 py-3.5 sm:px-6">
            <button
              onClick={() => setOpen(true)}
              aria-label="Abrir menu"
              className="rounded-lg border border-line p-2 text-fg-dim hover:bg-ink-800 hover:text-fg lg:hidden"
            >
              <Menu size={17} />
            </button>
            <div className="hidden items-center gap-1 lg:flex">
              {NAV.map(({ href, label }) => {
                const active = href === "/" ? path === "/" : path.startsWith(href);
                return (
                  <Link
                    key={href}
                    href={href}
                    className={cx(
                      "rounded-lg px-3 py-1.5 text-[13px] transition-colors",
                      active
                        ? "bg-ink-800 font-medium text-fg"
                        : "text-fg-mute hover:text-fg-dim"
                    )}
                  >
                    {label}
                  </Link>
                );
              })}
            </div>
            <div className="ml-auto flex items-center gap-2">
              <span className="hidden text-xs text-fg-mute sm:block tnum">
                {new Date().toLocaleDateString("pt-BR", {
                  weekday: "long",
                  day: "2-digit",
                  month: "long",
                })}
              </span>
              <div className="grid h-8 w-8 place-items-center rounded-full bg-brand-500/15 text-[11px] font-semibold text-brand-400 lg:hidden">
                {initials}
              </div>
            </div>
          </header>

          <main className="flex-1 overflow-x-hidden px-4 py-5 sm:px-6 sm:py-6">
            {children}
          </main>
        </div>
      </div>
    </div>
  );
}
