"use client";
import Link from "next/link";
import { useEffect, useMemo, useRef, useState } from "react";
import { Check, ChevronRight, Copy, ExternalLink, FileText, Globe, Landmark, Lock, Mail, MapPin, Phone } from "lucide-react";
import { nameFromEmail } from "@/components/AvatarMenu";
import { ClusterTag } from "@/components/ClusterIcon";
import { useDetail } from "@/components/DetailPanel";
import { Qr } from "@/components/DocActions";
import { ActionsWidget } from "@/components/ChatActions";
import { partnerFacts } from "@/components/PartnerInfo";
import { SenderLogo } from "@/components/SenderLogo";
import { KIND } from "@/components/TodoList";
import { contactOf, dueLabel, epcPayload, fmtIban, openTotal, paymentOf, todoKind, todos } from "@/lib/actions";
import { CLUSTERS } from "@/lib/clusters";
import { fmtDate, fmtMoney, useDocs } from "@/lib/docs";
import { caseIds } from "@/lib/dupes";
import { buildPartners } from "@/lib/partners";
import { PayImageButton } from "@/lib/payimage";
import { lastPayment } from "@/lib/lastpay";
import { relatedPayDocs } from "@/lib/related";
import { purposeFor } from "@/lib/purpose";
import { useSession } from "@/lib/supabase";
import { SMALL, thumbUrl } from "@/lib/thumbs";
import type { Doc } from "@/lib/types";

/**
 * Bausteine im Chat: Die KI nennt nur Dokument-IDs bzw. Partner-Schlüssel – Beträge, IBAN, Adressen usw.
 * kommen hier aus den echten Daten. So erfindet die KI keine Bankverbindungen.
 */
export const WIDGETS = ["zahlung", "partner", "dokumente", "aufgaben", "uebersicht", "gehalt", "aktion"] as const;
export type WidgetKind = (typeof WIDGETS)[number];

// Kachel-Verläufe wie in Finastry
export const TILE = {
  purple: "var(--accent-grad, linear-gradient(120deg,#5530c9 0%,#6438da 55%,#7650e6 100%))",
  teal: "linear-gradient(120deg,#1f9688 0%,#27a294 100%)",
  blue: "linear-gradient(120deg,#2b5fe6 0%,#3a6cf0 100%)",
  amber: "linear-gradient(120deg,#c46d06 0%,#d07a12 100%)",
  red: "linear-gradient(120deg,#d4143c 0%,#e8305a 100%)",
  ink: "linear-gradient(120deg,#1b2130 0%,#262d3d 100%)",
};
const BAR = ["#6d4aff", "#1f9688", "#2b5fe6", "#c46d06", "#d4143c", "#1b2130", "#8f72ff", "#27a294", "#3a6cf0", "#d07a12", "#e8305a", "#4a5568", "#a995ff"];

// Die KI schreibt mal nur die ID, mal einen Link [Titel](/d/ID) – wir nehmen, was drinsteckt
const ids = (body: string) => [...new Set(body.match(/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/gi) ?? [])];
/** zahlung-Baustein: „<ID> | 75“ = anderer Betrag (Teilzahlung, Rate, Abschlag) für dieses Dokument */
const askedAmounts = (body: string) => new Map(body.split("\n").map((l) => [/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/i.exec(l)?.[0]?.toLowerCase(), /\|\s*([\d.]+(?:,\d{1,2})?|\d+(?:\.\d{1,2})?)\s*(?:€|eur)?/i.exec(l)?.[1]] as const).filter((x): x is [string, string] => !!x[0] && !!x[1]).map(([id, v]) => [id, parseAmount(v)] as const).filter(([, v]) => v > 0 && v < 1e7));
const parseAmount = (v: string) => Number(/,\d{1,2}$/.test(v) ? v.replace(/\./g, "").replace(",", ".") : v.replace(/,/g, ""));
const keys = (body: string) => [...new Set(body.split("\n").map((l) => (l.match(/\/partner\/([^\s)]+)/)?.[1] ?? l.replace(/^[-*\s]+/, "")).trim()).filter(Boolean))];
const dateOf = (d: Doc) => d.doc_date ?? d.received_at.slice(0, 10);

