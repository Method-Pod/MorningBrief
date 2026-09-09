import type { MetadataRoute } from "next";

/**
 * A carteira de identidade do app.
 *
 * Um site não vira aplicativo sozinho: ele precisa se declarar um. Este
 * arquivo é essa declaração — o Next o serve em /manifest.webmanifest e o
 * injeta no <head> de toda página. Sem ele o navegador não tem como saber que
 * a página quer virar app, então faz a única coisa que sabe fazer, que é um
 * atalho para dentro do navegador.
 *
 * O que cada campo destrava:
 *
 * - `display: standalone` é o que tira a barra de endereço e as abas. É o
 *   campo que separa "app" de "atalho".
 * - `icons` com 192 e 512 é o mínimo que o Chrome exige para oferecer
 *   "Instalar". Com um só tamanho ele instala mas escolhe mal onde reduzir.
 * - `background_color` é a cor da tela que aparece no meio segundo entre
 *   tocar no ícone e a página pintar. Diferente do fundo real do app, é aí
 *   que se vê o pisca-pisca branco de PWA malfeito — daí ser o mesmo
 *   `--a-bg` do globals.css.
 * - `shortcuts` é o menu que aparece ao segurar o ícone na tela de início.
 *
 * O que NÃO está aqui, de propósito: `orientation`. Travar em retrato
 * quebraria o app instalado no computador, que é a mesma declaração.
 */

const DESC =
  "Seu painel do dia: demandas, recorrências, hábitos, anotações, agenda e contas a pagar em um só lugar.";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "Morning Brief",
    /*
     * O rótulo debaixo do ícone, e só ele. Android e iOS cortam em torno de
     * 12 caracteres, e "Morning Brief" tem 13 — apareceria como "Morning
     * Bri…". O nome cheio continua valendo na janela e na lista de apps.
     */
    short_name: "Brief",
    description: DESC,
    lang: "pt-BR",
    dir: "ltr",
    start_url: "/",
    scope: "/",
    display: "standalone",
    background_color: "#f1f4f7",
    theme_color: "#f1f4f7",
    categories: ["productivity"],
    icons: [
      {
        src: "/app-icon-192.png",
        sizes: "192x192",
        type: "image/png",
        purpose: "any",
      },
      {
        src: "/app-icon-512.png",
        sizes: "512x512",
        type: "image/png",
        purpose: "any",
      },
      /*
       * A versão recortável, separada da normal e não no lugar dela.
       *
       * O Android recorta o ícone na forma do próprio sistema — círculo,
       * quadrado arredondado, gota — e só garante o que cai dentro do círculo
       * de 80% do lado. A arte normal já vem com canto arredondado, e um
       * recorte circular por cima dela come os cantos; esta sangra até a
       * borda e tem o desenho reduzido para caber na zona segura.
       *
       * Declarar as duas quer dizer que quem recorta usa esta, e quem mostra
       * o ícone como está — Windows, iOS, a aba do navegador — usa a outra.
       */
      {
        src: "/app-icon-maskable.png",
        sizes: "512x512",
        type: "image/png",
        purpose: "maskable",
      },
    ],
    shortcuts: [
      { name: "Demandas", url: "/demandas" },
      { name: "Anotações", url: "/anotacoes" },
      { name: "Contas a pagar", url: "/contas" },
    ],
  };
}
