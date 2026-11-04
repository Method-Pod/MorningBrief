import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createServiceClient } from "@/lib/supabase/service";
import { gerarChave } from "@/lib/chavesDoClaude";

/*
 * Cria uma chave para o Claude Code (Conta > Claude).
 *
 * Pelo servidor, e não pelo navegador: a tabela não tem política de
 * inserção, para nenhuma chave nascer de outro jeito. A sessão é conferida
 * com `getUser` e o id que vem DELA é o dono da chave. A resposta traz a
 * chave inteira uma única vez; depois disso só existe o hash.
 *
 * Listar e revogar são pelo navegador, com o RLS (a pessoa só vê e só
 * revoga as próprias).
 */
export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  const supabase = await createClient();
  const { data } = await supabase.auth.getUser();
  if (!data.user) return NextResponse.json({ erro: "sessão expirada" }, { status: 401 });

  let nome = "Claude Code";
  try {
    const corpo = (await req.json()) as { nome?: unknown };
    if (typeof corpo.nome === "string" && corpo.nome.trim()) nome = corpo.nome.trim().slice(0, 60);
  } catch {
    /* sem corpo: nome padrão */
  }

  let servico;
  try {
    servico = createServiceClient();
  } catch {
    return NextResponse.json({ erro: "Indisponível neste servidor." }, { status: 503 });
  }

  /* Teto de chaves ativas: uma por aparelho é o uso esperado; dez já é sinal
     de chave esquecida aberta por aí. */
  const { count } = await servico
    .from("chaves_do_claude")
    .select("id", { count: "exact", head: true })
    .eq("user_id", data.user.id)
    .is("revogada_em", null);
  if ((count ?? 0) >= 10)
    return NextResponse.json(
      { erro: "Já há 10 chaves ativas. Revogue as que não usa antes de criar outra." },
      { status: 409 }
    );

  const { chave, prefixo, hash } = await gerarChave();
  const { error } = await servico
    .from("chaves_do_claude")
    .insert({ user_id: data.user.id, nome, prefixo, hash });
  if (error)
    return NextResponse.json(
      {
        erro: /chaves_do_claude/.test(error.message)
          ? "Falta rodar supabase/CLAUDE-REVISAO-E-MODELOS.sql no Supabase."
          : "Não deu para criar a chave.",
      },
      { status: 500 }
    );

  return NextResponse.json({ chave, prefixo, nome });
}