function CopyBtn({ value, label }: { value: string; label?: string }) {
  const [done, setDone] = useState(false);
  return (
    <button type="button" onClick={(e) => { e.stopPropagation(); void navigator.clipboard.writeText(value); setDone(true); setTimeout(() => setDone(false), 1400); }} aria-label={`${label ?? "Wert"} kopieren`} className="grid h-7 w-7 shrink-0 place-items-center rounded-full text-muted hover:bg-surface-2 hover:text-fg">
      {done ? <Check size={14} className="text-positive-text" /> : <Copy size={14} />}
    </button>
  );
}
function Row({ label, value, shown }: { label: string; value: string; shown?: string }) {
  return (
    <div className="flex items-center gap-2 px-4 py-2">
      <span className="min-w-0 flex-1">
        <span className="block text-[11.5px] text-muted">{label}</span>
        <span className="tnum block text-[13.5px] font-semibold [overflow-wrap:anywhere]">{shown ?? value}</span>
      </span>
      <CopyBtn value={value} label={label} />
    </div>
  );
}

// ---------- Zahlungen: auswählen (mehrere), dann je eine Karte zum Wischen ----------
function PaymentWidget({ body }: { body: string }) {
  const { allDocs } = useDocs();
  const session = useSession();
  const open = useDetail();
  const today = new Date().toISOString().slice(0, 10);
  const name = session?.user.email ? nameFromEmail(session.user.email) : "";
  const list = useMemo(() => ids(body).map((id) => allDocs.find((d) => d.id === id)).filter(Boolean).map((d) => {
    // keine IBAN im Schreiben: zuletzt bekannte des Absenders (alter Verwendungszweck gilt nicht)
    const own = paymentOf(d!), last = own ? undefined : lastPayment(d!, allDocs);
    const p0 = own ?? (last && { ...last.payment, reference: undefined, amount: undefined }), p = p0 && { ...p0 };
    const t = todos([d!], today, { pastDays: 3650, aheadDays: 365 })[0];
    // manche Schreiben liefern als „Empfänger“ nur die IBAN – dann den Absender nehmen
    if (p && (!p.recipient || /^[A-Z]{2}\d{2}[A-Z0-9]{10,}$/.test(p.recipient.replace(/\s/g, "")))) p.recipient = d!.sender ?? undefined;
    return { d: d!, rel: relatedPayDocs(d!, allDocs), p, from: last?.source, lastRef: last?.payment.reference, total: openTotal(d!) ?? p?.amount, todo: t, purpose: purposeFor(d!, name, last?.payment.reference), links: contactOf(d!).links.filter((l) => /pay|zahl|bezahl|checkout|portal|kundenkonto/i.test(l)) };
  }), [body, allDocs, today, name]);
  const [sel, setSel] = useState<string[]>([]);
  useEffect(() => setSel((cur) => (cur.length ? cur : list.map((x) => x.d.id))), [list]);
  // Betrag frei wählbar: aus dem Chat („<ID> | 75“) oder selbst eingetippt – GiroCode und Text folgen
  const asked = useMemo(() => askedAmounts(body), [body]);
  const [typed, setTyped] = useState<Record<string, string>>({});
  if (!list.length) return null;
  const amountOf = (x: (typeof list)[number]) => {
    const t = typed[x.d.id];
    if (t !== undefined) { const v = parseAmount(t.replace(/\s|€/g, "")); return t.trim() && v > 0 ? v : undefined; }
    return asked.get(x.d.id.toLowerCase()) ?? x.total;
  };
  const chosen = list.filter((x) => sel.includes(x.d.id));
  const sum = chosen.reduce((s, x) => s + (amountOf(x) ?? 0), 0);
  return (
    <div className="space-y-3">
      {list.length > 1 && (
        <div className="overflow-hidden rounded-2xl border border-card-line bg-surface">
          <p className="flex items-center justify-between gap-3 px-4 pt-3 pb-2 text-[13px] font-semibold">Was möchtest du bezahlen?<span className="tnum shrink-0 text-muted">{chosen.length} gewählt · {fmtMoney(sum)}</span></p>
          <ul className="divide-y divide-line border-t border-line">
            {list.map((x) => { const on = sel.includes(x.d.id); return (
              <li key={x.d.id}>
                <button type="button" onClick={() => setSel(on ? sel.filter((i) => i !== x.d.id) : [...sel, x.d.id])} className="flex w-full items-center gap-3 px-4 py-2.5 text-left hover:bg-surface-2">
                  <span className={`grid h-5 w-5 shrink-0 place-items-center rounded-md border-2 ${on ? "border-fg bg-fg text-canvas" : "border-line-strong"}`}>{on && <Check size={12} strokeWidth={3} />}</span>
                  <SenderLogo domain={x.d.sender_domain} sender={x.d.sender} cluster={x.d.cluster} size={30} />
                  <span className="min-w-0 flex-1"><b className="block truncate text-[13.5px]">{x.d.title ?? x.d.file_name}</b><span className="block truncate text-[12px] text-muted">{fmtDate(dateOf(x.d))}{x.todo && <> · <span className={`font-semibold ${x.todo.days < 0 ? "text-negative-text" : ""}`}>{dueLabel(x.todo.days)}</span></>}</span></span>
                  <b className="tnum shrink-0 text-[13.5px]">{amountOf(x) !== undefined ? fmtMoney(amountOf(x)!) : "–"}</b>
                </button>
              </li>
            ); })}
          </ul>
        </div>
      )}
      {/* je Zahlung eine Karte, nach rechts wischen */}
      <div className="-mx-1 flex snap-x snap-mandatory gap-3 overflow-x-auto px-1 pb-1 [scrollbar-width:none]">
        {chosen.map((x) => {
          const amount = amountOf(x);
          const partial = amount !== undefined && x.total !== undefined && Math.abs(amount - x.total) > 0.004;
          const all = [x.p?.recipient && `Empfänger: ${x.p.recipient}`, x.p && `IBAN: ${fmtIban(x.p.iban)}`, x.p?.bic && `BIC: ${x.p.bic}`, amount !== undefined && `Betrag: ${fmtMoney(amount)}`, `Verwendungszweck: ${x.purpose.text}`].filter(Boolean).join("\n");
          return (
            <article key={x.d.id} className={`w-[88%] max-w-[420px] shrink-0 snap-start overflow-hidden rounded-2xl border border-card-line bg-surface shadow-card ${chosen.length === 1 ? "w-full max-w-none" : ""}`}>
              <div className="flex items-start gap-3 px-4 pt-4 pb-3">
                <SenderLogo domain={x.d.sender_domain} sender={x.d.sender} cluster={x.d.cluster} size={40} bare />
                <span className="min-w-0 flex-1">
                  <b className="block truncate text-[14px]">{x.p?.recipient ?? x.d.sender}</b>
                  <button type="button" onClick={() => open?.({ kind: "doc", id: x.d.id })} className="block max-w-full truncate text-left text-[12px] text-selected hover:underline">{x.d.title} · {fmtDate(dateOf(x.d))}</button>
                </span>
                <span className="text-right">
                  {amount !== undefined && <b className="tnum block text-[20px] leading-6">{fmtMoney(amount)}</b>}
                  {partial && <span className="block text-[11px] text-muted">von {fmtMoney(x.total!)} offen</span>}
                  {x.todo && <span className={`mt-1 inline-block rounded-full border px-2 py-px text-[11px] font-semibold ${x.todo.days < 0 ? "border-negative/40 text-negative-text" : "border-card-line text-soft"}`}>bis {fmtDate(x.todo.date)}</span>}
                </span>
              </div>
              <CaseDocs d={x.d} rel={x.rel} />
              {x.from && (
                <p className="border-t border-line bg-[#fff7e6] px-4 py-2.5 text-[12.5px] text-[#7a4a00] dark:bg-[#3a2a0a] dark:text-[#f5c46b]">
                  In diesem Schreiben steht keine IBAN. Das ist die zuletzt verwendete – aus{" "}
                  <button type="button" onClick={() => open?.({ kind: "doc", id: x.from!.id })} className="font-semibold underline">{x.from.title ?? x.from.file_name}</button> vom {fmtDate(dateOf(x.from))}{x.lastRef ? <> (Verwendungszweck damals: „{x.lastRef}“)</> : null}. Bitte kurz prüfen.
                </p>
              )}
              {x.p ? (
                <div className="divide-y divide-line border-t border-line">
                  {x.p.recipient && <Row label="Empfänger" value={x.p.recipient} />}
                  <Row label="IBAN" value={x.p.iban} shown={fmtIban(x.p.iban)} />
                  {x.p.bic && <Row label="BIC" value={x.p.bic} />}
                  {/* Betrag: änderbar (Teilzahlung, Rate) – der GiroCode übernimmt ihn */}
                  <label className="flex items-center gap-3 px-4 py-2.5">
                    <span className="w-28 shrink-0 text-[12px] text-muted">Betrag{partial ? " (Teilbetrag)" : ""}</span>
                    <span className="flex min-w-0 flex-1 items-center gap-1.5 rounded-lg border border-card-line px-2.5 focus-within:border-fg">
                      <input inputMode="decimal" value={typed[x.d.id] ?? (amount !== undefined ? amount.toFixed(2).replace(".", ",") : "")} onChange={(e) => setTyped({ ...typed, [x.d.id]: e.target.value })} placeholder="Betrag eingeben" aria-label="Betrag" className="tnum h-8 min-w-0 flex-1 bg-transparent text-[14px] font-semibold outline-none" />
                      <span className="text-[13px] text-muted">€</span>
                    </span>
                  </label>
                  <Row label={x.purpose.note ? `Verwendungszweck (${x.purpose.note})` : x.purpose.given ? "Verwendungszweck" : "Verwendungszweck (Vorschlag)"} value={x.purpose.text} />
                </div>
              ) : <p className="border-t border-line px-4 py-3 text-[12.5px] text-muted">Keine Bankverbindung im Schreiben – vermutlich Lastschrift oder Zahlung im Kundenkonto.</p>}
              <div className="flex items-center gap-3 border-t border-line p-3">
                {x.p && <Qr text={epcPayload({ ...x.p, amount, reference: x.purpose.text })} size={84} />}
                <span className="min-w-0 flex-1 space-y-2 text-[12px] text-muted">
                  {x.p && <span className="block">GiroCode: mit der Banking-App scannen.</span>}
                  {x.links.slice(0, 1).map((l) => <a key={l} href={l} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1.5 font-semibold text-selected"><Globe size={13} /> Online bezahlen <ExternalLink size={11} /></a>)}
                  <button type="button" onClick={() => void navigator.clipboard.writeText(all)} className="flex h-8 items-center gap-1.5 rounded-full border border-card-line px-3 font-semibold text-fg hover:bg-surface-2"><Copy size={13} /> Alles kopieren</button>
                  {x.p && <PayImageButton data={{ p: { ...x.p, amount, reference: x.purpose.text }, sender: x.d.sender, domain: x.d.sender_domain, title: x.d.title, due: x.todo?.date }} />}
                </span>
              </div>
            </article>
          );
        })}
      </div>
    </div>
  );
}

// ---------- Partner (Arzt, Versicherung, Arbeitgeber …) als Karte ----------
function PartnerWidget({ body }: { body: string }) {
  const { allDocs } = useDocs();
  const partners = useMemo(() => buildPartners(allDocs), [allDocs]);
  const list = keys(body).map((k) => partners.find((p) => p.key === k)).filter(Boolean);
  if (!list.length) return null;
  return (
    <div className="-mx-1 flex snap-x snap-mandatory items-start gap-3 overflow-x-auto px-1 pb-1 [scrollbar-width:none]">
      {list.map((p) => {
        const f = partnerFacts(p!);
        const phone = f.phones[0]?.v, mail = f.emails[0]?.v, addr = f.addresses[0]?.v;
        const kennungen = p!.ids.filter((x, n, a) => a.findIndex((y) => y.label === x.label) === n).slice(0, 3);
        return (
          <article key={p!.key} className={`shrink-0 snap-start overflow-hidden rounded-2xl border border-card-line bg-surface shadow-card ${list.length === 1 ? "w-full" : "w-[86%] max-w-[380px]"}`}>
            <div className="flex items-center gap-3 px-4 pt-4 pb-3">
              <SenderLogo domain={p!.domain} sender={p!.name} cluster={p!.cluster} size={44} bare />
              <span className="min-w-0 flex-1"><b className="block text-[15px] leading-5">{p!.name}</b><span className="mt-0.5 flex items-center gap-1.5 text-[12px] text-muted"><ClusterTag id={p!.cluster} /> · {p!.docs.length} Dok.</span></span>
            </div>
            <div className="divide-y divide-line border-t border-line text-[13px]">
              {addr && <a href={`https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(`${p!.name}, ${addr}`)}`} target="_blank" rel="noopener noreferrer" className="flex items-start gap-2.5 px-4 py-2.5 hover:bg-surface-2"><MapPin size={15} className="mt-0.5 shrink-0 text-muted" /><span className="min-w-0 flex-1">{addr}</span><ExternalLink size={12} className="mt-1 text-muted" /></a>}
              {phone && <a href={`tel:${phone.replace(/[^\d+]/g, "")}`} className="flex items-center gap-2.5 px-4 py-2.5 hover:bg-surface-2"><Phone size={15} className="shrink-0 text-muted" /><span className="tnum flex-1 font-semibold">{phone}</span></a>}
              {mail && <a href={`mailto:${mail}`} className="flex items-center gap-2.5 px-4 py-2.5 hover:bg-surface-2"><Mail size={15} className="shrink-0 text-muted" /><span className="min-w-0 flex-1 truncate font-semibold">{mail}</span></a>}
              {kennungen.map((k) => <div key={k.label + k.value} className="flex items-center gap-2 px-4 py-2"><span className="w-28 shrink-0 truncate text-[12px] text-muted">{k.label}</span><span className="tnum min-w-0 flex-1 truncate font-semibold">{k.value}</span><CopyBtn value={k.value} label={k.label} /></div>)}
              {f.banks[0] && <div className="flex items-center gap-2 px-4 py-2"><Landmark size={14} className="shrink-0 text-muted" /><span className="tnum min-w-0 flex-1 truncate text-[12.5px] font-semibold">{fmtIban(f.banks[0].iban)}</span><CopyBtn value={f.banks[0].iban} label="IBAN" /></div>}
            </div>
            <div className="flex gap-2 border-t border-line p-3">
              {phone && <a href={`tel:${phone.replace(/[^\d+]/g, "")}`} className="inline-flex h-9 items-center gap-1.5 rounded-full bg-fg px-3.5 text-[12.5px] font-semibold text-canvas"><Phone size={13} /> Anrufen</a>}
              <Link href={`/partner/${p!.key}`} className="inline-flex h-9 items-center gap-1 rounded-full border border-card-line px-3.5 text-[12.5px] font-semibold hover:bg-surface-2">Alles zu {p!.name.split(" ")[0]} <ChevronRight size={13} /></Link>
            </div>
          </article>
        );
      })}
    </div>
  );
}

// ---------- Dokumente als Vorschau-Kacheln (antippen öffnet rechts) ----------
export function Thumb({ d }: { d: Doc }) {
  const [url, setUrl] = useState<string>();
  const ref = useRef<HTMLSpanElement>(null);
  // erst laden, wenn sichtbar – dann das kleine Vorschaubild (nicht das Original)
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    let off = false;
    const io = new IntersectionObserver((e) => {
      if (!e.some((x) => x.isIntersecting)) return;
      io.disconnect();
      void thumbUrl(d, SMALL).then((u) => !off && setUrl(u));
    }, { rootMargin: "200px" });
    io.observe(el);
    return () => { off = true; io.disconnect(); };
  }, [d]);
  if (url) return <img src={url} alt="" className="pointer-events-none h-full w-full object-cover object-top select-none" draggable={false} />;
  return (
    <span ref={ref} className="grid h-full w-full place-items-center bg-surface-2 text-muted">
      {d.encrypted ? <Lock size={22} /> : <span className="flex flex-col items-center gap-1"><FileText size={24} /><span className="text-[10px] font-semibold uppercase">{d.mime_type.includes("pdf") ? "PDF" : "Datei"}</span></span>}
    </span>
  );
}
function DocsWidget({ body }: { body: string }) {
  const { allDocs } = useDocs();
  const open = useDetail();
  const list = ids(body).map((id) => allDocs.find((d) => d.id === id)).filter(Boolean) as Doc[];
  if (!list.length) return null;
  return (
    <div className="-mx-1 flex snap-x gap-2.5 overflow-x-auto px-1 pb-1 [scrollbar-width:none]">
      {list.slice(0, 12).map((d, i) => (
        <button key={d.id} type="button" onClick={() => open?.({ kind: "doc", id: d.id })} className="w-40 shrink-0 snap-start overflow-hidden rounded-2xl border border-card-line bg-surface text-left shadow-card hover:border-brand-500/40">
          {/* Nummer, damit man sagen kann „verbinde 1 und 2“ */}
          <span className="relative block h-28 overflow-hidden"><Thumb d={d} /><span className="absolute top-2 left-2"><SenderLogo domain={d.sender_domain} sender={d.sender} cluster={d.cluster} size={26} /></span>{list.length > 1 && <span className="tnum absolute top-2 right-2 grid h-6 min-w-6 place-items-center rounded-full bg-fg px-1.5 text-[12px] font-bold text-canvas">{i + 1}</span>}</span>
          <span className="block p-2.5"><b className="line-clamp-2 text-[12.5px] leading-4">{d.title ?? d.file_name}</b><span className="mt-1 block truncate text-[11px] text-muted">{d.doc_type ?? "Dokument"} · {fmtDate(dateOf(d))}</span></span>
        </button>
      ))}
    </div>
  );
}

