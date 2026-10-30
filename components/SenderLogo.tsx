"use client";
import { useState } from "react";
import { ClusterIcon, ClusterTile } from "@/components/ClusterIcon";
import { domainFor } from "@/lib/partners";

/** Firmenlogo zur Absender-Domain (z. B. Vodafone), sonst das Symbol des Bereichs */
/** `bare`: echtes Logo ohne Rand und Kreis (z. B. Partner-Kacheln) */
export function SenderLogo({ domain: given, sender, cluster, size = 40, urgent = false, bare = false }: { domain?: string | null; sender?: string | null; cluster?: string | null; size?: number; urgent?: boolean; bare?: boolean }) {
  const [failed, setFailed] = useState(false);
  // kleine Icons (16 px, z. B. nur ein favicon) nicht verwerfen, sondern scharf in Originalgröße mittig zeigen
  const [tiny, setTiny] = useState(false);
  const fit = (e: React.SyntheticEvent<HTMLImageElement>) => { const w = e.currentTarget.naturalWidth; if (w < 12) setFailed(true); else if (w <= 24) setTiny(true); };
  const domain = domainFor(sender, given);
  if (urgent) return <ClusterIcon id={cluster} size={size} tone="urgent" />;
  // kein Logo: farbige Kachel mit Farbverlauf wie in Finastry
  if (!domain || failed) return <ClusterTile id={cluster} size={size} />;
  if (bare) return (
    <span className="grid shrink-0 place-items-center" style={{ width: size, height: size }}>
      <img src={`/api/logo?d=${encodeURIComponent(domain)}`} alt="" width={tiny ? 16 : Math.round(size * 0.86)} height={tiny ? 16 : Math.round(size * 0.86)} onError={() => setFailed(true)} onLoad={fit} className="rounded-lg object-contain" />
    </span>
  );
  return (
    <span className="grid shrink-0 place-items-center overflow-hidden rounded-full bg-white" style={{ width: size, height: size }}>
      <img src={`/api/logo?d=${encodeURIComponent(domain)}`} alt="" width={tiny ? 16 : Math.round(size * 0.74)} height={tiny ? 16 : Math.round(size * 0.74)} onError={() => setFailed(true)} onLoad={fit} className="object-contain" />
    </span>
  );
}
