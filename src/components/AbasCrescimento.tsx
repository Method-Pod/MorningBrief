"use client";

import * as React from "react";
import { usePathname } from "next/navigation";
import { PilulaDeAbas } from "./PilulaDeAbas";
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
  { href: "/habitos", label: "Hábitos" },
  { href: "/aulas", label: "Aulas" },
  { href: "/leitura", label: "Leitura" },
];

export const ROTAS_CRESCIMENTO = ABAS.map((a) => a.href);

/**
 * As três abas, no mesmo desenho das abas do topo do app: a pílula de vidro
 * e o destaque roxo que desliza. Pedido dele: os dois menus iguais.
 */
export function AbasCrescimento({ className }: { className?: string }) {
  const path = usePathname();
  return (
    <PilulaDeAbas
      rotulo="Crescimento"
      className={cx("inline-flex", className)}
      abas={ABAS.map(({ href, label }) => ({
        href,
        label,
        ativa: path === href || path.startsWith(href + "/"),
      }))}
    />
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
      <div className="min-w-0 max-w-full">
        <h1 className="titulo-pagina">Crescimento</h1>
        <AbasCrescimento className="mt-3" />
      </div>
      {acoes}
    </div>
  );
}
