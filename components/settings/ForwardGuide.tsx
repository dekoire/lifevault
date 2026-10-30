"use client";
import { useState } from "react";
import { Check, ChevronDown, Copy, ExternalLink, Filter } from "lucide-react";

/** Suchbegriffe für Gmail-Filter: Betreff in mehreren Sprachen, Werbung und Soziales ausgenommen */
const FILTERS = [
  {
    id: "subject",
    title: "Rechnungen, Verträge & Angebote (Betreff, mehrsprachig)",
    hint: "Empfohlen. Deutsch, Englisch, Französisch, Spanisch, Italienisch, Niederländisch, Portugiesisch, Polnisch, Türkisch.",
    query: "subject:(Rechnung OR Rechnungskopie OR Beleg OR Quittung OR Zahlungsbeleg OR Gutschrift OR Mahnung OR Zahlungserinnerung OR Abrechnung OR Nebenkostenabrechnung OR Vertrag OR Vertragsbestätigung OR Vertragsänderung OR Kündigungsbestätigung OR Angebot OR Kostenvoranschlag OR Versicherungsschein OR Beitragsrechnung OR Bescheid OR Kontoauszug OR Lohnabrechnung OR invoice OR receipt OR \"credit note\" OR \"payment reminder\" OR contract OR agreement OR quote OR quotation OR statement OR facture OR reçu OR devis OR contrat OR factura OR recibo OR presupuesto OR contrato OR fattura OR ricevuta OR preventivo OR contratto OR factuur OR offerte OR fatura OR orçamento OR faktura OR rachunek OR umowa OR sözleşme OR teklif) -category:promotions -category:social",
  },
  {
    id: "pdf",
    title: "PDF-Anhang mit Rechnungs-Stichwort im Text",
    hint: "Optional – fängt mehr, auch Mails ohne passenden Betreff. Unwichtiges sortiert die KI beim Import aus.",
    query: "has:attachment filename:pdf (Rechnung OR Rechnungsnummer OR invoice OR \"invoice number\" OR receipt OR facture OR factura OR fattura OR factuur OR Vertrag OR contract OR Angebot OR quote) -category:promotions",
  },
  {
    id: "senders",
    title: "Eigene Absender ohne Stichwort im Betreff",
    hint: "Für Abos & Shops, die z. B. nur „Order Confirmation“ oder „bill for …“ schreiben. Adressen anpassen.",
    query: "from:(billing@shop.example OR receipts@dienst.example)",
  },
] as const;

const TIPS = [
  "Lieber im Betreff suchen (subject:) – im Text steht „Rechnung“ auch in Werbung („Kauf auf Rechnung“).",
  "Mehrsprachig denken: Auslandsdienste schicken „receipt“, „invoice“, „facture“ – ein Filter mit OR deckt alle ab.",
  "Bestellbestätigungen weglassen: Die Rechnung kommt meist später extra.",
  "Filter wirken nur auf neue Mails – ältere einmal von Hand weiterleiten oder oben einen Zeitraum importieren.",
  "Bei Alias-Diensten (z. B. DuckDuckGo, iCloud „E-Mail-Adresse verbergen“) ist der Absender umgeschrieben – für from: die Adresse nehmen, die in deinem Postfach steht.",
  "Neue Lifevault-Adresse erzeugt? Dann in Gmail neu als Weiterleitungsziel bestätigen und in den Filtern auswählen.",
];

function CopyBox({ text }: { text: string }) {
  const [done, setDone] = useState(false);
  return (
    <div className="mt-2 flex items-start gap-2 rounded-2xl bg-surface-2 py-2 pr-2 pl-3">
      <code className="min-w-0 flex-1 text-[12px] leading-relaxed break-words">{text}</code>
      <button type="button" onClick={() => { void navigator.clipboard.writeText(text); setDone(true); setTimeout(() => setDone(false), 1400); }} className="inline-flex h-8 shrink-0 items-center gap-1.5 rounded-full bg-fg px-3 text-[12px] font-semibold text-canvas">{done ? <Check size={13} /> : <Copy size={13} />} {done ? "Kopiert" : "Kopieren"}</button>
    </div>
  );
}

