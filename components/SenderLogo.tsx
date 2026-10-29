"use client";
import { useState } from "react";
import { ClusterIcon } from "@/components/ClusterIcon";
import { domainFor } from "@/lib/partners";

/** Firmenlogo zur Absender-Domain (z. B. Vodafone), sonst das Symbol des Bereichs */
export function SenderLogo({ domain: given, sender, cluster, size = 40 }: { domain?: string | null; sender?: string | null; cluster?: string | null; size?: number }) {
  const [failed, setFailed] = useState(false);
  const domain = domainFor(sender, given);
  if (!domain || failed) return <ClusterIcon id={cluster} size={size} />;
  return (
    <span className="grid shrink-0 place-items-center overflow-hidden rounded-full border border-card-line bg-white" style={{ width: size, height: size }}>
      <img src={`/api/logo?d=${encodeURIComponent(domain)}`} alt="" width={Math.round(size * 0.6)} height={Math.round(size * 0.6)} onError={() => setFailed(true)} className="object-contain" />
    </span>
  );
}
