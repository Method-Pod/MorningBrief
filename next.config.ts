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
  /*
   * Nega o que o app não usa. `geolocation=(self)` é a exceção: o clima do
   * início pede a posição do aparelho, e uma lista vazia nega para a própria
   * origem também — o navegador recusa em silêncio, sem nem mostrar a caixa de
   * permissão, o que é exatamente o sintoma de "não me pediu permissão".
   */
  {
    key: "Permissions-Policy",
    value: "camera=(), microphone=(), geolocation=(self), payment=()",
  },
];

const nextConfig: NextConfig = {
  reactStrictMode: true,
  async headers() {
    return [{ source: "/:path*", headers: cabecalhos }];
  },
};

export default nextConfig;
