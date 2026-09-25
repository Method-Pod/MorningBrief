import type { NextConfig } from "next";

/*
 * Cabeçalhos de resposta. Nenhum deles altera o que é renderizado — são
 * instruções para o navegador, invisíveis na página.
 *
 * A política de conteúdo (CSP) NÃO está aqui, e sim no middleware: ela leva
 * um nonce sorteado a cada requisição, e cabeçalho fixo de configuração não
 * tem como sortear nada. Ver src/lib/csp.ts.
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

/*
 * A versão publicada, congelada dentro do pacote.
 *
 * `VERCEL_GIT_COMMIT_SHA` existe na Vercel e vale para o build inteiro. Ela
 * entra aqui como variável pública porque o NAVEGADOR precisa dela: é o valor
 * que a aba carregada carrega consigo, e é comparando com o que o servidor
 * responde AGORA que dá para saber que subiu versão nova. Ver
 * `src/app/api/versao/route.ts` e `src/components/AvisoDeVersao.tsx`.
 *
 * Fora da Vercel não existe deploy, então "dev" serve: o aviso nunca dispara
 * em desenvolvimento, que é o comportamento certo.
 */
const versao = process.env.VERCEL_GIT_COMMIT_SHA?.slice(0, 12) ?? "dev";

const nextConfig: NextConfig = {
  reactStrictMode: true,
  env: { NEXT_PUBLIC_VERSAO: versao },
  async headers() {
    return [
      { source: "/:path*", headers: cabecalhos },
      /*
       * O service worker nunca vem do cache.
       *
       * Ele é o arquivo que decide o que os outros podem guardar, então uma
       * cópia velha dele é o pior tipo de cópia velha: o navegador seguiria
       * uma regra que já foi corrigida, e não haveria como publicar a
       * correção. O padrão de arquivo em /public é cacheável, e é justamente
       * o que não serve aqui.
       *
       * A tela de sem-sinal sai pela mesma porta: quem a guarda é o service
       * worker, no `install`, e um intermediário guardando por conta própria
       * atrapalharia a troca dela numa publicação nova.
       */
      {
        source: "/:arquivo(sw.js|offline.html)",
        headers: [
          { key: "Cache-Control", value: "public, max-age=0, must-revalidate" },
        ],
      },
    ];
  },
};

export default nextConfig;
