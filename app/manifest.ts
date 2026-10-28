import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "Lifevault",
    short_name: "Lifevault",
    description: "Dein Tresor für alle Unterlagen",
    start_url: "/",
    display: "standalone",
    background_color: "#f3f4f6",
    theme_color: "#6d4aff",
    icons: [{ src: "/icon.svg", sizes: "any", type: "image/svg+xml", purpose: "any" }],
  };
}
