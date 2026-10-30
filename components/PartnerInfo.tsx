"use client";
import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { Check, ChevronDown, Copy, ExternalLink, Globe, Hash, Landmark, Mail, MapPin, Phone, UserRound, X } from "lucide-react";
import { SenderLogo } from "@/components/SenderLogo";
import { contactOf, fmtIban, paymentOf, type Payment } from "@/lib/actions";
import { ClusterTag, IconTile } from "@/components/ClusterIcon";
import { fmtDate } from "@/lib/docs";
import type { Partner } from "@/lib/partners";
import type { Doc } from "@/lib/types";

/** Ein gefundener Wert mit Stand (Briefdatum) und Quelle */
type Entry = { v: string; label?: string; date: string; title: string };
type Bank = Payment & { date: string; title: string };

// Personen beim Partner: Sachbearbeiter, Ansprechpartner, Unterzeichner, Ärztinnen und Ärzte (nicht du, nicht der Empfänger)
const PERSON = /ansprech|sachbearb|bearbeiter|betreu|berater|zuständig|kontaktperson|unterzeich|arzt|ärzt|direktor/i;
const NOT_PERSON = /empfänger|adressat|überweis|zuweis|arbeitnehmer|kürzel|telefon|^unterzeichnung|kontaktdaten|werksarzt/i;

const dateOf = (d: Doc) => d.doc_date ?? d.received_at.slice(0, 10);
const norm = (s: string) => s.toLowerCase().replace(/[^\p{L}\p{N}@]/gu, "");

/** Alle Angaben eines Partners, neueste zuerst; ältere abweichende Werte bleiben als Verlauf */
export function partnerFacts(p: Partner) {
  const docs = [...p.docs].sort((a, b) => dateOf(b).localeCompare(dateOf(a)));
  const people: Entry[] = [], phones: Entry[] = [], emails: Entry[] = [], addresses: Entry[] = [], banks: Bank[] = [];
  const add = (list: Entry[], e: Entry) => { if (!list.some((x) => norm(x.v) === norm(e.v))) list.push(e); };
  for (const d of docs) {
    const date = dateOf(d), title = d.title ?? d.file_name;
    const c = contactOf(d);
    for (const v of c.phones) add(phones, { v, date, title });
    for (const v of c.emails) add(emails, { v, date, title });
    for (const v of c.addresses) add(addresses, { v, date, title });
    for (const f of d.key_facts ?? []) {
      if (f.personal || !PERSON.test(f.label) || NOT_PERSON.test(f.label)) continue;
      const v = f.value.trim();
      if (v.length > 140 || !/\p{L}{3}/u.test(v) || /^[\d.\s/-]+$/.test(v)) continue;
      add(people, { v, label: f.label, date, title });
    }
    const pay = paymentOf(d);
    if (pay && !banks.some((b) => b.iban === pay.iban)) banks.push({ ...pay, date, title });
  }
  return { people, phones, emails, addresses, banks };
}

function CopyBtn({ value }: { value: string }) {
  const [done, setDone] = useState(false);
  return (
    <button type="button" aria-label="Kopieren" title="Kopieren" onClick={(e) => { e.stopPropagation(); void navigator.clipboard.writeText(value); setDone(true); setTimeout(() => setDone(false), 1400); }} className="grid h-7 w-7 shrink-0 place-items-center rounded-full text-muted hover:bg-surface-2 hover:text-fg">
      {done ? <Check size={14} className="text-positive-text" /> : <Copy size={14} />}
    </button>
  );
}

/** Zeile wie bei Finastry: Symbol + graue Bezeichnung links, Wert rechts */
function DetailRow({ icon, label, children }: { icon: React.ReactNode; label: string; children: React.ReactNode }) {
  return (
    <div className="flex min-h-12 flex-col gap-2 px-4 py-3 sm:flex-row sm:items-start sm:gap-3 sm:py-2.5">
      <span className="flex shrink-0 items-center gap-3 sm:min-h-7"><span className="shrink-0 text-muted">{icon}</span><span className="text-[13px] text-muted sm:w-28">{label}</span></span>
      <span className="min-w-0 flex-1 text-[13px] font-medium break-words text-fg">{children}</span>
    </div>
  );
}

const Stand = ({ e }: { e: { date: string; title: string } }) => <span className="block text-[12px] font-normal text-muted">Stand {fmtDate(e.date)} · aus „{e.title}“</span>;

