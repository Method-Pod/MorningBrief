import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { currentIdentity } from "@/lib/session";
import { Shell } from "@/components/Shell";

export default async function AppLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  if (
    !process.env.NEXT_PUBLIC_SUPABASE_URL ||
    !process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
  ) {
    redirect("/login");
  }

  const supabase = await createClient();

  /*
   * Verificação local, não getUser().
   *
   * O middleware já validou a sessão contra o servidor de auth nesta mesma
   * requisição. Chamar getUser() aqui repetia essa ida de ~105ms, em série
   * com a do middleware, antes de qualquer pixel aparecer — 210ms de espera
   * em cada clique de navegação.
   */
  const quem = await currentIdentity(supabase);
  if (!quem) redirect("/login");

  return (
    <Shell email={quem.email} nome={quem.nome}>
      {children}
    </Shell>
  );
}
