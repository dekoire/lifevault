import Link from "next/link";
import { Fragment } from "react";

/** Kleines Markdown für Chat-Antworten: Absätze, Listen, Überschriften, **fett** und [Links](/d/…) */
function inline(text: string, key: string) {
  const parts: React.ReactNode[] = [];
  const re = /(\*\*[^*]+\*\*|\[[^\]]+\]\([^)]+\))/g;
  let last = 0;
  let m: RegExpExecArray | null;
  let i = 0;
  while ((m = re.exec(text))) {
    if (m.index > last) parts.push(text.slice(last, m.index));
    const t = m[0];
    if (t.startsWith("**")) parts.push(<strong key={`${key}-${i++}`} className="font-semibold">{t.slice(2, -2)}</strong>);
    else {
      const [, label, href] = /\[([^\]]+)\]\(([^)]+)\)/.exec(t)!;
      parts.push(href.startsWith("/")
        ? <Link key={`${key}-${i++}`} href={href} className="inline-flex items-center rounded-md border border-card-line px-1.5 font-semibold text-fg hover:bg-surface-2">{label}</Link>
        : /^https?:\/\//.test(href) ? <a key={`${key}-${i++}`} href={href} target="_blank" rel="noreferrer" className="font-semibold text-selected underline">{label}</a> : label);
    }
    last = m.index + t.length;
  }
  if (last < text.length) parts.push(text.slice(last));
  return parts;
}

export function Markdown({ text }: { text: string }) {
  const blocks = text.replace(/\r/g, "").split(/\n{2,}/);
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
          return (
            <div key={bi} className="no-scrollbar -mx-1 overflow-x-auto px-1">
              <table className="w-full min-w-max overflow-hidden rounded-2xl border border-card-line text-[14px]">
                <thead className="bg-surface-2"><tr>{head.map((c, ci) => <th key={ci} className="px-3 py-2 text-left font-semibold">{inline(c, `${bi}-h${ci}`)}</th>)}</tr></thead>
                <tbody className="divide-y divide-line">{lines.slice(2).map((l, ri) => <tr key={ri}>{cells(l).map((c, ci) => <td key={ci} className="px-3 py-2 align-top">{inline(c, `${bi}-${ri}-${ci}`)}</td>)}</tr>)}</tbody>
              </table>
            </div>
          );
        }
        // Überschrift mit folgendem Inhalt im selben Block
        if (/^#{1,4}\s+/.test(lines[0] ?? "") && lines.length > 1) {
          return <div key={bi} className="space-y-2"><h3 className="pt-1 text-[16px] font-semibold">{inline(lines[0].replace(/^#{1,4}\s+/, ""), `${bi}-h`)}</h3><Markdown text={lines.slice(1).join("\n")} /></div>;
        }
        const h = /^#{1,4}\s+(.*)$/.exec(b.trim());
        if (h && lines.length === 1) return <h3 key={bi} className="pt-1 text-[16px] font-semibold">{inline(h[1], `${bi}`)}</h3>;
        return <p key={bi}>{lines.map((l, li) => <Fragment key={li}>{li > 0 && <br />}{inline(l.replace(/^#{1,4}\s+/, ""), `${bi}-${li}`)}</Fragment>)}</p>;
      })}
    </div>
  );
}
