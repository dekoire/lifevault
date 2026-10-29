import { Briefcase, Car, FileSignature, Folder, HeartPulse, House, IdCard, Landmark, Receipt, ShieldCheck, ShoppingBag, Tags, Wallet, type LucideIcon } from "lucide-react";
import { clusterOf } from "@/lib/clusters";

const ICONS: Record<string, LucideIcon> = {
  gesundheit: HeartPulse, rechnungen: Receipt, belege: ShoppingBag, vertraege: FileSignature, arbeit: Briefcase,
  versicherungen: ShieldCheck, wohnen: House, steuer: Landmark, mobilitaet: Car, finanzen: Wallet, angebote: Tags,
  persoenlich: IdCard, sonstiges: Folder,
};

/** Bereichs-Symbol: schwarz auf weiß mit Rahmen */
export function ClusterIcon({ id, size = 40 }: { id?: string | null; size?: number }) {
  const c = clusterOf(id);
  const Icon = ICONS[c.id] ?? Folder;
  return (
    <span className="grid shrink-0 place-items-center rounded-full border border-card-line bg-surface text-fg" style={{ width: size, height: size }}>
      <Icon size={Math.round(size * 0.46)} strokeWidth={1.7} />
    </span>
  );
}
