"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import * as React from "react";
import {
  BookOpen,
  CalendarDays,
  ChevronLeft,
  ChevronRight,
  GraduationCap,
  ListChecks,
  Repeat2,
  LayoutDashboard,
  Library,
  Menu,
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
        Um cartão solto, não uma faixa colada na janela.

        Ela ia de borda a borda — encostava em cima, embaixo e na esquerda —,
        e por isso lia como parte da moldura do navegador em vez de parte do
        app. Com 12px de folga em volta e o mesmo `card` que todo o resto usa
        (branco, canto de 22px, a mesma sombra de 1px), ela passa a ser mais
        um cartão sobre o fundo cinza, igual aos do painel.

        `sticky` em vez de `fixed`: o aside continua no fluxo, então mantém a
        largura na grade flex sem precisar de margem compensatória no <main>.
        A altura é a da janela menos as duas folgas, e é ela que dá base ao
        `mt-auto` do rodapé; o `overflow-y-auto` salva a barra em tela baixa,
        onde a navegação e a conta passam da altura disponível.
      */}
      <aside
        className={cx(
          "card camada-fixa sticky top-3 my-3 ml-3 hidden h-[calc(100dvh-24px)] shrink-0 flex-col overflow-y-auto overflow-x-hidden pt-5 pb-4 transition-[width] duration-200 lg:flex",
          encolhida ? "w-[68px]" : "w-[224px]"
        )}
      >
        {/*
          A marca fica nos dois estados; o que muda é a forma dela.

          Aberta, o nome escrito; encolhida, o símbolo sozinho — que é o mesmo
          da tela de início do telefone. Antes a marca sumia e sobrava o botão
          de encolher, e uma barra sem marca nenhuma no alto perde o ponto de
          referência: não dá para saber de relance de que programa é aquela
          fileira de ícones.
        */}
        <div
          className={cx(
            "mb-6 flex items-center",
            encolhida ? "justify-center px-2.5" : "gap-1 pr-2.5"
          )}
        >
          {encolhida ? (
            <Link href="/" prefetch={false} aria-label="Início" title="Morning Brief">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src="/icon-dark.svg"
                alt=""
                width={30}
                height={30}
                className="block h-[30px] w-[30px] rounded-[9px]"
              />
            </Link>
          ) : (
            <>
              <div className="min-w-0 flex-1">{wordmark}</div>
              <button
                type="button"
                onClick={alternarLargura}
                aria-label="Encolher a barra lateral"
                aria-expanded
                title="Encolher a barra"
                className="grid h-8 w-8 shrink-0 place-items-center rounded-[10px] text-fg-mute transition-colors hover:bg-ink-800 hover:text-fg"
              >
                <ChevronLeft size={18} />
              </button>
            </>
          )}
        </div>
        {navegacao(encolhida)}
        {rodape(encolhida)}

        {/*
          A borda da direita é o que reabre a barra.

          Encolhida não há botão: 68px de largura já são a fileira de ícones, e
          um botão a mais ali disputaria espaço com eles. A faixa tem 10px de
          alvo — larga o bastante para o ponteiro acertar — e mostra um risco
          fino quando o ponteiro passa, que é o aviso de que dali se puxa.

          `absolute` dentro do `aside`, que é `sticky` e portanto posicionado:
          a faixa acompanha a altura da barra sem entrar no fluxo dela.
        */}
        {encolhida && (
          <button
            type="button"
            onClick={alternarLargura}
            aria-label="Abrir a barra lateral"
            aria-expanded={false}
            title="Abrir a barra"
            className="group absolute inset-y-0 right-0 w-2.5 cursor-pointer"
          >
            {/* O risco não vai de ponta a ponta: com o canto arredondado, uma
                linha reta colada na borda escaparia da curva. Recuada em
                cima e embaixo, ela lê como puxador. */}
            <span className="absolute inset-y-10 right-[3px] w-[3px] rounded-full bg-transparent transition-colors group-hover:bg-brand-500/40" />
          </button>
        )}
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
