import { createServerClient, type SetAllCookies } from "@supabase/ssr";
import { cookies } from "next/headers";

type CookiesToSet = Parameters<SetAllCookies>[0];

export async function createClient() {
  const cookieStore = await cookies();

  return createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return cookieStore.getAll();
        },
        setAll(cookiesToSet: CookiesToSet) {
          try {
            cookiesToSet.forEach(({ name, value, options }) =>
              cookieStore.set(name, value, options)
            );
          } catch {
            // Server Components não podem escrever cookies; o middleware cobre o refresh.
          }
        },
      },
    }
  );
}
