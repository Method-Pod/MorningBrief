import { createServerClient, type SetAllCookies } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";
import { novoNonce, politicaDeConteudo } from "../csp";

const PUBLIC_PATHS = ["/login", "/auth"];

type CookiesToSet = Parameters<SetAllCookies>[0];

export async function updateSession(request: NextRequest) {
  /*
   * O nonce da política de conteúdo, sorteado aqui porque é aqui que cada
   * requisição passa uma vez só.
   *
   * Ele vai em dois lugares e os dois são necessários: no cabeçalho da
   * RESPOSTA, que é o que o navegador obedece, e no cabeçalho da REQUISIÇÃO,
   * que é de onde o Next lê o número para carimbar nas próprias tags
   * <script>. Sem o segundo, o navegador barraria o JavaScript do próprio
   * app — a tela abriria em branco.
   */
  const nonce = novoNonce();
  const politica = politicaDeConteudo({
    nonce,
    supabaseUrl: process.env.NEXT_PUBLIC_SUPABASE_URL,
    desenvolvimento: process.env.NODE_ENV !== "production",
  });

  const cabecalhosDaRequisicao = new Headers(request.headers);
  cabecalhosDaRequisicao.set("x-nonce", nonce);
  cabecalhosDaRequisicao.set("content-security-policy", politica);

  const comPolitica = <T extends { headers: Headers }>(r: T): T => {
    r.headers.set("content-security-policy", politica);
    return r;
  };

  let response = NextResponse.next({ request: { headers: cabecalhosDaRequisicao } });

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  // Sem env configurada, deixa passar para a página mostrar o aviso de setup.
  if (!url || !key) return comPolitica(response);

  const supabase = createServerClient(url, key, {
    cookies: {
      getAll() {
        return request.cookies.getAll();
      },
      setAll(cookiesToSet: CookiesToSet) {
        cookiesToSet.forEach(({ name, value }) =>
          request.cookies.set(name, value)
        );
        response = NextResponse.next({
          request: { headers: cabecalhosDaRequisicao },
        });
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
    return comPolitica(NextResponse.redirect(redirect));
  }

  if (autenticado && path === "/login") {
    const redirect = request.nextUrl.clone();
    redirect.pathname = "/";
    redirect.search = "";
    return comPolitica(NextResponse.redirect(redirect));
  }

  return comPolitica(response);
}
