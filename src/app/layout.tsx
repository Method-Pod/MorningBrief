import type { Metadata, Viewport } from "next";
import { Plus_Jakarta_Sans } from "next/font/google";
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
  themeColor: "#f1f4f7",
  width: "device-width",
  initialScale: 1,
};

/**
 * Aplica o accent salvo antes da primeira pintura. Sem isso a página abre no
 * azul padrão e pisca para a cor escolhida no primeiro frame de hidratação.
 */
const ACCENT_BOOT = `try{var a=localStorage.getItem('mb.accent');
if(['red','blue','green','yellow'].indexOf(a)>-1)document.documentElement.dataset.accent=a}catch(e){}`;

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
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
        <script dangerouslySetInnerHTML={{ __html: ACCENT_BOOT }} />
      </head>
      <body className="min-h-dvh font-sans antialiased">{children}</body>
    </html>
  );
}
