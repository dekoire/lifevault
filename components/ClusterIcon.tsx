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