/** Neuester Wert + aufklappbarer Verlauf älterer Werte */
function HistoryValue({ list, render, copy = true }: { list: Entry[]; render?: (e: Entry) => React.ReactNode; copy?: boolean }) {
  const [open, setOpen] = useState(false);
  const [first, ...older] = list;
  const show = (e: Entry) => render?.(e) ?? e.v;
  return (
    <span className="block">
      <span className="flex items-start gap-1">
        <span className="min-w-0 flex-1 pt-1">{show(first)}{first.label && <span className="block text-[12px] font-normal text-soft">{first.label}</span>}<Stand e={first} /></span>
        {copy && <CopyBtn value={first.v} />}
      </span>
      {older.length > 0 && (
        <>
          <button type="button" onClick={() => setOpen(!open)} className="mt-1.5 inline-flex items-center gap-1 rounded-full border border-card-line px-3.5 py-2 text-[12px] leading-4 font-semibold text-soft hover:text-fg">
            Früher ({older.length}) <ChevronDown size={12} className={`transition-transform ${open ? "rotate-180" : ""}`} />
          </button>
          {open && (
            <span className="mt-2 block space-y-2 border-l-2 border-line pl-3">
              {older.map((e) => (
                <span key={e.v} className="flex items-start gap-1">
                  <span className="min-w-0 flex-1 text-soft">{e.v}{e.label && <span className="block text-[12px] font-normal text-muted">{e.label}</span>}<Stand e={e} /></span>
                  {copy && <CopyBtn value={e.v} />}
                </span>
              ))}
            </span>
          )}
        </>
      )}
    </span>
  );
}

const CARD_ROWS = "divide-y divide-line rounded-2xl border border-card-line bg-surface shadow-card";
const Title = ({ children }: { children: React.ReactNode }) => <h3 className="px-1 pt-1 text-[13px] font-semibold text-soft">{children}</h3>;

/** Inhalt: Ansprechpartner, Kontakt, Bankverbindungen, Kennungen – je mit Stand und Verlauf */
export function PartnerFacts({ p }: { p: Partner }) {
  const { people, phones, emails, addresses, banks } = partnerFacts(p);
  const [allBanks, setAllBanks] = useState(false);
  const ids = p.ids.filter((i, n, all) => all.findIndex((x) => x.label.toLowerCase() === i.label.toLowerCase()) === n).slice(0, 8);
  const hasContact = people.length + phones.length + emails.length + addresses.length > 0 || !!p.domain;
  const maps = (v: string) => `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(`${p.name}, ${v}`)}`;
  const shownBanks = allBanks ? banks : banks.slice(0, 2);
  return (
    <div className="space-y-4">
      {hasContact ? (
        <>
          <Title>Kontakt</Title>
          <div className={CARD_ROWS}>
            {people.length > 0 && <DetailRow icon={<UserRound size={16} />} label="Ansprechpartner"><HistoryValue list={people} /></DetailRow>}
            {phones.length > 0 && <DetailRow icon={<Phone size={16} />} label="Telefon"><HistoryValue list={phones} render={(e) => <a href={`tel:${e.v.replace(/[^\d+]/g, "")}`} className="tnum text-selected hover:underline">{e.v}</a>} /></DetailRow>}
            {emails.length > 0 && <DetailRow icon={<Mail size={16} />} label="E-Mail"><HistoryValue list={emails} render={(e) => <a href={`mailto:${e.v}`} className="text-selected [overflow-wrap:anywhere] hover:underline">{e.v}</a>} /></DetailRow>}
            {addresses.length > 0 && <DetailRow icon={<MapPin size={16} />} label="Adresse"><HistoryValue list={addresses} render={(e) => <a href={maps(e.v)} target="_blank" rel="noopener noreferrer" className="inline-flex items-start gap-1 text-selected hover:underline">{e.v}<ExternalLink size={12} className="mt-0.5 shrink-0" /></a>} /></DetailRow>}
            {p.domain && <DetailRow icon={<Globe size={16} />} label="Website"><a href={`https://${p.domain}`} target="_blank" rel="noopener noreferrer" className="inline-flex min-h-7 items-center gap-1 text-selected hover:underline">{p.domain}<ExternalLink size={12} /></a></DetailRow>}
          </div>
        </>
      ) : null}

      {banks.length > 0 && (
        <>
          <Title>{banks.length === 1 ? "Bankverbindung" : `Bankverbindungen (${banks.length})`}</Title>
          <div className="space-y-2.5">
            {shownBanks.map((b, n) => (
              <div key={b.iban} className={CARD_ROWS}>
                <div className="flex items-center gap-3 px-4 py-3">
                  <IconTile icon={Landmark} color="#0f766e" size={36} />
                  <span className="min-w-0 flex-1">
                    <b className="block truncate text-[14px]">{b.bank ?? b.recipient ?? "Bankverbindung"}</b>
                    <span className="block truncate text-[12px] text-muted">Stand {fmtDate(b.date)} · aus „{b.title}“</span>
                  </span>
                  <span className={`shrink-0 rounded-full border px-3.5 py-2 text-[12px] leading-4 font-semibold ${n === 0 ? "border-fg text-fg" : "border-card-line text-muted"}`}>{n === 0 ? "zuletzt genannt" : "älter"}</span>
                </div>
                {b.recipient && <DetailRow icon={<UserRound size={16} />} label="Empfänger"><span className="flex items-center gap-1"><span className="min-w-0 flex-1">{b.recipient}</span><CopyBtn value={b.recipient} /></span></DetailRow>}
                <DetailRow icon={<Landmark size={16} />} label="IBAN"><span className="flex items-center gap-1"><span className="tnum min-w-0 flex-1">{fmtIban(b.iban)}</span><CopyBtn value={b.iban} /></span></DetailRow>
                {b.bic && <DetailRow icon={<Hash size={16} />} label="BIC"><span className="flex items-center gap-1"><span className="min-w-0 flex-1">{b.bic}</span><CopyBtn value={b.bic} /></span></DetailRow>}
              </div>
            ))}
            {banks.length > 2 && <button type="button" onClick={() => setAllBanks(!allBanks)} className="px-1 text-[13px] font-semibold text-selected">{allBanks ? "Weniger anzeigen" : `Alle ${banks.length} Bankverbindungen`}</button>}
          </div>
        </>
      )}

      {ids.length > 0 && (
        <>
          <Title>Deine Kennungen</Title>
          <div className={CARD_ROWS}>
            {ids.map((i) => <DetailRow key={`${i.label}|${i.value}`} icon={<Hash size={16} />} label={i.label}><span className="flex items-center gap-1"><span className="tnum min-w-0 flex-1 [overflow-wrap:anywhere]">{i.value}</span><CopyBtn value={i.value} /></span></DetailRow>)}
          </div>
        </>
      )}
      {!hasContact && !banks.length && !ids.length && <p className="rounded-2xl border border-card-line bg-surface p-5 text-center text-[14px] text-muted">In den Dokumenten stehen keine Kontaktdaten.</p>}
    </div>
  );
}

