import type { Metadata, Viewport } from "next";
import { Inter } from "next/font/google";
import "./globals.css";

const inter = Inter({ subsets: ["latin"], variable: "--font-inter", display: "swap" });

export const metadata: Metadata = {
  title: "Lifevault",
  description: "Dein Tresor für alle Unterlagen – hochladen, automatisch sortieren, alles fragen.",
  appleWebApp: { capable: true, title: "Lifevault", statusBarStyle: "default" },
  icons: { icon: [{ url: "/icon.svg", type: "image/svg+xml" }, { url: "/icon-192.png", sizes: "192x192", type: "image/png" }], apple: [{ url: "/apple-touch-icon.png", sizes: "180x180" }] },
  other: { "mobile-web-app-capable": "yes" },
  robots: { index: false, follow: false },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  // wie eine App: kein Reinzoomen (auch nicht beim Tippen in Eingabefelder)
  maximumScale: 1,
  userScalable: false,
  viewportFit: "cover",
  themeColor: "#f3f4f6",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="de" className={inter.variable}>
      <body>
        {children}
        {/* Safari ignoriert „user-scalable=no“ teils: Pinch-Zoom-Gesten abfangen */}
        <script dangerouslySetInnerHTML={{ __html: `document.addEventListener("gesturestart",function(e){e.preventDefault()},{passive:false});document.addEventListener("touchmove",function(e){if(e.scale&&e.scale!==1)e.preventDefault()},{passive:false});` }} />
      </body>
    </html>
  );
}
