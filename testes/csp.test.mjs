import { test } from "node:test";
import assert from "node:assert/strict";
import { novoNonce, politicaDeConteudo } from "../src/lib/csp.ts";

const SUPA = "https://abcdefgh.supabase.co";
const politica = (x = {}) =>
  politicaDeConteudo({ nonce: "N0NCE", supabaseUrl: SUPA, ...x });

/** As fontes declaradas para uma diretiva, como lista. */
const fontes = (texto, diretiva) => {
  const parte = texto
    .split(";")
    .map((p) => p.trim())
    .find((p) => p.startsWith(diretiva + " "));
  return parte ? parte.slice(diretiva.length + 1).split(" ") : null;
};

test("o nonce e diferente a cada chamada", () => {
  const vistos = new Set(Array.from({ length: 200 }, () => novoNonce()));
  assert.equal(vistos.size, 200, "nonce repetido e o mesmo que nao ter nonce");
  /* Base64 de 16 bytes: 24 caracteres com o preenchimento. */
  const um = novoNonce();
  assert.equal(um.length, 24);
  assert.ok(/^[A-Za-z0-9+/]+={0,2}$/.test(um), "so caracteres validos de base64");
});

test("o script so roda com o nonce do dia", () => {
  const s = fontes(politica(), "script-src");
  assert.ok(s.includes("'nonce-N0NCE'"));
  assert.ok(s.includes("'strict-dynamic'"));
});

test("unsafe-inline vem DEPOIS do nonce, como reserva para navegador antigo", () => {
  /* Navegador que entende nonce ignora `'unsafe-inline'` e `https:`; o antigo,
     que nao entende, usa os dois em vez de ficar com a tela branca. A ordem
     nao muda o comportamento, mas a presenca do nonce muda — e e ela que
     desliga o `'unsafe-inline'` onde importa. */
  const s = fontes(politica(), "script-src");
  assert.ok(s.indexOf("'nonce-N0NCE'") < s.indexOf("'unsafe-inline'"));
  assert.ok(s.includes("https:"));
});

test("eval so existe em desenvolvimento", () => {
  assert.ok(
    !fontes(politica(), "script-src").includes("'unsafe-eval'"),
    "em producao nao entra"
  );
  assert.ok(
    fontes(politica({ desenvolvimento: true }), "script-src").includes("'unsafe-eval'"),
    "o recarregamento automatico do next dev usa eval"
  );
});

test("o navegador fala com o banco, e com o oEmbed do YouTube", () => {
  const c = fontes(politica(), "connect-src");
  assert.ok(c.includes("'self'"), "as rotas de /api");
  assert.ok(c.includes(SUPA), "o banco");
  assert.ok(c.includes("wss://abcdefgh.supabase.co"), "o canal de tempo real");
  /* Regressao: `dadosDoLink` chama o oEmbed do navegador ao colar o link de
     uma aula. Sem isto, cadastrar aula pararia de trazer titulo e capa. */
  assert.ok(c.includes("https://www.youtube.com"), "o oEmbed da aula");
});

test("endereco de banco torto nao derruba a politica", () => {
  const t = politicaDeConteudo({ nonce: "N", supabaseUrl: "nao e url" });
  assert.ok(t.includes("connect-src 'self'"));
  const semNada = politicaDeConteudo({ nonce: "N" });
  assert.ok(semNada.includes("connect-src 'self'"));
});

test("imagem de qualquer site, porque o endereco e o que a pessoa cola", () => {
  const i = fontes(politica(), "img-src");
  for (const f of ["'self'", "data:", "blob:", "https:"]) assert.ok(i.includes(f), f);
});

test("o service worker do app pode ser registrado", () => {
  /* Sem isto o Chrome nao oferece "Instalar" e o app volta a ser atalho. */
  assert.ok(fontes(politica(), "worker-src").includes("'self'"));
  assert.ok(fontes(politica(), "manifest-src").includes("'self'"));
});

test("as travas que nao tem exceção", () => {
  const t = politica();
  assert.ok(t.includes("object-src 'none'"), "nada de plugin");
  assert.ok(t.includes("base-uri 'self'"), "ninguem troca o destino dos links");
  assert.ok(t.includes("form-action 'self'"), "formulario so envia para ca");
  assert.ok(t.includes("frame-ancestors 'none'"), "ninguem embute o app");
  assert.ok(t.includes("default-src 'self'"), "o que nao foi dito vem daqui");
});

test("upgrade-insecure-requests so em producao", () => {
  assert.ok(politica().includes("upgrade-insecure-requests"));
  assert.ok(
    !politica({ desenvolvimento: true }).includes("upgrade-insecure-requests"),
    "em localhost, http e o normal"
  );
});

test("o texto e uma politica valida de uma linha so", () => {
  const t = politica();
  assert.ok(!/[\r\n]/.test(t), "cabecalho HTTP nao aceita quebra de linha");
  for (const parte of t.split(";")) assert.ok(parte.trim().length > 0);
});
