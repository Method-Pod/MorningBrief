import type { Metadata, Viewport } from "next";
import { Plus_Jakarta_Sans } from "next/font/google";
import "./globals.css";

const jakarta = Plus_Jakarta_Sans({
  subsets: ["latin"],
  display: "swap",
  variable: "--font-jakarta",
});

export const metadata: Metadata = {
  title: "Morning Brief",
  description:
    "Seu painel do dia: demandas, recorrências, anotações, agenda e contas a pagar em um só lugar.",
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
