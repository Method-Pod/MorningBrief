import { test } from "node:test";
import assert from "node:assert/strict";
import { acharClassicos, juntar } from "../src/lib/regrasPt.ts";

/** O que a regra propoe para o primeiro achado, ou null. */
const sugestao = (texto) => {
  const a = acharClassicos(texto);
  return a.length ? { errado: a[0].errado, troca: a[0].trocas[0] } : null;
};

/** O texto com todas as correcoes aplicadas, de tras para frente. */
const corrigir = (texto) =>
  acharClassicos(texto)
    .slice()
    .sort((a, b) => b.inicio - a.inicio)
    .reduce(
      (t, a) => t.slice(0, a.inicio) + a.trocas[0] + t.slice(a.inicio + a.tamanho),
      texto
    );

test("pega mal e mau nos casos que decidem sozinhos", () => {
  assert.equal(corrigir("Eu dormi mau ontem."), "Eu dormi mal ontem.");
  assert.equal(corrigir("Ele passou mau na festa."), "Ele passou mal na festa.");
  assert.equal(corrigir("Estou de mal humor."), "Estou de mau humor.");
  assert.equal(corrigir("Que menino mau educado."), "Que menino mal educado.");
  assert.equal(corrigir("O trabalho ficou mau feito."), "O trabalho ficou mal feito.");
  assert.equal(corrigir("Acordei mau hoje."), "Acordei mal hoje.");
});

test("nao mexe em mal e mau quando estao certos", () => {
  assert.equal(acharClassicos("Ele e um mau motorista.").length, 0);
  assert.equal(acharClassicos("O mau tempo atrapalhou.").length, 0);
  assert.equal(acharClassicos("Dormi mal ontem.").length, 0);
});

test("pega mas e mais", () => {
  assert.equal(corrigir("Eu queria ir, mais eu nao pude."), "Eu queria ir, mas eu nao pude.");
  assert.equal(corrigir("Tentei, mais nao deu."), "Tentei, mas nao deu.");
  assert.equal(corrigir("Chegamos mas ou menos as oito."), "Chegamos mais ou menos as oito.");
});

test("nao mexe em mais de quantidade", () => {
  assert.equal(acharClassicos("Quero mais arroz.").length, 0);
  assert.equal(acharClassicos("Ele tem mais dinheiro.").length, 0);
  assert.equal(acharClassicos("Vou comprar mais tres.").length, 0);
});

test("regra dos porques", () => {
  assert.equal(corrigir("Voce fez isso porque?"), "Voce fez isso por quê?");
  assert.equal(corrigir("Nao sei o porque disso."), "Nao sei o porquê disso.");
  assert.equal(corrigir("Nao sei porque ele fez isso."), "Nao sei por que ele fez isso.");
});

test("a gente contra agente", () => {
  assert.equal(corrigir("Amanha agente vai la."), "Amanha a gente vai la.");
  assert.equal(corrigir("Acho que agente precisa conversar."), "Acho que a gente precisa conversar.");
  /* "agente" de verdade nao pode ser tocado. */
  assert.equal(acharClassicos("O agente de viagens ligou.").length, 0);
});

test("para mim antes de infinitivo", () => {
  assert.equal(corrigir("Isso e para mim fazer."), "Isso e para eu fazer.");
  assert.equal(corrigir("Trouxe pra mim assinar."), "Trouxe pra eu assinar.");
  /* "para mim" sem verbo esta certo. */
  assert.equal(acharClassicos("Isso e para mim.").length, 0);
  assert.equal(acharClassicos("Ele deu o livro para mim ontem.").length, 0);
});

test("aonde com verbo de movimento", () => {
  assert.equal(corrigir("Onde voce vai?"), "Aonde voce vai?");
  assert.equal(corrigir("Onde ele foi?"), "Aonde ele foi?");
  assert.equal(corrigir("Onde vamos?"), "Aonde vamos?");
  assert.equal(acharClassicos("Onde voce mora?").length, 0);
});

test("nao troca onde por aonde quando o verbo e auxiliar", () => {
  /* Regressao medida: «Onde vou guardar as chaves?» esta certo com "onde"
     — ali "vou" nao e ir a lugar nenhum, e auxiliar de "guardar". */
  assert.equal(acharClassicos("Onde vou guardar as chaves?").length, 0);
  assert.equal(acharClassicos("Onde eu vou colocar isso?").length, 0);
  assert.equal(acharClassicos("Onde vamos jantar hoje?").length, 0);
  assert.equal(acharClassicos("Onde ele vai morar?").length, 0);
});

