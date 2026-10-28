import { Briefcase, Car, FileSignature, Folder, HeartPulse, House, IdCard, Landmark, Receipt, ShieldCheck, ShoppingBag, Tags, Wallet, type LucideIcon } from "lucide-react";
import { clusterOf } from "@/lib/clusters";

const ICONS: Record<string, LucideIcon> = {
  gesundheit: HeartPulse, rechnungen: Receipt, belege: ShoppingBag, vertraege: FileSignature, arbeit: Briefcase,
  versicherungen: ShieldCheck, wohnen: House, steuer: Landmark, mobilitaet: Car, finanzen: Wallet, angebote: Tags,
  persoenlich: IdCard, sonstiges: Folder,
};

/** Cluster-Symbol in getönter Kachel (Farbe je Cluster) */
export function ClusterIcon({ id, size = 40 }: { id?: string | null; size?: number }) {
  const c = clusterOf(id);
  const Icon = ICONS[c.id] ?? Folder;
  return (
    <span className="grid shrink-0 place-items-center rounded-xl" style={{ width: size, height: size, color: c.color, background: `color-mix(in srgb, ${c.color} 12%, transparent)` }}>
      <Icon size={Math.round(size * 0.48)} strokeWidth={1.9} />
    </span>
  );
}
