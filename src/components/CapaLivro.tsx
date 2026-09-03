"use client";

import * as React from "react";
import { BookOpen, ImagePlus, Loader2, Star, Trash2 } from "lucide-react";
import type { SupabaseClient } from "@supabase/supabase-js";
import { cx } from "./ui";

export const BUCKET_CAPAS = "capas";

const TIPOS = ["image/jpeg", "image/png", "image/webp"];
const LIMITE_MB = 3;

const extDe = (tipo: string) =>
  tipo === "image/png" ? "png" : tipo === "image/webp" ? "webp" : "jpg";

/**
 * Sobe a capa e devolve o endereço público.
 *
 * O caminho é `<id do usuário>/<id do livro>.<ext>`, com upsert: a política do
 * bucket exige que a primeira pasta seja o id de quem envia, e é isso que
 * impede subir arquivo na pasta de outra pessoa. Um arquivo por livro, então
 * trocar a capa substitui em vez de acumular lixo.
 */
export async function enviarCapa(
  supabase: SupabaseClient,
  uid: string,
  bookId: string,
  arquivo: File
): Promise<{ url?: string; erro?: string }> {
  if (!TIPOS.includes(arquivo.type)) return { erro: "Use JPG, PNG ou WebP." };
  if (arquivo.size > LIMITE_MB * 1024 * 1024)
    return { erro: `A imagem precisa ter menos de ${LIMITE_MB} MB.` };

  const caminho = `${uid}/${bookId}.${extDe(arquivo.type)}`;
  const { error } = await supabase.storage
    .from(BUCKET_CAPAS)
    .upload(caminho, arquivo, { upsert: true, contentType: arquivo.type });

  if (error)
    return {
      erro: error.message.toLowerCase().includes("bucket")
        ? "O bucket de capas ainda não existe. Rode supabase/CAPAS.sql no SQL Editor."
        : error.message,
    };

  const { data } = supabase.storage.from(BUCKET_CAPAS).getPublicUrl(caminho);
  /* ?v= força o navegador a buscar de novo: o caminho é o mesmo a cada troca,
     e sem isso a capa antiga ficaria em cache. */
  return { url: `${data.publicUrl}?v=${Date.now()}` };
}

/** Apaga as três extensões possíveis — não sabemos com qual foi enviada. */
export async function apagarCapa(
  supabase: SupabaseClient,
  uid: string,
  bookId: string
) {
  await supabase.storage
    .from(BUCKET_CAPAS)
    .remove([`${uid}/${bookId}.jpg`, `${uid}/${bookId}.png`, `${uid}/${bookId}.webp`]);
}

/* ------------------------------ capa na estante ------------------------------ */

/**
 * A capa, ou um lugar onde ela deveria estar.
 *
 * Proporção fixa de 2:3 para a grade não dançar quando um livro tem capa alta e
 * o vizinho não tem nenhuma. `img` cru e não next/image porque a origem é
 * externa e variável — Google Books, Open Library, Storage — e configurar o
 * otimizador para cada domínio não paga uma imagem de 100px.
 */
export function Capa({
  url,
  titulo,
  className,
}: {
  url: string | null;
  titulo: string;
  className?: string;
}) {
  const [quebrou, setQuebrou] = React.useState(false);

  if (!url || quebrou)
    return (
      <div
        className={cx(
          "grid aspect-[2/3] w-full place-items-center rounded-[10px] bg-ink-800 p-2 text-center",
          className
        )}
      >
        <span className="flex flex-col items-center gap-1.5 text-fg-mute">
          <BookOpen size={18} />
          <span className="line-clamp-3 text-[9.5px] font-medium leading-tight">
            {titulo}
          </span>
        </span>
      </div>
    );

  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src={url}
      alt=""
      /*
       * `lazy` + `async`: a grade pode ter dezenas de capas, e sem isto todas
       * baixam de uma vez na abertura, competindo com a consulta ao banco. O
       * `aspect-[2/3]` já reserva o espaço, então nada pula quando cada uma
       * chega.
       */
      loading="lazy"
      decoding="async"
      onError={() => setQuebrou(true)}
      className={cx(
        "aspect-[2/3] w-full rounded-[10px] bg-ink-800 object-cover",
        className
      )}
    />
  );
}

