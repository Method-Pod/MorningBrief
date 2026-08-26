"use client";

import * as React from "react";
import { Camera, Loader2, Trash2 } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { currentUserId, SESSION_EXPIRED } from "@/lib/session";
import { cx } from "./ui";

const BUCKET = "avatars";
const LIMITE_MB = 2;
const TIPOS = ["image/jpeg", "image/png", "image/webp"];

/*
 * Store da foto fora do React, com assinantes.
 *
 * Dois motivos:
 *
 * 1. A foto aparece em dois lugares — barra lateral e página de Conta. Com um
 *    useState por componente, trocar na Conta não avisaria a barra, e a foto
 *    nova só apareceria na próxima navegação.
 *
 * 2. Não dá para ler de getClaims(). getClaims decodifica o access_token, e
 *    updateUser({ data }) grava o metadata no servidor sem emitir token novo:
 *    o JWT continua com o metadata antigo por até uma hora. Era exatamente
 *    por isso que a foto era enviada com sucesso e nunca aparecia. getSession()
 *    lê o objeto de sessão guardado, que updateUser atualiza, e não custa rede.
 */
let atual: string | null = null;
let carregou = false;
const assinantes = new Set<() => void>();

const avisar = () => assinantes.forEach((fn) => fn());

export function definirFoto(url: string | null) {
  atual = url;
  carregou = true;
  avisar();
}

export function useAvatar() {
  const supabase = React.useMemo(() => createClient(), []);
  const [url, setUrl] = React.useState<string | null>(atual);

  React.useEffect(() => {
    const notificar = () => setUrl(atual);
    assinantes.add(notificar);

    if (!carregou) {
      (async () => {
        const { data } = await supabase.auth.getSession();
        const v = data.session?.user?.user_metadata?.avatar_url;
        atual = typeof v === "string" && v ? v : null;
        carregou = true;
        avisar();
      })();
    } else {
      notificar();
    }

    return () => {
      assinantes.delete(notificar);
    };
  }, [supabase]);

  return { url, setUrl: definirFoto };
}

export function Iniciais({
  nome,
  url,
  tamanho = 32,
  className,
}: {
  nome: string;
  url?: string | null;
  tamanho?: number;
  className?: string;
}) {
  const [falhou, setFalhou] = React.useState(false);
  React.useEffect(() => setFalhou(false), [url]);

  const iniciais = (nome || "?").slice(0, 2).toUpperCase();
  const mostraFoto = !!url && !falhou;

  return (
    <span
      className={cx(
        "grid shrink-0 place-items-center overflow-hidden rounded-full bg-brand-500 font-bold text-on-brand",
        className
      )}
      style={{ width: tamanho, height: tamanho, fontSize: tamanho * 0.34 }}
    >
      {mostraFoto ? (
        // <img> puro: a URL é do Storage, fora dos domínios do next/image.
        // onError volta para as iniciais em vez de deixar um quadro vazio.
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={url}
          alt={`Foto de ${nome}`}
          width={tamanho}
          height={tamanho}
          loading="eager"
          decoding="sync"
          onError={() => setFalhou(true)}
          className="h-full w-full object-cover"
          style={{ aspectRatio: "1 / 1" }}
        />
      ) : (
        iniciais
      )}
    </span>
  );
}