// ---------- Aufgaben als abhakbare Liste (gleicher Stand wie auf der Startseite) ----------
const DONE = "lifevault:todo-done";
function TodosWidget({ body }: { body: string }) {
  const { allDocs } = useDocs();
  const open = useDetail();
  const today = new Date().toISOString().slice(0, 10);
  const want = ids(body);
  const [done, setDone] = useState<string[]>([]);
  useEffect(() => { try { setDone(JSON.parse(localStorage.getItem(DONE) ?? "[]")); } catch { /* egal */ } }, []);
  const list = todos(allDocs, today).filter((t) => !want.length || want.includes(t.doc.id));
  const toggle = (k: string) => setDone((cur) => { const n = cur.includes(k) ? cur.filter((x) => x !== k) : [...cur, k]; try { localStorage.setItem(DONE, JSON.stringify(n)); } catch { /* egal */ } return n; });
  if (!list.length) return <p className="rounded-2xl border border-card-line bg-surface px-4 py-3 text-[13.5px]">Nichts offen. 🎉</p>;
  const openCount = list.filter((t) => !done.includes(`${t.doc.id}|${t.date}`)).length;
  return (
    <div className="overflow-hidden rounded-2xl border border-card-line bg-surface">
      <p className="flex items-center justify-between px-4 pt-3 pb-2 text-[13px] font-semibold">Zu erledigen<span className="text-muted">{openCount} offen</span></p>
      <ul className="divide-y divide-line border-t border-line">
        {list.slice(0, 12).map((t) => {
          const k = `${t.doc.id}|${t.date}`, isDone = done.includes(k), K = KIND[todoKind(t)];
          const amt = t.total ?? t.payment?.amount;
          return (
            <li key={k} className={`flex items-center gap-3 px-4 py-2.5 ${isDone ? "opacity-50" : ""}`}>
              <button type="button" onClick={() => toggle(k)} aria-label="Erledigt" className={`grid h-6 w-6 shrink-0 place-items-center rounded-full border-2 ${isDone ? "border-positive bg-positive text-white" : "border-line-strong hover:border-fg"}`}>{isDone && <Check size={13} strokeWidth={3} />}</button>
              <button type="button" onClick={() => open?.({ kind: "doc", id: t.doc.id })} className="flex min-w-0 flex-1 items-center gap-2.5 text-left">
                <SenderLogo domain={t.doc.sender_domain} sender={t.doc.sender} cluster={t.doc.cluster} size={30} />
                <span className="min-w-0 flex-1"><b className={`block truncate text-[13.5px] ${isDone ? "line-through" : ""}`}>{t.what}</b><span className="flex items-center gap-1 text-[11.5px] text-muted"><K.icon size={11} /> {K.label} · {t.doc.sender}</span></span>
                <span className="shrink-0 text-right">{amt !== undefined && <b className="tnum block text-[13px]">{fmtMoney(amt)}</b>}<span className={`text-[11.5px] font-semibold ${t.days < 0 && !isDone ? "text-negative-text" : "text-muted"}`}>{dueLabel(t.days)}</span></span>
              </button>
            </li>
          );
        })}
      </ul>
    </div>
  );
}

