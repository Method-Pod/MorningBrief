"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { BuscaGlobal } from "./BuscaGlobal";
import * as React from "react";
import { ListPlus, Moon, Receipt, Search, Sun } from "lucide-react";
import { ROTAS_CRESCIMENTO } from "./AbasCrescimento";
import { Iniciais, useAvatar } from "./Avatar";
import { naRota } from "@/lib/rota";
import { IdentityProvider } from "./identity";
import { useTema, useTemaEfetivo } from "./tema";
import { cx } from "./ui";

/*
 * Recorrentes saiu da navegação: a regra agora é criada pela caixa "Demanda
 * recorrente" dentro de Nova demanda. A rota /recorrentes continua existindo
 * para pausar, editar e excluir — chega-se a ela pelo card do Início e pelo
 * aviso de demanda gerada.
 */
const NAV = [
  /*
   * "Início", e não "Hoje": é a preferência de quem lê este menu de manhã, e
   * para ele aquilo é a entrada, não o dia.
   */
  { href: "/", label: "Início" },
  { href: "/demandas", label: "Demandas" },
  /* Hábitos, Aulas e Leitura num item só: as três telas ganham uma barra
     própria no topo (AbasCrescimento) e o item acende em qualquer uma. */
  { href: "/habitos", label: "Crescimento", tambem: ROTAS_CRESCIMENTO },
  { href: "/contas", label: "Contas a pagar" },
  { href: "/referencias", label: "Referências" },
  { href: "/anotacoes", label: "Anotações" },
  { href: "/calendario", label: "Calendário" },
];

/**
 * Um botão redondo da barra de ícones, com o nome num balão ao passar o mouse.
 *
 * O balão sai para a direita no computador, onde a barra é vertical; no
 * telefone não há passar o mouse, e o nome fica no `aria-label`.
 */
function BotaoDaBarra({
  rotulo,
  onClick,
  children,
}: {
  rotulo: string;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={rotulo}
      className="group relative grid h-10 w-10 shrink-0 place-items-center rounded-full text-fg-dim transition-colors hover:bg-fg/[0.08] hover:text-fg"
    >
      {children}
      <span
        aria-hidden
        className="pointer-events-none absolute left-full top-1/2 z-10 ml-3 hidden -translate-y-1/2 whitespace-nowrap rounded-full bg-fg px-2.5 py-1 text-[11.5px] font-semibold text-[var(--a-bg)] opacity-0 transition-opacity group-hover:opacity-100 lg:block"
      >
        {rotulo}
      </span>
    </button>
  );
}


/**
 * Dá a cada cartão que aparece na tela a sua vez de entrar.
 *
 * O CSS anima `.card[data-surgiu]` com atraso de `--surge-i` × 90ms. Aqui se
 * escreve essa ordem, na sequência em que os cartões surgem no DOM — e não só
 * na troca de tela: as telas abrem com o esqueleto e os cartões chegam
 * depois, com os dados. Uma rajada de cartões dentro de 700ms é uma entrada
 * só e escalona; um cartão que aparece sozinho mais tarde (uma demanda nova)
 * entra na hora, sem fila.
 */
