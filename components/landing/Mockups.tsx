import { CalendarClock, FileText, Layers, ListChecks, Lock, Sparkles } from "lucide-react";
import { ClusterIcon } from "@/components/ClusterIcon";
import { CLUSTERS } from "@/lib/clusters";

const card = "rounded-2xl border border-card-line bg-surface";

/** Nachgebaute App-Ansichten (statisch, keine echten Daten) */
export function HomeMock() {
  const kpis = [[FileText, "48", "Dokumente"], [Layers, "9", "Bereiche"], [ListChecks, "612", "Key-Fakten"], [CalendarClock, "3", "Fristen"]] as const;
  const counts: Record<string, number> = { rechnungen: 12, vertraege: 8, gesundheit: 6, arbeit: 5, versicherungen: 5, belege: 7 };
  return (
    <div className="space-y-3 rounded-3xl border border-card-line bg-page p-4 shadow-[0_24px_60px_rgba(42,26,110,.18)]">
      <div className={`${card} grid grid-cols-4 divide-x divide-line`}>
        {kpis.map(([Icon, v, l]) => <div key={l} className="p-3"><span className="flex items-center gap-1 text-[10px] text-muted"><Icon size={11} /> {l}</span><b className="text-[20px] font-[650]">{v}</b></div>)}
      </div>
      <div className="grid grid-cols-3 gap-2">
        {CLUSTERS.filter((c) => counts[c.id]).map((c) => (
          <div key={c.id} className={`${card} p-3`}>
            <span className="flex items-start justify-between"><ClusterIcon id={c.id} size={30} tone="plain" /><span className="rounded-full border border-card-line px-3 text-[10px] font-semibold text-soft">{counts[c.id]}</span></span>
            <b className="mt-2 block text-[12px] font-semibold">{c.label}</b>
          </div>
        ))}
      </div>
    </div>
  );
}

export function ChatMock() {
  return (
    <div className="space-y-3 rounded-3xl border border-card-line bg-page p-4 shadow-[0_24px_60px_rgba(42,26,110,.18)]">
      <p className="ml-auto w-fit max-w-[85%] rounded-2xl rounded-br-md bg-brand-500 px-3.5 py-2.5 text-[13px] text-white">Wie viele Urlaubstage habe ich laut Arbeitsvertrag?</p>
      <div className={`${card} space-y-2 p-4 text-[13px] leading-5`}>
        <p className="flex items-center gap-1.5 text-[11px] font-semibold text-selected"><Sparkles size={12} /> Lifevault</p>
        <p><b>30 Urlaubstage pro Jahr</b> bei einer 5-Tage-Woche.</p>
        <p className="text-soft">Dazu kommen tarifliche Zusatztage nach IG-Metall-Tarif. Resturlaub verfällt am 31. März des Folgejahres.</p>
        <p className="flex flex-wrap gap-1 pt-1"><span className="rounded-full border border-card-line px-3 py-2 text-[12px] leading-4 font-medium text-fg">Arbeitsvertrag Nordwerk</span></p>
      </div>
    </div>
  );
}

export function DocMock() {
  const rows = [["Arbeitgeber", "Nordwerk Maschinenbau GmbH"], ["Zeitraum", "September 2026"], ["Brutto", "4.850,00 €"], ["Netto", "3.012,46 €"]];
  return (
    <div className="space-y-3 rounded-3xl border border-card-line bg-page p-4 shadow-[0_24px_60px_rgba(42,26,110,.18)]">
      <div className={`${card} p-4`}>
        <span className="flex items-center gap-2.5"><ClusterIcon id="arbeit" size={34} /><span><b className="block text-[14px]">Gehaltsabrechnung September</b><span className="text-[11px] text-muted">Arbeit · 30.09.2026</span></span><Lock size={14} className="ml-auto text-fg" /></span>
      </div>
      <div className={`${card} overflow-hidden`}>
        <p className="px-4 pt-3 pb-1 text-[12px] font-semibold">Bezüge</p>
        <dl className="divide-y divide-line text-[12px]">{rows.map(([k, v]) => <div key={k} className="grid grid-cols-2 px-4 py-2"><dt className="text-muted">{k}</dt><dd className="font-semibold">{v}</dd></div>)}</dl>
      </div>
    </div>
  );
}
