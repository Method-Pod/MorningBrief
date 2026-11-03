import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createServiceClient } from "@/lib/supabase/service";
import { BALDE_DAS_COPIAS, fazerCopia } from "@/lib/copiaDeSeguranca";
import { todayISO } from "@/lib/format";

/*
 * As cópias automáticas da pessoa: listar para baixar (GET) e fazer uma
 * agora (POST).
 *
 * O balde é privado e não tem política de leitura -- só a chave de serviço
 * entra. Por isso a rota confere a sessão com `getUser` (que pergunta ao
 * Supabase, e não só lê o cookie) e usa o id que VEIO DE LÁ para montar o
 * caminho: não há parâmetro nenhum que o navegador possa trocar para chegar
 * na pasta de outra pessoa.
 */
export const dynamic = "force-dynamic";

async function quemChamou() {
  const supabase = await createClient();
  const { data } = await supabase.auth.getUser();
  return data.user?.id ?? null;
}

export async function GET() {
  const uid = await quemChamou();
  if (!uid) return NextResponse.json({ erro: "sessão expirada" }, { status: 401 });

  let servico;
  try {
    servico = createServiceClient();
  } catch {
    return NextResponse.json({ erro: "Cópias indisponíveis neste servidor." }, { status: 503 });
  }
  const pasta = servico.storage.from(BALDE_DAS_COPIAS);
  const { data, error } = await pasta.list(uid, {
    limit: 100,
    sortBy: { column: "name", order: "desc" },
  });
  /* Balde que ainda não existe = a primeira cópia ainda não rodou. */
  if (error) return NextResponse.json({ copias: [] });

  const arquivos = (data ?? []).filter((a) => a.name.endsWith(".json"));
  if (!arquivos.length) return NextResponse.json({ copias: [] });

  /* Cinco minutos: o tempo de tocar em "Baixar", não um link para guardar. */
  const { data: links } = await pasta.createSignedUrls(
    arquivos.map((a) => `${uid}/${a.name}`),
    300,
    { download: true }
  );
  const copias = arquivos.map((a, i) => ({
    dia: a.name.replace(/\.json$/, ""),
    bytes: (a.metadata as { size?: number } | null)?.size ?? null,
    url: links?.[i]?.signedUrl ?? null,
  }));
  return NextResponse.json({ copias });
}

export async function POST() {
  const uid = await quemChamou();
  if (!uid) return NextResponse.json({ erro: "sessão expirada" }, { status: 401 });

  let servico;
  try {
    servico = createServiceClient();
  } catch {
    return NextResponse.json({ erro: "Cópias indisponíveis neste servidor." }, { status: 503 });
  }
  const r = await fazerCopia(servico, { userId: uid, hoje: todayISO() });
  if (!r) return NextResponse.json({ erro: "Não deu para fazer a cópia." }, { status: 500 });
  return NextResponse.json(r);
}
