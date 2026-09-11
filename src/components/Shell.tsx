"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import * as React from "react";
import {
  BookOpen,
  CalendarDays,
  ChevronRight,
  GraduationCap,
  ListChecks,
  Repeat2,
  LayoutDashboard,
  Library,
  Menu,
  PanelLeftClose,
  PanelLeftOpen,
  StickyNote,
  Wallet,
  X,
} from "lucide-react";
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
  { href: "/leitura", label: "Leitura", icon: BookOpen },
  { href: "/aulas", label: "Aulas", icon: GraduationCap },
  { href: "/contas", label: "Contas a pagar", icon: Wallet },
  { href: "/referencias", label: "Referências", icon: Library },
  { href: "/anotacoes", label: "Anotações", icon: StickyNote },
  { href: "/calendario", label: "Calendário", icon: CalendarDays },
];

/**
 * A conta na barra lateral: uma linha, e nada mais.
 *
 * Tinha rótulo "CONTA", foto, nome, e-mail, seta e um botão "Sair" de
 * largura cheia — cinco coisas para o que é um atalho. O e-mail saiu porque
 * repete o que já está na tela de conta e ninguém precisa reler o próprio
 * endereço na barra; o rótulo saiu porque a foto e o nome já dizem o que
 * aquilo é; e "Sair" saiu porque existe igual dentro da tela de conta, a um
 * clique daqui, e é a última coisa que se faz num dia de trabalho — não
 * precisa de lugar cativo.
 */
function CaixaConta({
  nome,
  ativo,
  compacta,
}: {
  nome: string;
  ativo: boolean;
  compacta?: boolean;
}) {
  const { url: foto } = useAvatar();

  return (
    <Link
      href="/conta"
      prefetch={false}
      title={compacta ? nome : undefined}
      className={cx(
        "flex items-center rounded-[16px] p-2.5 transition-colors",
        compacta ? "justify-center" : "gap-2.5",
        ativo ? "bg-brand-500/12" : "bg-ink-800 hover:bg-black/[0.03]"
      )}
    >
      <Iniciais nome={nome} url={foto} tamanho={30} />
      {!compacta && (
        <>
          <span
            className={cx(
              "min-w-0 flex-1 truncate text-[12.5px] font-semibold",
              ativo ? "text-brand-400" : "text-fg"
            )}
          >
            {nome}
          </span>
          <ChevronRight size={14} className="shrink-0 text-fg-mute" />
        </>
      )}
    </Link>
  );
}

