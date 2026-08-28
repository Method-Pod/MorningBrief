import { type NextRequest } from "next/server";
import { updateSession } from "@/lib/supabase/middleware";

export async function middleware(request: NextRequest) {
  return await updateSession(request);
}

export const config = {
  /*
   * robots.txt, sitemap.xml e afins ficavam presos aqui: o matcher só abria
   * exceção para _next e imagens, então o crawler pedia /robots.txt e levava
   * 307 para /login. Sem robots.txt legível não há como instruir o buscador
   * a não indexar as telas internas.
   *
   * /api/cron também sai daqui, e por outro motivo: quem chama é o agendador do
   * Vercel, não um navegador com sessão. Preso no matcher, ele levava 307 para
   * /login e a manutenção diária nunca rodava. A rota tem a própria trava, pelo
   * cabeçalho Authorization com o CRON_SECRET — é a checagem certa para quem
   * chama de máquina, e ela recusa qualquer chamada sem o segredo.
   */
  matcher: [
    "/((?!api/cron|_next/static|_next/image|favicon\.ico|robots\.txt|sitemap\.xml|manifest\.webmanifest|apple-icon\.png|icon\.png|og\.png|\.well-known|.*\.(?:svg|png|jpg|jpeg|gif|webp|ico|txt|xml)$).*)",
  ],
};
