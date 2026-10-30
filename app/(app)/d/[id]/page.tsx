"use client";
import { NotFound } from "@/components/NotFound";
import { isCardDoc, PdfPages } from "@/components/PdfPages";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { use, useEffect, useMemo, useRef, useState } from "react";
import { Archive, ArchiveRestore, CalendarClock, Check, Copy, ChevronLeft, ChevronRight, Download, FileDown, FileText, Lock, LockOpen, RefreshCw, Scissors, ShieldAlert, ShieldCheck, Trash2, Wallet } from "lucide-react";
import { Composer, MessageList, useChat } from "@/components/ChatPanel";
import { SenderLogo } from "@/components/SenderLogo";
import { CARD, ICON_BTN, KeyValueTable, Section } from "@/components/ui";
import { VaultUnlock } from "@/components/VaultUnlock";
import { clusterOf } from "@/lib/clusters";
import { chrono, fmtDate, fmtMoney, isUrgent, useDocs } from "@/lib/docs";
import { useProjects } from "@/lib/projects";
import { Clamp } from "@/components/Clamp";
import { DocLabels } from "@/components/Labels";
import { ImportanceCard } from "@/components/Importance";
import { DocPayment } from "@/components/DocActions";
import { relatedPayDocs } from "@/lib/related";
import { explainDoc, groupRank } from "@/lib/doctypes";
import { partnerKey } from "@/lib/partners";
import { useHistoryLinks } from "@/lib/history";
import { useDetail } from "@/components/DetailPanel";
import { OfficePreview } from "@/components/OfficePreview";
import { officeKind } from "@/lib/office";
import { useMe } from "@/lib/me";
import { openDoc, protectDoc, unprotectDoc } from "@/lib/protect";
import { sensitivity } from "@/lib/sensitive";
import { WebSourceCard } from "@/components/WebSourceCard";
import { MergedParts } from "@/components/MergedParts";
import { authFetch, supabase } from "@/lib/supabase";
import { addressesInDoc } from "@/lib/mailcore";
import type { Doc, DocView, Fact, SecretPart } from "@/lib/types";
import { contactOf } from "@/lib/actions";
import { RelationGraph } from "@/components/RelationGraph";
import { ChevronDown, Mail, MapPin, Phone, UserRound, Globe } from "lucide-react";

/** Fakten nach Gruppe sortieren (Reihenfolge wie vom Modell geliefert) */
function groupFacts(facts: Fact[]) {
  const m = new Map<string, Fact[]>();
  for (const f of facts) {
    const g = f.group?.trim() || "Weitere Angaben";
    m.set(g, [...(m.get(g) ?? []), f]);
  }
  return [...m.entries()];
}

function exportMarkdown(d: Doc, c: SecretPart) {
  const lines = [`# ${d.title ?? d.file_name}`, "", `- Bereich: ${clusterOf(d.cluster).label}`, `- Art: ${d.doc_type ?? ""}`, `- Absender: ${d.sender ?? ""}`, `- Datum: ${fmtDate(d.doc_date)}`, `- Eingang: ${fmtDate(d.received_at)}`, "", "## Zusammenfassung", c.summary ?? ""];
  for (const [g, fs] of groupFacts(c.key_facts ?? [])) lines.push("", `## ${g}`, "| Angabe | Wert |", "| --- | --- |", ...fs.map((f) => `| ${f.label} | ${f.value.replace(/\|/g, "/")} |`));
  if (c.deadlines?.length) lines.push("", "## Fristen", ...c.deadlines.map((x) => `- ${fmtDate(x.date)}: ${x.what}`));
  if (c.amounts?.length) lines.push("", "## Beträge", ...c.amounts.map((a) => `- ${a.label}: ${fmtMoney(a.value, a.currency)}`));
  lines.push("", "## Vollständiger Text", "", c.full_text ?? "");
  const blob = new Blob([lines.join("\n")], { type: "text/markdown;charset=utf-8" });
  const a = Object.assign(document.createElement("a"), { href: URL.createObjectURL(blob), download: `${(d.title ?? d.file_name).replace(/[^\p{L}\p{N} _-]/gu, "").slice(0, 80)}.md` });
  a.click();
}

