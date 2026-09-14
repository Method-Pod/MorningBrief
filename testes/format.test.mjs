import { test } from "node:test";
import assert from "node:assert/strict";
import {
  brl, dateBR, dataCurta, rotuloMes, daysUntil, ultimosDias, semanaDe,
  valorDigitado, normalizarLink, rotuloDeLink, localDay, todayISO,
  dateTimeBR, localTime,
} from "../src/lib/format.ts";

/* ------------------------------ dinheiro ------------------------------ */

test("valorDigitado entende os dois jeitos de escrever dinheiro", () => {
  /* Formato daqui: ponto e milhar, virgula e decimal. */
  assert.equal(valorDigitado("1.234,56"), 1234.56);
  assert.equal(valorDigitado("1.500"), 1500);
  assert.equal(valorDigitado("12.345.678,90"), 12345678.9);
  assert.equal(valorDigitado("0,99"), 0.99);
  assert.equal(valorDigitado("R$ 1.234,56"), 1234.56);

  /* Formato do teclado e do extrato em ingles. Era aqui que dava 100x. */
  assert.equal(valorDigitado("1234.56"), 1234.56);
  assert.equal(valorDigitado("1234.5"), 1234.5);
  assert.equal(valorDigitado("0.99"), 0.99);

  /* Sem separador nenhum. */
  assert.equal(valorDigitado("1234"), 1234);
  assert.equal(valorDigitado(1234.56), 1234.56);

  /* Negativo (abatimento digitado com sinal). */
  assert.equal(valorDigitado("-50,25"), -50.25);

  /* Nao sobra numero: NaN, para quem chama decidir o recado. */
  assert.ok(Number.isNaN(valorDigitado("")));
  assert.ok(Number.isNaN(valorDigitado("abc")));
  assert.ok(Number.isNaN(valorDigitado("R$")));
});

test("brl nunca escreve NaN na tela", () => {
  assert.equal(brl(0).replace(/\u00a0/g, " "), "R$ 0,00");
  assert.equal(brl(NaN).replace(/\u00a0/g, " "), "R$ 0,00");
  assert.equal(brl(Infinity).replace(/\u00a0/g, " "), "R$ 0,00");
  assert.equal(brl(1234.5).replace(/\u00a0/g, " "), "R$ 1.234,50");
});

/* -------------------------------- datas -------------------------------- */

test("dateBR nao escorrega de fuso", () => {
  assert.equal(dateBR("2026-01-01"), "01/01/2026");
  assert.equal(dateBR("2026-12-31T23:00:00Z"), "31/12/2026");
  assert.equal(dateBR(null), "—");
});

test("dataCurta e rotuloMes", () => {
  assert.equal(dataCurta("2026-08-04"), "04 de ago.");
  assert.equal(dataCurta("2026-12-25"), "25 de dez.");
  assert.equal(dataCurta(null), "—");
  assert.equal(rotuloMes("2026-08"), "ago/26");
});

test("daysUntil conta dias corridos a partir de hoje", () => {
  const hoje = todayISO();
  assert.equal(daysUntil(hoje), 0);
  const d = new Date(hoje + "T00:00:00");
  d.setDate(d.getDate() + 5);
  const daqui5 = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
  assert.equal(daysUntil(daqui5), 5);
});

test("ultimosDias devolve n dias terminando no fim, em ordem", () => {
  const d = ultimosDias("2026-03-03", 5);
  assert.deepEqual(d, ["2026-02-27", "2026-02-28", "2026-03-01", "2026-03-02", "2026-03-03"]);
});

test("semanaDe vai sempre de segunda a domingo", () => {
  /* 2026-09-14 e uma segunda. */
  const s = semanaDe("2026-09-14");
  assert.equal(s.length, 7);
  assert.equal(s[0], "2026-09-14");
  assert.equal(s[6], "2026-09-20");

  /* Domingo pertence a semana que comecou na segunda anterior. */
  const dom = semanaDe("2026-09-20");
  assert.equal(dom[0], "2026-09-14");

  /* Deslocada. */
  assert.equal(semanaDe("2026-09-14", -1)[0], "2026-09-07");
});

test("localDay aguenta timestamp torto sem quebrar", () => {
  assert.equal(localDay(null), "");
  assert.equal(localDay("nao-e-data"), "nao-e-data");
});

test("dateTimeBR e localTime aguentam timestamp torto sem quebrar", () => {
  /* Regressao: Intl.format(Invalid Date) levanta RangeError e derruba a
     arvore inteira do React — uma linha ruim no banco apagaria a tela. */
  assert.doesNotThrow(() => dateTimeBR("nao-e-data"));
  assert.doesNotThrow(() => localTime("nao-e-data"));
  assert.equal(dateTimeBR(null), "—");
  assert.equal(localTime(null), "");
});

/* -------------------------------- links -------------------------------- */

test("normalizarLink poe esquema em endereco colado sem esquema", () => {
  assert.equal(normalizarLink("drive.google.com/x"), "https://drive.google.com/x");
  assert.equal(normalizarLink("https://a.com"), "https://a.com");
  assert.equal(normalizarLink("http://a.com"), "http://a.com");
  assert.equal(normalizarLink("  "), "");
});

test("rotuloDeLink mostra o dominio", () => {
  assert.equal(rotuloDeLink("https://www.google.com/algo/muito/longo"), "google.com");
  assert.equal(rotuloDeLink("drive.google.com/x"), "drive.google.com");
});

/* --------------------------- gravou ou não? --------------------------- */

const { nenhumaLinha, NADA_GRAVADO } = await import("../src/lib/erros.ts");

test("nenhumaLinha acusa a gravacao que nao alcancou linha nenhuma", () => {
  /* O PostgREST responde 204 sem erro quando o filtro nao casa com nada, e
     `data` volta vazio. Sem isto, a tela fecharia dizendo "salvo". */
  assert.ok(nenhumaLinha([]), "lista vazia e falha");
  assert.ok(nenhumaLinha(null), "nulo e falha");
  assert.ok(nenhumaLinha(undefined), "indefinido e falha");
  assert.equal(nenhumaLinha([{ id: "1" }]), null, "uma linha e sucesso");
  assert.equal(nenhumaLinha([{ id: "1" }, { id: "2" }]), null);
});

test("a mensagem entra na frase que notice.check monta", () => {
  /* `check` escreve "Nao foi possivel X: <mensagem>", entao a mensagem nao
     pode ter comeco proprio — sairia com dois comecos. */
  const m = nenhumaLinha([]).message;
  assert.ok(m.length > 0);
  assert.equal(m[0], m[0].toLowerCase(), "comeca em minuscula, e continuacao");
  assert.ok(!m.startsWith("Nada foi gravado"), "esse comeco e o do NADA_GRAVADO");
  assert.ok(NADA_GRAVADO.startsWith("Nada foi gravado"));
});
