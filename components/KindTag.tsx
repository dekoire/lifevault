import { BookOpen, CircleAlert, CircleCheck, ClipboardList, FileSignature, IdCard, Landmark, Mail, Receipt, Stethoscope, Tags, type LucideIcon } from "lucide-react";
import { IconAvatar } from "@/components/ListControls";
import { KINDS, kindOf } from "@/lib/kinds";
import type { Doc } from "@/lib/types";

/** Kleine Pill mit der Dokumentart (Vertrag, Rechnung, Mahnung …) */
export function KindTag({ d }: { d: Pick<Doc, "doc_type" | "title"> }) {
  const k = kindOf(d);
  return <span className="inline-flex shrink-0 items-center rounded-full px-1.5 py-px text-[11px] leading-4 font-semibold" style={{ background: `${k.color}14`, color: k.color }} title={d.doc_type ?? k.label}>{k.short}</span>;
}

const KIND_ICONS: Record<string, LucideIcon> = {
  mahnung: CircleAlert, medizin: Stethoscope, ausweis: IdCard, angebot: Tags, bescheid: Landmark, formular: ClipboardList,
  bedingungen: BookOpen, rechnung: Receipt, bestaetigung: CircleCheck, vertrag: FileSignature, schreiben: Mail,
};

/** Art als runder Avatar in ihrer Farbe (Filter, Auswahl) */
export function KindAvatar({ id, size = 30 }: { id: string; size?: number }) {
  const k = KINDS.find((x) => x.id === id);
  return <IconAvatar icon={KIND_ICONS[id] ?? Mail} color={k?.color === "#111827" ? undefined : k?.color} size={size} />;
}