/** Ein Dokument: links Tabelle und Fakten in Gruppen, rechts Original und Chat dazu */
/** Über dem Original: wie heikel ist das Dokument – und falls nicht verschlüsselt, Verschlüsseln anbieten */
function SensitiveBadge({ doc, unlocked, onProtect, flat = false }: { doc: Doc; unlocked: boolean; onProtect: () => void; flat?: boolean }) {
  const { vault } = useMe();
  const s = sensitivity(doc);
  // Kachel mit Farbverlauf wie in Finastry, weiße Schrift
  const G = { teal: "linear-gradient(120deg,#1f9688 0%,#27a294 100%)", red: "linear-gradient(120deg,#d4143c 0%,#e8305a 100%)", amber: "linear-gradient(120deg,#c46d06 0%,#d07a12 100%)", ink: "linear-gradient(120deg,#1b2130 0%,#262d3d 100%)" };
  const box = `flex flex-wrap items-center gap-3 px-4 py-3.5 text-[13px] text-white ${flat ? "" : "rounded-2xl shadow-card"}`;
  if (doc.encrypted) return (
    <div className={box} style={{ background: G.teal }}>
      <ShieldCheck size={20} className="shrink-0" />
      <span className="min-w-0 flex-1"><b className="text-[14px]">Verschlüsselt geschützt</b><span className="block text-white/85">Datei und Inhalt liegen nur verschlüsselt auf dem Server.</span></span>
    </div>
  );
  const bg = s.level === "hoch" ? G.red : s.level === "mittel" ? G.amber : G.ink;
  const head = s.level === "hoch" ? "Sehr sensibel" : s.level === "mittel" ? "Sensibel" : "Unkritisch";
  return (
    <div className={box} style={{ background: bg }}>
      {s.level === "gering" ? <ShieldCheck size={20} className="shrink-0" /> : <ShieldAlert size={20} className="shrink-0" />}
      <span className="min-w-0 flex-1"><b className="text-[14px]">{head}</b><span className="block text-white/85">{s.reasons.length ? `Enthält ${s.reasons.join(", ")} – nicht verschlüsselt.` : "Keine besonders schützenswerten Daten erkannt."}</span></span>
      {s.level !== "gering" && (vault && unlocked
        ? <button type="button" onClick={onProtect} className="inline-flex h-9 shrink-0 items-center gap-1.5 rounded-full bg-white px-4 text-[13px] font-semibold text-[#111]"><Lock size={14} /> Verschlüsseln</button>
        : <Link href="/einstellungen/tresor" className="inline-flex h-9 shrink-0 items-center gap-1.5 rounded-full bg-white px-4 text-[13px] font-semibold text-[#111]"><Lock size={14} /> {vault ? "Tresor entsperren" : "Tresor einrichten"}</Link>)}
    </div>
  );
}

type MailSeen = { msg_id: string; source: string; subject: string | null; sender: string | null; mail_date: string | null; forwarded_by: string | null; original_from: string | null; original_to: string[] | null };
/** Kam das Dokument aus einer E-Mail? Betreff, Datum, über welches Postfach, von wem ursprünglich und an wen */
function useMailOrigin(id: string) {
  const [m, setM] = useState<MailSeen | null>(null);
  useEffect(() => {
    let alive = true;
    void supabase.from("mail_seen").select("msg_id,source,subject,sender,mail_date,forwarded_by,original_from,original_to").contains("doc_ids", [id]).limit(1).maybeSingle().then(async ({ data }) => {
      if (!alive) return;
      setM(data as MailSeen | null);
      // früher importiert, Herkunft noch nicht bekannt: einmal bei der Mail nachschauen
      if (data && data.source === "inbox" && !data.original_from) {
        const r = await authFetch("/api/mail/inbox/origin", { method: "POST", body: JSON.stringify({ email: String(data.msg_id).replace(/^inbox:/, "") }) }).catch(() => null);
        const o = r?.ok ? ((await r.json()) as { forwardedBy: string | null; originalFrom: string | null; originalTo: string[] }) : null;
        if (alive && o) setM({ ...(data as MailSeen), forwarded_by: o.forwardedBy, original_from: o.originalFrom, original_to: o.originalTo });
      }
    });
    return () => { alive = false; };
  }, [id]);
  return m;
}

/** Herkunft: per Mail (mit Postfach, ursprünglichem Absender und Empfänger) oder hochgeladen */
function originRows(doc: Doc, mail: MailSeen | null, fullText?: string | null) {
  const small = (t: string) => <span className="block text-[12px] font-normal text-muted">{t}</span>;
  const inDoc = fullText ? addressesInDoc(fullText, doc.sender_domain) : [];
  const rows: { label: string; value: React.ReactNode }[] = [];
  if (mail) {
    const sender = (mail.sender ?? "").match(/<([^>]+)>/)?.[1] ?? mail.sender;
    // direkt aus dem eigenen Postfach geschickt (nicht weitergeleitet): das Postfach ist der Absender
    const direct = mail.source === "inbox" && !mail.forwarded_by && !mail.original_to?.length;
    const via = mail.forwarded_by ?? (direct ? mail.original_from ?? sender : null);
    const from = direct ? null : mail.original_from ?? (mail.source === "inbox" ? null : sender);
    rows.push({ label: "Herkunft", value: <>Per E-Mail{mail.source === "inbox" ? " an deine Lifevault-Adresse" : ` (${mail.source})`}{small(`${mail.subject || "(ohne Betreff)"} · ${fmtDate(mail.mail_date)}`)}</> });
    if (via) rows.push({ label: "Über Postfach", value: via });
    if (from) rows.push({ label: "Ursprünglich von", value: from });
    if (mail.original_to?.length) rows.push({ label: "Ursprünglich an", value: mail.original_to.join(", ") });
  } else rows.push({ label: "Herkunft", value: doc.web_source ? "Aus dem Web gespeichert" : "Hochgeladen" });
  if (inDoc.length) rows.push({ label: "Adresse im Dokument", value: inDoc.join(", ") });
  return rows;
}

/** Info-Kacheln oben: Farbverläufe wie in Finastry (lila, türkis, blau, orange) */
const TILE_GRADS = [
  "linear-gradient(120deg,#5530c9 0%,#6438da 55%,#7650e6 100%)",
  "linear-gradient(120deg,#177d71 0%,#1f9688 55%,#36b3a2 100%)",
  "linear-gradient(120deg,#1d4ed8 0%,#2563eb 55%,#3f74f0 100%)",
  "linear-gradient(120deg,#c2410c 0%,#ea580c 55%,#f97316 100%)",
];
const TILE_URGENT = "linear-gradient(120deg,#9f1239 0%,#b42318 55%,#d92d20 100%)";

