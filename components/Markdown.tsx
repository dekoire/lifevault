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
        ? <Link key={`${key}-${i++}`} href={href} className="inline-flex items-center rounded-md bg-lavender px-1.5 font-semibold text-selected hover:underline">{label}</Link>
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
        const h = /^#{1,4}\s+(.*)$/.exec(b.trim());
        if (h && lines.length === 1) return <h3 key={bi} className="pt-1 text-[16px] font-semibold">{inline(h[1], `${bi}`)}</h3>;
        return <p key={bi}>{lines.map((l, li) => <Fragment key={li}>{li > 0 && <br />}{inline(l.replace(/^#{1,4}\s+/, ""), `${bi}-${li}`)}</Fragment>)}</p>;
      })}
    </div>
  );
}
