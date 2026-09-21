import type { Metadata, Viewport } from "next";
import { headers } from "next/headers";
import { Plus_Jakarta_Sans } from "next/font/google";
import { ACCENT_KEYS } from "@/lib/accents";
import { TEMA_STORAGE } from "@/lib/tema";
import { RegistroApp } from "@/components/RegistroApp";
import { CorDaBarra } from "@/components/tema";
import "./globals.css";

const jakarta = Plus_Jakarta_Sans({
  subsets: ["latin"],
  display: "swap",
  variable: "--font-jakarta",
});

const SITE = "https://morningbrief-app.vercel.app";
const DESC =
  "Seu painel do dia: demandas, recorrências, hábitos, anotações, agenda e contas a pagar em um só lugar.";

/*
 * Tudo aqui vive no <head> e não desenha nada na página.
 *
 * metadataBase é o que permite ao Next resolver /og.png em URL absoluta —
 * WhatsApp, LinkedIn e Slack ignoram caminho relativo em og:image, e era por
 * isso que o link aparecia como retângulo cinza sem imagem nem descrição.
 *
 * robots: só o login é indexável. As telas internas já devolvem 307, mas sem
 * a instrução explícita o buscador insiste e as URLs sujam o relatório.
 */
export const metadata: Metadata = {
  metadataBase: new URL(SITE),
  title: {
    default: "Morning Brief",
    template: "%s · Morning Brief",
  },
  description: DESC,
  applicationName: "Morning Brief",
  /*
   * O manifest é o arquivo que faz o navegador oferecer "Instalar" em vez de
   * "adicionar atalho". O Next já injeta o <link> por existir o
   * src/app/manifest.ts; declarar aqui é para o caminho ficar visível a quem
   * lê este arquivo, e não uma segunda etiqueta.
   */
  manifest: "/manifest.webmanifest",
  /*
   * O recado para o iPhone. A Apple ignora o `display: standalone` do
   * manifest e exige a instrução em etiqueta própria — sem isto o app
   * instalado abre dentro do Safari, com barra de endereço, que é o sintoma
   * de "instalei e continua parecendo site".
   *
   * `title` é o rótulo debaixo do ícone no iOS, que não vem do manifest.
   * `statusBarStyle: default` deixa o iOS pintar a barra de status com a cor
   * do tema e escrever a hora em tinta escura; "black-translucent" jogaria o
   * conteúdo para debaixo do relógio, e aí a primeira linha de cada tela
   * ficaria escondida.
   */
  appleWebApp: {
    capable: true,
    title: "Brief",
    statusBarStyle: "default",
  },
  /*
   * A mesma instrução, no nome antigo. Medido: `capable: true` acima faz o
   * Next escrever `mobile-web-app-capable`, que é o nome novo e padronizado —
   * e é o único que ele escreve. O Safari do iPhone só passou a ler o
   * `display: standalone` do manifest no iOS 17.4; antes disso, quem manda o
   * app abrir em tela cheia é esta etiqueta com o nome antigo, e sem ela um
   * iPhone que não atualizou abre o app dentro do Safari.
   *
   * As duas juntas não conflitam: cada navegador lê a que conhece.
   */
  other: { "apple-mobile-web-app-capable": "yes" },
  alternates: { canonical: "/" },
  robots: {
    index: false,
    follow: false,
    googleBot: { index: false, follow: false },
  },
  openGraph: {
    type: "website",
    siteName: "Morning Brief",
    title: "Morning Brief",
    description: DESC,
    url: SITE,
    locale: "pt_BR",
    images: [
      {
        url: "/og.png",
        width: 1200,
        height: 630,
        alt: "Morning Brief",
      },
    ],
  },
  twitter: {
    card: "summary_large_image",
    title: "Morning Brief",
    description: DESC,
    images: ["/og.png"],
  },
};

