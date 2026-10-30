"use client";
import { Fragment } from "react";
import { Cite, parseCite } from "@/components/Cite";
import { EntityLink } from "@/components/EntityLink";

/** Eurobeträge („711,69 €“, „75 €“, „EUR 12,50“) hervorheben – man sieht sofort, worum es geht */
const MONEY = /(?:\d{1,3}(?:\.\d{3})+|\d+)(?:,\d{1,2})?\s?(?:€|EUR\b|Euro\b)|(?:€|EUR)\s?(?:\d{1,3}(?:\.\d{3})+|\d+)(?:,\d{1,2})?/g;
function money(text: string, key: string): React.ReactNode[] {
  const out: React.ReactNode[] = [];
  let last = 0, i = 0;
  for (const m of text.matchAll(MONEY)) {
    if (m.index! > last) out.push(text.slice(last, m.index));
    out.push(<span key={`${key}-m${i++}`} className="tnum rounded-md bg-brand-500/10 px-1 py-px font-semibold whitespace-nowrap text-fg">{m[0]}</span>);
    last = m.index! + m[0].length;
  }
  if (last < text.length) out.push(text.slice(last));
  return out;
}

/** Kleines Markdown für Chat-Antworten: Absätze, Listen, Überschriften, **fett**, [Links](/d/…) und Quellen [[q:ID|Seite|Zitat]]; Beträge hervorgehoben */
function inline(text: string, key: string) {
  const parts: React.ReactNode[] = [];
  const re = /(\[\[q:[^\]]+\]\]|\*\*[^*]+\*\*|\[[^\]]+\]\([^)]+\))/g;
  let last = 0;
  let m: RegExpExecArray | null;
  let i = 0;
  while ((m = re.exec(text))) {
    if (m.index > last) parts.push(...money(text.slice(last, m.index), `${key}-t${i}`));
    const t = m[0];
    if (t.startsWith("[[q:")) parts.push(<Cite key={`${key}-${i++}`} {...parseCite(t.slice(4, -2))} />);
    else if (t.startsWith("**")) parts.push(<strong key={`${key}-${i++}`} className="font-semibold">{money(t.slice(2, -2), `${key}-b${i}`)}</strong>);
    else {
      const [, label, href] = /\[([^\]]+)\]\(([^)]+)\)/.exec(t)!;
      parts.push(href.startsWith("/")
        ? <EntityLink key={`${key}-${i++}`} href={href} label={label} />
        : /^https?:\/\//.test(href) ? <a key={`${key}-${i++}`} href={href} target="_blank" rel="noreferrer" className="font-semibold text-selected underline">{label}</a> : label);
    }
    last = m.index + t.length;
  }
  if (last < text.length) parts.push(...money(text.slice(last), `${key}-e`));
  return parts;
}

/** Infografik-Blöcke aus der Antwort: ```kpi (Kennzahlen-Kacheln) und ```chart (Balken) */
function Kpis({ body }: { body: string }) {
  const rows = body.split("\n").map((l) => l.split("|").map((c) => c.trim())).filter((c) => c[0] && c[1]).slice(0, 6);
  return (
    <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
      {rows.map(([label, value, sub], i) => (
        <div key={i} className="rounded-2xl border border-card-line bg-surface px-3.5 py-3">
          <span className="block text-[12px] leading-4 text-muted">{label}</span>
          <span className="tnum mt-1 block text-[19px] leading-6 font-[650] tracking-tight">{value}</span>
          {sub && <span className="block text-[11px] leading-4 text-muted">{sub}</span>}
        </div>
      ))}
    </div>
  );
}