/** Seitenpanel von rechts (Handy: von unten) – Aufbau wie die Buchungsdetails in Finastry */
export function PartnerSheet({ p, onClose: rawClose, extra }: { p: Partner; onClose: () => void; extra?: React.ReactNode }) {
  const [closing, setClosing] = useState(false);
  const onClose = () => { setClosing(true); setTimeout(rawClose, 190); };
  useEffect(() => {
    const esc = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", esc);
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => { window.removeEventListener("keydown", esc); document.body.style.overflow = prev; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  return createPortal(
    <div data-closing={closing || undefined} className="sheet-backdrop fixed inset-0 z-50 flex items-end bg-black/35 lg:items-stretch lg:justify-end" onClick={onClose}>
      <aside role="dialog" aria-modal="true" aria-label={p.name} data-closing={closing || undefined} onClick={(e) => e.stopPropagation()}
        className="sheet-panel pb-safe h-[92dvh] w-full overflow-y-auto rounded-t-3xl bg-canvas shadow-lg lg:h-full lg:w-[520px] lg:rounded-none">
        <div className="space-y-4 p-4 sm:p-5">
          <div className="flex items-start gap-4 px-1 pt-1">
            <SenderLogo domain={p.domain} sender={p.name} cluster={p.cluster} size={64} bare />
            <div className="min-w-0 flex-1">
              <div className="text-[17px] leading-6 font-semibold">{p.name}</div>
              <div className="text-[13px] text-muted">{p.docs.length} {p.docs.length === 1 ? "Dokument" : "Dokumente"} · {fmtDate(p.first)}{p.first !== p.last ? ` – ${fmtDate(p.last)}` : ""}</div>
            </div>
            <button type="button" onClick={onClose} aria-label="Schließen" className="grid h-9 w-9 shrink-0 place-items-center rounded-full bg-surface-2 hover:bg-surface-3"><X size={18} /></button>
          </div>
          <div className="flex flex-wrap gap-1.5 px-1">
            <span className="rounded-full border border-card-line bg-surface px-3.5 py-2 text-[12px] leading-4 font-semibold"><ClusterTag id={p.cluster} /></span>
            <span className={`rounded-full border px-3.5 py-2 text-[12px] leading-4 font-semibold ${p.active ? "border-positive/40 text-positive-text" : "border-card-line text-muted"}`}>{p.active ? "aktuell" : "früher"}</span>
          </div>
          {extra}
          <PartnerFacts p={p} />
        </div>
      </aside>
    </div>,
    document.body,
  );
}
