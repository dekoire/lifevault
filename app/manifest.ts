import type { MetadataRoute } from "next";

/** Web-App für den Home-Bildschirm (iPhone: Safari › Teilen › „Zum Home-Bildschirm“) */
export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "Lifevault",
    short_name: "Lifevault",
    description: "Dein Tresor für alle Unterlagen",
    lang: "de",
    start_url: "/",
    scope: "/",
    display: "standalone",
    background_color: "#f7f7f8",
    theme_color: "#f7f7f8",
    icons: [
      { src: "/icon-192.png", sizes: "192x192", type: "image/png", purpose: "any" },
      { src: "/icon-512.png", sizes: "512x512", type: "image/png", purpose: "any" },
      { src: "/icon-maskable-512.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
      { src: "/icon.svg", sizes: "any", type: "image/svg+xml", purpose: "any" },
    ],
  };
}
