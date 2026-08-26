import type { NextConfig } from "next";

/*
 * Cabeçalhos de resposta. Nenhum deles altera o que é renderizado — são
 * instruções para o navegador, invisíveis na página.
 *
 * Sem CSP por enquanto: o app injeta um <script> inline no layout para
 * aplicar o tema antes da primeira pintura, e uma política sem nonce
 * bloquearia exatamente esse script. CSP exige um passo próprio.
 */
const cabecalhos = [
  // impede que o app seja embutido em iframe de terceiro (clickjacking)
  { key: "X-Frame-Options", value: "DENY" },
  // o navegador para de adivinhar o tipo do arquivo pelo conteúdo
  { key: "X-Content-Type-Options", value: "nosniff" },
  // não vaza a URL interna completa ao sair para outro site
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  // nega o que o app não usa
  {
    key: "Permissions-Policy",
    value: "camera=(), microphone=(), geolocation=(), payment=()",
  },
];

const nextConfig: NextConfig = {
  reactStrictMode: true,
  async headers() {
    return [{ source: "/:path*", headers: cabecalhos }];
  },
};

export default nextConfig;
