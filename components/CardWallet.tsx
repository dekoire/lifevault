"use client";
import { useMemo, useState } from "react";
import { AlertTriangle, Combine, WalletCards } from "lucide-react";
import { useDetail } from "@/components/DetailPanel";
import { MergeSheet } from "@/components/MergeReview";
import { SenderLogo } from "@/components/SenderLogo";
import { cardOrder, KIND_BG, walletCards } from "@/lib/cards";
import { useDocs } from "@/lib/docs";

const fmtValid = (d?: Date) => (d ? d.toLocaleDateString("de-DE", { month: "2-digit", year: "numeric" }) : undefined);

/** Karten & Ausweise als Wallet zum Wischen – Nummern nur maskiert, Tippen öffnet das Dokument */
export function CardWallet({ title = "Karten & Ausweise", compact = false }: { title?: string; compact?: boolean }) {
  const { allDocs } = useDocs();
  const cards = useMemo(() => walletCards(allDocs), [allDocs]);
  const open = useDetail();
  const [ask, setAsk] = useState<string>();
  if (!cards.length) return null;

  return (
    <section>
      <h2 className="mb-3 flex items-center gap-2 text-[17px] font-semibold"><WalletCards size={18} /> {title} <span className="tnum rounded-full border border-card-line px-2 py-px text-[12px] font-semibold text-muted">{cards.length}</span></h2>
      <div className="-mx-1 flex snap-x snap-mandatory gap-3 overflow-x-auto px-1 pb-2 [scrollbar-width:none]">
        {cards.map((c) => {
          const soon = c.validDate && c.validDate.getTime() - Date.now() < 90 * 86_400_000;
          return (
            <div key={c.key} className={`shrink-0 snap-start ${compact ? "w-[260px]" : "w-[300px]"}`}>
              <button type="button" onClick={() => open?.({ kind: "doc", id: c.main.id })} className="relative flex aspect-[1.586] w-full flex-col justify-between overflow-hidden rounded-2xl p-4 text-left text-white shadow-card transition hover:-translate-y-0.5" style={{ background: KIND_BG[c.kind] }}>
                {/* dezenter Glanz */}
                <span className="pointer-events-none absolute -top-16 -right-10 h-40 w-40 rounded-full bg-white/10" />
                <span className="relative flex items-center gap-2.5">
                  <span className="grid h-9 w-9 shrink-0 place-items-center overflow-hidden rounded-xl bg-white"><SenderLogo domain={c.domain} sender={c.issuer} cluster={c.cluster} size={30} bare /></span>
                  <span className="min-w-0 flex-1"><b className="block truncate text-[14px] leading-5">{c.label}</b><span className="block truncate text-[11.5px] text-white/75">{c.kind === "id" ? "Bundesrepublik Deutschland" : c.issuer ?? ""}</span></span>
                </span>
                <span className="tnum relative text-[17px] font-semibold tracking-[0.12em]">{c.number ?? " "}</span>
                <span className="relative flex items-end justify-between gap-2 text-[11px]">
                  <span className="min-w-0"><span className="block text-white/65">Inhaber</span><b className="block truncate text-[12.5px] uppercase">{c.holder ?? "–"}</b></span>
                  {c.validDate && <span className="shrink-0 text-right"><span className="block text-white/65">gültig bis</span><b className={`tnum block text-[12.5px] ${soon ? "rounded bg-white px-1 text-[#d4143c]" : ""}`}>{fmtValid(c.validDate)}</b></span>}
                </span>
                {c.check && <span className="absolute top-3 right-3 inline-flex items-center gap-1 rounded-full bg-white/95 px-2 py-0.5 text-[10.5px] font-semibold text-[#9a5800]"><AlertTriangle size={10} /> prüfen</span>}
              </button>
              {c.check && (
                <div className="mt-1.5 flex items-center gap-2 px-1 text-[12px] text-soft">
                  <span className="min-w-0 flex-1 truncate">{c.check}</span>
                  {c.docs.length >= 2 && <button type="button" onClick={() => setAsk(c.key)} className="inline-flex shrink-0 items-center gap-1 font-semibold text-fg"><Combine size={12} /> Ansehen & zusammenführen</button>}
                </div>
              )}
            </div>
          );
        })}
      </div>
      {(() => { const c = cards.find((x) => x.key === ask); return c ? <MergeSheet docs={cardOrder(c).ids.map((id) => c.docs.find((d) => d.id === id)!)} skip={cardOrder(c).skip} title={`${c.label}${c.issuer && c.kind !== "id" ? ` ${c.issuer}` : ""}`} reason={c.check} onClose={() => setAsk(undefined)} /> : null; })()}
    </section>
  );
}
