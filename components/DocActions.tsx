"use client";
import { IconTile } from "@/components/ClusterIcon";
import Link from "next/link";
import { useEffect, useState } from "react";
import { CalendarClock, Check, ChevronDown, Copy, Euro, ExternalLink, FileText, Globe, Landmark, Mail, MapPin, Phone, QrCode } from "lucide-react";
import { useDetail } from "@/components/DetailPanel";
import { contactOf, dueLabel, epcPayload, fmtIban, openTotal, paymentOf, todos, type Payment } from "@/lib/actions";
import { fmtDate, fmtMoney, useDocs } from "@/lib/docs";
import { PayImageButton } from "@/lib/payimage";
import { lastPayment } from "@/lib/lastpay";
import { purposeFor } from "@/lib/purpose";
import { nameFromEmail } from "@/components/AvatarMenu";
import { useSession } from "@/lib/supabase";
import type { Doc } from "@/lib/types";

const ACCESS = /\bpin\b|kennwort|passwort|code|filiale|zahlschein|barcode|kunden-?\s?n|vertragskonto|vertrags-?\s?n|rechnungs-?\s?n|referenz|verwendungszweck|zugang|login|benutzer|transaktions|kassenzeichen|aktenzeichen|mandats/i;

function CopyRow({ label, value, shown }: { label: string; value: string; shown?: string }) {
  const [done, setDone] = useState(false);
  return (
    <button type="button" onClick={() => { void navigator.clipboard.writeText(value); setDone(true); setTimeout(() => setDone(false), 1400); }} className="flex w-full items-center gap-3 px-3.5 py-2.5 text-left hover:bg-surface-2">
      <span className="w-28 shrink-0 text-[12px] text-muted">{label}</span>
      <span className="tnum min-w-0 flex-1 text-[14px] font-semibold [overflow-wrap:anywhere]">{shown ?? value}</span>
      {done ? <Check size={15} className="shrink-0 text-positive-text" /> : <Copy size={15} className="shrink-0 text-muted" />}
    </button>
  );
}

/** QR-Code als Bild (für GiroCode und Links) */
export function Qr({ text, size = 148 }: { text: string; size?: number }) {
  const [src, setSrc] = useState<string>();
  useEffect(() => { void import("qrcode").then((q) => q.toDataURL(text, { margin: 1, width: size * 2, errorCorrectionLevel: "M" })).then(setSrc).catch(() => setSrc(undefined)); }, [text, size]);
  return src ? <img src={src} alt="QR-Code" width={size} height={size} className="rounded-lg bg-white p-1" /> : <span className="block rounded-lg bg-surface-2" style={{ width: size, height: size }} />;
}

/** Überweisung: Betrag, Fälligkeit, alle Felder zum Kopieren, GiroCode zum Scannen */
function PaymentCard({ p, due, label = "Überweisung", doc, note, refLabel }: { p: Payment; due?: { date: string; days: number }; label?: string; doc?: Doc; note?: React.ReactNode; refLabel?: string }) {
  const [done, setDone] = useState(false);
  const all = [p.recipient && `Empfänger: ${p.recipient}`, `IBAN: ${fmtIban(p.iban)}`, p.bic && `BIC: ${p.bic}`, p.amount && `Betrag: ${fmtMoney(p.amount, p.currency)}`, p.reference && `Verwendungszweck: ${p.reference}`].filter(Boolean).join("\n");
  const late = due && due.days < 0;
  return (
    <section className="overflow-hidden rounded-2xl border border-card-line bg-surface">
      <div className="flex items-center justify-between gap-3 bg-surface-2 px-3.5 py-3">
        <span className="flex items-center gap-2 text-[14px] font-semibold"><Landmark size={16} /> {label}</span>
        <span className="text-right">
          {p.amount !== undefined && <b className="tnum block text-[18px] leading-6">{fmtMoney(p.amount, p.currency)}</b>}
          {due && <span className={`block text-[12px] font-semibold ${late ? "text-negative-text" : "text-muted"}`}>bis {fmtDate(due.date)} · {dueLabel(due.days)}</span>}
        </span>
      </div>
      {note && <div className="border-b border-line bg-[#fff7e6] px-3.5 py-2.5 text-[13px] text-[#7a4a00] dark:bg-[#3a2a0a] dark:text-[#f5c46b]">{note}</div>}
      <div className="divide-y divide-line">
        {p.recipient && <CopyRow label="Empfänger" value={p.recipient} />}
        <CopyRow label="IBAN" value={p.iban} shown={fmtIban(p.iban)} />
        {p.bic && <CopyRow label={p.bank ? `BIC · ${p.bank}` : "BIC"} value={p.bic} />}
        {p.amount !== undefined && <CopyRow label="Betrag" value={p.amount.toFixed(2).replace(".", ",")} shown={fmtMoney(p.amount, p.currency)} />}
        {p.reference && <CopyRow label={refLabel ?? "Verwendungszweck"} value={p.reference} />}
      </div>
      <div className="flex items-center gap-4 border-t border-line p-3.5">
        <Qr text={epcPayload(p)} size={112} />
        <span className="min-w-0 flex-1 text-[13px] text-muted">
          <b className="mb-1 flex items-center gap-1.5 text-[13px] text-fg"><QrCode size={14} /> GiroCode</b>
          Mit der Banking-App scannen – Empfänger, IBAN, Betrag und Verwendungszweck sind dann schon ausgefüllt.
          <button type="button" onClick={() => { void navigator.clipboard.writeText(all); setDone(true); setTimeout(() => setDone(false), 1400); }} className="mt-2 inline-flex h-8 items-center gap-1.5 rounded-full border border-card-line px-3 text-[13px] font-semibold text-fg hover:bg-surface-2">{done ? <Check size={13} /> : <Copy size={13} />} Alles kopieren</button>
          <PayImageButton data={{ p, sender: doc?.sender, domain: doc?.sender_domain, title: doc?.title, due: due?.date }} className="mt-2 ml-1.5" />
        </span>
      </div>
    </section>
  );
}