export default function DocPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const router = useRouter();
  const { docs, allDocs, reprocess, splitDoc, remove, refresh } = useDocs();
  const { newerDoc } = useHistoryLinks(allDocs);
  const newer = newerDoc.get(id);
  const { projects } = useProjects();
  const { settings, unlocked } = useMe();
  const show = settings.doc_sections;
  const listed = allDocs.find((d) => d.id === id);
  // Nachbarn im selben Bereich (zeitlich) zum Blättern und Wischen
  const siblings = useMemo(() => (listed ? chrono(docs.filter((d) => d.cluster === listed.cluster && d.archived === listed.archived)) : []), [docs, listed]);
  const pos = siblings.findIndex((d) => d.id === id);
  const prev = pos > 0 ? siblings[pos - 1] : undefined;
  const next = pos >= 0 && pos < siblings.length - 1 ? siblings[pos + 1] : undefined;
  const touch = useRef<{ x: number; y: number }>(undefined);
  const onTouchStart = (e: React.TouchEvent) => { touch.current = { x: e.touches[0].clientX, y: e.touches[0].clientY }; };
  const onTouchEnd = (e: React.TouchEvent) => {
    const t = touch.current;
    touch.current = undefined;
    if (!t) return;
    const dx = e.changedTouches[0].clientX - t.x, dy = e.changedTouches[0].clientY - t.y;
    if (Math.abs(dx) < 70 || Math.abs(dx) < Math.abs(dy) * 2) return;
    const target = dx < 0 ? next : prev; // nach links wischen → neuer, nach rechts → älter
    if (target) router.replace(`/d/${target.id}`);
  };
  const [doc, setDoc] = useState<Doc>();
  const [missing, setMissing] = useState(false);
  const [opened, setOpened] = useState<{ content: SecretPart | null; url: string }>();
  const [url, setUrl] = useState<string>();
  const [open, setOpen] = useState<Record<string, boolean>>({});
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    void supabase.from("documents").select("*").eq("id", id).maybeSingle().then(({ data }) => { setDoc((data as Doc) ?? undefined); setMissing(!data); });
  }, [id, listed?.status, listed?.encrypted, listed?.archived]);
  // Original: unverschlüsselt per kurzlebigem Link, verschlüsselt im Browser öffnen
  useEffect(() => {
    if (!doc) return;
    if (doc.encrypted) {
      if (unlocked) void openDoc(doc).then(setOpened).catch(() => setOpened(undefined));
      else setOpened(undefined);
    } else void supabase.storage.from("documents").createSignedUrl(doc.file_path, 600).then(({ data }) => setUrl(data?.signedUrl));
  }, [doc?.id, doc?.encrypted, doc?.file_path, unlocked]); // eslint-disable-line react-hooks/exhaustive-deps

  const content: SecretPart | null = doc ? (doc.encrypted ? opened?.content ?? null : doc) : null;
  const groups = useMemo(() => groupFacts(content?.key_facts ?? []), [content]);
  const sortedGroups = useMemo(() => [...groups].sort((a, b) => groupRank(a[0]) - groupRank(b[0])), [groups]);
  const [more, setMore] = useState<Record<string, boolean>>({});
  const detail = useDetail();
  const mail = useMailOrigin(id);
  // aufbereitete Ansicht fehlt (älteres Dokument): einmal nachholen
  const viewAsked = useRef<string>(undefined);
  useEffect(() => {
    if (!doc || doc.view || doc.encrypted || doc.status !== "ready" || viewAsked.current === doc.id) return;
    viewAsked.current = doc.id;
    void authFetch("/api/view", { method: "POST", body: JSON.stringify({ id: doc.id }) }).then((r) => r.json()).then((j: { view?: DocView }) => j.view && setDoc((d) => (d && d.id === doc.id ? { ...d, view: j.view } : d))).catch(() => undefined);
  }, [doc]);
  const chat = useChat({ docId: id, docText: doc?.encrypted && content ? `${content.summary ?? ""}\n${JSON.stringify(content.key_facts)}\n${content.full_text ?? ""}` : undefined });

  if (!doc) return missing ? <NotFound title="Dokument nicht gefunden" /> : <p className="py-20 text-center text-muted">Lädt …</p>;
  const c = clusterOf(doc.cluster);
  const explain = explainDoc(doc.doc_type, doc.title);
  // Auf einen Blick: wichtigste Beträge und die nächste Frist
  const today = new Date().toISOString().slice(0, 10);
  const nextDl = (content?.deadlines ?? []).filter((x) => x.date >= today).sort((a, b) => a.date.localeCompare(b.date))[0];
  const daysTo = nextDl ? Math.round((Date.parse(nextDl.date) - Date.parse(today)) / 864e5) : 0;
  // Auf einen Blick, je nach Dokument: zu zahlen (mit Zusammensetzung klein), nächste Frist, wichtigste Nummer zum Kopieren
  const amounts = content?.amounts ?? [];
  const totalA = amounts.find((a) => /gesamt|zu zahlen|zahlbetrag|summe|forderung|endbetrag|rechnungsbetrag|offen/i.test(a.label))
    ?? (amounts.length > 2 ? amounts.find((a) => Math.abs(a.value - amounts.filter((b) => b !== a).reduce((n, b) => n + b.value, 0)) < 0.01) : undefined);
  const mainA = totalA ?? amounts[0];
  const partsA = amounts.filter((a) => a !== mainA).slice(0, 3);
  const REF = /aktenzeichen|kassenzeichen|kunden-?n(umme)?r|vertrags-?n(umme)?r|rechnungs-?n(umme)?r|versicherungs-?n(umme)?r|versichertenn|policen|mitglieds|steuernummer|steuer-id|identifikationsnummer|vorgangsnummer|referenz|fall-?n(umme)?r|antragsn/i;
  const refFact = (content?.key_facts ?? []).find((f) => REF.test(f.label) && f.value.length <= 40);
  const glance: { label: string; value: string; sub?: string; urgent?: boolean; copy?: string }[] = [
    ...(mainA ? [{ label: mainA.label, value: fmtMoney(mainA.value, mainA.currency), sub: partsA.length ? partsA.map((a) => `${a.label} ${fmtMoney(a.value, a.currency)}`).join(" · ") : totalA ? undefined : undefined }] : []),
    ...(nextDl ? [{ label: "Nächste Frist", value: fmtDate(nextDl.date), sub: `${nextDl.what} · in ${daysTo} ${daysTo === 1 ? "Tag" : "Tagen"}`, urgent: daysTo <= 7 }] : [{ label: "Datum", value: fmtDate(doc.doc_date ?? doc.received_at), sub: doc.doc_type ?? undefined }]),
    ...(refFact ? [{ label: refFact.label, value: refFact.value, copy: refFact.value }] : []),
  ];
  // einheitliche Kacheln aus der aufbereiteten Ansicht (sonst die grobe Auswahl von oben)
  const view = doc.encrypted ? null : doc.view ?? null;
  const tiles: typeof glance = view?.glance.length ? view.glance.map((g) => ({ label: g.label, value: g.value, sub: g.hint ?? undefined })) : glance;
  // die eine Frist, die zählt – oben rechts
  const act = view?.action && view.action.date >= today ? view.action : !view && nextDl ? { label: "Frist", date: nextDl.date, what: nextDl.what } : null;
  const actDays = act ? Math.round((Date.parse(act.date) - Date.parse(today)) / 864e5) : 0;
  // persönliche Angaben, Kontakt und Kosten haben eigene Kacheln
  const personal = (content?.key_facts ?? []).filter((f) => f.personal);
  const contact = content ? contactOf({ ...doc, ...content } as Doc, content.full_text) : undefined;
  const COST_GROUP = /kosten|preis|beitr|betr(a|ä)g|rechnung|beleg|gebühr|zahlung|summe|leistung(en)? &? ?kosten/i;
  const restGroups = sortedGroups.map(([g, fs]) => [g, fs.filter((f) => !f.personal)] as const).filter(([g, fs]) => fs.length && !/persönlich|kontakt/i.test(g) && !(view?.costs && COST_GROUP.test(g)));
  const fileUrl = doc.encrypted ? opened?.url : url;
  const image = doc.mime_type.startsWith("image/");
  const isOpen = (k: string, def: boolean) => open[k] ?? def;
  const toggle = (k: string, def: boolean) => setOpen({ ...open, [k]: !isOpen(k, def) });

  const run = async (fn: () => Promise<void>) => { setBusy(true); try { await fn(); await refresh(); } catch (e) { alert((e as Error).message); } finally { setBusy(false); } };
  const download = async () => {
    if (doc.encrypted) { if (opened) Object.assign(document.createElement("a"), { href: opened.url, download: doc.file_name }).click(); return; }
    const { data } = await supabase.storage.from("documents").createSignedUrl(doc.file_path, 60, { download: doc.file_name });
    if (data) location.href = data.signedUrl;
  };
  const del = async () => { if (confirm("Dokument endgültig löschen?")) { await remove(doc); router.replace("/"); } };
  const tools: { icon: React.ReactNode; label: string; onClick: () => void; hidden?: boolean; danger?: boolean }[] = [
    { icon: <Download size={17} />, label: "Original herunterladen", onClick: () => void download(), hidden: doc.encrypted && !opened },
    { icon: <FileDown size={17} />, label: "Als Markdown exportieren", onClick: () => content && exportMarkdown(doc, content), hidden: !content },
    { icon: <RefreshCw size={17} />, label: "Neu auslesen", onClick: () => void run(() => reprocess(doc.id)), hidden: doc.encrypted && !unlocked },
    { icon: <Scissors size={17} />, label: "In einzelne Dokumente trennen", onClick: () => { if (confirm("Prüfen, ob die PDF mehrere eigenständige Dokumente enthält, und sie getrennt ablegen? Das kann bei langen Akten ein paar Minuten dauern.")) { void splitDoc(doc.id); router.push(`/c/${doc.cluster ?? "sonstiges"}`); } }, hidden: doc.encrypted || doc.mime_type !== "application/pdf" },
    { icon: doc.archived ? <ArchiveRestore size={17} /> : <Archive size={17} />, label: doc.archived ? "Wieder aktuell" : "Archivieren", onClick: () => void run(async () => { await supabase.from("documents").update({ archived: !doc.archived, archived_reason: doc.archived ? null : "von dir archiviert", archive_manual: true }).eq("id", doc.id); }) },
    { icon: doc.encrypted ? <LockOpen size={17} /> : <Lock size={17} />, label: doc.encrypted ? "Verschlüsselung aufheben" : "Verschlüsseln", onClick: () => void run(() => (doc.encrypted ? unprotectDoc(doc) : protectDoc(doc))), hidden: !unlocked },
    { icon: <Trash2 size={17} />, label: "Löschen", onClick: () => void del(), danger: true },
  ];

  // gesperrt: nichts verraten – kein Titel, Absender, Logo, Tags oder Fristen; nur Zurück und die Entsperren-Box, mittig
  if (doc.encrypted && !unlocked) return (
    <div className="flex min-h-[calc(100dvh-12rem)] flex-col">
      <button type="button" onClick={() => router.back()} className="inline-flex h-10 items-center gap-1 self-start rounded-full pr-3 pl-1.5 text-[14px] font-semibold text-soft hover:bg-surface-3"><ChevronLeft size={18} /> Zurück</button>
      <div className="grid flex-1 place-items-center py-10">
        <div className="w-full max-w-md"><VaultUnlock /></div>
      </div>
    </div>
  );

  return (
    <div onTouchStart={onTouchStart} onTouchEnd={onTouchEnd}>
      <div className="mb-3 flex items-center justify-between gap-2">
        <Link href={`/c/${c.id}`} className="inline-flex h-10 items-center gap-1 rounded-full pr-3 pl-1.5 text-[14px] font-semibold text-soft hover:bg-surface-3"><ChevronLeft size={18} /> {c.label}</Link>
        {siblings.length > 1 && pos >= 0 && (
          <span className="inline-flex items-center gap-1 rounded-full border border-card-line bg-surface p-1">
            <button type="button" disabled={!prev} onClick={() => prev && router.replace(`/d/${prev.id}`)} aria-label="Älteres Dokument" title={prev?.title ?? ""} className="grid h-8 w-8 place-items-center rounded-full hover:bg-surface-2 disabled:opacity-30"><ChevronLeft size={17} /></button>
            <span className="tnum px-1 text-[12px] font-semibold text-soft">{pos + 1} / {siblings.length}</span>
            <button type="button" disabled={!next} onClick={() => next && router.replace(`/d/${next.id}`)} aria-label="Neueres Dokument" title={next?.title ?? ""} className="grid h-8 w-8 place-items-center rounded-full hover:bg-surface-2 disabled:opacity-30"><ChevronRight size={17} /></button>
          </span>
        )}
      </div>

      {/* Kopf: Logo, Titel, Kennzeichen, kleine Aktionen */}
      <div className="mb-5 flex flex-col gap-4 md:flex-row md:items-start md:justify-between">
        <div className="flex min-w-0 items-start gap-3.5">
          <button type="button" onClick={() => doc.sender && detail?.({ kind: "partner", key: partnerKey(doc.sender) })} disabled={!doc.sender} title={doc.sender ? `Alles zu ${doc.sender}` : undefined} className="shrink-0 rounded-full transition hover:ring-2 hover:ring-brand-500/40 disabled:hover:ring-0">
            <SenderLogo domain={doc.sender_domain} sender={doc.sender} cluster={doc.cluster} urgent={isUrgent(doc)} size={52} />
          </button>
          <div className="min-w-0">
            <h1 className="text-[24px] leading-8 font-[650] tracking-tight md:text-[28px] md:leading-9">{doc.title ?? doc.file_name}</h1>
            {doc.sender && <button type="button" onClick={() => detail?.({ kind: "partner", key: partnerKey(doc.sender!) })} className="mt-0.5 text-[14px] font-semibold text-soft hover:text-selected hover:underline">{doc.sender}</button>}
            <div className="mt-2 flex flex-wrap gap-1.5">
              <Link href={`/c/${c.id}`} className="inline-flex h-7 items-center rounded-full px-2.5 text-[12px] font-semibold border border-card-line text-fg">{c.label}</Link>
              {doc.archived ? <span className="inline-flex h-7 items-center gap-1 rounded-full border border-card-line px-2.5 text-[12px] font-semibold text-soft" title={doc.archived_reason ?? ""}><Archive size={12} /> Archiviert</span> : doc.status === "ready" && <span className="inline-flex h-7 items-center rounded-full bg-positive/10 px-2.5 text-[12px] font-semibold text-positive-text">Aktuell</span>}
              {doc.encrypted && <span className="inline-flex h-7 items-center gap-1 rounded-full border border-card-line px-2.5 text-[12px] font-semibold text-fg"><Lock size={12} /> Verschlüsselt</span>}
              {/* eine Zeile: Bereich, Status, Tags – Wichtigkeit hat rechts eine eigene Kachel */}
              <DocLabels inline doc={doc} onChange={setDoc} />
            </div>
          </div>
        </div>
        <div className="flex shrink-0 flex-col items-start gap-2 md:items-end">
          {act && (
            <span className={`inline-flex items-center gap-2 rounded-2xl px-3.5 py-2 ${actDays <= 7 ? "bg-urgent text-white" : "border border-card-line bg-surface"}`} title={act.what}>
              <CalendarClock size={16} className="shrink-0" />
              <span className="leading-tight"><span className={`block text-[12px] ${actDays <= 7 ? "text-white/80" : "text-muted"}`}>{act.label}</span><b className="tnum text-[15px]">{fmtDate(act.date)}</b><span className={`ml-1.5 text-[12px] ${actDays <= 7 ? "text-white/80" : "text-muted"}`}>{actDays === 0 ? "heute" : `in ${actDays} ${actDays === 1 ? "Tag" : "Tagen"}`}</span></span>
            </span>
          )}
          <div className="flex gap-1.5">
          {tools.filter((t) => !t.hidden).map((t) => <button key={t.label} type="button" disabled={busy} onClick={t.onClick} title={t.label} aria-label={t.label} className={`${ICON_BTN} ${t.danger ? "hover:text-negative-text" : ""} disabled:opacity-50`}>{t.icon}</button>)}
          </div>
        </div>
      </div>

      {doc.status === "processing" && <div className={`${CARD} mb-4 p-4`}><span className="flex items-center gap-2.5"><span className="flex gap-1">{[0, 1, 2].map((i) => <span key={i} className="typing-dot h-1.5 w-1.5 rounded-full bg-fg" style={{ animationDelay: `${i * 0.15}s` }} />)}</span><span className="text-shimmer text-[14px] font-medium">Wird ausgelesen und sortiert …</span></span></div>}
      {doc.status === "error" && <div className="mb-4 rounded-xl bg-negative/10 p-4 text-[14px] text-negative-text">
        {doc.error}
        {/Passwort/.test(doc.error ?? "") && (
          <form onSubmit={(e) => { e.preventDefault(); const pw = new FormData(e.currentTarget).get("pw"); if (typeof pw === "string" && pw) void run(() => reprocess(doc.id, pw)); }} className="mt-2.5 flex gap-2">
            <input name="pw" type="text" autoComplete="off" placeholder="PDF-Passwort, z. B. Geburtsdatum TTMMJJJJ" data-own-focus className="h-10 min-w-0 flex-1 rounded-full border border-card-line bg-surface px-4 text-[14px] text-fg outline-none focus:border-line-strong" />
            <button type="submit" disabled={busy} className="h-10 shrink-0 rounded-full bg-fg px-4 text-[14px] font-semibold text-canvas disabled:opacity-50">Öffnen</button>
          </form>
        )}
      </div>}
      {doc.archived && doc.archived_reason && <p className="mb-4 rounded-xl bg-surface-3 px-4 py-3 text-[13px] text-soft"><b>Archiviert:</b> {doc.archived_reason}</p>}
      {newer && (
        <p className="mb-4 flex flex-wrap items-center gap-x-2 gap-y-1 rounded-xl border border-amber/30 bg-amber/5 px-4 py-3 text-[13px]">
          <b>Ältere Fassung ({newer.topic}).</b>
          {newer.currentDocId && docs.find((d) => d.id === newer.currentDocId) && <span>Aktuell gilt: <Link href={`/d/${newer.currentDocId}`} className="font-semibold underline">{docs.find((d) => d.id === newer.currentDocId)!.title}</Link></span>}
          {newer.note && <span className="basis-full text-muted">{newer.note}</span>}
        </p>
      )}
      {doc.encrypted && !unlocked && <div className="mb-4"><VaultUnlock /></div>}

      {/* gesperrt: nur die Entsperren-Box – Überblick, Original und Chat erst nach dem Entsperren */}
      <div className={`grid grid-cols-1 gap-4 lg:grid-cols-[minmax(0,1fr)_minmax(0,0.85fr)] lg:items-start ${doc.encrypted && !unlocked ? "hidden" : ""}`}>
        {/* links: Daten */}
        <div className="space-y-3">
          {/* 1. drei Kacheln je nach Art (Rechnung: Datum · Betrag · zahlen bis; Versicherung: Art · gilt ab · Laufzeit …) */}
          {tiles.length > 0 && (
            <div className={`grid gap-3 ${tiles.length >= 3 ? "grid-cols-2 sm:grid-cols-3" : "grid-cols-2"}`}>
              {/* farbig mit Verlauf wie die Kacheln in Finastry – jede Kachel eine eigene Farbe, dringend immer rot */}
              {tiles.map((g, i) => (
                <div key={i} className={`group relative min-w-0 rounded-2xl px-4 py-4 text-white shadow-card ${tiles.length === 3 && i === 2 ? "col-span-2 sm:col-span-1" : ""}`} style={{ background: g.urgent ? TILE_URGENT : TILE_GRADS[i % TILE_GRADS.length] }}>
                  <span className="block truncate text-[12px] font-medium text-white/80">{g.label}</span>
                  <span className="tnum mt-1 block truncate text-[19px] leading-7 font-semibold" title={g.value}>{g.value}</span>
                  {g.sub && <span className="block truncate text-[12px] text-white/75" title={g.sub}>{g.sub}</span>}
                  {g.copy && <CopyBtn value={g.copy} className="absolute top-2.5 right-2.5 !text-white hover:!bg-white/20" />}
                </div>
              ))}
            </div>
          )}

          {/* 2. Inhalt: worum es geht – Befund, Leistungen, was versichert ist … */}
          {(view?.content.points.length || explain || (show.summary && content?.summary)) && (
            <section className={`${CARD} p-5`}>
              <h2 className="mb-2 text-[18px] leading-[26px] font-semibold">{view?.content.title ?? explain ?? "Worum es geht"}</h2>
              {show.summary && content?.summary && <Clamp className="text-[15px] leading-6 text-soft">{content.summary}</Clamp>}
              {!!view?.content.points.length && <ul className="mt-3 space-y-1.5 text-[14px] leading-6">{view.content.points.map((p, i) => <li key={i} className="flex gap-2.5"><span className="mt-[9px] h-1.5 w-1.5 shrink-0 rounded-full bg-brand-500" />{p}</li>)}</ul>}
              {!doc.encrypted && !view && doc.status === "ready" && <p className="mt-3 text-[13px] text-muted">Wird aufbereitet …</p>}
            </section>
          )}

          {/* 3. Überblick – immer offen, nur das Nötige */}
          <section className={`${CARD} overflow-hidden`}>
            <h2 className="flex items-center gap-2 px-5 pt-5 pb-2 text-[18px] leading-[26px] font-semibold"><FileText size={16} /> Überblick</h2>
            <KeyValueTable rows={[
              { label: "Art", value: doc.doc_type ?? "–" },
              { label: "Absender", value: doc.sender ?? "–" },
              { label: "Datum", value: fmtDate(doc.doc_date) || "–" },
              { label: "Eingang", value: fmtDate(doc.received_at) },
              ...originRows(doc, mail, content?.full_text),
              ...(projects.length > 1 ? [{ label: "Projekt", value: (
                <select value={doc.project_id ?? ""} onChange={(e) => void run(async () => { const { error } = await supabase.from("documents").update({ project_id: e.target.value }).eq("id", doc.id); if (error) throw error; setDoc({ ...doc, project_id: e.target.value }); })}
                  className="h-8 rounded-full border border-card-line bg-surface px-2.5 text-[13px] font-semibold">
                  {projects.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
                </select>
              ) }] : []),
            ]} />
          </section>

          {/* 4. Bezahlen – immer als Kachel, auch wenn gerade nichts offen ist */}
          <DocPayment always doc={doc} url={fileUrl} fullText={content?.full_text} related={relatedPayDocs(doc, docs)} />

          {/* 5. Kosten Stand heute – zusammengefasst, Einzelheiten zum Aufklappen */}
          {view?.costs ? <CostCard costs={view.costs} /> : show.amounts && !!content?.amounts?.length && (
            <Section title="Beträge" icon={<Wallet size={16} />} count={content.amounts.length} open={isOpen("am", false)} onToggle={() => toggle("am", false)}>
              <KeyValueTable rows={content.amounts.map((a) => ({ label: a.label, value: <span className="tnum">{fmtMoney(a.value, a.currency)}</span> }))} />
            </Section>
          )}

          {/* 6. Daten über dich */}
          {show.facts && personal.length > 0 && (
            <Section title="Daten über dich" icon={<UserRound size={16} />} count={personal.length} open={isOpen("me", false)} onToggle={() => toggle("me", false)}>
              <FactGrid facts={personal} />
            </Section>
          )}

          {/* 7. Kontakt */}
          {contact && (contact.phones.length + contact.emails.length + contact.addresses.length + contact.links.length > 0) && (
            <Section title="Kontakt" icon={<Phone size={16} />} open={isOpen("ct", true)} onToggle={() => toggle("ct", true)}>
              <ul className="divide-y divide-line border-t border-line text-[14px]">
                {doc.sender && <li className="px-5 py-3 font-semibold">{doc.sender}</li>}
                {contact.phones.map((p) => <li key={p} className="group relative flex items-center gap-2.5 px-5 py-3"><Phone size={14} className="shrink-0 text-muted" /><a href={`tel:${p.replace(/[^\d+]/g, "")}`} className="font-semibold hover:underline">{p}</a><CopyBtn value={p} className="absolute top-1/2 right-2.5 -translate-y-1/2" /></li>)}
                {contact.emails.map((e) => <li key={e} className="group relative flex items-center gap-2.5 px-5 py-3"><Mail size={14} className="shrink-0 text-muted" /><a href={`mailto:${e}`} className="font-semibold break-all hover:underline">{e}</a><CopyBtn value={e} className="absolute top-1/2 right-2.5 -translate-y-1/2" /></li>)}
                {contact.addresses.map((a) => <li key={a} className="group relative flex items-start gap-2.5 px-5 py-3"><MapPin size={14} className="mt-1 shrink-0 text-muted" /><span className="pr-8">{a}</span><CopyBtn value={a} className="absolute top-1/2 right-2.5 -translate-y-1/2" /></li>)}
                {contact.links.slice(0, 3).map((l) => <li key={l} className="flex items-center gap-2.5 px-5 py-3"><Globe size={14} className="shrink-0 text-muted" /><a href={l} target="_blank" rel="noopener noreferrer" className="truncate font-semibold text-selected hover:underline">{l.replace(/^https?:\/\//, "")}</a></li>)}
              </ul>
            </Section>
          )}

          {/* 8. weitere Angaben in EINER Kachel (Kennungen, Hinweise, Konsequenzen …) – Gruppen als Zwischenüberschriften */}
          {show.facts && restGroups.length > 0 && (
            <Section title="Weitere Angaben" icon={<FileText size={16} />} count={restGroups.reduce((n, [, fs]) => n + fs.length, 0)} open={isOpen("rest", false)} onToggle={() => toggle("rest", false)}>
              {restGroups.map(([g, fs]) => {
                const all = more[g];
                return (
                  <div key={g}>
                    <h3 className="border-t border-line px-5 pt-4 pb-1.5 text-[12px] font-semibold text-muted">{g}</h3>
                    <FactGrid facts={all ? fs : fs.slice(0, 8)} />
                    {fs.length > 8 && <button type="button" onClick={() => setMore({ ...more, [g]: !all })} className="w-full border-t border-line px-5 py-2.5 text-center text-[13px] font-semibold text-fg hover:bg-surface-2">{all ? "Weniger anzeigen" : `Alle ${fs.length} anzeigen`}</button>}
                  </div>
                );
              })}
            </Section>
          )}
          {show.deadlines && !!content?.deadlines?.length && (
            <Section title="Fristen & Termine" icon={<CalendarClock size={16} />} count={content.deadlines.length} open={isOpen("dl", false)} onToggle={() => toggle("dl", false)}>
              <KeyValueTable rows={content.deadlines.map((x) => ({ label: fmtDate(x.date), value: x.what }))} />
            </Section>
          )}
        </div>

        {/* rechts: Original und Chat */}
        <div className="space-y-3 lg:sticky lg:top-6">
          {/* Schutz-Hinweis als Kopf der Bild-Kachel, Bild ohne eigenen Rahmen */}
          {!(show.original && fileUrl) && <SensitiveBadge doc={doc} unlocked={unlocked} onProtect={() => void run(() => protectDoc(doc))} />}
          {show.original && fileUrl && (
            <section className={`${CARD} overflow-hidden`}>
              <SensitiveBadge flat doc={doc} unlocked={unlocked} onProtect={() => void run(() => protectDoc(doc))} />
              {image ? <img src={fileUrl} alt={doc.title ?? doc.file_name} className="max-h-[60vh] w-full bg-surface-2 object-contain p-3" /> : officeKind(doc.mime_type, doc.file_name) ? <OfficePreview url={fileUrl} mime={doc.mime_type} name={doc.file_name} /> : doc.mime_type === "application/pdf" ? <PdfPages url={fileUrl} card={isCardDoc(doc)} bare /> : <iframe src={fileUrl} title="Original" className="h-[60vh] w-full bg-surface-2" />}
            </section>
          )}
          <ImportanceCard doc={doc} onChange={setDoc} />
          <MergedParts doc={doc} onSplit={() => router.push("/")} />
          {!doc.encrypted && <WebSourceCard doc={doc} onChanged={() => void refresh()} />}
          {show.chat && (
            <section className={`${CARD} p-5`}>
              <h2 className="mb-3 text-[18px] leading-[26px] font-semibold">Frag zu diesem Dokument</h2>
              {chat.msgs.length > 0 && <div className="mb-4 max-h-[50vh] overflow-y-auto pr-1"><MessageList msgs={chat.msgs} compact busy={chat.busy} onAsk={(q) => void chat.send(q)} onResearch={(i, y) => void chat.research(i, y)} onSave={(i, y) => void chat.saveFound(i, y)} /></div>}
              <Composer plain busy={chat.busy} onSend={(q) => void chat.send(q)} onStop={chat.stop} placeholder="z. B. Wie hoch ist mein Netto?" depth={chat.depth} onDepth={chat.setDepth} />
            </section>
          )}
        </div>
      </div>
      {/* ganz unten: wie die Dokumente zusammenhängen */}
      {!(doc.encrypted && !unlocked) && <RelationGraph doc={doc} />}
    </div>
  );
}

/** Kosten Stand heute: Summe groß, Positionen zum Aufklappen (brutto, zusammengefasst) */
function CostCard({ costs }: { costs: NonNullable<DocView["costs"]> }) {
  const [open, setOpen] = useState(false);
  const per = costs.total?.per && costs.total.per !== "einmalig" ? ` ${costs.total.per}` : "";
  return (
    <section className={`${CARD} overflow-hidden`}>
      <div className="flex items-start justify-between gap-3 px-5 pt-5 pb-4">
        <span className="min-w-0">
          <span className="flex items-center gap-2 text-[18px] leading-[26px] font-semibold"><Wallet size={16} /> Kosten · Stand heute</span>
          {costs.total ? <><b className="tnum mt-1 block text-[24px] leading-8">{fmtMoney(costs.total.value, "EUR")}<span className="text-[14px] font-semibold text-muted">{per}</span></b><span className="block text-[13px] text-muted">{costs.total.label}</span></> : <b className="mt-1 block text-[15px]">{costs.items.length} Positionen</b>}
        </span>
      </div>
      {costs.items.length > 0 && (
        <>
          <button type="button" onClick={() => setOpen(!open)} className="flex w-full items-center justify-between border-t border-line px-5 py-3 text-[13px] font-semibold hover:bg-surface-2">Zusammensetzung<ChevronDown size={15} className={`text-muted transition-transform ${open ? "rotate-180" : ""}`} /></button>
          {open && <ul className="divide-y divide-line border-t border-line text-[14px]">{costs.items.map((x, i) => <li key={i} className="flex items-baseline gap-3 px-5 py-2.5"><span className="min-w-0 flex-1">{x.label}{x.note && <span className="block text-[12px] text-muted">{x.note}</span>}</span><span className="tnum shrink-0 font-semibold">{fmtMoney(x.value, "EUR")}</span></li>)}</ul>}
        </>
      )}
    </section>
  );
}

/** Angaben kompakt in zwei Spalten, jeder Wert mit Kopieren (z. B. Aktenzeichen fürs Telefonat) */
function FactGrid({ facts }: { facts: Fact[] }) {
  return (
    <dl className="grid sm:grid-cols-2">
      {facts.map((f, i) => (
        <div key={i} className="group relative min-w-0 border-t border-line px-5 py-3 sm:odd:border-r">
          <dt className="truncate pr-8 text-[12px] text-muted" title={f.label}>{f.label}</dt>
          <dd className="pr-8 text-[14px] font-semibold break-words">{f.value}</dd>
          <CopyBtn value={f.value} className="absolute top-1/2 right-2.5 -translate-y-1/2" />
        </div>
      ))}
    </dl>
  );
}

function CopyBtn({ value, className = "" }: { value: string; className?: string }) {
  const [ok, setOk] = useState(false);
  return (
    <button type="button" onClick={() => { void navigator.clipboard?.writeText(value); setOk(true); setTimeout(() => setOk(false), 1200); }} aria-label="Kopieren" title="Kopieren"
      className={`grid h-7 w-7 place-items-center rounded-full text-muted transition hover:bg-surface-2 hover:text-fg sm:opacity-0 sm:group-hover:opacity-100 ${ok ? "!opacity-100 text-positive-text" : ""} ${className}`}>
      {ok ? <Check size={14} /> : <Copy size={13} />}
    </button>
  );
}
