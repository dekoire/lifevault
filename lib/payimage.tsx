"use client";
import { useState } from "react";
import { Download, Loader2 } from "lucide-react";
import { epcPayload, fmtIban, type Payment } from "@/lib/actions";
import { fmtDate, fmtMoney } from "@/lib/docs";
import { domainFor } from "@/lib/partners";

/**
 * Überweisung als Bild: Logo, Absender, Betrag, Frist, Empfänger, IBAN, Verwendungszweck und ein großer GiroCode.
 * Auf dem Handy speichern → in der Banking-App „Foto-Überweisung“/„QR-Code aus Bild“ wählen. Alles im Browser erzeugt.
 */
export type PayImage = { p: Payment; sender?: string | null; domain?: string | null; title?: string | null; due?: string };

const FONT = "-apple-system, BlinkMacSystemFont, 'Inter', 'Segoe UI', Roboto, sans-serif";
const load = (src: string) => new Promise<HTMLImageElement | undefined>((ok) => { const i = new Image(); i.onload = () => ok(i.naturalWidth > 16 ? i : undefined); i.onerror = () => ok(undefined); i.src = src; });
function wrap(ctx: CanvasRenderingContext2D, text: string, max: number, lines = 3) {
  const out: string[] = [];
  let cur = "";
  for (const w of text.split(/\s+/)) {
    const t = cur ? `${cur} ${w}` : w;
    if (ctx.measureText(t).width <= max) cur = t;
    else { if (cur) out.push(cur); cur = w; }
  }
  if (cur) out.push(cur);
  if (out.length > lines) { out.length = lines; out[lines - 1] = `${out[lines - 1].replace(/.{2}$/, "")}…`; }
  return out;
}

