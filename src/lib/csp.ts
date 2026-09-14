/**
 * A política de conteúdo — o que o navegador pode carregar e executar.
 *
 * Ela responde a uma pergunta só: se um dia entrar código estranho numa
 * página deste app, o navegador roda? Sem política, roda. Com ela, só roda
 * script que saiu daqui, e o script estranho morre sem fazer nada.
 *
 * O app não tem nenhum script de terceiro — sem analytics, sem chat, sem
 * pixel —, o que torna a política realista: não há nada a liberar por
 * conveniência, e cada exceção abaixo tem um motivo que dá para escrever
 * numa linha.
 *
 * **Por que nonce e não lista de endereços.** O Next escreve tags `<script>`
 * dentro do HTML para entregar os dados da página. Liberar "script inline"
 * para elas liberaria qualquer script inline, inclusive o injetado — que é
 * exatamente o que a política existe para barrar. O nonce é um número
 * sorteado a cada requisição: as tags do Next levam o número, o injetado não
 * tem como adivinhá-lo, e só as primeiras rodam.
 *
 * `strict-dynamic` completa: o que um script com nonce carregar é confiado
 * por tabela. É o que faz os pedaços de JavaScript do Next carregarem sem
 * precisar listá-los um a um — e a lista é justamente o que envelhece mal.
 */

/** Um nonce novo por requisição. Repetir seria o mesmo que não ter. */
export function novoNonce(): string {
  const bytes = new Uint8Array(16);
  crypto.getRandomValues(bytes);
  return btoa(String.fromCharCode(...bytes));
}

/**
 * O texto da política.
 *
 * `supabaseUrl` entra em `connect-src` porque o navegador fala com o banco
 * direto — é assim que o app funciona, e sem isto nenhuma tela carrega.
 *
 * `desenvolvimento` liga `unsafe-eval`: o recarregamento automático do
 * `next dev` usa `eval`, e sem ele a tela local não atualiza sozinha. Em
 * produção não entra.
 */
export function politicaDeConteudo({
  nonce,
  supabaseUrl,
  desenvolvimento = false,
}: {
  nonce: string;
  supabaseUrl?: string;
  desenvolvimento?: boolean;
}): string {
  /* Só o endereço, sem caminho: a diretiva compara origem. */
  const supabase = (() => {
    if (!supabaseUrl) return [];
    try {
      const u = new URL(supabaseUrl);
      /* wss para o canal de tempo real do Supabase. Não é usado hoje; custa
         uma palavra e evita uma tela em branco no dia em que for. */
      return [u.origin, `wss://${u.host}`];
    } catch {
      return [];
    }
  })();

  const regras: Record<string, string[]> = {
    /* O que não estiver dito abaixo só pode vir daqui. */
    "default-src": ["'self'"],

    /*
     * Nada de script inline sem o nonce do dia. `strict-dynamic` confia no
     * que esses scripts carregarem — os pedaços do próprio Next.
     *
     * `'unsafe-inline'` e `https:` ficam por último e de propósito: navegador
     * que entende nonce IGNORA os dois, e navegador antigo, que não entende,
     * cai neles em vez de ficar com a página quebrada. É a receita publicada
     * para não trocar segurança nova por tela branca em aparelho velho.
     */
    "script-src": [
      "'self'",
      `'nonce-${nonce}'`,
      "'strict-dynamic'",
      ...(desenvolvimento ? ["'unsafe-eval'"] : []),
      "'unsafe-inline'",
      "https:",
    ],

    /*
     * `'unsafe-inline'` no estilo não tem como sair, e não é descuido: o
     * React escreve `style="..."` em cada elemento que tem cor própria — a
     * bolinha do cartão, a barra do gráfico —, e a política trata atributo de
     * estilo como estilo inline. Estilo injetado desfigura a página; não
     * executa código, que é o que importa aqui.
     */
    "style-src": ["'self'", "'unsafe-inline'"],

    /*
     * Imagem de qualquer site em https.
     *
     * Capa de livro, miniatura de aula, foto de canal e o ícone de cada
     * referência salva vêm do site de origem — o endereço é o que a pessoa
     * cola, então não há lista possível. `data:` e `blob:` são a prévia da
     * imagem antes de subir.
     */
    "img-src": ["'self'", "data:", "blob:", "https:"],

    /* As fontes são servidas junto com o app. */
    "font-src": ["'self'", "data:"],

    /*
     * Para onde o navegador pode falar.
     *
     * `'self'` cobre as rotas de /api. O Supabase é o banco. O YouTube está
     * aqui porque o oEmbed dele é chamado do navegador ao colar o link de uma
     * aula — é o que traz título, canal e miniatura.
     */
    "connect-src": ["'self'", ...supabase, "https://www.youtube.com"],

    /* O service worker do app, e nenhum outro. */
    "worker-src": ["'self'", "blob:"],
    "manifest-src": ["'self'"],
    "media-src": ["'self'", "data:", "blob:"],

    /* Nada de plugin, nada de <base> trocando o destino dos links. */
    "object-src": ["'none'"],
    "base-uri": ["'self'"],
    /* Formulário só envia para cá. */
    "form-action": ["'self'"],
    /* Ninguém embute este app num iframe. Mesma trava do X-Frame-Options,
       que fica por ser o que navegador antigo entende. */
    "frame-ancestors": ["'none'"],
    "frame-src": ["'none'"],
  };

  const texto = Object.entries(regras)
    .map(([nome, valores]) => `${nome} ${valores.join(" ")}`)
    .join("; ");

  /* Em produção, qualquer pedido em http é refeito em https antes de sair. */
  return desenvolvimento ? texto : `${texto}; upgrade-insecure-requests`;
}