const A = ({ href, children }: { href: string; children: React.ReactNode }) => (
  <a href={href} target="_blank" rel="noreferrer" className="inline-flex items-center gap-0.5 font-semibold text-brand-500 underline-offset-2 hover:underline">{children} <ExternalLink size={11} /></a>
);

/** Einstellungen › E-Mail-Import: Anleitung, wie Rechnungen automatisch per Gmail-Filter an die Lifevault-Adresse gehen */
export function ForwardGuide({ address, allowed }: { address: string; allowed: string[] }) {
  const [open, setOpen] = useState(false);
  return (
    <div className="border-t border-line">
      <button type="button" onClick={() => setOpen(!open)} aria-expanded={open} className="flex w-full items-center gap-3 p-5 text-left">
        <Filter size={15} className="shrink-0" />
        <span className="min-w-0 flex-1">
          <b className="block text-[14px]">Rechnungen automatisch weiterleiten</b>
          <span className="text-[13px] text-muted">Gmail-Filter, die nur Rechnungen, Verträge & Angebote an Lifevault schicken</span>
        </span>
        <ChevronDown size={16} className={`shrink-0 text-muted transition-transform ${open ? "rotate-180" : ""}`} />
      </button>
      {open && (
        <div className="space-y-5 px-5 pb-5 text-[13px]">
          <ol className="list-decimal space-y-2 pl-5 text-soft">
            <li>
              Dein Postfach unter <b className="text-fg">Erlaubte Absender</b> eintragen{allowed.length ? <> (eingetragen: {allowed.join(", ")})</> : null}. Automatisch weitergeleitete Mails behalten den ursprünglichen Absender – Lifevault erkennt am Zustellweg, dass sie aus deinem Postfach kommen.
            </li>
            <li>
              In Gmail <A href="https://mail.google.com/mail/u/0/#settings/fwdandpop">Weiterleitung & POP/IMAP</A> öffnen → <b className="text-fg">Weiterleitungsadresse hinzufügen</b> → <code className="rounded bg-surface-2 px-1">{address}</code> eintragen. „Weiterleitung deaktivieren“ ausgewählt lassen – es soll nicht alles weitergehen.
            </li>
            <li>Gmail schickt einen Bestätigungscode an Lifevault. Er erscheint hier in der App – mit einem Klick bestätigen.</li>
            <li>
              <A href="https://mail.google.com/mail/u/0/#settings/filters">Filter</A> öffnen → <b className="text-fg">Neuen Filter erstellen</b> → einen Suchbegriff von unten in <b className="text-fg">Enthält die Wörter</b> einfügen → <b className="text-fg">Filter erstellen</b> → <b className="text-fg">Weiterleiten an</b> deine Lifevault-Adresse wählen. Tipp: zusätzlich ein Label „Lifevault“ setzen.
            </li>
          </ol>

          <div className="space-y-4">
            {FILTERS.map((f) => (
              <div key={f.id}>
                <b className="block text-[14px]">{f.title}</b>
                <span className="text-[13px] text-muted">{f.hint}</span>
                <CopyBox text={f.query} />
              </div>
            ))}
          </div>

          <div>
            <b className="block text-[14px]">Tipps</b>
            <ul className="mt-1.5 list-disc space-y-1 pl-5 text-[13px] text-soft">
              {TIPS.map((t) => <li key={t}>{t}</li>)}
            </ul>
            <p className="mt-2 text-[13px] text-muted">Outlook, iCloud & Co.: dort heißt es „Regeln“. Bedingung „Betreff enthält“ mit denselben Wörtern, Aktion „Weiterleiten an“ deine Lifevault-Adresse.</p>
          </div>
        </div>
      )}
    </div>
  );
}
