/*
 * Refaz os ícones do app a partir da marca (public/marca-clara.svg).
 *
 *   node scripts/gerar-icones.mjs
 *
 * Gera o ícone da aba (src/app/icon.png), o do iPhone (src/app/apple-icon.png),
 * os do app instalado (public/app-icon-*.png) e os ladrilhos em SVG
 * (public/icon-dark.svg e icon-light.svg). Todos no mesmo desenho: o
 * hexágono claro sobre um quadrado em degradê preto.
 *
 * Depois de rodar, suba o número do CACHE em public/sw.js: o app guarda os
 * ícones no aparelho pelo nome do arquivo, e sem isso o desenho antigo fica.
 *
 * O sharp já vem com o Next; nada a instalar.
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import sharp from "sharp";

const RAIZ = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const D = /d="([^"]+)"/.exec(fs.readFileSync(path.join(RAIZ, "public/marca-clara.svg"), "utf8"))[1];

/* O fundo do ladrilho: degradê preto, do canto de cima para o de baixo. */
const FUNDO = `<linearGradient id="bg" x1="168.907" y1="0" x2="831.093" y2="1000" gradientUnits="userSpaceOnUse"><stop stop-color="#3a3a3a"/><stop offset="1" stop-color="#000000"/></linearGradient>`;
/* O hexágono: as versões 4 (claro, sobre o escuro) e 3 (escuro, sobre o branco). */
const DEGRADE_CLARO = `<linearGradient id="m" x1="260.543" y1="38.5473" x2="0" y2="261.345" gradientUnits="userSpaceOnUse"><stop stop-color="#ffffff"/><stop offset="1" stop-color="#999999"/></linearGradient>`;
const DEGRADE_ESCURO = `<linearGradient id="m" x1="216.592" y1="0" x2="43.9514" y2="299.893" gradientUnits="userSpaceOnUse"><stop stop-color="#000000"/><stop offset="1" stop-color="#666666"/></linearGradient>`;

/* O desenho num quadrado de 1000, com a altura pedida, centrado. */
const marca = (altura) => {
  const k = altura / 300;
  const tx = (1000 - 261 * k) / 2;
  const ty = (1000 - 300 * k) / 2;
  return `<g transform="translate(${tx.toFixed(2)} ${ty.toFixed(2)}) scale(${k.toFixed(4)})"><path d="${D}" fill="url(#m)"/></g>`;
};

const ladrilho = ({ rx, altura, claro = false }) =>
  `<svg width="1000" height="1000" viewBox="0 0 1000 1000" fill="none" xmlns="http://www.w3.org/2000/svg"><defs>${
    claro ? DEGRADE_ESCURO : DEGRADE_CLARO + FUNDO
  }</defs><rect width="1000" height="1000" rx="${rx}" fill="${claro ? "#ffffff" : "url(#bg)"}"/>${marca(altura)}</svg>`;

const png = (fonte, tamanho, saida) =>
  sharp(Buffer.from(fonte), { density: 300 })
    .resize(tamanho, tamanho)
    .png()
    .toFile(path.join(RAIZ, saida));

fs.writeFileSync(path.join(RAIZ, "public/icon-dark.svg"), ladrilho({ rx: 250, altura: 560 }));
fs.writeFileSync(path.join(RAIZ, "public/icon-light.svg"), ladrilho({ rx: 250, altura: 560, claro: true }));

await png(ladrilho({ rx: 250, altura: 560 }), 192, "src/app/icon.png");
await png(ladrilho({ rx: 250, altura: 560 }), 192, "public/app-icon-192.png");
await png(ladrilho({ rx: 250, altura: 560 }), 512, "public/app-icon-512.png");
/* O iPhone arredonda sozinho e pinta de preto o que for transparente: quadrado cheio. */
await png(ladrilho({ rx: 0, altura: 560 }), 180, "src/app/apple-icon.png");
/* Maskable: o sistema recorta em círculo ou gota; o desenho fica na zona segura. */
await png(ladrilho({ rx: 0, altura: 440 }), 512, "public/app-icon-maskable.png");

console.log("ícones refeitos");
