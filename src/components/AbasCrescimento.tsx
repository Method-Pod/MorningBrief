"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { BookOpen, GraduationCap, Repeat2 } from "lucide-react";
import { cx } from "./ui";

/*
 * As três telas de "Crescimento", uma barra só.
 *
 * Hábitos, Aulas e Leitura eram três itens soltos no menu. Pedido dele:
 * juntar. Viraram um item ("Crescimento") e esta barra no topo de cada uma —
 * as telas continuam as mesmas, com os mesmos endereços, então nada do que
 * já existe muda de lugar por dentro.
 */
const ABAS = [
  { href: "/habitos", label: "Hábitos", icon: Repeat2 },
  { href: "/aulas", label: "Aulas", icon: GraduationCap },
  { href: "/leitura", label: "Leitura", icon: BookOpen },
];

export const ROTAS_CRESCIMENTO = ABAS.map((a) => a.href);

export function AbasCrescimento({ className }: { className?: string }) {
  const path = usePathname();
  return (
    <nav
      aria-label="Crescimento"
      className={cx(
        "flex w-fit max-w-full gap-1 overflow-x-auto rounded-full bg-ink-800 p-1",
        className
      )}
    >
      {ABAS.map(({ href, label, icon: Icon }) => {
        const ativa = path === href || path.startsWith(href + "/");
        return (
          <Link
            key={href}
            href={href}
            prefetch={false}
            aria-current={ativa ? "page" : undefined}
            className={cx(
              "flex h-9 shrink-0 items-center gap-1.5 rounded-full px-3.5 text-[13px] font-semibold transition-colors",
              ativa
                ? "bg-ink-900 text-fg shadow-[var(--elev-1)]"
                : "text-fg-mute hover:text-fg-dim"
            )}
          >
            <Icon size={14} className={ativa ? "text-brand-400" : ""} />
            {label}
          </Link>
        );
      })}
    </nav>
  );
}
