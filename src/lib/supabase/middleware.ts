import { createServerClient, type SetAllCookies } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";

const PUBLIC_PATHS = ["/login", "/auth"];

type CookiesToSet = Parameters<SetAllCookies>[0];

export async function updateSession(request: NextRequest) {
  let response = NextResponse.next({ request });

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  // Sem env configurada, deixa passar para a página mostrar o aviso de setup.
  if (!url || !key) return response;

  const supabase = createServerClient(url, key, {
    cookies: {
      getAll() {
        return request.cookies.getAll();
      },
      setAll(cookiesToSet: CookiesToSet) {
        cookiesToSet.forEach(({ name, value }) =>
          request.cookies.set(name, value)
        );
        response = NextResponse.next({ request });
        cookiesToSet.forEach(({ name, value, options }) =>
          response.cookies.set(name, value, options)
        );
      },
    },
  });

  /*
   * getClaims() em vez de getUser().
   *
   * getUser() é uma ida de rede ao servidor de auth — 105ms medidos — em toda
   * navegação, antes de qualquer byte da página. getClaims() verifica a
   * assinatura do JWT localmente contra o JWKS do projeto, que fica em cache;
   * este projeto usa ES256, então a verificação é local de fato.
   *
   * A renovação do token continua acontecendo: getClaims chama getSession por
   * dentro, e é getSession que troca o token expirado e regrava os cookies
   * pelo setAll acima.
   */
  let autenticado = false;
  try {
    const { data } = await supabase.auth.getClaims();
    autenticado = typeof data?.claims?.sub === "string";
  } catch {
    autenticado = false;
  }

  /*
   * Rede de proteção: se getClaims falhar por algo alheio à sessão — busca do
   * JWKS que não completou, por exemplo — sem isto a pessoa seria mandada para
   * o login com sessão válida. getSession lê o cookie, é local, e só corre
   * quando a verificação já falhou.
   */
  if (!autenticado) {
    const { data } = await supabase.auth.getSession();
    autenticado = !!data.session;
  }

  const path = request.nextUrl.pathname;
  const isPublic = PUBLIC_PATHS.some((p) => path.startsWith(p));

  if (!autenticado && !isPublic) {
    const redirect = request.nextUrl.clone();
    redirect.pathname = "/login";
    redirect.searchParams.set("next", path);
    return NextResponse.redirect(redirect);
  }

  if (autenticado && path === "/login") {
    const redirect = request.nextUrl.clone();
    redirect.pathname = "/";
    redirect.search = "";
    return NextResponse.redirect(redirect);
  }

  return response;
}