const num = (v: string) => Number(v.replace(/[^\d,.-]/g, "").replace(/\.(?=\d{3}(\D|$))/g, "").replace(",", "."));
function Chart({ body }: { body: string }) {
  const lines = body.split("\n").map((l) => l.trim()).filter(Boolean);
  const meta = Object.fromEntries(lines.filter((l) => /^(title|unit):/i.test(l)).map((l) => [l.split(":")[0].toLowerCase(), l.slice(l.indexOf(":") + 1).trim()]));
  const rows = lines.filter((l) => !/^(title|unit):/i.test(l) && l.includes("|")).map((l) => { const [label, v] = l.split("|").map((c) => c.trim()); return { label, value: num(v) }; }).filter((r) => r.label && Number.isFinite(r.value)).slice(0, 12);
  if (!rows.length) return null;
  const max = Math.max(...rows.map((r) => Math.abs(r.value)), 1);
  const fmt = (v: number) => `${v.toLocaleString("de-DE", { maximumFractionDigits: 2 })}${meta.unit ? ` ${meta.unit}` : ""}`;
  return (
    <figure className="rounded-2xl border border-card-line bg-surface p-4">
      {meta.title && <figcaption className="mb-3 text-[14px] font-semibold">{meta.title}</figcaption>}
      <ul className="space-y-2.5">
        {rows.map((r, i) => (
          <li key={i} className="grid grid-cols-[minmax(0,7rem)_minmax(0,1fr)] items-center gap-3 text-[13px] sm:grid-cols-[minmax(0,10rem)_minmax(0,1fr)]">
            <span className="truncate text-soft" title={r.label}>{r.label}</span>
            <span className="flex min-w-0 items-center gap-2">
              <span className="h-2.5 rounded-full bg-brand-500" style={{ width: `${Math.max(2, (Math.abs(r.value) / max) * 100)}%`, maxWidth: "calc(100% - 5.5rem)" }} />
              <span className="tnum shrink-0 font-semibold">{fmt(r.value)}</span>
            </span>
          </li>
        ))}
      </ul>
    </figure>
  );
}

export function Markdown({ text, widget }: { text: string; widget?: (kind: string, body: string) => React.ReactNode }) {
  // Infografik-Blöcke herauslösen, Rest normal darstellen
  // Infografiken (kpi, chart) und Bausteine aus dem Chat (zahlung, partner, dokumente, aufgaben, uebersicht, gehalt, aktion)
  const parts = text.replace(/\r/g, "").split(/```(kpi|chart|zahlung|partner|dokumente|aufgaben|uebersicht|gehalt|aktion|verlauf|partnerliste|gruppen|konditionen|deckung|regelungen)\n?([\s\S]*?)(?:```|$)/);
  if (parts.length > 1) {
    const out: React.ReactNode[] = [];
    for (let i = 0; i < parts.length; i += 3) {
      if (parts[i].trim()) out.push(<MarkdownText key={`t${i}`} text={parts[i]} />);
      if (parts[i + 1] === "kpi") out.push(<Kpis key={`k${i}`} body={parts[i + 2] ?? ""} />);
      if (parts[i + 1] === "chart") out.push(<Chart key={`c${i}`} body={parts[i + 2] ?? ""} />);
      if (widget && !["kpi", "chart"].includes(parts[i + 1])) out.push(<div key={`w${i}`}>{widget(parts[i + 1], parts[i + 2] ?? "")}</div>);
    }
    return <div className="space-y-3">{out}</div>;
  }
  return <MarkdownText text={text} />;
}

/** Abschnitts-Überschrift wie in Finastry: lila Balken links, kräftig – gliedert lange Antworten auf einen Blick */
function Heading({ children }: { children: React.ReactNode }) {
  return <h3 className="mt-5 mb-1 flex items-center gap-2.5 text-[17px] leading-7 font-bold tracking-tight first:mt-0"><span className="h-5 w-1.5 shrink-0 rounded-full bg-brand-500" aria-hidden />{children}</h3>;
}

