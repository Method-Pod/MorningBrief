/*
 * Imagens do Storage do Supabase na medida em que aparecem.
 *
 * Medido no Início: a foto de perfil tinha 174 KB (1259×1351) para aparecer
 * em 38×38, e duas miniaturas de referência, 835 e 800 KB para aparecer em
 * 181×136. O Supabase reduz na entrega -- `/render/image/` no lugar de
 * `/object/` -- e manda WebP para o navegador que aceita: a mesma miniatura
 * de 835 KB chega com 32 KB, e a foto com 2 KB. O arquivo guardado não muda.
 *
 * Só o que mora no Storage passa por aqui. Endereço de fora (capa do YouTube,
 * prévia de um site, capa do Google Livros) volta como veio: o Supabase não
 * tem como reduzir o que não é dele.
 */

const OBJETO = "/storage/v1/object/public/";
const RENDER = "/storage/v1/render/image/public/";

/** A versão reduzida de uma imagem do Storage; as de fora voltam iguais. */
export function imagemReduzida(
  url: string | null | undefined,
  largura: number,
  opcoes: { altura?: number; qualidade?: number } = {}
): string | null | undefined {
  if (!url || !url.includes(OBJETO)) return url;
  let u: URL;
  try {
    u = new URL(url);
  } catch {
    return url;
  }
  if (!u.hostname.endsWith(".supabase.co")) return url;
  u.pathname = u.pathname.replace(OBJETO, RENDER);
  /* O dobro do que aparece: a tela de alta densidade desenha 2 pixels por
     ponto, e com 1× a imagem sai borrada justamente nela. */
  u.searchParams.set("width", String(Math.round(largura * 2)));
  if (opcoes.altura) {
    u.searchParams.set("height", String(Math.round(opcoes.altura * 2)));
    u.searchParams.set("resize", "cover");
  }
  u.searchParams.set("quality", String(opcoes.qualidade ?? 70));
  return u.toString();
}

/**
 * O endereço original de uma imagem reduzida -- para cair nele se a versão
 * reduzida falhar (um plano do Supabase sem a redução, por exemplo), em vez
 * de dar a imagem por perdida.
 */
export function imagemOriginal(url: string): string {
  if (!url.includes(RENDER)) return url;
  const u = new URL(url);
  u.pathname = u.pathname.replace(RENDER, OBJETO);
  ["width", "height", "resize", "quality"].forEach((k) => u.searchParams.delete(k));
  return u.toString();
}

/**
 * Para o `onError` de um `<img>` com endereço reduzido: troca uma vez pelo
 * original. A marca no elemento impede a troca de virar laço se o original
 * também falhar -- aí quem decide o que mostrar é o resto do componente.
 */
export function voltarAoOriginal(e: { currentTarget: HTMLImageElement }) {
  const img = e.currentTarget;
  if (img.dataset.original) return false;
  const original = imagemOriginal(img.src);
  if (original === img.src) return false;
  img.dataset.original = "1";
  img.src = original;
  return true;
}