/* ------------------------------ escolher arquivo ------------------------------ */

/**
 * Botão de arquivo com prévia.
 *
 * Serve aos dois momentos: no cadastro manual o arquivo fica em memória até o
 * livro existir (não há id para o caminho antes disso), e no detalhe ele sobe
 * na hora. Quem decide é o pai, por `onArquivo`.
 */
export function EscolherCapa({
  previa,
  titulo,
  ocupado,
  onArquivo,
  onRemover,
}: {
  previa: string | null;
  titulo: string;
  ocupado?: boolean;
  onArquivo: (f: File) => void;
  onRemover?: () => void;
}) {
  const campo = React.useRef<HTMLInputElement>(null);

  return (
    <div className="flex items-end gap-3">
      <div className="w-[84px] shrink-0">
        <Capa url={previa} titulo={titulo} />
      </div>

      <div className="flex flex-col gap-1.5">
        <input
          ref={campo}
          type="file"
          accept="image/jpeg,image/png,image/webp"
          className="hidden"
          onChange={(e) => {
            const f = e.target.files?.[0];
            /* Zera o campo para que escolher o MESMO arquivo de novo dispare
               outro change — sem isso, corrigir um envio que falhou exigiria
               escolher outro arquivo. */
            e.target.value = "";
            if (f) onArquivo(f);
          }}
        />
        <button
          type="button"
          onClick={() => campo.current?.click()}
          disabled={ocupado}
          className="inline-flex h-9 items-center gap-1.5 rounded-[12px] bg-ink-800 px-3 text-[12px] font-medium text-fg-dim transition-colors hover:bg-ink-750 disabled:opacity-50"
        >
          {ocupado ? (
            <Loader2 size={14} className="animate-spin" />
          ) : (
            <ImagePlus size={14} />
          )}
          {previa ? "Trocar capa" : "Escolher capa"}
        </button>

        {previa && onRemover && (
          <button
            type="button"
            onClick={onRemover}
            disabled={ocupado}
            className="inline-flex h-8 items-center gap-1.5 rounded-[12px] px-3 text-[11.5px] text-fg-mute transition-colors hover:bg-neg/15 hover:text-neg disabled:opacity-50"
          >
            <Trash2 size={13} />
            Remover
          </button>
        )}

        <span className="px-0.5 text-[10.5px] text-fg-mute">
          JPG, PNG ou WebP · até {LIMITE_MB} MB
        </span>
      </div>
    </div>
  );
}

/* ------------------------------ nota ------------------------------ */

/**
 * Nota de 1 a 5 em estrelas.
 *
 * Clicar na estrela já marcada zera — é como se desfaz uma nota dada por
 * engano, sem um botão "limpar" que só existiria para isso.
 */
export function Estrelas({
  nota,
  onNota,
  tamanho = 16,
}: {
  nota: number | null;
  onNota?: (n: number | null) => void;
  tamanho?: number;
}) {
  const fixa = !onNota;
  /* Sem nota e sem como dar: não desenha cinco estrelas vazias na grade só
     para dizer que ninguém avaliou. */
  if (fixa && !nota) return null;

  return (
    <span className="inline-flex items-center gap-0.5">
      {[1, 2, 3, 4, 5].map((n) => {
        const cheia = !!nota && n <= nota;
        const estrela = (
          <Star
            size={tamanho}
            strokeWidth={2}
            className={cx(
              "transition-colors",
              cheia ? "fill-warn text-warn" : "fill-none text-line"
            )}
          />
        );
        return fixa ? (
          <span key={n}>{estrela}</span>
        ) : (
          <button
            key={n}
            type="button"
            onClick={() => onNota(nota === n ? null : n)}
            aria-label={`${n} de 5`}
            aria-pressed={cheia}
            className="rounded transition-transform hover:scale-110"
          >
            {estrela}
          </button>
        );
      })}
    </span>
  );
}
