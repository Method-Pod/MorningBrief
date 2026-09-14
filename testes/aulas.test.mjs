import { test } from "node:test";
import assert from "node:assert/strict";
import {
  fonteDoLink,
  normalizarUrl,
  duracaoExata,
  duracaoDaAula,
  pctAssistido,
  idDaPlaylist,
  idDoVideo,
  segundosDaDuracao,
  segundosDoTexto,
  textoDaDuracao,
} from "../src/lib/aulas.ts";

test("fonteDoLink reconhece YouTube, Telegram e o resto", () => {
  assert.equal(fonteDoLink("https://youtube.com/watch?v=abc"), "youtube");
  assert.equal(fonteDoLink("youtu.be/abc"), "youtube");
  assert.equal(fonteDoLink("https://m.youtube.com/watch?v=abc"), "youtube");
  assert.equal(fonteDoLink("https://t.me/canal/12"), "telegram");
  assert.equal(fonteDoLink("https://drive.google.com/x"), "outro");
  /* Nao pode confundir um dominio que so termina parecido. */
  assert.equal(fonteDoLink("https://naoeyoutube.com.br/x"), "outro");
});

test("normalizarUrl poe https no que foi colado sem esquema", () => {
  assert.equal(normalizarUrl("youtu.be/abc"), "https://youtu.be/abc");
  assert.equal(normalizarUrl("http://a.com"), "http://a.com");
  assert.equal(normalizarUrl("  "), "");
});

test("idDoVideo cobre as formas que o YouTube usa", () => {
  const ID = "dQw4w9WgXcQ";
  assert.equal(idDoVideo(`https://www.youtube.com/watch?v=${ID}`), ID);
  assert.equal(idDoVideo(`https://youtu.be/${ID}`), ID);
  assert.equal(idDoVideo(`https://youtu.be/${ID}?t=42`), ID);
  assert.equal(idDoVideo(`https://www.youtube.com/shorts/${ID}`), ID);
  assert.equal(idDoVideo(`https://www.youtube.com/embed/${ID}`), ID);
  assert.equal(idDoVideo(`https://www.youtube.com/live/${ID}`), ID);
  assert.equal(idDoVideo(`https://m.youtube.com/watch?v=${ID}&list=PL1`), ID);
});

test("idDoVideo recusa o que nao e id de video", () => {
  assert.equal(idDoVideo("https://youtube.com/@canal"), null);
  assert.equal(idDoVideo("https://youtube.com/watch?v=curto"), null);
  assert.equal(idDoVideo("https://vimeo.com/12345"), null);
  assert.equal(idDoVideo("nao e link"), null);
});

test("idDaPlaylist aceita a pagina e o video tocando dentro dela", () => {
  assert.equal(idDaPlaylist("https://youtube.com/playlist?list=PLabc"), "PLabc");
  assert.equal(idDaPlaylist("https://youtube.com/watch?v=x&list=PLabc"), "PLabc");
  /* As listas privadas do proprio usuario a API nao devolve. */
  assert.equal(idDaPlaylist("https://youtube.com/playlist?list=WL"), null);
  assert.equal(idDaPlaylist("https://youtube.com/playlist?list=LL"), null);
  assert.equal(idDaPlaylist("https://youtube.com/watch?v=x"), null);
});

test("segundosDaDuracao le o formato ISO do YouTube", () => {
  assert.equal(segundosDaDuracao("PT1H2M10S"), 3730);
  assert.equal(segundosDaDuracao("PT3M34S"), 214);
  assert.equal(segundosDaDuracao("PT45S"), 45);
  assert.equal(segundosDaDuracao("P1DT2H"), 7200);
  assert.equal(segundosDaDuracao("PT0S"), null);
  assert.equal(segundosDaDuracao("lixo"), null);
  assert.equal(segundosDaDuracao(null), null);
  assert.equal(segundosDaDuracao(42), null);
});

test("segundosDoTexto entende relogio, letras e numero solto", () => {
  assert.equal(segundosDoTexto("1:23:45"), 5025);
  assert.equal(segundosDoTexto("23:45"), 1425, "duas partes sao minuto e segundo");
  assert.equal(segundosDoTexto("1h23m45s"), 5025);
  assert.equal(segundosDoTexto("90min"), 5400);
  assert.equal(segundosDoTexto("83"), 4980, "numero solto e minuto");
  /* Regressao: "45s" saia como 4 minutos e 5 segundos, porque o motor
     repartia o numero para fazer o resto casar. */
  assert.equal(segundosDoTexto("45s"), 45);
  assert.equal(segundosDoTexto("1h23"), 4980);
  assert.equal(segundosDoTexto(" 1 h 23 m "), 4980, "espaco nao atrapalha");
});

test("segundosDoTexto recusa o que nao da para entender", () => {
  assert.equal(segundosDoTexto(""), null);
  assert.equal(segundosDoTexto("uma hora"), null);
  assert.equal(segundosDoTexto("0"), null);
  assert.equal(segundosDoTexto("12:99"), null, "99 nao e segundo valido");
});

test("duracaoExata escreve sem as partes que valem zero", () => {
  assert.equal(duracaoExata(5025), "1h23m45s");
  assert.equal(duracaoExata(3600), "1h");
  assert.equal(duracaoExata(214), "3m34s");
  assert.equal(duracaoExata(45), "45s");
  assert.equal(duracaoExata(0), null);
  assert.equal(duracaoExata(null), null);
});

test("o texto da duracao volta a ser o mesmo numero", () => {
  /* O campo pode ser preenchido pelo link e editado a mao: as duas pontas
     precisam falar a mesma lingua. */
  for (const s of [45, 214, 3600, 5025, 90, 7325]) {
    assert.equal(segundosDoTexto(textoDaDuracao(s)), s, `ida e volta de ${s}s`);
  }
});

test("duracaoDaAula atravessa a migracao de minutos para segundos", () => {
  assert.equal(duracaoDaAula({ duracao_seg: 300 }), 300);
  assert.equal(duracaoDaAula({ duracao_seg: null, minutos: 5 }), 300);
  assert.equal(duracaoDaAula({ duracao_seg: null, minutos: null }), null);
});

test("pctAssistido compara minuto com segundo na unidade certa", () => {
  assert.equal(pctAssistido({ duracao_seg: 600, em_minuto: 5 }), 50);
  assert.equal(pctAssistido({ duracao_seg: 600, em_minuto: 0 }), 0);
  /* Passar do fim nao pode dar mais de 100. */
  assert.equal(pctAssistido({ duracao_seg: 600, em_minuto: 30 }), 100);
  assert.equal(pctAssistido({ duracao_seg: null, em_minuto: 5 }), null);
  assert.equal(pctAssistido({ duracao_seg: 600, em_minuto: null }), null);
});
