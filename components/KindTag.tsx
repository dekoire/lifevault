import { kindOf } from "@/lib/kinds";
import type { Doc } from "@/lib/types";

/** Kleine Pill mit der Dokumentart (Vertrag, Rechnung, Mahnung …) */
export function KindTag({ d }: { d: Pick<Doc, "doc_type" | "title"> }) {
  const k = kindOf(d);
  return <span className="inline-flex shrink-0 items-center rounded-full px-1.5 py-px text-[11px] leading-4 font-semibold" style={{ background: `${k.color}14`, color: k.color }} title={d.doc_type ?? k.label}>{k.short}</span>;
}