// ---------- Überblick: Dokumente je Bereich, farbig ----------
function OverviewWidget() {
  const { allDocs } = useDocs();
  const ready = allDocs.filter((d) => d.status === "ready");
  const today = new Date().toISOString().slice(0, 10);
  const open = todos(ready, today);
  const late = open.filter((t) => t.days < 0).length;
  const byCluster = CLUSTERS.map((c) => ({ c, n: ready.filter((d) => d.cluster === c.id).length })).filter((x) => x.n).sort((a, b) => b.n - a.n);
  const max = Math.max(...byCluster.map((x) => x.n), 1);
  const partners = new Set(ready.map((d) => d.sender).filter(Boolean)).size;
  const tiles = [
    { label: "Dokumente", value: ready.length, bg: TILE.purple },
    { label: "Partner", value: partners, bg: TILE.blue },
    { label: "Offen", value: open.length, bg: TILE.teal, sub: late ? `${late} überfällig` : undefined },
    { label: "Verschlüsselt", value: ready.filter((d) => d.encrypted).length, bg: TILE.ink },
  ];
  return (
    <div className="space-y-3">
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
        {tiles.map((t) => <div key={t.label} className="rounded-2xl px-3.5 py-3 text-white shadow-card" style={{ background: t.bg }}><span className="block text-[12px] text-white/80">{t.label}</span><b className="tnum block text-[24px] leading-8">{t.value}</b>{t.sub && <span className="block text-[11px] text-white/85">{t.sub}</span>}</div>)}
      </div>
      <figure className="rounded-2xl border border-card-line bg-surface p-4">
        <figcaption className="mb-3 text-[13.5px] font-semibold">Dokumente je Bereich</figcaption>
        <ul className="space-y-2">
          {byCluster.map((x, i) => (
            <li key={x.c.id} className="grid grid-cols-[minmax(0,9rem)_minmax(0,1fr)] items-center gap-3 text-[13px]">
              <Link href={`/c/${x.c.id}`} className="truncate hover:underline"><ClusterTag id={x.c.id} /></Link>
              <span className="flex items-center gap-2"><span className="h-2.5 rounded-full" style={{ width: `${Math.max(3, (x.n / max) * 100)}%`, maxWidth: "calc(100% - 2.5rem)", background: BAR[i % BAR.length] }} /><b className="tnum">{x.n}</b></span>
            </li>
          ))}
        </ul>
      </figure>
    </div>
  );
}