/** QR-Codes im Dokument selbst finden (Foto oder erste PDF-Seiten) und lesbar machen */
function useDocQrCodes(url: string | undefined, mime: string) {
  const [codes, setCodes] = useState<string[]>([]);
  useEffect(() => {
    if (!url || !(mime.startsWith("image/") || mime === "application/pdf")) return;
    let off = false;
    (async () => {
      const jsQR = (await import("jsqr")).default;
      const scan = (c: HTMLCanvasElement) => { const ctx = c.getContext("2d")!; const img = ctx.getImageData(0, 0, c.width, c.height); return jsQR(img.data, img.width, img.height)?.data; };
      const found: string[] = [];
      if (mime.startsWith("image/")) {
        const bmp = await createImageBitmap(await (await fetch(url)).blob());
        const s = Math.min(1, 1800 / Math.max(bmp.width, bmp.height));
        const c = document.createElement("canvas"); c.width = bmp.width * s; c.height = bmp.height * s;
        c.getContext("2d")!.drawImage(bmp, 0, 0, c.width, c.height);
        const r = scan(c); if (r) found.push(r);
      } else {
        const { getDocumentProxy } = await import("unpdf");
        const pdf = await getDocumentProxy(new Uint8Array(await (await fetch(url)).arrayBuffer()));
        for (let i = 1; i <= Math.min(pdf.numPages, 3); i++) {
          const page = await pdf.getPage(i);
          const vp = page.getViewport({ scale: 2 });
          const c = document.createElement("canvas"); c.width = vp.width; c.height = vp.height;
          await page.render({ canvasContext: c.getContext("2d")!, viewport: vp, canvas: c } as Parameters<typeof page.render>[0]).promise;
          const r = scan(c); if (r && !found.includes(r)) found.push(r);
        }
      }
      if (!off) setCodes(found);
    })().catch(() => undefined);
    return () => { off = true; };
  }, [url, mime]);
  return codes;
}

const PAY_LINK = /pay|zahl|bezahl|checkout|payment|invoice|rechnung|kundenportal|kundenkonto|mein-?konto|portal/i;
const host = (u: string) => { try { return new URL(u).hostname.replace(/^www\./, ""); } catch { return u; } };

/** GiroCode (EPC) aus dem Brief lesen: BCD-Format mit Empfänger, IBAN, Betrag, Zweck */
function parseEpc(c: string) {
  const l = c.split(/\r?\n/);
  if (l[0] !== "BCD" || l.length < 7) return null;
  const amt = /^EUR(\d+(?:\.\d+)?)$/.exec(l[7] ?? "");
  return { recipient: l[5], iban: l[6], amount: amt ? Number(amt[1]) : undefined, reference: l[10] || l[9] || "" };
}

