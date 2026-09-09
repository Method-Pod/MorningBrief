/*
 * O ajudante que fica no aparelho.
 *
 * Duas razões para ele existir, nesta ordem:
 *
 * 1. O Chrome só oferece "Instalar" para um site que tenha um destes. É
 *    exigência dele, não escolha nossa.
 * 2. Abrir o app sem sinal mostra uma tela do app em vez do erro de rede do
 *    navegador. App de verdade não abre com dinossauro.
 *
 * O QUE ELE NÃO FAZ, de propósito — e é aqui que PWA costuma estragar dados:
 *
 * - Não guarda HTML de página. Toda tela deste app depende de quem está
 *   logado, e o middleware responde 307 para /login quando não está. Guardar
 *   isso serviria a tela de uma sessão velha, ou o login para quem já entrou.
 * - Não toca em nada do Supabase, nem em POST/PATCH/DELETE. Dado de conta não
 *   entra em cache: seria mostrar saldo de ontem como se fosse de hoje.
 * - Não toca em requisição de outro domínio.
 *
 * O que ele guarda é só o que não muda sem trocar de nome: os arquivos de
 * /_next/static, cujo nome carrega um hash do conteúdo, e os ícones. Uma
 * publicação nova gera nomes novos, então não existe versão velha servida por
 * engano — o CACHE abaixo é limpo no activate de qualquer forma.
 */

const CACHE = "mb-v1";
const OFFLINE = "/offline.html";

/*
 * Teto de arquivos de /_next/static guardados.
 *
 * O nome desses arquivos carrega um hash do conteúdo, então cada publicação
 * gera nomes novos e os antigos ficariam no aparelho para sempre — ninguém
 * mais os pede, e nada os apagava. Não quebra nada, mas é lixo acumulando no
 * telefone de quem usa o app todo dia por um ano.
 *
 * 120 dá folga larga: uma tela deste app carrega perto de 15 arquivos.
 */
const TETO = 120;

/* Só o essencial na instalação: a tela de sem-sinal precisa estar no aparelho
   ANTES de faltar sinal, senão não há como buscá-la na hora que faz falta. */
self.addEventListener("install", (evento) => {
  evento.waitUntil(
    caches
      .open(CACHE)
      .then((c) => c.addAll([OFFLINE, "/app-icon-192.png"]))
      .then(() => self.skipWaiting())
  );
});

/* Apaga cache de versão anterior e assume o controle das telas já abertas,
   para uma publicação nova não depender de fechar e reabrir o app. */
self.addEventListener("activate", (evento) => {
  evento.waitUntil(
    caches
      .keys()
      .then((nomes) =>
        Promise.all(nomes.filter((n) => n !== CACHE).map((n) => caches.delete(n)))
      )
      .then(() => self.clients.claim())
  );
});

/** Arquivo cujo nome muda quando o conteúdo muda: pode vir do aparelho. */
function eImutavel(url) {
  return (
    url.pathname.startsWith("/_next/static/") ||
    /^\/(app-icon-[\w-]+|icon|apple-icon|og|logo|icon-dark|icon-light)\.(png|svg)$/.test(
      url.pathname
    )
  );
}

self.addEventListener("fetch", (evento) => {
  const req = evento.request;
  if (req.method !== "GET") return;

  const url = new URL(req.url);
  if (url.origin !== self.location.origin) return;

  /*
   * Navegação: rede primeiro, sempre. O aparelho só entra em cena quando a
   * rede falha de fato — e aí entrega a tela de sem-sinal, não uma versão
   * velha da página pedida.
   *
   * `req.mode === "navigate"` cobre digitar endereço, recarregar e abrir o
   * app; a navegação interna do Next é fetch de dados, e cai fora daqui.
   */
  if (req.mode === "navigate") {
    evento.respondWith(
      fetch(req).catch(() =>
        caches.match(OFFLINE).then(
          (r) =>
            r ||
            new Response("Sem conexão.", {
              status: 503,
              headers: { "content-type": "text/plain; charset=utf-8" },
            })
        )
      )
    );
    return;
  }

  if (!eImutavel(url)) return;

  /* Imutável: entrega do aparelho na hora e guarda no primeiro acesso. */
  evento.respondWith(
    caches.match(req).then((guardado) => {
      if (guardado) return guardado;
      return fetch(req).then((resposta) => {
        if (resposta.ok && resposta.type === "basic") {
          const copia = resposta.clone();
          caches
            .open(CACHE)
            .then((c) => c.put(req, copia).then(() => podar(c)));
        }
        return resposta;
      });
    })
  );
});

/**
 * Apaga os arquivos de /_next/static mais antigos quando passam do teto.
 *
 * `cache.keys()` devolve na ordem em que entraram, então os primeiros da lista
 * são os mais velhos. O filtro por /_next/static não é detalhe: a tela de
 * sem-sinal e o ícone entraram no `install`, são os mais antigos de todos, e
 * uma poda ingênua começaria justamente por eles — deixando o app sem a tela
 * que a poda existe para preservar.
 */
async function podar(cache) {
  const chaves = await cache.keys();
  const podaveis = chaves.filter((r) =>
    new URL(r.url).pathname.startsWith("/_next/static/")
  );
  for (let i = 0; i < podaveis.length - TETO; i++) {
    await cache.delete(podaveis[i]);
  }
}