test("nao chama de substantivo o porque que e conjuncao", () => {
  /* Regressao medida: a regra olhava so o artigo antes e estragava frase
     certa — «Escolhi aquele porque eu gosto dele» virava «aquele porque». */
  assert.equal(acharClassicos("Escolhi aquele porque eu gosto dele.").length, 0);
  assert.equal(acharClassicos("Peguei o porque estava barato.").length, 0);
  assert.equal(acharClassicos("Comprei esse porque era mais bonito.").length, 0);
  /* O substantivo de verdade continua sendo pego. */
  assert.equal(corrigir("Nao sei o porque disso."), "Nao sei o porquê disso.");
  assert.equal(corrigir("Quero saber o porque."), "Quero saber o porquê.");
});

test("nao mexe em disse/contou + porque, que aceita as duas leituras", () => {
  assert.equal(acharClassicos("Ele disse porque estava cansado.").length, 0);
  assert.equal(acharClassicos("Ela contou porque nao veio.").length, 0);
});

test("ha de tempo passado", () => {
  assert.equal(corrigir("Foi a dois anos atras."), "Foi há dois anos atras.");
  assert.equal(corrigir("Comprei a 3 meses atras."), "Comprei há 3 meses atras.");
});

test("mantem a caixa do original", () => {
  const s = sugestao("Porque voce fez isso?");
  /* Comeco de frase: a troca sobe a primeira letra. */
  if (s) assert.equal(s.troca[0], s.troca[0].toUpperCase());
  assert.equal(corrigir("Mais eu nao fui."), "Mas eu nao fui.");
});

test("as posicoes apontam mesmo para o trecho errado", () => {
  const texto = "Dormi mau, acordei mau, passei mau.";
  const achados = acharClassicos(texto);
  assert.equal(achados.length, 3, "tres ocorrencias, nao uma");
  achados.forEach((a) => {
    assert.equal(
      texto.slice(a.inicio, a.inicio + a.tamanho),
      a.errado,
      "a faixa marcada e exatamente o trecho errado"
    );
  });
  /* Em ordem crescente: a tela aplica de tras para frente contando com isso. */
  assert.deepEqual(
    achados.map((a) => a.inicio),
    achados.map((a) => a.inicio).slice().sort((x, y) => x - y)
  );
});

test("rodar duas vezes acha o mesmo", () => {
  /* Regressao: a flag `g` guarda lastIndex no proprio objeto. Reusar a
     instancia faria a segunda revisao comecar do meio do texto. */
  const texto = "Dormi mau e agente foi embora.";
  assert.deepEqual(acharClassicos(texto), acharClassicos(texto));
});

test("juntar deixa o servico ganhar o empate", () => {
  const doServico = [{ inicio: 6, tamanho: 3, fonte: "lt" }];
  const locais = [
    { inicio: 6, tamanho: 3, errado: "mau", trocas: ["mal"], motivo: "" },
    { inicio: 20, tamanho: 6, errado: "agente", trocas: ["a gente"], motivo: "" },
  ];
  const j = juntar(doServico, locais);
  assert.equal(j.length, 2, "o de casa que encostava saiu");
  assert.equal(j[0].fonte, "lt");
  assert.equal(j[1].inicio, 20);
});

test("juntar devolve em ordem de posicao", () => {
  const j = juntar(
    [{ inicio: 50, tamanho: 2 }],
    [{ inicio: 10, tamanho: 3, errado: "x", trocas: ["y"], motivo: "" }]
  );
  assert.deepEqual(j.map((a) => a.inicio), [10, 50]);
});

test("texto vazio nao acha nada", () => {
  assert.deepEqual(acharClassicos(""), []);
});

test("duas regras nunca apontam o mesmo trecho", () => {
  /* Regressao medida: «Quero saber o porque.» casava a regra do fim de frase
     e a do substantivo ao mesmo tempo — duas correcoes brigando pela mesma
     palavra, a de cima errada e o botao da de baixo sem efeito. */
  const frases = [
    "Quero saber o porque.",
    "Nao sei o porque.",
    "Ele perguntou o porque?",
    "Dormi mau, mais agente foi embora, e onde ele vai?",
    "Isso e para mim fazer, mais eu nao sei o porque disso.",
  ];
  for (const f of frases) {
    const a = acharClassicos(f);
    for (let i = 0; i < a.length; i++)
      for (let j = i + 1; j < a.length; j++)
        assert.ok(
          a[i].inicio + a[i].tamanho <= a[j].inicio,
          `sobreposicao em ${JSON.stringify(f)}: ${JSON.stringify([a[i], a[j]])}`
        );
  }
});

test("aplicar todas as correcoes nao estraga o texto", () => {
  assert.equal(corrigir("Quero saber o porque."), "Quero saber o porquê.");
  assert.equal(
    corrigir("Dormi mau, mais agente foi embora."),
    "Dormi mal, mas a gente foi embora."
  );
});