function MarkdownText({ text }: { text: string }) {
  // Listen- und Textzeilen im selben Absatz trennen, damit „- …“ zwischen Sätzen eine echte Liste wird
  const isItem = (l: string) => /^\s*([-*•]|\d+\.)\s+/.test(l);
  const lines = text.replace(/\r/g, "").replace(/```\w*\n?/g, "").split("\n");
  const spaced = lines.flatMap((l, i) => (i > 0 && l.trim() && lines[i - 1].trim() && !l.trim().startsWith("|") && !/^#{1,4}\s/.test(lines[i - 1]) && isItem(l) !== isItem(lines[i - 1]) ? ["", l] : [l]));
  const blocks = spaced.join("\n").split(/\n{2,}/);
  return (
    <div className="space-y-3 text-[15px] leading-7">
      {blocks.map((b, bi) => {
        const lines = b.split("\n").filter((l) => l.trim());
        if (lines.length && lines.every((l) => /^\s*([-*•]|\d+\.)\s+/.test(l))) {
          const ordered = /^\s*\d+\./.test(lines[0]);
          const Tag = ordered ? "ol" : "ul";
          return <Tag key={bi} className={`space-y-1 pl-5 ${ordered ? "list-decimal" : "list-disc"} marker:text-muted`}>{lines.map((l, li) => <li key={li}>{inline(l.replace(/^\s*([-*•]|\d+\.)\s+/, ""), `${bi}-${li}`)}</li>)}</Tag>;
        }
        // Tabelle: | a | b | mit Trennzeile
        if (lines.length >= 2 && lines.every((l) => l.trim().startsWith("|")) && /^\s*\|?\s*:?-{2,}/.test(lines[1])) {
          const cells = (l: string) => l.trim().replace(/^\||\|$/g, "").split("|").map((c) => c.trim());
          const head = cells(lines[0]);
          // Tabelle als Kachel (wie in Finastry): erste Spalte fett, Zahlen rechtsbündig
          const numeric = (c: string) => /^[−+-]?[\d.]+(,\d+)?\s?(€|%|EUR)?$/.test(c.replace(/\*\*/g, "").trim());
          return (
            <div key={bi} className="overflow-hidden rounded-2xl border border-card-line bg-surface shadow-card">
              <div className="no-scrollbar overflow-x-auto">
                <table className="w-full text-[14px]">
                  <thead className="bg-surface-2/70 text-[12px] tracking-wide text-muted uppercase"><tr>{head.map((c, ci) => <th key={ci} className="px-3.5 py-2.5 text-left font-semibold whitespace-nowrap">{inline(c, `${bi}-h${ci}`)}</th>)}</tr></thead>
                  <tbody className="divide-y divide-line">{lines.slice(2).map((l, ri) => <tr key={ri} className="hover:bg-surface-2/50">{cells(l).map((c, ci) => <td key={ci} className={`px-3.5 py-2.5 align-top ${ci === 0 ? "font-semibold" : ""} ${numeric(c) ? "tnum text-right whitespace-nowrap" : ""}`}>{inline(c, `${bi}-${ri}-${ci}`)}</td>)}</tr>)}</tbody>
                </table>
              </div>
            </div>
          );
        }
        // Überschrift mit folgendem Inhalt im selben Block
        if (/^#{1,4}\s+/.test(lines[0] ?? "") && lines.length > 1) {
          return <div key={bi} className="space-y-2"><Heading>{inline(lines[0].replace(/^#{1,4}\s+/, ""), `${bi}-h`)}</Heading><Markdown text={lines.slice(1).join("\n")} /></div>;
        }
        const h = /^#{1,4}\s+(.*)$/.exec(b.trim());
        if (h && lines.length === 1) return <Heading key={bi}>{inline(h[1], `${bi}`)}</Heading>;
        return <p key={bi}>{lines.map((l, li) => <Fragment key={li}>{li > 0 && <br />}{inline(l.replace(/^#{1,4}\s+/, ""), `${bi}-${li}`)}</Fragment>)}</p>;
      })}
    </div>
  );
}
