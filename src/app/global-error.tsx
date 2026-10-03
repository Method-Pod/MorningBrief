"use client";

/*
 * O último recurso: quando até o layout raiz falha.
 *
 * Aqui não há CSS do app garantido nem tema — por isso os estilos vão inline,
 * escuros e neutros. O que importa é a pessoa ter um botão para tentar de novo
 * em vez de uma página em branco.
 */
export default function ErroGeral({ reset }: { error: Error; reset: () => void }) {
  return (
    <html lang="pt-BR">
      <body
        style={{
          margin: 0,
          minHeight: "100dvh",
          display: "grid",
          placeItems: "center",
          background: "#151515",
          color: "#f0efec",
          fontFamily: "system-ui, -apple-system, Segoe UI, Roboto, sans-serif",
          padding: 16,
        }}
      >
        <div style={{ maxWidth: 420, textAlign: "center" }}>
          <h1 style={{ fontSize: 20, margin: 0 }}>O app não abriu</h1>
          <p style={{ color: "#b8b6ae", fontSize: 14, lineHeight: 1.5 }}>
            Algo deu errado ao carregar. Seus dados continuam salvos.
          </p>
          <button
            onClick={reset}
            style={{
              marginTop: 12,
              height: 40,
              padding: "0 18px",
              borderRadius: 12,
              border: 0,
              background: "#f0efec",
              color: "#151515",
              fontWeight: 600,
              fontSize: 14,
              cursor: "pointer",
            }}
          >
            Tentar de novo
          </button>
        </div>
      </body>
    </html>
  );
}
