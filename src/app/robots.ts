import type { MetadataRoute } from "next";

/**
 * App privado: nada é indexável.
 *
 * As telas internas já devolvem 307 para /login sem sessão, então o buscador
 * nunca veria o conteúdo — mas sem instrução explícita ele insiste, e as URLs
 * internas aparecem no relatório de cobertura como erro.
 *
 * Coerente com `robots: { index: false }` no metadata do layout. Se um dia o
 * login virar página de apresentação pública, basta liberar aqui e trocar o
 * index para true — os dois precisam concordar, senão o robots.txt convida o
 * crawler para uma página que a meta tag manda ignorar.
 */
export default function robots(): MetadataRoute.Robots {
  return {
    rules: [{ userAgent: "*", disallow: "/" }],
  };
}
