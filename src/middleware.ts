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
   */
  matcher: [
    "/((?!_next/static|_next/image|favicon\.ico|robots\.txt|sitemap\.xml|manifest\.webmanifest|apple-icon\.png|icon\.png|og\.png|\.well-known|.*\.(?:svg|png|jpg|jpeg|gif|webp|ico|txt|xml)$).*)",
  ],
};