function useSurgir(path: string) {
  React.useEffect(() => {
    const main = document.querySelector("main");
    if (!main) return;
    /* Os cartões da rajada atual. Só contam os que continuam na tela: os do
       esqueleto de carregamento somem quando os dados chegam, e contá-los
       atrasaria à toa a entrada dos cartões de verdade. */
    let rajada: HTMLElement[] = [];
    let ultimo = 0;
    const marcar = () => {
      const novos = main.querySelectorAll<HTMLElement>(".card:not([data-surgiu])");
      if (!novos.length) return;
      const agora = performance.now();
      rajada = agora - ultimo > 700 ? [] : rajada.filter((c) => c.isConnected);
      ultimo = agora;
      novos.forEach((c) => {
        c.style.setProperty("--surge-i", String(Math.min(rajada.length, 10)));
        c.dataset.surgiu = "";
        rajada.push(c);
      });
    };
    marcar();
    const obs = new MutationObserver(marcar);
    obs.observe(main, { childList: true, subtree: true });
    return () => obs.disconnect();
  }, [path]);
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
  const { url: foto } = useAvatar();
  const { setTema } = useTema();
  const efetivo = useTemaEfetivo();

  /*
   * A navegação não adianta as telas de uma vez.
   *
   * O `<Link>` do Next adianta sozinho toda rota visível, e as sete abas
   * estão sempre visíveis: eram sete pedidos ao abrir o Início, disputando a
   * rede com os dados da própria página. Adianta ao passar o mouse ou ao
   * encostar o dedo — o instante antes do clique, e uma rota só.
   */
  const adiantar = (href: string) => () => router.prefetch(href);
  const aqui = (href: string) => naRota(path, href);

  useSurgir(path);

  /*
   * A pílula que desliza até a aba ativa, como na referência.
   *
   * Uma peça só, posicionada por medida, em vez de cada aba acender o próprio
   * fundo: trocar de tela faz a pílula correr de uma aba à outra, que é o que
   * diz "você saiu dali e chegou aqui". Remede ao mudar de tela, ao mudar o
   * tamanho da janela e quando a fonte termina de carregar (a largura das
   * abas muda com ela).
   */
  const faixa = React.useRef<HTMLElement>(null);
  const [pilula, setPilula] = React.useState<{ x: number; w: number } | null>(null);
  React.useLayoutEffect(() => {
    const medir = () => {
      const ativa = faixa.current?.querySelector<HTMLElement>('[aria-current="page"]');
      setPilula(ativa ? { x: ativa.offsetLeft, w: ativa.offsetWidth } : null);
    };
    medir();
    /* A aba ativa rola para a vista na faixa do telefone, onde nem todas cabem. */
    faixa.current
      ?.querySelector<HTMLElement>('[aria-current="page"]')
      ?.scrollIntoView({ block: "nearest", inline: "center" });
    window.addEventListener("resize", medir);
    document.fonts?.ready.then(medir);
    return () => window.removeEventListener("resize", medir);
  }, [path]);

  const nomeVisivel = nome || email.split("@")[0] || "você";

  /*
   * As ações da barra de ícones são as que o app já tem, chamadas de outro
   * lugar: a busca global, o formulário de nova demanda e o de nova conta
   * (que as telas abrem ao receber `?nova=1`) e o tema.
   */
  const acoes = (
    <>
      <BotaoDaBarra
        rotulo="Buscar em tudo"
        onClick={() => window.dispatchEvent(new CustomEvent("mb:buscar"))}
      >
        <Search size={17} />
      </BotaoDaBarra>
      <BotaoDaBarra rotulo="Nova demanda" onClick={() => router.push("/demandas?nova=1")}>
        <ListPlus size={18} />
      </BotaoDaBarra>
      <BotaoDaBarra rotulo="Nova conta" onClick={() => router.push("/contas?nova=1")}>
        <Receipt size={17} />
      </BotaoDaBarra>
      <span aria-hidden className="h-6 w-px shrink-0 bg-line lg:h-px lg:w-6" />
      <BotaoDaBarra
        rotulo={efetivo === "escuro" ? "Tema claro" : "Tema escuro"}
        onClick={() => setTema(efetivo === "escuro" ? "claro" : "escuro")}
      >
        {efetivo === "escuro" ? <Sun size={17} /> : <Moon size={17} />}
      </BotaoDaBarra>
    </>
  );

  return (
    <div className="min-h-dvh">
      {/*
        O topo: a marca, as abas e a conta.

        As abas ficam numa pílula de vidro no meio. Abaixo de 1280px elas não
        cabem na mesma linha da marca e da foto — são sete, e "Contas a pagar"
        é longa —, então descem para uma faixa própria, que rola para o lado no
        telefone em vez de quebrar em duas linhas.
      */}
      <header className="flex flex-wrap items-center gap-x-4 gap-y-3 px-4 pt-4 sm:px-6 lg:pl-[104px] lg:pr-8 lg:pt-5">
        <Link
          href="/"
          prefetch={false}
          className="flex shrink-0 items-center gap-2.5 text-[20px] font-bold tracking-[-0.035em] text-fg"
        >
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src="/icon-dark.svg"
            alt=""
            width={34}
            height={34}
            className="block h-[34px] w-[34px] rounded-[11px]"
          />
          <span>
            morning<span className="font-normal text-fg-mute">brief</span>
          </span>
        </Link>

        <nav
          ref={faixa}
          aria-label="Seções"
          className="vidro-flutuante sem-barra relative order-last -mx-1 flex w-[calc(100%+0.5rem)] gap-1 overflow-x-auto rounded-full p-1.5 xl:order-none xl:mx-auto xl:w-auto"
        >
          {pilula && (
            <span
              aria-hidden
              className="absolute bottom-1.5 top-1.5 left-0 rounded-full bg-brand-500 bg-[image:var(--a-degrade)] shadow-[inset_0_1px_0_rgb(255_255_255/0.25)] transition-[transform,width] duration-500 ease-[cubic-bezier(0.16,1,0.3,1)]"
              style={{ transform: `translateX(${pilula.x}px)`, width: pilula.w }}
            />
          )}
          {NAV.map(({ href, label, tambem }) => {
            const active = aqui(href) || !!tambem?.some(aqui);
            return (
              <Link
                key={href}
                href={href}
                prefetch={false}
                onMouseEnter={adiantar(href)}
                onTouchStart={adiantar(href)}
                aria-current={active ? "page" : undefined}
                className={cx(
                  "relative shrink-0 whitespace-nowrap rounded-full px-4 py-2 text-[13.5px] font-semibold transition-colors duration-300",
                  active
                    ? cx("text-on-brand", !pilula && "bg-brand-500")
                    : "text-fg-dim hover:bg-fg/[0.07] hover:text-fg"
                )}
              >
                {label}
              </Link>
            );
          })}
        </nav>

        <Link
          href="/conta"
          prefetch={false}
          aria-label={`Conta de ${nomeVisivel}`}
          title={nomeVisivel}
          className={cx(
            "ml-auto grid shrink-0 place-items-center rounded-full xl:ml-0",
            aqui("/conta") && "ring-2 ring-brand-500"
          )}
        >
          <Iniciais nome={nomeVisivel} url={foto} tamanho={38} />
        </Link>
      </header>

      {/*
        A barra de ícones: vertical e solta à esquerda no computador, e no
        rodapé no telefone, onde o polegar alcança.
      */}
      <nav
        aria-label="Ações rápidas"
        className={cx(
          "vidro-flutuante fixed z-40 flex items-center gap-1 rounded-full p-1.5",
          "bottom-[max(0.75rem,env(safe-area-inset-bottom))] left-1/2 -translate-x-1/2",
          "lg:bottom-auto lg:left-5 lg:top-1/2 lg:-translate-y-1/2 lg:translate-x-0 lg:flex-col"
        )}
      >
        {acoes}
      </nav>

      <BuscaGlobal />

      {/* -------- conteúdo -------- */}
      <main className="min-w-0 px-4 pb-28 pt-6 sm:px-6 lg:pb-14 lg:pl-[104px] lg:pr-8">
        <IdentityProvider value={{ email, nome }}>{children}</IdentityProvider>
      </main>
    </div>
  );
}