// ---------- Gehalt als Infografik aus Gehaltsabrechnungen ----------
const pick = (d: Doc, re: RegExp) => d.amounts?.find((a) => re.test(a.label))?.value ?? (() => { const f = d.key_facts?.find((x) => re.test(x.label) && /\d/.test(x.value)); return f ? Number(f.value.replace(/[^\d,.-]/g, "").replace(/\.(?=\d{3})/g, "").replace(",", ".")) || undefined : undefined; })();
function SalaryWidget({ body }: { body: string }) {
  const { allDocs } = useDocs();
  const list = ids(body).map((id) => allDocs.find((d) => d.id === id)).filter(Boolean).sort((a, b) => dateOf(a!).localeCompare(dateOf(b!))) as Doc[];
  const rows = list.map((d) => ({ d, brutto: pick(d, /gesamt-?brutto|brutto/i), netto: pick(d, /auszahlung|überweisung|netto/i) })).filter((r) => r.brutto || r.netto);
  if (!rows.length) return null;
  const last = rows[rows.length - 1];
  const abz = last.brutto && last.netto ? last.brutto - last.netto : undefined;
  const max = Math.max(...rows.map((r) => r.brutto ?? r.netto ?? 0), 1);
  const month = (d: Doc) => new Date(`${dateOf(d)}T00:00:00`).toLocaleDateString("de-DE", { month: "short", year: "2-digit" });
  return (
    <div className="space-y-3">
      <div className="grid grid-cols-3 gap-2">
        {[{ l: "Netto", v: last.netto, bg: TILE.teal }, { l: "Brutto", v: last.brutto, bg: TILE.ink }, { l: "Abzüge", v: abz, bg: TILE.amber }].map((t) => t.v !== undefined && <div key={t.l} className="rounded-2xl px-3.5 py-3 text-white shadow-card" style={{ background: t.bg }}><span className="block text-[12px] text-white/80">{t.l} · {month(last.d)}</span><b className="tnum block text-[18px] leading-7">{fmtMoney(t.v)}</b></div>)}
      </div>
      {last.brutto && last.netto && (
        <div className="rounded-2xl border border-card-line bg-surface p-4">
          <p className="mb-2 text-[13px] font-semibold">Vom Brutto bleiben {Math.round((last.netto / last.brutto) * 100)} %</p>
          <div className="flex h-3 overflow-hidden rounded-full"><span style={{ width: `${(last.netto / last.brutto) * 100}%`, background: "#1f9688" }} /><span className="flex-1" style={{ background: "#d07a12" }} /></div>
          <p className="mt-1.5 flex justify-between text-[11.5px] text-muted"><span>Netto {fmtMoney(last.netto)}</span><span>Steuern & Abgaben {fmtMoney(abz!)}</span></p>
        </div>
      )}
      {rows.length > 1 && (
        <figure className="rounded-2xl border border-card-line bg-surface p-4">
          <figcaption className="mb-3 text-[13px] font-semibold">Verlauf</figcaption>
          <div className="flex h-32 items-end gap-2">
            {rows.slice(-12).map((r) => (
              <div key={r.d.id} className="flex flex-1 flex-col items-center gap-1">
                <div className="flex w-full items-end justify-center gap-0.5" style={{ height: "100%" }}>
                  {r.brutto && <span className="w-2.5 rounded-t" style={{ height: `${(r.brutto / max) * 100}%`, background: "#1b2130" }} title={`Brutto ${fmtMoney(r.brutto)}`} />}
                  {r.netto && <span className="w-2.5 rounded-t" style={{ height: `${(r.netto / max) * 100}%`, background: "#1f9688" }} title={`Netto ${fmtMoney(r.netto)}`} />}
                </div>
                <span className="text-[10.5px] text-muted">{month(r.d)}</span>
              </div>
            ))}
          </div>
        </figure>
      )}
    </div>
  );
}