export async function payImageBlob({ p, sender, domain, title, due }: PayImage) {
  const W = 1080, PAD = 72;
  const c = document.createElement("canvas");
  const ctx = c.getContext("2d")!;
  // Höhe hängt vom Text ab: erst messen, dann zeichnen
  ctx.font = `600 38px ${FONT}`;
  const ref = p.reference ? wrap(ctx, p.reference, W - PAD * 2, 3) : [];
  const ibanLike = !!p.recipient && /^[A-Z]{2}\d{2}[A-Z0-9]{10,}$/.test(p.recipient.replace(/\s/g, ""));
  const name = (!ibanLike && p.recipient) || sender || "";
  const rcpt = wrap(ctx, name, W - PAD * 2, 2);
  const H = 1000 + ref.length * 50 + rcpt.length * 50 + 800;
  c.width = W; c.height = H;
  ctx.fillStyle = "#ffffff"; ctx.fillRect(0, 0, W, H);
  // Kopf mit Lila-Verlauf wie in der App
  const g = ctx.createLinearGradient(0, 0, W, 0); g.addColorStop(0, "#5530c9"); g.addColorStop(1, "#7650e6");
  ctx.fillStyle = g; ctx.fillRect(0, 0, W, 360);
  // Logo in weißem Kreis
  ctx.fillStyle = "#fff"; ctx.beginPath(); ctx.arc(PAD + 70, 150, 70, 0, Math.PI * 2); ctx.fill();
  const d = domainFor(sender, domain);
  const logo = d ? await load(`/api/logo?d=${encodeURIComponent(d)}`) : undefined;
  if (logo) { const s = 92 / Math.max(logo.naturalWidth, logo.naturalHeight); ctx.drawImage(logo, PAD + 70 - (logo.naturalWidth * s) / 2, 150 - (logo.naturalHeight * s) / 2, logo.naturalWidth * s, logo.naturalHeight * s); }
  else { ctx.fillStyle = "#5530c9"; ctx.font = `700 60px ${FONT}`; ctx.textAlign = "center"; ctx.textBaseline = "middle"; ctx.fillText((sender ?? "?").trim()[0]?.toUpperCase() ?? "?", PAD + 70, 152); }
  ctx.textAlign = "left"; ctx.textBaseline = "alphabetic"; ctx.fillStyle = "#fff";
  ctx.font = `700 44px ${FONT}`; ctx.fillText(wrap(ctx, sender ?? "Überweisung", W - PAD * 2 - 180, 1)[0] ?? "", PAD + 170, 140);
  ctx.font = `500 32px ${FONT}`; ctx.fillStyle = "rgba(255,255,255,.85)"; ctx.fillText(wrap(ctx, title ?? "", W - PAD * 2 - 180, 1)[0] ?? "", PAD + 170, 190);
  ctx.font = `500 30px ${FONT}`; ctx.fillText("Überweisung", PAD, 300);
  // Betrag + Frist
  let y = 470;
  ctx.fillStyle = "#111"; ctx.font = `800 96px ${FONT}`;
  ctx.fillText(p.amount !== undefined ? fmtMoney(p.amount, p.currency) : "Betrag offen", PAD, y);
  if (due) {
    y += 70; ctx.font = `600 34px ${FONT}`; ctx.fillStyle = new Date(`${due}T23:59:59`) < new Date() ? "#d4143c" : "#555";
    ctx.fillText(`zahlbar bis ${fmtDate(due)}`, PAD, y);
  }
  // Felder
  y += 50;
  const field = (label: string, lines: string[]) => {
    y += 60; ctx.fillStyle = "#777"; ctx.font = `500 28px ${FONT}`; ctx.fillText(label, PAD, y);
    ctx.fillStyle = "#111"; ctx.font = `600 38px ${FONT}`;
    for (const l of lines) { y += 50; ctx.fillText(l, PAD, y); }
    y += 18; ctx.fillStyle = "#eee"; ctx.fillRect(PAD, y, W - PAD * 2, 2);
  };
  if (rcpt.length) field("Empfänger", rcpt);
  field("IBAN", [fmtIban(p.iban)]);
  if (p.bic) field("BIC", [p.bic]);
  if (ref.length) field("Verwendungszweck", ref);
  // GiroCode
  const QR = 560;
  const qr = await import("qrcode");
  const qc = document.createElement("canvas");
  await qr.toCanvas(qc, epcPayload({ ...p, recipient: name }), { margin: 2, width: QR, errorCorrectionLevel: "M" });
  y += 60; ctx.drawImage(qc, (W - QR) / 2, y, QR, QR); y += QR + 56;
  ctx.textAlign = "center"; ctx.fillStyle = "#111"; ctx.font = `700 34px ${FONT}`; ctx.fillText("GiroCode", W / 2, y);
  ctx.fillStyle = "#777"; ctx.font = `500 26px ${FONT}`; ctx.fillText("In der Banking-App scannen oder als Foto-Überweisung laden", W / 2, y + 44);
  return await new Promise<Blob>((ok, no) => c.toBlob((b) => (b ? ok(b) : no(new Error("Bild konnte nicht erstellt werden."))), "image/png"));
}

/** Knopf: auf dem Handy über „Teilen“ (→ „Bild sichern“ in Fotos), sonst Download */
export function PayImageButton({ data, className = "" }: { data: PayImage; className?: string }) {
  const [busy, setBusy] = useState(false);
  const run = async () => {
    setBusy(true);
    try {
      const blob = await payImageBlob(data);
      const name = `Ueberweisung-${(data.sender ?? "Zahlung").replace(/[^\wäöüÄÖÜß]+/g, "-").slice(0, 40)}.png`;
      const file = new File([blob], name, { type: "image/png" });
      const mobile = /iphone|ipad|android/i.test(navigator.userAgent);
      if (mobile && navigator.canShare?.({ files: [file] })) { await navigator.share({ files: [file], title: name }).catch(() => undefined); return; }
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a"); a.href = url; a.download = name; a.click();
      setTimeout(() => URL.revokeObjectURL(url), 2000);
    } finally { setBusy(false); }
  };
  return (
    <button type="button" onClick={(e) => { e.stopPropagation(); void run(); }} disabled={busy} className={`inline-flex h-8 items-center gap-1.5 rounded-full border border-card-line px-3 text-[12.5px] font-semibold text-fg hover:bg-surface-2 disabled:opacity-60 ${className}`}>
      {busy ? <Loader2 size={13} className="animate-spin" /> : <Download size={13} />} Als Bild speichern
    </button>
  );
}
