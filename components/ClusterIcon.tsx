import { Briefcase, Car, FileSignature, Folder, HeartPulse, House, IdCard, Landmark, Receipt, ShieldCheck, ShoppingBag, Tags, Wallet, type LucideIcon } from "lucide-react";
import { clusterOf } from "@/lib/clusters";

const ICONS: Record<string, LucideIcon> = {
  gesundheit: HeartPulse, rechnungen: Receipt, belege: ShoppingBag, vertraege: FileSignature, arbeit: Briefcase,
  versicherungen: ShieldCheck, wohnen: House, steuer: Landmark, mobilitaet: Car, finanzen: Wallet, angebote: Tags,
  persoenlich: IdCard, sonstiges: Folder,
};

const TONES = {
  solid: "bg-fg text-canvas", // Avatar: schwarz, weißes Symbol
  urgent: "bg-urgent text-white", // dringend: dunkelrot, weißes Symbol
  plain: "bg-surface text-fg", // ruhig: weiß ohne Rand, schwarzes Symbol
};

/** Bereich als Text mit schwarzem Symbol davor (in Listen) */
export function ClusterTag({ id, className = "" }: { id?: string | null; className?: string }) {
  const c = clusterOf(id);
  const Icon = ICONS[c.id] ?? Folder;
  return <span className={`inline-flex min-w-0 items-center gap-1.5 ${className}`}><Icon size={14} strokeWidth={2} className="shrink-0 text-fg" /><span className="truncate">{c.label}</span></span>;
}

/** Heller Farbverlauf aus einer Farbe – wie die Kategorie-Kacheln in Finastry */
export const tintGradient = (color: string) => `linear-gradient(135deg, color-mix(in srgb, ${color} 20%, transparent) 0%, color-mix(in srgb, ${color} 6%, transparent) 100%)`;

/** Kachel ohne Logo, wie in Finastry: abgerundetes Quadrat, Farbverlauf und Symbol in der Farbe des Bereichs */
export function ClusterTile({ id, size = 40 }: { id?: string | null; size?: number }) {
  const c = clusterOf(id);
  const Icon = ICONS[c.id] ?? Folder;
  return (
    <span className="grid shrink-0 place-items-center" style={{ width: size, height: size, borderRadius: Math.round(size * 0.26), color: c.color, background: tintGradient(c.color) }}>
      <Icon size={Math.round(size * 0.45)} strokeWidth={1.75} />
    </span>
  );
}

/** Bereichs-Symbol als runder Avatar */
export function ClusterIcon({ id, size = 40, tone = "solid" }: { id?: string | null; size?: number; tone?: keyof typeof TONES }) {
  const c = clusterOf(id);
  const Icon = ICONS[c.id] ?? Folder;
  return (
    <span className={`grid shrink-0 place-items-center rounded-full ${TONES[tone]}`} style={{ width: size, height: size }}>
      <Icon size={Math.round(size * 0.46)} strokeWidth={1.7} />
    </span>
  );
}
