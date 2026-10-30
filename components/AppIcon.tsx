"use client";
import { useState } from "react";

/** Icon einer verbundenen App: Logo der Webseite (über /api/logo), sonst der Anfangsbuchstabe */
export function AppIcon({ name, homepage, size = 40 }: { name: string; homepage?: string | null; size?: number }) {
  const [failed, setFailed] = useState(false);
  let host: string | undefined;
  try { host = homepage ? new URL(homepage).hostname : undefined; } catch { host = undefined; }
  const box = { width: size, height: size, borderRadius: Math.round(size * 0.28) };
  if (!host || failed) return <span className="grid shrink-0 place-items-center bg-fg font-bold text-canvas" style={{ ...box, fontSize: size * 0.42 }}>{name.slice(0, 1).toUpperCase()}</span>;
  return (
    <span className="grid shrink-0 place-items-center overflow-hidden border border-card-line bg-white" style={box}>
      <img src={`/api/logo?d=${encodeURIComponent(host)}`} alt="" width={Math.round(size * 0.72)} height={Math.round(size * 0.72)} onError={() => setFailed(true)} onLoad={(e) => e.currentTarget.naturalWidth < 12 && setFailed(true)} className="object-contain" />
    </span>
  );
}
