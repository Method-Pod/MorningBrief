import { lookup } from "node:dns/promises";

/**
 * Trava para o servidor não ser usado como binóculo da rede interna.
 *
 * O problema tem nome — SSRF — e nasce de uma coisa inocente: `/api/link`
 * recebe um endereço digitado na tela e o servidor vai buscar aquela página
 * para ler o título e a imagem. Quem digita o endereço decide para onde o
 * **servidor** conecta, e o servidor está dentro da rede, não fora dela.
 *
 * Um endereço como `http://169.254.169.254/latest/meta-data/` não aponta para
 * a internet: aponta para o serviço de metadados da própria máquina na
 * nuvem, onde ficam credenciais. `http://localhost:3000/...` alcança o que só
 * a máquina alcança. E como a rota devolve o título e a descrição do que leu,
 * parte da resposta volta para a tela — é leitura, não é só conexão cega.
 *
 * Hoje as rotas exigem sessão, então quem alcança isto é ele mesmo; a trava é
 * por não depender disso continuar verdade amanhã, e porque o custo dela é
 * uma consulta de DNS.
 *
 * **O que esta trava não resolve:** o endereço é resolvido aqui e resolvido
 * de novo pelo `fetch`, e entre uma coisa e outra o DNS pode responder
 * diferente — é o truque conhecido como *DNS rebinding*. Fechar essa fresta
 * exigiria conectar pelo IP já conferido, com um agente HTTP próprio. Fica
 * registrado: as portas óbvias estão fechadas, esta continua entreaberta.
 */

/** Portas de web. Um endereço apontando para 6379 não quer ler uma página. */
const PORTAS = new Set(["", "80", "443"]);

/**
 * Nomes que nunca são a internet.
 *
 * `.local` é mDNS (impressora, NAS da casa), `.internal` é o nome interno de
 * várias nuvens, e `localhost` é a própria máquina. Nenhum deles chega a
 * passar por DNS público, então é mais barato barrar pelo nome.
 */
const NOMES_DE_CASA =
  /(^|\.)(localhost|local|internal|intranet|lan|home|corp)$/i;

/**
 * Faixas de IP que não são endereço público.
 *
 * A lista é a das reservadas pela IANA que importam aqui. `100.64/10` é o
 * CGNAT das operadoras; `169.254/16` é o link-local, onde mora o serviço de
 * metadados das nuvens; `0.0.0.0/8` costuma ser atalho para a própria
 * máquina.
 */
function ipv4Privado(ip: string): boolean {
  const p = ip.split(".").map(Number);
  if (p.length !== 4 || p.some((n) => !Number.isInteger(n) || n < 0 || n > 255))
    return true; /* não entendi: trata como suspeito */
  const [a, b] = p;
  return (
    a === 0 ||
    a === 10 ||
    a === 127 ||
    (a === 100 && b >= 64 && b <= 127) ||
    (a === 169 && b === 254) ||
    (a === 172 && b >= 16 && b <= 31) ||
    (a === 192 && b === 168) ||
    (a === 192 && b === 0) ||
    (a === 198 && b >= 18 && b <= 19) ||
    a >= 224 /* multicast e reservado */
  );
}

function ipv6Privado(ip: string): boolean {
  const v = ip.toLowerCase().replace(/^\[|\]$/g, "");

  /*
   * Tudo que começa em `::` é barrado, e isso não é excesso de zelo.
   *
   * O IPv6 público da internet mora em 2000::/3, ou seja, começa em 2 ou 3.
   * O que começa em `::` é o espaço especial: `::` (não especificado), `::1`
   * (a própria máquina) e `::ffff:…` (um IPv4 vestido de IPv6).
   *
   * A regra larga é o conserto de um furo real, achado no teste:
   * `http://[::ffff:10.0.0.1]/` passava. O motivo é que o analisador de
   * endereços do navegador e do Node **reescreve** aquilo como
   * `[::ffff:a00:1]` — o mesmo endereço em hexadecimal —, e a conferência
   * que procurava o formato com pontos não via nada. Procurar cada
   * disfarce do IPv4 dentro do IPv6 é jogo de gato e rato; barrar o prefixo
   * inteiro não é.
   */
  if (v.startsWith("::")) return true;

  return (
    /^f[cd]/.test(v) /* fc00::/7, endereço local único */ ||
    /^fe[89ab]/.test(v) /* fe80::/10, link-local */ ||
    /^ff/.test(v) /* multicast */
  );
}

const ehIPv4 = (h: string) => /^\d{1,3}(\.\d{1,3}){3}$/.test(h);

export type Veredito = { ok: true } | { ok: false; motivo: string };

/**
 * O endereço aponta para a internet pública?
 *
 * Confere na ordem do mais barato para o mais caro: esquema, porta, nome
 * suspeito, IP escrito à mão e, só no fim, o DNS. Um endereço barrado nos
 * primeiros passos nem chega a custar uma consulta.
 */
export async function enderecoPublico(alvo: URL): Promise<Veredito> {
  if (alvo.protocol !== "http:" && alvo.protocol !== "https:")
    return { ok: false, motivo: "esquema" };

  if (!PORTAS.has(alvo.port)) return { ok: false, motivo: "porta" };

  const host = alvo.hostname.replace(/^\[|\]$/g, "");
  if (!host) return { ok: false, motivo: "sem-host" };
  if (NOMES_DE_CASA.test(host)) return { ok: false, motivo: "nome-interno" };

  if (ehIPv4(host))
    return ipv4Privado(host) ? { ok: false, motivo: "ip-privado" } : { ok: true };

  if (host.includes(":"))
    return ipv6Privado(host) ? { ok: false, motivo: "ip-privado" } : { ok: true };

  /*
   * Nome comum: resolve e confere o que saiu.
   *
   * `all: true` porque um nome pode responder vários endereços, e basta um
   * deles ser interno para o truque funcionar — quem escolhe qual usar na
   * hora da conexão é o sistema, não nós.
   *
   * Nome que não resolve é barrado. Ele não ia carregar de todo jeito, e
   * deixar passar o que não se conseguiu conferir é o oposto do que esta
   * função existe para fazer.
   */
  try {
    const enderecos = await lookup(host, { all: true, verbatim: true });
    if (!enderecos.length) return { ok: false, motivo: "sem-dns" };
    const interno = enderecos.some((e) =>
      e.family === 4 ? ipv4Privado(e.address) : ipv6Privado(e.address)
    );
    return interno ? { ok: false, motivo: "resolve-interno" } : { ok: true };
  } catch {
    return { ok: false, motivo: "sem-dns" };
  }
}

/** O mesmo veredito a partir de texto, para quem tem só a string. */
export async function enderecoPublicoTexto(cru: string): Promise<Veredito> {
  let u: URL;
  try {
    u = new URL(cru);
  } catch {
    return { ok: false, motivo: "endereco-invalido" };
  }
  return enderecoPublico(u);
}