export function ChatWidget({ kind, body }: { kind: string; body: string }) {
  switch (kind) {
    case "zahlung": return <PaymentWidget body={body} />;
    case "partner": return <PartnerWidget body={body} />;
    case "dokumente": return <DocsWidget body={body} />;
    case "aufgaben": return <TodosWidget body={body} />;
    case "uebersicht": return <OverviewWidget />;
    case "gehalt": return <SalaryWidget body={body} />;
    case "aktion": return <ActionsWidget body={body} />;
    default: return null;
  }
}


/** Alle Schreiben zum Vorgang (Rechnung, Mahnung, Forderung …) – antippen öffnet sie rechts; Hinweis, wenn es ein neueres gibt */
function CaseDocs({ d, rel }: { d: Doc; rel: Doc[] }) {
  const open = useDetail();
  const [show, setShow] = useState(false);
  const all = [d, ...rel].sort((a, b) => dateOf(b).localeCompare(dateOf(a)));
  const newer = rel.filter((x) => dateOf(x) > dateOf(d));
  return (
    <div className="border-t border-line">
      {newer.length > 0 && (
        <button type="button" onClick={() => open?.({ kind: "doc", id: newer[0].id })} className="flex w-full items-center gap-2 bg-[#eef3ff] px-4 py-2 text-left text-[12.5px] font-semibold text-[#2443a8] hover:underline dark:bg-[#1c2540] dark:text-[#9fb6ff]">
          <FileText size={14} className="shrink-0" /> Neueres Schreiben vom {fmtDate(dateOf(newer[0]))}: {newer[0].title ?? newer[0].file_name}
        </button>
      )}
      <button type="button" aria-expanded={show} onClick={() => setShow(!show)} className="flex w-full items-center gap-2 px-4 py-2.5 text-left text-[12.5px] font-semibold text-soft hover:bg-surface-2">
        <FileText size={14} className="shrink-0" /><span className="flex-1">{all.length === 1 ? "Das Schreiben dazu" : `${all.length} Schreiben zu diesem Vorgang`}</span>
        <ChevronRight size={15} className={`shrink-0 transition-transform ${show ? "rotate-90" : ""}`} />
      </button>
      {show && (
        <ul className="divide-y divide-line border-t border-line">
          {all.map((x) => (
            <li key={x.id}>
              <button type="button" onClick={() => open?.({ kind: "doc", id: x.id })} className="flex w-full items-center gap-3 px-4 py-2 text-left hover:bg-surface-2">
                <span className="h-10 w-8 shrink-0 overflow-hidden rounded-md border border-card-line bg-surface-2"><Thumb d={x} /></span>
                <span className="min-w-0 flex-1">
                  <b className="block truncate text-[13px] font-semibold">{x.title ?? x.file_name}</b>
                  <span className="block text-[11.5px] text-muted">{fmtDate(dateOf(x))}{x.id === d.id ? " · hier gezeigt" : dateOf(x) > dateOf(d) ? " · neuer" : " · älter"}</span>
                </span>
                <ChevronRight size={14} className="shrink-0 text-muted" />
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
