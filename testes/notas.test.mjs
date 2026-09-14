import { test } from "node:test";
import assert from "node:assert/strict";
import { paraEditor, textoDaNota, notaVazia, urlCurta } from "../src/lib/notas.ts";
import { metatag, decodificarHtml } from "../src/lib/paginaRemota.ts";

/* ------------------------------ anotacoes ------------------------------ */

test("nota antiga de texto puro vira um paragrafo por linha", () => {
  assert.equal(paraEditor("uma linha"), "<p>uma linha</p>");
  assert.equal(paraEditor("a\nb"), "<p>a</p><p>b</p>");
  /* Linha vazia era a separacao entre dois assuntos: engoli-la mudaria o
     que a pessoa escreveu. */
  assert.equal(paraEditor("a\n\nb"), "<p>a</p><p></p><p>b</p>");
  assert.equal(paraEditor(""), "");
  assert.equal(paraEditor("   "), "");
});

test("texto puro com sinal de menor nao vira tag inventada", () => {
  assert.equal(paraEditor("3 < 5"), "<p>3 &lt; 5</p>");
  assert.equal(paraEditor('aspas "assim"'), "<p>aspas &quot;assim&quot;</p>");
  assert.equal(paraEditor("a & b"), "<p>a &amp; b</p>");
});

test("nota que ja e HTML do editor passa intacta", () => {
  const html = "<p>ja era html</p><ul><li>x</li></ul>";
  assert.equal(paraEditor(html), html);
  assert.equal(paraEditor("<h2>titulo</h2>"), "<h2>titulo</h2>");
});

test("textoDaNota tira as tags para a busca nao procurar dentro delas", () => {
  /* A busca comparava `content` cru: procurar "div" achava toda nota que
     tivesse uma. */
  assert.equal(textoDaNota("<p>oi</p>"), "oi");
  assert.equal(textoDaNota('<p class="x">oi</p>'), "oi");
  assert.equal(textoDaNota("<div>nada aqui</div>"), "nada aqui");
});

test("blocos viram espaco, para duas palavras nao virarem uma", () => {
  assert.equal(textoDaNota("<p>fim</p><p>inicio</p>"), "fim inicio");
  assert.equal(textoDaNota("<li>a</li><li>b</li>"), "a b");
  assert.equal(textoDaNota("linha1<br>linha2"), "linha1 linha2");
});

test("entidades voltam a ser caractere", () => {
  assert.equal(textoDaNota("<p>3 &lt; 5 &amp; 6 &gt; 2</p>"), "3 < 5 & 6 > 2");
  assert.equal(textoDaNota("<p>a&nbsp;b</p>"), "a b");
});

test("notaVazia enxerga o paragrafo vazio que o editor deixa", () => {
  assert.equal(notaVazia("<p></p>"), true);
  assert.equal(notaVazia(""), true);
  assert.equal(notaVazia("<p><br></p>"), true);
  assert.equal(notaVazia("<p>a</p>"), false);
});

test("urlCurta mostra o que identifica a pagina", () => {
  assert.equal(urlCurta("https://draana.vercel.app/sites/tdah"), "tdah");
  assert.equal(urlCurta("https://www.google.com"), "google.com");
  assert.equal(urlCurta("https://www.google.com/"), "google.com");
  /* "watch" nao identifica nada: o dominio diz mais. */
  assert.equal(urlCurta("https://youtube.com/watch?v=abc"), "youtube.com");
  assert.equal(urlCurta("https://site.com/artigo.html"), "artigo");
  assert.equal(urlCurta("nao e url"), "nao e url");
});

test("urlCurta corta o pedaco longo demais", () => {
  const longo = urlCurta("https://site.com/" + "a".repeat(60));
  assert.ok(longo.length <= 28, `ficou com ${longo.length}`);
  assert.ok(longo.endsWith("…"));
});

/* ------------------------ leitura de pagina alheia ------------------------ */

test("metatag acha a tag nas duas ordens de atributo", () => {
  assert.equal(
    metatag('<meta property="og:title" content="Titulo">', "og:title"),
    "Titulo"
  );
  assert.equal(
    metatag('<meta content="Titulo" property="og:title">', "og:title"),
    "Titulo"
  );
  assert.equal(
    metatag('<meta name="description" content="Desc">', "description"),
    "Desc"
  );
  assert.equal(metatag("<html></html>", "og:title"), null);
});

test("metatag nao se confunde com o ponto do nome", () => {
  /* O ponto e caractere especial em expressao regular: sem escapar, "og:x"
     acharia "ogAx". */
  assert.equal(metatag('<meta property="ogXtitle" content="a">', "og:title"), null);
});

test("decodificarHtml desfaz as entidades na ordem certa", () => {
  assert.equal(decodificarHtml("Papo &amp; Elite"), "Papo & Elite");
  assert.equal(decodificarHtml("&#39;aspas&#39;"), "'aspas'");
  assert.equal(decodificarHtml("&quot;x&quot;"), '"x"');
  /* `&amp;lt;` e um "&lt;" escrito literalmente: nao pode virar "<". */
  assert.equal(decodificarHtml("&amp;lt;"), "&lt;");
});
