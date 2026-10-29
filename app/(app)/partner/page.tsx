"use client";
import Link from "next/link";
import { useMemo, useState } from "react";
import { ChevronRight, Search } from "lucide-react";
import { SenderLogo } from "@/components/SenderLogo";
import { CARD, PageHeader } from "@/components/ui";
import { clusterOf } from "@/lib/clusters";
import { fmtDate, useDocs } from "@/lib/docs";
import { buildPartners, type Partner } from "@/lib/partners";

/** Alle Vertragspartner, Dienstleister und Händler aus deinen Dokumenten */
export default function PartnersPage() {
  const { docs, loading } = useDocs();
  const [q, setQ] = useState("");
  const all = useMemo(() => buildPartners(docs), [docs]);
  const term = q.trim().toLowerCase();
  const list = term ? all.filter((p) => p.name.toLowerCase().includes(term) || p.ids.some((i) => `${i.label} ${i.value}`.toLowerCase().includes(term))) : all;
  const groups: [string, Partner[]][] = [
    ["Verträge & Dienstleister", list.filter((p) => p.active && !p.isShop)],
    ["Händler & Einkäufe", list.filter((p) => p.active && p.isShop)],
    ["Früher", list.filter((p) => !p.active)],
  ];
  return (
    <>
      <PageHeader title="Partner" subtitle={loading ? " " : `${all.length} Firmen und Stellen aus deinen Unterlagen – mit allen Kunden-, Vertrags- und Versicherungsnummern`} />
      <div className="max-w-4xl space-y-5">
        <label className="flex h-12 items-center gap-2.5 rounded-full border border-card-line bg-surface px-4 focus-within:border-brand-500">
          <Search size={18} className="text-muted" />
          <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Suchen: Firma oder Nummer, z. B. O2 oder Kundennummer" className="h-full min-w-0 flex-1 bg-transparent text-[15px] outline-none placeholder:text-muted" />
        </label>
        {groups.map(([title, ps]) => ps.length > 0 && (
          <section key={title}>
            <h2 className="mb-2.5 text-[15px] font-semibold text-soft">{title}</h2>
            <div className={`${CARD} divide-y divide-line overflow-hidden`}>
              {ps.map((p) => (
                <Link key={p.key} href={`/partner/${p.key}`} className={`flex items-center gap-3 px-4 py-3 hover:bg-surface-2/70 ${p.active ? "" : "opacity-60"}`}>
                  <SenderLogo domain={p.domain} sender={p.name} cluster={p.cluster} size={42} />
                  <span className="min-w-0 flex-1">
                    <b className="block truncate text-[15px]">{p.name}</b>
                    <span className="block truncate text-[13px] text-muted">
                      {p.isShop ? `zuletzt ${fmtDate(p.last)} · ${p.docs.length} ${p.docs.length === 1 ? "Beleg" : "Belege"}` : `${clusterOf(p.cluster).label} · ${p.docs.length} ${p.docs.length === 1 ? "Dokument" : "Dokumente"}${p.ids.length ? ` · ${p.ids.length} ${p.ids.length === 1 ? "Kennung" : "Kennungen"}` : ""}`}
                    </span>
                  </span>
                  <ChevronRight size={16} className="text-muted" />
                </Link>
              ))}
            </div>
          </section>
        ))}
        {!loading && !all.length && <p className="text-[14px] text-muted">Noch keine Partner. Sobald Dokumente ausgelesen sind, erscheinen hier Absender, Vertragspartner und Händler.</p>}
      </div>
    </>
  );
}