/** Eigener Bereich „Bezahlung“: was ist offen (gesamt), woraus setzt es sich zusammen, und wie bezahle ich – Überweisung, GiroCode, Link */
/** always: auch ohne offene Zahlung zeigen (Status „nichts offen“ + bekannte Bankverbindung mit GiroCode) */
function PaymentSection({ doc, codes, links, related, always = false }: { doc: Doc; codes: string[]; links: string[]; related: Doc[]; always?: boolean }) {
  const today = new Date().toISOString().slice(0, 10);
  const todo = todos([doc], today)[0];
  const { allDocs } = useDocs();
  const payment = paymentOf(doc);
  const total = openTotal(doc) ?? payment?.amount;
  const [showItems, setShowItems] = useState(false);
  const epc = codes.map(parseEpc).find(Boolean);
  // keine IBAN im Schreiben: zuletzt bekannte Bankverbindung des Absenders, mit Herkunft
  const last = !payment && !epc ? lastPayment(doc, allDocs) : undefined;
  const session = useSession();
  const purpose = last ? purposeFor(doc, session?.user.email ? nameFromEmail(session.user.email) : "", last.payment.reference) : undefined;
  const qrLinks = codes.filter((c) => /^https?:\/\//i.test(c) && PAY_LINK.test(c));
  // gleiche Seite nur einmal (z. B. zweimal viacash.com)
  const payLinks = [...new Map([...qrLinks, ...links.filter((l) => PAY_LINK.test(l))].map((l) => [host(l), l])).values()].slice(0, 3);
  // Zugangsdaten fürs Bezahlen aus den Angaben: PIN, Code, Zahlschein-/Kunden-/Vertragsnummer, Referenz …
  const access = [...new Map((doc.key_facts ?? []).filter((f) => ACCESS.test(f.label) && f.value && f.value.length <= 80).map((f) => [f.value.replace(/\s/g, ""), f])).values()].slice(0, 6);
  const isPay = !!(payment || total || epc || (todo && /zahl|fällig|überweis|rechnung|mahn|gebühr|abschlag/i.test(todo.what)));
  if (!isPay && !always) return null;
  const late = todo && todo.days < 0;
  // nichts offen: bezahlt, Lastschrift oder kein Zahlungsdokument – trotzdem zeigen, wohin man zahlen würde
  const nothing = !todo && !isPay;
  return (
    <section className="overflow-hidden rounded-2xl border border-card-line bg-surface">
      <div className="flex items-start justify-between gap-3 px-4 pt-3.5 pb-3">
        <span>
          <span className="flex items-center gap-2 text-[12px] font-semibold tracking-wide text-muted uppercase"><Euro size={14} /> Bezahlung</span>
          {nothing ? <b className="mt-1 block text-[18px] leading-7">Nichts offen</b> : total !== undefined ? <b className="tnum mt-1 block text-[26px] leading-8">{fmtMoney(total, "EUR")}</b> : <b className="mt-1 block text-[15px]">Betrag nicht erkannt</b>}
          <span className="block text-[13px] text-muted">{nothing ? (doc.archived ? "erledigt bzw. archiviert" : "aus diesem Dokument ist gerade nichts zu zahlen") : todo?.items?.length ? `offen insgesamt · ${todo.items.length} Posten` : todo ? "offen" : "laut Dokument"}</span>
        </span>
        {todo && <span className={`mt-1 shrink-0 rounded-full border px-3.5 py-1 text-[12px] font-semibold ${late ? "border-negative/40 text-negative-text" : "border-card-line text-soft"}`}>{late ? dueLabel(todo.days) : `bis ${fmtDate(todo.date)}`}</span>}
      </div>
      {todo?.items && todo.items.length > 1 && (
        <div className="border-t border-line">
          <button type="button" onClick={() => setShowItems(!showItems)} className="flex w-full items-center justify-between px-4 py-2.5 text-[13px] font-semibold hover:bg-surface-2">Zusammensetzung<ChevronDown size={15} className={`text-muted transition-transform ${showItems ? "rotate-180" : ""}`} /></button>
          {showItems && <ul className="divide-y divide-line border-t border-line text-[13px]">{todo.items.map((x, i) => <li key={i} className="flex gap-3 px-4 py-2"><span className="tnum w-20 shrink-0 text-muted">{fmtDate(x.date)}</span><span className="min-w-0 flex-1">{x.what}</span></li>)}</ul>}
        </div>
      )}
      {related.length > 0 && <RelatedDocs doc={doc} related={related} />}
      {/* Wege zu zahlen – jeweils klar benannt */}
      <div className="space-y-2.5 border-t border-line p-3">
        {payment && <PaymentCard p={{ ...payment, amount: total ?? payment.amount }} doc={doc} />}
        {!payment && epc && <PaymentCard p={{ iban: epc.iban, recipient: epc.recipient, amount: epc.amount ?? total, reference: epc.reference, currency: "EUR" }} label="GiroCode aus dem Schreiben" doc={doc} />}
        {last && purpose && <PaymentCard p={{ ...last.payment, amount: total, reference: purpose.text }} refLabel={purpose.note ? "Verwendungszweck (wie zuletzt)" : purpose.given ? "Verwendungszweck" : "Verwendungszweck (Vorschlag)"} label="Zuletzt bekannte Bankverbindung" doc={doc} note={<>In diesem Schreiben steht keine IBAN. Das ist die zuletzt verwendete von {doc.sender} – aus <Link href={`/d/${last.source.id}`} className="font-semibold underline">{last.source.title ?? last.source.file_name}</Link> vom {fmtDate(last.source.doc_date ?? last.source.received_at)}{last.payment.reference ? <> (Verwendungszweck damals: „{last.payment.reference}“)</> : null}. Bitte vor dem Zahlen kurz prüfen.</>} />}
        {payLinks.map((l, i) => (
          <div key={l} className="overflow-hidden rounded-xl border border-card-line">
            <a href={l} target="_blank" rel="noopener noreferrer" className="flex items-center gap-3 px-3.5 py-3 hover:bg-surface-2">
              <IconTile icon={Globe} color="#2563eb" size={36} />
              <span className="min-w-0 flex-1"><b className="block text-[14px]">{qrLinks.includes(l) ? "Online bezahlen (QR-Code im Brief)" : "Online bezahlen / Kundenportal"}</b><span className="block truncate text-[12px] text-muted">{host(l)}</span></span>
              <ExternalLink size={14} className="shrink-0 text-muted" />
            </a>
            {/* was man dort eingeben muss – PIN, Code, Kundennummer, Betrag – zum Kopieren gleich dabei (nur beim ersten Link) */}
            {i === 0 && (access.length > 0 || total) && (
              <div className="divide-y divide-line border-t border-line">
                {total ? <CopyRow label="Betrag" value={total.toFixed(2).replace(".", ",")} shown={fmtMoney(total, payment?.currency ?? "EUR")} /> : null}
                {access.map((f) => <CopyRow key={f.label + f.value} label={f.label} value={f.value} />)}
              </div>
            )}
          </div>
        ))}
        {!payment && !epc && !last && !payLinks.length && <p className="px-1 text-[13px] text-muted">{nothing ? "Keine Bankverbindung bekannt – bei diesem Absender gab es bisher nichts zu überweisen (z. B. Lastschrift)." : "Keine Bankverbindung oder Zahlungslink im Schreiben – vermutlich per Lastschrift oder im Kundenkonto des Absenders."}</p>}
      </div>
    </section>
  );
}

/** Oberer Block im Dokument-Panel: Bezahlung (eigener Bereich), sonst Frist, dazu Kontakt & Links */
export function DocActions({ doc, url, fullText, related = [] }: { doc: Doc; url?: string; fullText?: string | null; related?: Doc[] }) {
  const today = new Date().toISOString().slice(0, 10);
  const todo = todos([doc], today)[0];
  const contact = contactOf(doc, fullText);
  const codes = useDocQrCodes(url, doc.mime_type);
  const hasContact = contact.addresses.length + contact.phones.length + contact.emails.length > 0;
  const pay = PaymentSection({ doc, codes, links: contact.links, related });
  // gleiche Seite nur einmal
  const otherLinks = [...new Map(contact.links.filter((l) => !PAY_LINK.test(l)).map((l) => [host(l), l])).values()];
  return (
    <div className="space-y-3">
      {pay}
      {todo && !pay && (
        <p className="flex items-start gap-2.5 rounded-2xl border border-card-line bg-surface px-3.5 py-3 text-[14px]">
          <CalendarClock size={16} className="mt-0.5 shrink-0" />
          <span><b>{todo.what}</b><span className={`block text-[12px] font-semibold ${todo.days < 0 ? "text-negative-text" : "text-muted"}`}>bis {fmtDate(todo.date)} · {dueLabel(todo.days)}</span></span>
        </p>
      )}
      {(hasContact || otherLinks.length > 0) && (
        <section className="overflow-hidden rounded-2xl border border-card-line bg-surface">
          <p className="px-3.5 pt-3 pb-1.5 text-[12px] font-semibold tracking-wide text-muted uppercase">Kontakt & Links</p>
          <div className="divide-y divide-line text-[14px]">
            {contact.addresses.map((a) => <a key={a} href={`https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(a)}`} target="_blank" rel="noopener noreferrer" className="flex items-center gap-3 px-3.5 py-2.5 hover:bg-surface-2"><MapPin size={15} className="shrink-0 text-muted" /><span className="min-w-0 flex-1">{a}</span><ExternalLink size={13} className="text-muted" /></a>)}
            {contact.phones.map((p) => <a key={p} href={`tel:${p.replace(/[^\d+]/g, "")}`} className="flex items-center gap-3 px-3.5 py-2.5 hover:bg-surface-2"><Phone size={15} className="shrink-0 text-muted" /><span className="tnum flex-1 font-medium">{p}</span></a>)}
            {contact.emails.map((e) => <a key={e} href={`mailto:${e}`} className="flex items-center gap-3 px-3.5 py-2.5 hover:bg-surface-2"><Mail size={15} className="shrink-0 text-muted" /><span className="min-w-0 flex-1 break-all font-medium">{e}</span></a>)}
          </div>
          {otherLinks.length > 0 && (
            <div className="flex flex-wrap gap-1.5 border-t border-line p-3">
              {otherLinks.map((l) => (
                <a key={l} href={l} target="_blank" rel="noopener noreferrer" className="inline-flex max-w-full items-center gap-1.5 rounded-full border border-card-line py-1 pr-3 pl-1 text-[13px] font-semibold hover:bg-surface-2">
                  <span className="grid h-6 w-6 shrink-0 place-items-center overflow-hidden rounded-full bg-surface-2"><img src={`/api/logo?d=${encodeURIComponent(host(l))}`} alt="" width={15} height={15} onError={(e) => { e.currentTarget.replaceWith(Object.assign(document.createElement("span"), { textContent: "🌐" })); }} /></span>
                  <span className="truncate">{host(l)}</span><ExternalLink size={12} className="shrink-0 text-muted" />
                </a>
              ))}
            </div>
          )}
        </section>
      )}
    </div>
  );
}

/** Alle Schreiben zum selben Vorgang – antippen öffnet sie rechts (bzw. auf der Seite) */
function RelatedDocs({ doc, related }: { doc: Doc; related: Doc[] }) {
  const open = useDetail();
  const dOf = (x: Doc) => x.doc_date ?? x.received_at.slice(0, 10);
  const all = [doc, ...related].sort((a, b) => dOf(b).localeCompare(dOf(a)));
  return (
    <div className="border-t border-line">
      <p className="px-4 pt-2.5 pb-1 text-[13px] text-soft"><b className="text-fg">{all.length} Schreiben zum selben Vorgang</b> – maßgeblich ist das neueste.</p>
      <ul className="pb-1.5">
        {all.map((x) => {
          const here = x.id === doc.id;
          const cls = `flex w-full items-center gap-2 px-4 py-1.5 text-left text-[13px] ${here ? "font-semibold text-fg" : "text-selected hover:bg-surface-2"}`;
          const body = <><FileText size={13} className="shrink-0" /><span className="min-w-0 flex-1 truncate">{x.title ?? x.file_name}</span><span className="shrink-0 text-muted">{fmtDate(dOf(x))}{here ? " · dieses" : x.id === all[0].id ? " · neuestes" : ""}</span></>;
          return <li key={x.id}>{here ? <span className={cls}>{body}</span> : open ? <button type="button" onClick={() => open({ kind: "doc", id: x.id })} className={cls}>{body}</button> : <Link href={`/d/${x.id}`} className={cls}>{body}</Link>}</li>;
        })}
      </ul>
    </div>
  );
}

/** Dokumentseite: Bezahlung gleich offen zeigen, solange die Zahlung nicht erledigt ist */
export function DocPayment({ doc, url, fullText, related = [], always = false }: { doc: Doc; url?: string; fullText?: string | null; related?: Doc[]; always?: boolean }) {
  const codes = useDocQrCodes(url, doc.mime_type);
  const contact = contactOf(doc, fullText);
  const todo = todos([doc], new Date().toISOString().slice(0, 10))[0];
  let done = false;
  try { done = !!todo && (JSON.parse(localStorage.getItem("lifevault:todo-done") ?? "[]") as string[]).includes(`${doc.id}|${todo.date}`); } catch { /* egal */ }
  if ((!todo || done) && !always) return null;
  return <PaymentSection doc={doc} codes={codes} links={contact.links} related={related} always={always} />;
}
