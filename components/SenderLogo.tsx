"use client";
import { useState } from "react";
import { ClusterIcon } from "@/components/ClusterIcon";
import { domainFor } from "@/lib/partners";

/** Firmenlogo zur Absender-Domain (z. B. Vodafone), sonst das Symbol des Bereichs */
/** `bare`: echtes Logo ohne Rand und Kreis (z. B. Partner-Kacheln) */
export function SenderLogo({ domain: given, sender, cluster, size = 40, urgent = false, bare = false }: { domain?: string | null; sender?: string | null; cluster?: string | null; size?: number; urgent?: boolean; bare?: boolean }) {
  const [failed, setFailed] = useState(false);
  const domain = domainFor(sender, given);
  if (urgent) return <ClusterIcon id={cluster} size={size} tone="urgent" />;
  if (!domain || failed) return <ClusterIcon id={cluster} size={size} />;
  if (bare) return (
    <span className="grid shrink-0 place-items-center" style={{ width: size, height: size }}>
      <img src={`/api/logo?d=${encodeURIComponent(domain)}`} alt="" width={Math.round(size * 0.86)} height={Math.round(size * 0.86)} onError={() => setFailed(true)} onLoad={(e) => { if (e.currentTarget.naturalWidth <= 16) setFailed(true); }} className="rounded-lg object-contain" />
    </span>
  );
  return (
    <span className="grid shrink-0 place-items-center overflow-hidden rounded-full bg-white" style={{ width: size, height: size }}>
      <img src={`/api/logo?d=${encodeURIComponent(domain)}`} alt="" width={Math.round(size * 0.74)} height={Math.round(size * 0.74)} onError={() => setFailed(true)} onLoad={(e) => { if (e.currentTarget.naturalWidth <= 16) setFailed(true); }} className="object-contain" />
    </span>
  );
}
