"use client";
import { useState } from "react";
import { Check, Copy, ExternalLink, Mail, X } from "lucide-react";
import { useConfirmations } from "@/lib/inbox";

/** Gmail fragt, ob an deine Lifevault-Adresse weitergeleitet werden darf – hier mit einem Klick bestätigen */
export function ForwardConfirm() {
  const { list, done } = useConfirmations();
  const [copied, setCopied] = useState<string>();
  if (!list.length) return null;
  return (
    <div className="mb-4 space-y-2">
      {list.map((c) => (
        <div key={c.id} className="flex flex-wrap items-center gap-3 rounded-2xl px-4 py-3 text-white shadow-card" style={{ background: "var(--accent-grad, linear-gradient(120deg,#5530c9 0%,#6438da 55%,#7650e6 100%))" }}>
          <span className="grid h-10 w-10 shrink-0 place-items-center rounded-[10px] bg-white/15"><Mail size={18} /></span>
          <span className="min-w-0 flex-1">
            <b className="block text-[15px]">Gmail-Weiterleitung bestätigen</b>
            <span className="block text-[13px] text-white/80">{c.forwarder ? `${c.forwarder} möchte` : "Gmail möchte"} Mails an deine Lifevault-Adresse weiterleiten. Ein Klick genügt – danach kommen Rechnungen automatisch an.</span>
          </span>
          {c.code && (
            <button type="button" onClick={() => { void navigator.clipboard?.writeText(c.code!); setCopied(c.id); setTimeout(() => setCopied(undefined), 1500); }} title="Code kopieren" className="inline-flex h-9 items-center gap-1.5 rounded-full bg-white/15 px-3 text-[13px] font-semibold tracking-wide hover:bg-white/25">
              {copied === c.id ? <Check size={14} /> : <Copy size={14} />} {c.code}
            </button>
          )}
          {c.link && <a href={c.link} target="_blank" rel="noopener noreferrer" onClick={() => setTimeout(() => done(c.id), 500)} className="inline-flex h-9 items-center gap-1.5 rounded-full bg-white px-4 text-[13px] font-semibold text-brand-600">Jetzt bestätigen <ExternalLink size={13} /></a>}
          <button type="button" onClick={() => done(c.id)} aria-label="Ausblenden" title="Erledigt" className="grid h-8 w-8 place-items-center rounded-full hover:bg-white/15"><X size={15} /></button>
        </div>
      ))}
    </div>
  );
}
