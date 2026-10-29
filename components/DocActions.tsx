"use client";
import { useEffect, useState } from "react";
import { CalendarClock, Check, ChevronDown, Copy, Euro, ExternalLink, Globe, Landmark, Mail, MapPin, Phone, QrCode } from "lucide-react";
import { contactOf, dueLabel, epcPayload, fmtIban, openTotal, paymentOf, todos, type Payment } from "@/lib/actions";
import { fmtDate, fmtMoney } from "@/lib/docs";
import type { Doc } from "@/lib/types";

function CopyRow({ label, value, shown }: { label: string; value: string; shown?: string }) {
  const [done, setDone] = useState(false);
  return (
    <button type="button" onClick={() => { void navigator.clipboard.writeText(value); setDone(true); setTimeout(() => setDone(false), 1400); }} className="flex w-full items-center gap-3 px-3.5 py-2.5 text-left hover:bg-surface-2">
      <span className="w-28 shrink-0 text-[12px] text-muted">{label}</span>
      <span className="tnum min-w-0 flex-1 text-[13.5px] font-semibold [overflow-wrap:anywhere]">{shown ?? value}</span>
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
function PaymentCard({ p, due, label = "Überweisung" }: { p: Payment; due?: { date: string; days: number }; label?: string }) {
  const [done, setDone] = useState(false);
  const all = [p.recipient && `Empfänger: ${p.recipient}`, `IBAN: ${fmtIban(p.iban)}`, p.bic && `BIC: ${p.bic}`, p.amount && `Betrag: ${fmtMoney(p.amount, p.currency)}`, p.reference && `Verwendungszweck: ${p.reference}`].filter(Boolean).join("\n");
  const late = due && due.days < 0;
  return (
    <section className="overflow-hidden rounded-2xl border border-card-line bg-surface">
      <div className="flex items-center justify-between gap-3 bg-surface-2 px-3.5 py-3">
        <span className="flex items-center gap-2 text-[13.5px] font-semibold"><Landmark size={16} /> {label}</span>
        <span className="text-right">
          {p.amount !== undefined && <b className="tnum block text-[18px] leading-6">{fmtMoney(p.amount, p.currency)}</b>}
          {due && <span className={`block text-[11.5px] font-semibold ${late ? "text-negative-text" : "text-muted"}`}>bis {fmtDate(due.date)} · {dueLabel(due.days)}</span>}
        </span>
      </div>
      <div className="divide-y divide-line">
        {p.recipient && <CopyRow label="Empfänger" value={p.recipient} />}
        <CopyRow label="IBAN" value={p.iban} shown={fmtIban(p.iban)} />
        {p.bic && <CopyRow label={p.bank ? `BIC · ${p.bank}` : "BIC"} value={p.bic} />}
        {p.amount !== undefined && <CopyRow label="Betrag" value={p.amount.toFixed(2).replace(".", ",")} shown={fmtMoney(p.amount, p.currency)} />}
        {p.reference && <CopyRow label="Verwendungszweck" value={p.reference} />}
      </div>
      <div className="flex items-center gap-4 border-t border-line p-3.5">
        <Qr text={epcPayload(p)} size={112} />
        <span className="min-w-0 flex-1 text-[12.5px] text-muted">
          <b className="mb-1 flex items-center gap-1.5 text-[13px] text-fg"><QrCode size={14} /> GiroCode</b>
          Mit der Banking-App scannen – Empfänger, IBAN, Betrag und Verwendungszweck sind dann schon ausgefüllt.
          <button type="button" onClick={() => { void navigator.clipboard.writeText(all); setDone(true); setTimeout(() => setDone(false), 1400); }} className="mt-2 inline-flex h-8 items-center gap-1.5 rounded-full border border-card-line px-3 text-[12.5px] font-semibold text-fg hover:bg-surface-2">{done ? <Check size={13} /> : <Copy size={13} />} Alles kopieren</button>
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
function PaymentSection({ doc, codes, links, related }: { doc: Doc; codes: string[]; links: string[]; related: Doc[] }) {
  const today = new Date().toISOString().slice(0, 10);
  const todo = todos([doc], today)[0];
  const payment = paymentOf(doc);
  const total = openTotal(doc) ?? payment?.amount;
  const [showItems, setShowItems] = useState(false);
  const epc = codes.map(parseEpc).find(Boolean);
  const qrLinks = codes.filter((c) => /^https?:\/\//i.test(c) && PAY_LINK.test(c));
  const payLinks = [...new Set([...qrLinks, ...links.filter((l) => PAY_LINK.test(l))])].slice(0, 3);
  const isPay = !!(payment || total || epc || (todo && /zahl|fällig|überweis|rechnung|mahn|gebühr|abschlag/i.test(todo.what)));
  if (!isPay) return null;
  const late = todo && todo.days < 0;
  return (
    <section className="overflow-hidden rounded-2xl border border-card-line bg-surface">
      <div className="flex items-start justify-between gap-3 px-4 pt-3.5 pb-3">
        <span>
          <span className="flex items-center gap-2 text-[12px] font-semibold tracking-wide text-muted uppercase"><Euro size={14} /> Bezahlung</span>
          {total !== undefined ? <b className="tnum mt-1 block text-[26px] leading-8">{fmtMoney(total, "EUR")}</b> : <b className="mt-1 block text-[15px]">Betrag nicht erkannt</b>}
          <span className="block text-[12.5px] text-muted">{todo?.items?.length ? `offen insgesamt · ${todo.items.length} Posten` : "offen"}</span>
        </span>
        {todo && <span className={`mt-1 shrink-0 rounded-full border px-2.5 py-0.5 text-[12px] font-semibold ${late ? "border-negative/40 text-negative-text" : "border-card-line text-soft"}`}>{late ? dueLabel(todo.days) : `bis ${fmtDate(todo.date)}`}</span>}
      </div>
      {todo?.items && todo.items.length > 1 && (
        <div className="border-t border-line">
          <button type="button" onClick={() => setShowItems(!showItems)} className="flex w-full items-center justify-between px-4 py-2.5 text-[13px] font-semibold hover:bg-surface-2">Zusammensetzung<ChevronDown size={15} className={`text-muted transition-transform ${showItems ? "rotate-180" : ""}`} /></button>
          {showItems && <ul className="divide-y divide-line border-t border-line text-[13px]">{todo.items.map((x, i) => <li key={i} className="flex gap-3 px-4 py-2"><span className="tnum w-20 shrink-0 text-muted">{fmtDate(x.date)}</span><span className="min-w-0 flex-1">{x.what}</span></li>)}</ul>}
        </div>
      )}
      {related.length > 0 && (
        <div className="border-t border-line px-4 py-2.5 text-[12.5px] text-soft">
          <b className="text-fg">{related.length + 1} Schreiben zum selben Vorgang</b> – maßgeblich ist das neueste. Früher: {related.slice(0, 3).map((d) => `${d.title ?? d.file_name} (${fmtDate(d.doc_date ?? d.received_at)})`).join(", ")}
        </div>
      )}
      {/* Wege zu zahlen – jeweils klar benannt */}
      <div className="space-y-2.5 border-t border-line p-3">
        {payment && <PaymentCard p={{ ...payment, amount: total ?? payment.amount }} />}
        {!payment && epc && <PaymentCard p={{ iban: epc.iban, recipient: epc.recipient, amount: epc.amount ?? total, reference: epc.reference, currency: "EUR" }} label="GiroCode aus dem Schreiben" />}
        {payLinks.map((l) => (
          <a key={l} href={l} target="_blank" rel="noopener noreferrer" className="flex items-center gap-3 rounded-xl border border-card-line px-3.5 py-3 hover:bg-surface-2">
            <span className="grid h-9 w-9 shrink-0 place-items-center rounded-full bg-surface-2"><Globe size={16} /></span>
            <span className="min-w-0 flex-1"><b className="block text-[13.5px]">{qrLinks.includes(l) ? "Online bezahlen (QR-Code im Brief)" : "Online bezahlen / Kundenportal"}</b><span className="block truncate text-[12px] text-muted">{host(l)}</span></span>
            <ExternalLink size={14} className="shrink-0 text-muted" />
          </a>
        ))}
        {!payment && !epc && !payLinks.length && <p className="px-1 text-[12.5px] text-muted">Keine Bankverbindung oder Zahlungslink im Schreiben – vermutlich per Lastschrift oder im Kundenkonto des Absenders.</p>}
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
  const otherLinks = contact.links.filter((l) => !PAY_LINK.test(l));
  return (
    <div className="space-y-3">
      {pay}
      {todo && !pay && (
        <p className="flex items-start gap-2.5 rounded-2xl border border-card-line bg-surface px-3.5 py-3 text-[13.5px]">
          <CalendarClock size={16} className="mt-0.5 shrink-0" />
          <span><b>{todo.what}</b><span className={`block text-[12px] font-semibold ${todo.days < 0 ? "text-negative-text" : "text-muted"}`}>bis {fmtDate(todo.date)} · {dueLabel(todo.days)}</span></span>
        </p>
      )}
      {(hasContact || otherLinks.length > 0) && (
        <section className="overflow-hidden rounded-2xl border border-card-line bg-surface">
          <p className="px-3.5 pt-3 pb-1.5 text-[12px] font-semibold tracking-wide text-muted uppercase">Kontakt & Links</p>
          <div className="divide-y divide-line text-[13.5px]">
            {contact.addresses.map((a) => <a key={a} href={`https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(a)}`} target="_blank" rel="noopener noreferrer" className="flex items-center gap-3 px-3.5 py-2.5 hover:bg-surface-2"><MapPin size={15} className="shrink-0 text-muted" /><span className="min-w-0 flex-1">{a}</span><ExternalLink size={13} className="text-muted" /></a>)}
            {contact.phones.map((p) => <a key={p} href={`tel:${p.replace(/[^\d+]/g, "")}`} className="flex items-center gap-3 px-3.5 py-2.5 hover:bg-surface-2"><Phone size={15} className="shrink-0 text-muted" /><span className="tnum flex-1 font-medium">{p}</span></a>)}
            {contact.emails.map((e) => <a key={e} href={`mailto:${e}`} className="flex items-center gap-3 px-3.5 py-2.5 hover:bg-surface-2"><Mail size={15} className="shrink-0 text-muted" /><span className="min-w-0 flex-1 break-all font-medium">{e}</span></a>)}
          </div>
          {otherLinks.length > 0 && (
            <div className="flex flex-wrap gap-1.5 border-t border-line p-3">
              {otherLinks.map((l) => (
                <a key={l} href={l} target="_blank" rel="noopener noreferrer" className="inline-flex max-w-full items-center gap-1.5 rounded-full border border-card-line py-1 pr-3 pl-1 text-[12.5px] font-semibold hover:bg-surface-2">
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
