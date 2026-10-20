"use client";

import * as React from "react";
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

/**
 * A barra, no mesmo desenho do `Segmented`: trilho cinza e a escolhida em
 * roxo cheio.
 *
 * Era a última lasca branca levantada do app — o mesmo estilo que já tinha
 * saído de todos os outros seletores, porque no claro a escolhida e as
 * outras só se diferenciavam por uma sombra.
 */
export function AbasCrescimento({ className }: { className?: string }) {
  const path = usePathname();
  return (
    <nav
      aria-label="Crescimento"
      className={cx(
        "inline-flex max-w-full items-center gap-1 overflow-x-auto rounded-[14px] bg-ink-800 p-1",
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
              "flex h-8 shrink-0 items-center gap-1.5 rounded-lg px-3.5 text-[12.5px] font-semibold transition-colors",
              ativa
                ? "bg-brand-500 bg-[image:var(--a-degrade)] text-on-brand"
                : "text-fg-mute hover:text-fg-dim"
            )}
          >
            <Icon size={14} />
            {label}
          </Link>
        );
      })}
    </nav>
  );
}

/**
 * O topo das três telas: o nome da seção, as abas e as ações.
 *
 * Antes cada tela abria com DOIS cabeçalhos dizendo a mesma coisa — a barra
 * de abas com "Hábitos" escolhido e, logo embaixo, o título grande
 * "Hábitos". Agora o título é o da seção, igual ao item do menu lateral
 * ("Crescimento"), e quem diz em qual das três você está é a aba.
 */
export function CabecalhoCrescimento({ acoes }: { acoes?: React.ReactNode }) {
  return (
    <div className="flex flex-wrap items-end justify-between gap-3">
      <div className="min-w-0">
        <h1 className="titulo-pagina">Crescimento</h1>
        <AbasCrescimento className="mt-3" />
      </div>
      {acoes}
    </div>
  );
}
