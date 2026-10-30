import type { NextConfig } from "next";

/**
 * Content-Security-Policy: Skripte nur von hier (Next braucht Inline-Skripte) und Googles Anmeldung für den Gmail-Import,
 * Daten nur zu uns, Supabase und der Gmail-API, Frames nur Google (Maps, Anmeldung) und die Dokument-Vorschau.
 * Selbst wenn Text aus einem Dokument oder einer Mail als HTML durchrutschen würde, könnte er so nichts nachladen
 * oder Daten an fremde Server schicken. Niemand darf Lifevault einbetten.
 */
const supabaseOrigin = (() => {
  try {
    return new URL(process.env.NEXT_PUBLIC_SUPABASE_URL ?? "").origin;
  } catch {
    return "";
  }
})();
const CSP = [
  "default-src 'self'",
  // wasm: die PDF-Vorschau (pdf.js) dekodiert manche Bilder per WebAssembly
  `script-src 'self' 'unsafe-inline' 'wasm-unsafe-eval' https://accounts.google.com${process.env.NODE_ENV === "development" ? " 'unsafe-eval'" : ""}`,
  "style-src 'self' 'unsafe-inline' https://accounts.google.com",
  "img-src 'self' data: blob: https:",
  "font-src 'self' data:",
  `connect-src 'self' ${supabaseOrigin} ${supabaseOrigin.replace("https://", "wss://")} https://gmail.googleapis.com https://www.googleapis.com https://oauth2.googleapis.com https://accounts.google.com`.replace(/\s+/g, " ").trim(),
  `frame-src 'self' blob: ${supabaseOrigin} https://www.google.com https://maps.google.com https://accounts.google.com`.replace(/\s+/g, " ").trim(),
  "worker-src 'self' blob:",
  "object-src 'none'",
  "base-uri 'self'",
  "form-action 'self'",
  "frame-ancestors 'none'",
  "upgrade-insecure-requests",
].join("; ");

const config: NextConfig = {
  poweredByHeader: false,
  async headers() {
    return [
      {
        source: "/(.*)",
        headers: [
          { key: "Content-Security-Policy", value: CSP },
          { key: "X-Content-Type-Options", value: "nosniff" },
          { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
          { key: "X-Frame-Options", value: "DENY" },
          { key: "Permissions-Policy", value: "camera=(self), microphone=(), geolocation=()" },
        ],
      },
    ];
  },
};

export default config;
