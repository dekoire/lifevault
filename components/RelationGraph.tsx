"use client";
import Link from "next/link";
import { useMemo } from "react";
import { GitFork } from "lucide-react";
import { CARD } from "@/components/ui";
import { fmtDate, useDocs } from "@/lib/docs";
import { importanceLabel, importanceOf, roleLabel } from "@/lib/importance";
import { partnerKey } from "@/lib/partners";
import { relatedPayDocs } from "@/lib/related";
import type { Doc } from "@/lib/types";

type Link_ = { d: Doc; why: string };

const dateOf = (d: Doc) => d.doc_date ?? d.received_at.slice(0, 10);
const cut = (s: string, n: number) => (s.length > n ? `${s.slice(0, n - 1)}…` : s);

/**
 * Wie das Dokument mit anderen zusammenhängt – und warum: links die Grundlage (Vertrag, Police), in der Mitte dieses
 * Dokument, rechts was dazugehört (Rechnungen, Änderungen, gleicher Vorgang, gleiche Grundlage, gleicher Partner).
 */
export function RelationGraph({ doc }: { doc: Doc }) {
  const { docs } = useDocs();
  const { left, right } = useMemo(() => {
    const seen = new Set([doc.id]);
    const take = (list: Doc[], why: string, n: number): Link_[] => list.filter((d) => !seen.has(d.id)).sort((a, b) => dateOf(b).localeCompare(dateOf(a))).slice(0, n).map((d) => (seen.add(d.id), { d, why }));
    const basis = doc.basis_id ? docs.filter((d) => d.id === doc.basis_id) : [];
    const left = take(basis, "Grundlage – daraus folgt dieses Dokument", 1);
    const right = [
      ...take(docs.filter((d) => d.basis_id === doc.id), "gehört dazu – folgt aus diesem Dokument", 6),
      ...take(relatedPayDocs(doc, docs), "gleicher Vorgang (Rechnung, Mahnung …)", 4),
      ...(doc.basis_id ? take(docs.filter((d) => d.basis_id === doc.basis_id), "gleiche Grundlage", 4) : []),
    ];
    // gleicher Partner: die wichtigsten übrigen
    if (doc.sender && right.length < 8) {
      const k = partnerKey(doc.sender);
      const same = docs.filter((d) => d.sender && partnerKey(d.sender) === k && !seen.has(d.id)).sort((a, b) => importanceOf(b) - importanceOf(a) || dateOf(b).localeCompare(dateOf(a)));
      right.push(...take(same, "gleicher Partner", 8 - right.length));
    }
    return { left, right };
  }, [doc, docs]);
  if (!left.length && !right.length) return null;

  // Graph (ab sm): feste Spalten, Kanten als Kurven
  const W = 960, NW = 290, NH = 58, GAP = 14;
  const rows = Math.max(1, left.length, right.length);
  const H = Math.max(NH + 20, rows * (NH + GAP) + 10);
  const xs = { l: 10, c: (W - NW) / 2, r: W - NW - 10 };
  const yOf = (i: number, n: number) => (H - n * (NH + GAP) + GAP) / 2 + i * (NH + GAP);
  const cy = H / 2;
  const node = (d: Doc, x: number, y: number, why: string | null, main = false) => (
    <a key={d.id} href={`/d/${d.id}`} aria-label={d.title ?? d.file_name}>
      <rect x={x} y={y} width={NW} height={NH} rx={14} className={main ? "fill-brand-500" : "fill-surface stroke-card-line hover:fill-surface-2"} strokeWidth={main ? 0 : 1.2} />
      <text x={x + 14} y={y + 23} className={`text-[13px] font-semibold ${main ? "fill-white" : "fill-fg"}`}>{cut(d.title ?? d.file_name, 36)}</text>
      <text x={x + 14} y={y + 42} className={`text-[11px] ${main ? "fill-white/80" : "fill-muted"}`}>{cut([roleLabel(d.partner_role), importanceLabel(importanceOf(d)), fmtDate(dateOf(d))].filter(Boolean).join(" · "), 46)}</text>
      {why && <title>{why}</title>}
    </a>
  );
  const edge = (x1: number, y1: number, x2: number, y2: number, key: string) => <path key={key} d={`M${x1},${y1} C${(x1 + x2) / 2},${y1} ${(x1 + x2) / 2},${y2} ${x2},${y2}`} className="fill-none stroke-line-strong" strokeWidth={1.5} />;

  return (
    <section className={`${CARD} mt-4 p-4`}>
      <h2 className="flex items-center gap-2 text-[15px] font-semibold"><GitFork size={16} /> Zusammenhang</h2>
      <p className="mt-0.5 text-[12.5px] text-muted">Welche Dokumente dazugehören und warum. Antippen öffnet sie.</p>
      <div className="mt-3 hidden sm:block">
        <svg viewBox={`0 0 ${W} ${H}`} className="h-auto w-full" role="img" aria-label="Zusammenhang der Dokumente">
          {left.map((l, i) => edge(xs.l + NW, yOf(i, left.length) + NH / 2, xs.c, cy, `el${i}`))}
          {right.map((r, i) => edge(xs.c + NW, cy, xs.r, yOf(i, right.length) + NH / 2, `er${i}`))}
          {right.map((r, i) => <text key={`w${i}`} x={xs.r - 8} y={yOf(i, right.length) + NH / 2 - 6} textAnchor="end" className="fill-muted text-[10.5px]">{cut(r.why.split(" – ")[0], 28)}</text>)}
          {left.map((l, i) => <text key={`lw${i}`} x={xs.l + NW + 8} y={yOf(i, left.length) + NH / 2 - 6} className="fill-muted text-[10.5px]">Grundlage</text>)}
          {left.map((l, i) => node(l.d, xs.l, yOf(i, left.length), l.why))}
          {node(doc, xs.c, cy - NH / 2, null, true)}
          {right.map((r, i) => node(r.d, xs.r, yOf(i, right.length), r.why))}
        </svg>
      </div>
      {/* Handy: als Liste, gruppiert nach Grund */}
      <ul className="mt-3 space-y-1.5 sm:hidden">
        {[...left, ...right].map(({ d, why }) => (
          <li key={d.id}>
            <Link href={`/d/${d.id}`} className="block rounded-xl border border-card-line px-3 py-2.5 hover:bg-surface-2">
              <span className="block text-[11.5px] font-semibold text-brand-500">{why.split(" – ")[0]}</span>
              <span className="block truncate text-[14px] font-semibold">{d.title ?? d.file_name}</span>
              <span className="block text-[12px] text-muted">{[roleLabel(d.partner_role), importanceLabel(importanceOf(d)), fmtDate(dateOf(d))].filter(Boolean).join(" · ")}</span>
            </Link>
          </li>
        ))}
      </ul>
    </section>
  );
}