export const viewport: Viewport = {
  /*
   * A cor da barra do navegador, uma por tema.
   *
   * É o que pinta a faixa de cima no Android e a área em volta do app
   * instalado. Com um valor só, quem usa o escuro via uma tira clara grudada
   * no alto de uma tela escura — o detalhe que denuncia que o tema escuro foi
   * aplicado por fora e não pensado.
   *
   * Os valores são `--a-bg` de cada tema. Aqui não dá para usar a variável:
   * isto vira uma etiqueta no <head>, lida antes de qualquer CSS.
   */
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#f1f4f7" },
    { media: "(prefers-color-scheme: dark)", color: "#1f2328" },
  ],
  width: "device-width",
  initialScale: 1,
};

/**
 * Aplica o accent salvo antes da primeira pintura. Sem isso a página abre no
 * azul padrão e pisca para a cor escolhida no primeiro frame de hidratação.
 *
 * A lista de válidos vem de `ACCENT_KEYS`, e não escrita à mão aqui.
 *
 * Escrita à mão foi o que deu errado: ela tinha os quatro accents originais e
 * ficou para trás quando outros quatro entraram. A validação então recusava o
 * valor salvo de quem tinha escolhido laranja, ciano, violeta ou rosa, o
 * atributo não era aplicado, e a página abria azul e pulava para a cor certa
 * depois da hidratação -- exatamente a piscada que este script existe para
 * evitar, acontecendo só para metade das opções.
 *
 * Derivar da mesma constante que o seletor usa faz as duas listas não terem
 * como divergir de novo: acrescentar uma cor em `lib/accents` já a ensina aqui.
 */
/*
 * O tema segue a mesma receita, e pela mesma razão.
 *
 * Só que aqui a piscada seria pior: abrir no claro e saltar para o escuro
 * depois da hidratação é a tela inteira trocando de cor na cara de quem
 * abriu, não um detalhe mudando de tom.
 *
 * "auto" não é gravado no atributo de propósito — ausência é o que o CSS lê
 * como automático. Ver `lib/tema`.
 */
const ACCENT_BOOT = `try{var a=localStorage.getItem('mb.accent');
if(${JSON.stringify([...ACCENT_KEYS])}.indexOf(a)>-1)document.documentElement.dataset.accent=a}catch(e){}
try{var t=localStorage.getItem(${JSON.stringify(TEMA_STORAGE)});
if(t==='claro'||t==='escuro')document.documentElement.dataset.tema=t}catch(e){}`;

export default async function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  /*
   * O nonce da requisição, sorteado no middleware.
   *
   * Sem ele o script abaixo não roda: a política só aceita script inline que
   * traga o número do dia. E o script precisa rodar antes da primeira
   * pintura, senão a página abre no azul e pisca para a cor escolhida.
   *
   * Ler cabeçalho torna a renderização dinâmica — /login deixa de ser
   * gerada na build. Custa uma renderização por visita numa tela que já
   * passa pelo middleware de qualquer forma.
   */
  const nonce = (await headers()).get("x-nonce") ?? undefined;

  return (
    // suppressHydrationWarning: o ACCENT_BOOT troca data-accent antes da
    // hidratação, então o <html> do servidor divergir do cliente é esperado.
    // Extensões de navegador também injetam atributos aqui (LanguageTool
    // grava data-lt-installed). Vale só para os atributos deste elemento —
    // não silencia diferença nenhuma dentro da árvore.
    <html
      lang="pt-BR"
      data-accent="blue"
      className={jakarta.variable}
      suppressHydrationWarning
    >
      <head>
        {/*
          `suppressHydrationWarning` por causa do nonce, e não do conteúdo.

          O navegador esconde o atributo `nonce` de quem lê o DOM — é parte da
          proteção: script injetado não pode copiar o número de uma tag
          vizinha. Só que a hidratação do React lê o DOM para conferir, vê
          `nonce=""` onde o servidor escreveu o número, e acusa divergência a
          cada carregamento. A divergência é do navegador, não do código.
        */}
        <script
          nonce={nonce}
          suppressHydrationWarning
          dangerouslySetInnerHTML={{ __html: ACCENT_BOOT }}
        />
      </head>
      <body className="min-h-dvh font-sans antialiased">
        {children}
        <RegistroApp />
        <CorDaBarra />
      </body>
    </html>
  );
}