/** Onde fica guardado se a barra lateral abre inteira ou só com os ícones. */
const LARGURA_GUARDADA = "mb.barraLateral";

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

  /*
   * Barra lateral encolhida: só os ícones.
   *
   * Vale apenas para o computador. A gaveta do telefone abre por cima do
   * conteúdo e some ao escolher — encolher ali não devolveria espaço
   * nenhum, e tiraria os nomes de um menu que a pessoa abriu justamente
   * para ler.
   *
   * A escolha fica no navegador, como a da barra de formatação: é
   * preferência de quem usa, não de uma tela. Começa aberta na primeira
   * renderização e o efeito corrige em seguida — ler o armazenamento
   * durante a renderização quebraria a hidratação, porque no servidor ele
   * não existe.
   */
  const [encolhida, setEncolhida] = React.useState(false);
  React.useEffect(() => {
    try {
      setEncolhida(localStorage.getItem(LARGURA_GUARDADA) === "1");
    } catch {
      /* Armazenamento bloqueado: fica aberta, que é o padrão. */
    }
  }, []);

  const alternarLargura = () =>
    setEncolhida((v) => {
      try {
        localStorage.setItem(LARGURA_GUARDADA, v ? "0" : "1");
      } catch {}
      return !v;
    });

  const wordmark = (
    <Link
      href="/"
      className="block px-2.5 text-[21px] font-bold tracking-[-0.035em] text-fg"
    >
      morning<span className="font-normal text-fg-mute">brief</span>
    </Link>
  );

  /*
   * A barra lateral deixou de adiantar as nove telas de uma vez.
   *
   * O `<Link>` do Next adianta sozinho toda rota que esteja visível na tela,
   * e as nove estão sempre — é uma barra lateral. Medido no registro de rede
   * ao abrir o Início: nove pedidos `?_rsc=` para /demandas, /habitos,
   * /leitura, /aulas, /contas, /referencias, /anotacoes, /calendario e
   * /conta, disparados **antes** dos arquivos da própria página, e todos
   * cancelados em seguida.
   *
   * Cada um deles custa duas conferências de sessão no servidor — a do
   * middleware e a do layout — e uma renderização. E, no navegador, ocupam a
   * fila de conexões na hora exata em que a página precisa dela para buscar
   * os próprios dados.
   *
   * O ganho do adiantamento também é pequeno aqui: estas telas são todas de
   * cliente e buscam os dados delas depois de montar, então o que vinha
   * adiantado era a casca, não o conteúdo.
   *
   * Em lugar disso, adianta ao passar o mouse ou ao encostar o dedo — que é
   * o instante antes do clique, e cobre uma rota só: a que vai ser aberta.
   */
  const adiantar = (href: string) => () => router.prefetch(href);

  const navegacao = (compacta: boolean) => (
    <nav className="flex flex-col gap-[3px] px-2.5">
      {NAV.map(({ href, label, icon: Icon }) => {
        const active = href === "/" ? path === "/" : path.startsWith(href);
        return (
          <Link
            key={href}
            href={href}
            prefetch={false}
            onMouseEnter={adiantar(href)}
            onTouchStart={adiantar(href)}
            /* Encolhida, o nome vira balãozinho: sem ele restaria adivinhar
               o que cada desenho quer dizer. */
            title={compacta ? label : undefined}
            aria-label={compacta ? label : undefined}
            className={cx(
              "flex items-center rounded-[14px] py-2.5 text-sm font-medium transition-colors duration-150",
              compacta ? "justify-center px-0" : "gap-3 px-3",
              active
                ? "bg-brand-500 text-on-brand"
                : "text-fg-dim hover:bg-ink-800 hover:text-fg"
            )}
          >
            <Icon size={17} className={active ? "" : "opacity-80"} />
            {!compacta && <span className="truncate">{label}</span>}
          </Link>
        );
      })}
    </nav>
  );

  const rodape = (compacta: boolean) => (
    <div className="mt-auto px-2.5 pt-4">
      <CaixaConta
        nome={nome || email.split("@")[0] || "você"}
        ativo={path.startsWith("/conta")}
        compacta={compacta}
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
        overflow-y-auto salva a barra em tela baixa, onde a navegação e a
        conta passam da altura da janela.
      */}
      <aside
        className={cx(
          "camada-fixa sticky top-0 hidden h-dvh shrink-0 flex-col overflow-y-auto overflow-x-hidden bg-white pt-6 pb-5 transition-[width] duration-200 lg:flex",
          encolhida ? "w-[68px]" : "w-[224px]"
        )}
      >
        {/*
          Encolhida, a marca sai e fica só o botão, centralizado.

          Um "morningbrief" cortado em 68px não é marca, é sobra de texto — e
          voltar ao Início continua a um clique, pelo primeiro item da lista.
        */}
        <div
          className={cx(
            "mb-6 flex items-center",
            encolhida ? "justify-center px-2.5" : "gap-1 pr-2.5"
          )}
        >
          {!encolhida && <div className="min-w-0 flex-1">{wordmark}</div>}
          <button
            type="button"
            onClick={alternarLargura}
            aria-label={encolhida ? "Abrir a barra lateral" : "Encolher a barra lateral"}
            aria-expanded={!encolhida}
            title={encolhida ? "Abrir a barra" : "Encolher a barra"}
            className="grid h-8 w-8 shrink-0 place-items-center rounded-[10px] text-fg-mute transition-colors hover:bg-ink-800 hover:text-fg"
          >
            {encolhida ? <PanelLeftOpen size={17} /> : <PanelLeftClose size={17} />}
          </button>
        </div>
        {navegacao(encolhida)}
        {rodape(encolhida)}
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
            {navegacao(false)}
            {rodape(false)}
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
