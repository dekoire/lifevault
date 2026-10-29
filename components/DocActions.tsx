"use client";
import { useEffect, useState } from "react";
import { CalendarClock, Check, Copy, ExternalLink, Globe, Landmark, Mail, MapPin, Phone, QrCode } from "lucide-react";
import { contactOf, dueLabel, epcPayload, fmtIban, paymentOf, todos, type Payment } from "@/lib/actions";
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
function Qr({ text, size = 148 }: { text: string; size?: number }) {
  const [src, setSrc] = useState<string>();
  useEffect(() => { void import("qrcode").then((q) => q.toDataURL(text, { margin: 1, width: size * 2, errorCorrectionLevel: "M" })).then(setSrc).catch(() => setSrc(undefined)); }, [text, size]);
  return src ? <img src={src} alt="QR-Code" width={size} height={size} className="rounded-lg bg-white p-1" /> : <span className="block rounded-lg bg-surface-2" style={{ width: size, height: size }} />;
}

/** Überweisung: Betrag, Fälligkeit, alle Felder zum Kopieren, GiroCode zum Scannen */
function PaymentCard({ p, due }: { p: Payment; due?: { date: string; days: number } }) {
  const [done, setDone] = useState(false);
  const all = [p.recipient && `Empfänger: ${p.recipient}`, `IBAN: ${fmtIban(p.iban)}`, p.bic && `BIC: ${p.bic}`, p.amount && `Betrag: ${fmtMoney(p.amount, p.currency)}`, p.reference && `Verwendungszweck: ${p.reference}`].filter(Boolean).join("\n");
  const late = due && due.days < 0;
  return (
    <section className="overflow-hidden rounded-2xl border border-card-line bg-surface">
      <div className="flex items-center justify-between gap-3 bg-surface-2 px-3.5 py-3">
        <span className="flex items-center gap-2 text-[13.5px] font-semibold"><Landmark size={16} /> Überweisung</span>
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

/** Oberer Block im Dokument-Panel: Zu tun, Überweisung, Kontakt, Links, QR-Codes */
export function DocActions({ doc, url, fullText }: { doc: Doc; url?: string; fullText?: string | null }) {
  const today = new Date().toISOString().slice(0, 10);
  const todo = todos([doc], today)[0];
  const payment = paymentOf(doc);
  const contact = contactOf(doc, fullText);
  const codes = useDocQrCodes(url, doc.mime_type);
  const host = (u: string) => { try { return new URL(u).hostname.replace(/^www\./, ""); } catch { return u; } };
  const hasContact = contact.addresses.length + contact.phones.length + contact.emails.length > 0;
  return (
    <div className="space-y-3">
      {todo && !payment && (
        <p className="flex items-start gap-2.5 rounded-2xl border border-card-line bg-surface px-3.5 py-3 text-[13.5px]">
          <CalendarClock size={16} className="mt-0.5 shrink-0" />
          <span><b>{todo.what}</b><span className={`block text-[12px] font-semibold ${todo.days < 0 ? "text-negative-text" : "text-muted"}`}>bis {fmtDate(todo.date)} · {dueLabel(todo.days)}</span></span>
        </p>
      )}
      {payment && <PaymentCard p={payment} due={todo ? { date: todo.date, days: todo.days } : undefined} />}
      {(hasContact || contact.links.length > 0) && (
        <section className="overflow-hidden rounded-2xl border border-card-line bg-surface">
          <p className="px-3.5 pt-3 pb-1.5 text-[12px] font-semibold tracking-wide text-muted uppercase">Kontakt & Links</p>
          <div className="divide-y divide-line text-[13.5px]">
            {contact.addresses.map((a) => <a key={a} href={`https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(a)}`} target="_blank" rel="noopener noreferrer" className="flex items-center gap-3 px-3.5 py-2.5 hover:bg-surface-2"><MapPin size={15} className="shrink-0 text-muted" /><span className="min-w-0 flex-1">{a}</span><ExternalLink size={13} className="text-muted" /></a>)}
            {contact.phones.map((p) => <a key={p} href={`tel:${p.replace(/[^\d+]/g, "")}`} className="flex items-center gap-3 px-3.5 py-2.5 hover:bg-surface-2"><Phone size={15} className="shrink-0 text-muted" /><span className="tnum flex-1 font-medium">{p}</span></a>)}
            {contact.emails.map((e) => <a key={e} href={`mailto:${e}`} className="flex items-center gap-3 px-3.5 py-2.5 hover:bg-surface-2"><Mail size={15} className="shrink-0 text-muted" /><span className="min-w-0 flex-1 break-all font-medium">{e}</span></a>)}
          </div>
          {contact.links.length > 0 && (
            <div className="flex flex-wrap gap-1.5 border-t border-line p-3">
              {contact.links.map((l) => (
                <a key={l} href={l} target="_blank" rel="noopener noreferrer" className="inline-flex max-w-full items-center gap-1.5 rounded-full border border-card-line py-1 pr-3 pl-1 text-[12.5px] font-semibold hover:bg-surface-2">
                  <span className="grid h-6 w-6 shrink-0 place-items-center overflow-hidden rounded-full bg-surface-2"><img src={`/api/logo?d=${encodeURIComponent(host(l))}`} alt="" width={15} height={15} onError={(e) => { e.currentTarget.replaceWith(Object.assign(document.createElement("span"), { textContent: "🌐" })); }} /></span>
                  <span className="truncate">{host(l)}</span><ExternalLink size={12} className="shrink-0 text-muted" />
                </a>
              ))}
            </div>
          )}
        </section>
      )}
      {codes.length > 0 && (
        <section className="rounded-2xl border border-card-line bg-surface p-3.5">
          <p className="mb-2 flex items-center gap-1.5 text-[12px] font-semibold tracking-wide text-muted uppercase"><QrCode size={13} /> QR-Code im Dokument</p>
          {codes.map((c) => (
            <div key={c} className="flex items-center gap-3">
              <Qr text={c} size={96} />
              {/^https?:\/\//i.test(c)
                ? <a href={c} target="_blank" rel="noopener noreferrer" className="inline-flex min-w-0 items-center gap-1.5 rounded-full bg-fg px-3.5 py-2 text-[13px] font-semibold text-canvas"><Globe size={14} /> <span className="truncate">{host(c)} öffnen</span></a>
                : <span className="min-w-0 text-[12.5px] break-all text-soft">{c.slice(0, 200)}</span>}
            </div>
          ))}
        </section>
      )}
    </div>
  );
}
