/**
 * Reduz uma imagem no navegador antes de subir, no mesmo formato.
 *
 * Os envios guardavam o arquivo como veio da câmera ou do print: a foto de
 * perfil tinha 1259×1351 para aparecer em 38 pixels, e as imagens de
 * referência passavam de 800 KB. Reduzida aqui, ela já chega pequena ao
 * Storage -- e ocupa menos espaço guardada, não só na entrega.
 *
 * Mesmo formato de propósito (JPG continua JPG, PNG continua PNG): o nome do
 * arquivo leva a extensão, e as rotinas que apagam e trocam imagem procuram
 * por ela. Imagem que já cabe na medida sobe como está, sem recompressão.
 */
export async function reduzirImagem(arquivo: File, ladoMaior: number): Promise<File> {
  if (typeof createImageBitmap !== "function") return arquivo;
  let bitmap: ImageBitmap;
  try {
    bitmap = await createImageBitmap(arquivo);
  } catch {
    return arquivo;
  }
  const escala = Math.min(1, ladoMaior / Math.max(bitmap.width, bitmap.height));
  if (escala >= 1) {
    bitmap.close();
    return arquivo;
  }
  const w = Math.round(bitmap.width * escala);
  const h = Math.round(bitmap.height * escala);
  const tela = document.createElement("canvas");
  tela.width = w;
  tela.height = h;
  const ctx = tela.getContext("2d");
  if (!ctx) {
    bitmap.close();
    return arquivo;
  }
  ctx.imageSmoothingQuality = "high";
  ctx.drawImage(bitmap, 0, 0, w, h);
  bitmap.close();
  const blob = await new Promise<Blob | null>((ok) =>
    tela.toBlob(ok, arquivo.type, 0.86)
  );
  /* Se o navegador não souber gerar o formato, ou o resultado sair maior,
     vale o original. */
  if (!blob || blob.type !== arquivo.type || blob.size >= arquivo.size) return arquivo;
  return new File([blob], arquivo.name, { type: arquivo.type });
}
