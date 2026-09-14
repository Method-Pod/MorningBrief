import { test } from "node:test";
import assert from "node:assert/strict";
import { sugerirCategoria } from "../src/lib/categoriaSugerida.ts";

const TODAS = [
  "Cartão", "Streaming", "Internet", "Moradia", "Saúde", "Cuidados Pessoais",
  "Presente", "Educação", "Transporte", "Supermercado", "Impostos",
  "Software", "Marketing", "Equipe", "Empréstimo", "Seguro", "Outros",
];

const palpite = (d, lista = TODAS) => sugerirCategoria(d, lista);

test("acerta os casos que a descricao ja entrega", () => {
  assert.equal(palpite("Fatura | Nubank"), "Cartão");
  assert.equal(palpite("Netflix"), "Streaming");
  assert.equal(palpite("Internet fibra"), "Internet");
  assert.equal(palpite("Aluguel"), "Moradia");
  assert.equal(palpite("Conta de luz"), "Moradia");
  assert.equal(palpite("Academia"), "Saúde");
  assert.equal(palpite("Uber"), "Transporte");
  assert.equal(palpite("Mercado do mês"), "Supermercado");
  assert.equal(palpite("Assinatura Figma"), "Software");
  assert.equal(palpite("Seguro do carro"), "Seguro");
});

test("aceita o plural", () => {
  assert.equal(palpite("Perfumes"), "Cuidados Pessoais");
  assert.equal(palpite("Presentes de natal"), "Presente");
  assert.equal(palpite("Impostos e taxas"), "Impostos");
});

test("nao inventa categoria que a pessoa nao tem", () => {
  assert.equal(sugerirCategoria("Netflix", ["Moradia", "Outros"]), null);
});

test("compara sem acento: a lista da pessoa pode estar sem", () => {
  assert.equal(sugerirCategoria("Curso de ingles", ["Educacao"]), "Educacao");
  assert.equal(sugerirCategoria("Academia", ["Saude"]), "Saude");
});

test("descricao curta demais nao vira palpite", () => {
  assert.equal(palpite(""), null);
  assert.equal(palpite("ab"), null);
});

test("nao confunde palavra comum com termo de categoria", () => {
  /* "das" era termo da regra de Impostos (de DAS, o boleto do MEI) e casava
     com a preposicao — "Compra das fraldas" virava Impostos. */
  assert.equal(palpite("Compra das fraldas"), null);
  assert.equal(palpite("Conserto das janelas"), null);
  /* O boleto de verdade continua sendo reconhecido. */
  assert.equal(palpite("DAS MEI"), "Impostos");
  assert.equal(palpite("Boleto DAS"), "Impostos");
});

test("nao confunde Internet com a operadora dentro de outra palavra", () => {
  assert.equal(palpite("Internet"), "Internet");
  /* "inter" e banco (Cartão); "internet" nao pode cair la. */
  assert.equal(palpite("Fatura Inter"), "Cartão");
});

test("descricao sem nada reconhecivel nao gera palpite", () => {
  assert.equal(palpite("Coisa qualquer"), null);
  assert.equal(palpite("Pagamento avulso"), null);
});
