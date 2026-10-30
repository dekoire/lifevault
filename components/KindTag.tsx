import { BookOpen, CircleAlert, CircleCheck, ClipboardList, FileSignature, IdCard, Landmark, Mail, Receipt, Stethoscope, Tags, Wallet, type LucideIcon } from "lucide-react";
import { IconAvatar } from "@/components/ListControls";
import { KINDS, kindOf } from "@/lib/kinds";
import type { Doc } from "@/lib/types";

/** Dokumentart (Vertrag, Rechnung, Mahnung …) schlicht: schwarzes Symbol + Wort, ohne Fläche und Rahmen */
export function KindTag({ d }: { d: Pick<Doc, "doc_type" | "title"> }) {
  const k = kindOf(d);
  const Icon = KIND_ICONS[k.id] ?? Mail;
  return <span className="inline-flex shrink-0 items-center gap-1 text-[12px] leading-4 font-semibold text-fg" title={d.doc_type ?? k.label}><Icon size={13} strokeWidth={2.2} className="shrink-0" />{k.short}</span>;
}

const KIND_ICONS: Record<string, LucideIcon> = {
  mahnung: CircleAlert, gehalt: Wallet, medizin: Stethoscope, ausweis: IdCard, angebot: Tags, bescheid: Landmark, formular: ClipboardList,
  bedingungen: BookOpen, rechnung: Receipt, bestaetigung: CircleCheck, vertrag: FileSignature, schreiben: Mail,
};

/** Art als runder Avatar in ihrer Farbe (Filter, Auswahl) */
export function KindAvatar({ id, size = 30 }: { id: string; size?: number }) {
  const k = KINDS.find((x) => x.id === id);
  return <IconAvatar icon={KIND_ICONS[id] ?? Mail} color={k?.color === "#111827" ? undefined : k?.color} size={size} />;
}