export function TrocarFoto({
  nome,
  url,
  onTrocou,
}: {
  nome: string;
  url: string | null;
  onTrocou: (url: string | null) => void;
}) {
  const supabase = React.useMemo(() => createClient(), []);
  const input = React.useRef<HTMLInputElement>(null);
  const [ocupado, setOcupado] = React.useState(false);
  const [erro, setErro] = React.useState("");

  /*
   * Depois de gravar o metadata, pede um token novo.
   *
   * Sem isso, qualquer leitura que decodifique o JWT continuaria com o
   * metadata antigo até o refresh automático. Custa uma ida de rede, mas só
   * acontece ao trocar a foto.
   */
  const renovarToken = async () => {
    try {
      await supabase.auth.refreshSession();
    } catch {
      // se falhar, getSession ainda tem o user atualizado
    }
  };

  const enviar = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const arquivo = e.target.files?.[0];
    e.target.value = ""; // permite reenviar o mesmo arquivo
    if (!arquivo) return;
    setErro("");

    if (!TIPOS.includes(arquivo.type)) return setErro("Use JPG, PNG ou WebP.");
    if (arquivo.size > LIMITE_MB * 1024 * 1024)
      return setErro(`A imagem precisa ter menos de ${LIMITE_MB} MB.`);

    setOcupado(true);
    const uid = await currentUserId(supabase);
    if (!uid) {
      setOcupado(false);
      return setErro(SESSION_EXPIRED);
    }

    /*
     * Caminho fixo por usuário com upsert: cada pessoa tem um arquivo só, e a
     * política de Storage exige que a primeira pasta seja o próprio id — é o
     * que impede subir na pasta de outro.
     */
    const ext =
      arquivo.type === "image/png"
        ? "png"
        : arquivo.type === "image/webp"
          ? "webp"
          : "jpg";
    const caminho = `${uid}/perfil.${ext}`;

    const { error: envio } = await supabase.storage
      .from(BUCKET)
      .upload(caminho, arquivo, { upsert: true, contentType: arquivo.type });

    if (envio) {
      setOcupado(false);
      if (envio.message.toLowerCase().includes("bucket"))
        return setErro(
          "O bucket de fotos ainda não existe. Rode supabase/PENDENTE.sql no SQL Editor."
        );
      return setErro(envio.message);
    }

    const { data } = supabase.storage.from(BUCKET).getPublicUrl(caminho);
    // ?v= força o navegador a buscar de novo: o caminho é o mesmo a cada troca
    const publica = `${data.publicUrl}?v=${Date.now()}`;

    const { error: meta } = await supabase.auth.updateUser({
      data: { avatar_url: publica },
    });
    if (meta) {
      setOcupado(false);
      return setErro(meta.message);
    }

    await renovarToken();
    setOcupado(false);
    onTrocou(publica);
  };

  const remover = async () => {
    setErro("");
    setOcupado(true);
    const uid = await currentUserId(supabase);
    if (!uid) {
      setOcupado(false);
      return setErro(SESSION_EXPIRED);
    }
    await supabase.storage
      .from(BUCKET)
      .remove([`${uid}/perfil.jpg`, `${uid}/perfil.png`, `${uid}/perfil.webp`]);
    const { error } = await supabase.auth.updateUser({
      data: { avatar_url: null },
    });
    if (error) {
      setOcupado(false);
      return setErro(error.message);
    }
    await renovarToken();
    setOcupado(false);
    onTrocou(null);
  };

  return (
    <div>
      <div className="flex items-center gap-3.5">
        <div className="relative">
          <Iniciais nome={nome} url={url} tamanho={56} />
          <button
            onClick={() => input.current?.click()}
            disabled={ocupado}
            aria-label="Trocar foto de perfil"
            className="absolute -bottom-1 -right-1 grid h-7 w-7 place-items-center rounded-full bg-white text-fg-dim shadow-[0_1px_4px_rgb(20_24_26/0.18)] transition-colors hover:text-brand-400 disabled:opacity-50"
          >
            {ocupado ? (
              <Loader2 size={13} className="girar-lento" />
            ) : (
              <Camera size={13} />
            )}
          </button>
        </div>

        <div className="min-w-0">
          <p className="text-[13px] font-semibold">Foto de perfil</p>
          <p className="mt-0.5 text-[11.5px] text-fg-mute">
            JPG, PNG ou WebP, até {LIMITE_MB} MB.
          </p>
          <div className="mt-2 flex gap-2">
            <button
              onClick={() => input.current?.click()}
              disabled={ocupado}
              className="rounded-[10px] bg-ink-800 px-2.5 py-1.5 text-[11.5px] font-semibold text-fg-dim transition-colors hover:text-fg disabled:opacity-50"
            >
              {url ? "Trocar" : "Enviar"}
            </button>
            {url && (
              <button
                onClick={remover}
                disabled={ocupado}
                className="inline-flex items-center gap-1.5 rounded-[10px] bg-neg/10 px-2.5 py-1.5 text-[11.5px] font-semibold text-neg transition-colors hover:bg-neg/20 disabled:opacity-50"
              >
                <Trash2 size={12} />
                Remover
              </button>
            )}
          </div>
        </div>
      </div>

      <input
        ref={input}
        type="file"
        accept={TIPOS.join(",")}
        onChange={enviar}
        className="hidden"
      />

      {erro && (
        <p className="mt-3 rounded-[14px] bg-neg/12 px-3.5 py-3 text-xs font-medium text-neg">
          {erro}
        </p>
      )}
    </div>
  );
}
