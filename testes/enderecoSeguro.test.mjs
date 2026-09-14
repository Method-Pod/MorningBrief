import { test } from "node:test";
import assert from "node:assert/strict";
import { enderecoPublicoTexto } from "../src/lib/enderecoSeguro.ts";

/**
 * A trava que impede o servidor de virar binoculo da rede interna.
 *
 * Os casos abaixo nao tocam a rede: todos sao barrados antes do DNS, que e
 * justamente o desenho da funcao — o caro fica por ultimo.
 */

const barra = async (url, motivo) => {
  const v = await enderecoPublicoTexto(url);
  assert.equal(v.ok, false, `deveria barrar: ${url}`);
  if (motivo) assert.equal(v.motivo, motivo, `motivo errado para ${url}`);
};

test("barra o que nao e http nem https", async () => {
  await barra("file:///etc/passwd", "esquema");
  await barra("ftp://exemplo.com/x", "esquema");
  await barra("gopher://exemplo.com", "esquema");
});

test("barra porta que nao e de web", async () => {
  await barra("http://exemplo.com:6379/", "porta");
  await barra("http://exemplo.com:22/", "porta");
  await barra("http://exemplo.com:3000/", "porta");
});

test("barra nome de rede de casa", async () => {
  await barra("http://localhost/x", "nome-interno");
  await barra("http://impressora.local/", "nome-interno");
  await barra("http://api.internal/", "nome-interno");
  await barra("http://algo.intranet/", "nome-interno");
});

test("barra IPv4 reservado, inclusive o de metadados da nuvem", async () => {
  /* 169.254.169.254 e onde moram as credenciais da maquina na nuvem. */
  await barra("http://169.254.169.254/latest/meta-data/", "ip-privado");
  await barra("http://127.0.0.1:80/", "ip-privado");
  await barra("http://10.0.0.5/", "ip-privado");
  await barra("http://192.168.0.1/", "ip-privado");
  await barra("http://172.16.5.4/", "ip-privado");
  await barra("http://172.31.255.255/", "ip-privado");
  await barra("http://100.100.0.1/", "ip-privado");
  await barra("http://0.0.0.0/", "ip-privado");
  await barra("http://224.0.0.1/", "ip-privado");
});

test("172.32 ja e publico — a faixa privada termina em 172.31", async () => {
  const v = await enderecoPublicoTexto("http://172.32.0.1/");
  assert.equal(v.ok, true, "barrar demais quebraria site legitimo");
});

test("barra IPv6 interno, inclusive o IPv4 disfarcado", async () => {
  /* Regressao: `[::ffff:10.0.0.1]` passava, porque o analisador de enderecos
     reescreve aquilo como `[::ffff:a00:1]` e a conferencia procurava pontos. */
  await barra("http://[::ffff:10.0.0.1]/", "ip-privado");
  await barra("http://[::ffff:169.254.169.254]/", "ip-privado");
  await barra("http://[::1]/", "ip-privado");
  await barra("http://[fd00::1]/", "ip-privado");
  await barra("http://[fe80::1]/", "ip-privado");
  await barra("http://[ff02::1]/", "ip-privado");
});

test("IPv6 publico passa", async () => {
  const v = await enderecoPublicoTexto("http://[2606:4700:4700::1111]/");
  assert.equal(v.ok, true);
});

test("texto que nem e endereco e barrado", async () => {
  await barra("nao e um endereco", "endereco-invalido");
  await barra("", "endereco-invalido");
});

test("nome que nao resolve e barrado, nao liberado", async () => {
  /* Deixar passar o que nao se conseguiu conferir e o oposto do que a
     funcao existe para fazer. .invalid nunca resolve, por norma. */
  await barra("http://nao-existe-mesmo.invalid/", "sem-dns");
});
