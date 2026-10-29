"use client";
import { useState } from "react";
import { Check, Copy, ExternalLink, Globe, Hash, Landmark, Mail, MapPin, Phone } from "lucide-react";
import { contactOf, fmtIban, paymentOf, type Payment } from "@/lib/actions";
import { fmtDate } from "@/lib/docs";
import type { Partner } from "@/lib/partners";

function Copyable({ value, shown, label }: { value: string; shown?: string; label?: string }) {
  const [done, setDone] = useState(false);
  return (
    <button type="button" onClick={() => { void navigator.clipboard.writeText(value); setDone(true); setTimeout(() => setDone(false), 1400); }} className="flex w-full items-start gap-2 px-3.5 py-2 text-left hover:bg-surface-2">
      <span className="min-w-0 flex-1">
        {label && <span className="block text-[11.5px] text-muted">{label}</span>}
        <span className="tnum block text-[13.5px] font-semibold [overflow-wrap:anywhere]">{shown ?? value}</span>
      </span>
      {done ? <Check size={14} className="mt-0.5 shrink-0 text-positive-text" /> : <Copy size={14} className="mt-0.5 shrink-0 text-muted" />}
    </button>
  );
}

const Head = ({ icon: Icon, children }: { icon: typeof Mail; children: React.ReactNode }) => <p className="flex items-center gap-1.5 px-3.5 pt-3 pb-1 text-[11.5px] font-semibold tracking-wide text-muted uppercase"><Icon size={13} /> {children}</p>;

/** Neueste Angaben eines Partners: Kontakt, Adresse (mit Karte), Bankverbindung, deine Kennungen – alles zum Kopieren */
export function PartnerInfo({ p }: { p: Partner }) {
  // Dokumente sind nach Datum sortiert (neueste zuerst): erste Fundstelle = aktuellster Stand
  const addresses: { v: string; date: string }[] = [], phones: { v: string; date: string }[] = [], emails: { v: string; date: string }[] = [];
  let payment: (Payment & { date: string; title: string }) | undefined;
  for (const d of p.docs) {
    const date = d.doc_date ?? d.received_at.slice(0, 10);
    const c = contactOf(d);
    const add = (list: { v: string; date: string }[], vals: string[], max: number) => { for (const v of vals) if (list.length < max && !list.some((x) => x.v.toLowerCase() === v.toLowerCase())) list.push({ v, date }); };
    add(addresses, c.addresses, 2); add(phones, c.phones, 3); add(emails, c.emails, 2);
    const pay = !payment && paymentOf(d);
    if (pay) payment = { ...pay, date, title: d.title ?? d.file_name };
  }
  const ids = p.ids.filter((i, n, all) => all.findIndex((x) => x.label.toLowerCase() === i.label.toLowerCase()) === n).slice(0, 6);
  const hasContact = addresses.length + phones.length + emails.length > 0 || !!p.domain;
  if (!hasContact && !payment && !ids.length) return null;

  return (
    <aside className="overflow-hidden rounded-2xl border border-card-line bg-surface shadow-card">
      <p className="border-b border-line px-3.5 py-3 text-[14px] font-semibold">Neueste Angaben</p>
      {hasContact && (
        <div>
          <Head icon={Phone}>Kontakt</Head>
          <div className="pb-1 text-[13.5px]">
            {phones.map((x) => <a key={x.v} href={`tel:${x.v.replace(/[^\d+]/g, "")}`} className="flex items-center gap-2.5 px-3.5 py-2 hover:bg-surface-2"><Phone size={14} className="shrink-0 text-muted" /><span className="tnum flex-1 font-semibold">{x.v}</span></a>)}
            {emails.map((x) => <a key={x.v} href={`mailto:${x.v}`} className="flex items-center gap-2.5 px-3.5 py-2 hover:bg-surface-2"><Mail size={14} className="shrink-0 text-muted" /><span className="min-w-0 flex-1 font-semibold [overflow-wrap:anywhere]">{x.v}</span></a>)}
            {addresses.map((x) => (
              <a key={x.v} href={`https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(`${p.name}, ${x.v}`)}`} target="_blank" rel="noopener noreferrer" className="flex items-start gap-2.5 px-3.5 py-2 hover:bg-surface-2">
                <MapPin size={14} className="mt-0.5 shrink-0 text-muted" />
                <span className="min-w-0 flex-1"><span className="block font-semibold">{x.v}</span><span className="block text-[11.5px] text-muted">In Google Maps öffnen · Stand {fmtDate(x.date)}</span></span>
                <ExternalLink size={13} className="mt-0.5 shrink-0 text-muted" />
              </a>
            ))}
            {p.domain && <a href={`https://${p.domain}`} target="_blank" rel="noopener noreferrer" className="flex items-center gap-2.5 px-3.5 py-2 hover:bg-surface-2"><Globe size={14} className="shrink-0 text-muted" /><span className="flex-1 font-semibold">{p.domain}</span><ExternalLink size={13} className="text-muted" /></a>}
          </div>
        </div>
      )}
      {payment && (
        <div className="border-t border-line">
          <Head icon={Landmark}>Bankverbindung</Head>
          {payment.recipient && <Copyable label="Empfänger" value={payment.recipient} />}
          <Copyable label="IBAN" value={payment.iban} shown={fmtIban(payment.iban)} />
          {payment.bic && <Copyable label={payment.bank ? `BIC · ${payment.bank}` : "BIC"} value={payment.bic} />}
          <p className="px-3.5 pb-2.5 text-[11.5px] text-muted">aus „{payment.title}“ · {fmtDate(payment.date)}</p>
        </div>
      )}
      {ids.length > 0 && (
        <div className="border-t border-line pb-1.5">
          <Head icon={Hash}>Deine Kennungen</Head>
          {ids.map((i) => <Copyable key={`${i.label}|${i.value}`} label={i.label} value={i.value} />)}
        </div>
      )}
    </aside>
  );
}
