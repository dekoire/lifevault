"use client";
import { isCardDoc, PdfPages } from "@/components/PdfPages";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { use, useEffect, useMemo, useRef, useState } from "react";
import { Archive, ArchiveRestore, CalendarClock, ChevronLeft, ChevronRight, Download, FileDown, FileText, Lock, LockOpen, RefreshCw, Scissors, ShieldAlert, ShieldCheck, Trash2, Wallet } from "lucide-react";
import { Composer, MessageList, useChat } from "@/components/ChatPanel";
import { SenderLogo } from "@/components/SenderLogo";
import { CARD, ICON_BTN, KeyValueTable, Section } from "@/components/ui";
import { VaultUnlock } from "@/components/VaultUnlock";
import { clusterOf } from "@/lib/clusters";
import { chrono, fmtDate, fmtMoney, isUrgent, useDocs } from "@/lib/docs";
import { useProjects } from "@/lib/projects";
import { Clamp } from "@/components/Clamp";
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
import { supabase } from "@/lib/supabase";
import type { Doc, Fact, SecretPart } from "@/lib/types";

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

/** Kam das Dokument aus einer E-Mail? Absender, Betreff, Datum der Mail */
function useMailOrigin(id: string) {
  const [m, setM] = useState<{ subject: string | null; sender: string | null; mail_date: string | null } | null>(null);
  useEffect(() => { void supabase.from("mail_seen").select("subject,sender,mail_date").contains("doc_ids", [id]).limit(1).maybeSingle().then(({ data }) => setM(data)); }, [id]);
  return m;
}

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
  const [opened, setOpened] = useState<{ content: SecretPart | null; url: string }>();
  const [url, setUrl] = useState<string>();
  const [open, setOpen] = useState<Record<string, boolean>>({});
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    void supabase.from("documents").select("*").eq("id", id).maybeSingle().then(({ data }) => setDoc((data as Doc) ?? undefined));
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
  const chat = useChat({ docId: id, docText: doc?.encrypted && content ? `${content.summary ?? ""}\n${JSON.stringify(content.key_facts)}\n${content.full_text ?? ""}` : undefined });

  if (!doc) return <p className="py-20 text-center text-muted">Lädt …</p>;
  const c = clusterOf(doc.cluster);
  const explain = explainDoc(doc.doc_type, doc.title);
  // Auf einen Blick: wichtigste Beträge und die nächste Frist
  const today = new Date().toISOString().slice(0, 10);
  const nextDl = (content?.deadlines ?? []).filter((x) => x.date >= today).sort((a, b) => a.date.localeCompare(b.date))[0];
  const daysTo = nextDl ? Math.round((Date.parse(nextDl.date) - Date.parse(today)) / 864e5) : 0;
  const glance = [
    ...(content?.amounts ?? []).slice(0, nextDl ? 2 : 3).map((a) => ({ label: a.label, value: fmtMoney(a.value, a.currency), sub: undefined as string | undefined, urgent: false })),
    ...(nextDl ? [{ label: "Nächste Frist", value: fmtDate(nextDl.date), sub: `${nextDl.what} · in ${daysTo} ${daysTo === 1 ? "Tag" : "Tagen"}`, urgent: daysTo <= 7 }] : []),
  ];
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
    { icon: doc.archived ? <ArchiveRestore size={17} /> : <Archive size={17} />, label: doc.archived ? "Wieder aktuell" : "Archivieren", onClick: () => void run(async () => { await supabase.from("documents").update({ archived: !doc.archived, archived_reason: doc.archived ? null : "von dir archiviert" }).eq("id", doc.id); }) },
    { icon: doc.encrypted ? <LockOpen size={17} /> : <Lock size={17} />, label: doc.encrypted ? "Verschlüsselung aufheben" : "Verschlüsseln", onClick: () => void run(() => (doc.encrypted ? unprotectDoc(doc) : protectDoc(doc))), hidden: !unlocked },
    { icon: <Trash2 size={17} />, label: "Löschen", onClick: () => void del(), danger: true },
  ];

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
            </div>
          </div>
        </div>
        <div className="flex shrink-0 gap-1.5">
          {tools.filter((t) => !t.hidden).map((t) => <button key={t.label} type="button" disabled={busy} onClick={t.onClick} title={t.label} aria-label={t.label} className={`${ICON_BTN} ${t.danger ? "hover:text-negative-text" : ""} disabled:opacity-50`}>{t.icon}</button>)}
        </div>
      </div>

      {doc.status === "processing" && <div className={`${CARD} mb-4 p-4`}><span className="flex items-center gap-2.5"><span className="flex gap-1">{[0, 1, 2].map((i) => <span key={i} className="typing-dot h-1.5 w-1.5 rounded-full bg-fg" style={{ animationDelay: `${i * 0.15}s` }} />)}</span><span className="text-shimmer text-[14px] font-medium">Wird ausgelesen und sortiert …</span></span></div>}
      {doc.status === "error" && <p className="mb-4 rounded-xl bg-negative/10 p-4 text-[14px] text-negative-text">{doc.error}</p>}
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
          {(explain || (show.summary && content?.summary)) && (
            <section className={`${CARD} p-4`}>
              {explain && <h2 className="mb-1.5 text-[16px] leading-6 font-semibold">{explain}</h2>}
              {show.summary && content?.summary && <Clamp className="text-[15px] leading-6 text-soft">{content.summary}</Clamp>}
            </section>
          )}
          {glance.length > 0 && (
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
              {glance.map((g, i) => (
                <div key={i} className={`rounded-2xl border px-3.5 py-3 ${g.urgent ? "border-urgent bg-urgent text-white" : "border-card-line bg-surface"}`}>
                  <span className={`block truncate text-[12px] ${g.urgent ? "text-white/80" : "text-muted"}`}>{g.label}</span>
                  <span className="tnum mt-0.5 block text-[18px] leading-6 font-[650]">{g.value}</span>
                  {g.sub && <span className={`block truncate text-[11px] ${g.urgent ? "text-white/80" : "text-muted"}`}>{g.sub}</span>}
                </div>
              ))}
            </div>
          )}
          {show.info && (
            <Section title="Überblick" icon={<FileText size={16} />} open={isOpen("info", false)} onToggle={() => toggle("info", false)}>
              <KeyValueTable rows={[
                { label: "Art", value: doc.doc_type ?? "–" },
                { label: "Absender", value: doc.sender ?? "–" },
                { label: "Datum", value: fmtDate(doc.doc_date) || "–" },
                { label: "Eingang", value: fmtDate(doc.received_at) },
                { label: "Bereich", value: c.label },
                ...(projects.length > 1 ? [{ label: "Projekt", value: (
                  <select value={doc.project_id ?? ""} onChange={(e) => void run(async () => { const { error } = await supabase.from("documents").update({ project_id: e.target.value }).eq("id", doc.id); if (error) throw error; setDoc({ ...doc, project_id: e.target.value }); })}
                    className="h-8 rounded-full border border-card-line bg-surface px-2.5 text-[13px] font-semibold">
                    {projects.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
                  </select>
                ) }] : []),
                ...(mail ? [{ label: "Aus E-Mail", value: <>{mail.subject || "(ohne Betreff)"}<span className="block text-[12px] font-normal text-muted">{(mail.sender ?? "").replace(/<.*>/, "").trim() || mail.sender} · {fmtDate(mail.mail_date)}</span></> }] : []),
                { label: "Datei", value: `${doc.file_name} · ${doc.size_bytes < 1048576 ? `${Math.max(1, Math.round(doc.size_bytes / 1024))} KB` : `${(doc.size_bytes / 1048576).toLocaleString("de-DE", { maximumFractionDigits: 1 })} MB`}` },
                ...(doc.tags?.length && show.tags ? [{ label: "Schlagworte", value: doc.tags.join(", ") }] : []),
              ]} />
            </Section>
          )}
          {show.facts && sortedGroups.map(([g, fs], i) => {
            const all = more[g];
            const rows = all ? fs : fs.slice(0, 4);
            return (
              <Section key={g} title={g} count={fs.length} open={isOpen(`g:${g}`, i < 2 && groupRank(g) === 0)} onToggle={() => toggle(`g:${g}`, i < 2 && groupRank(g) === 0)}>
                <KeyValueTable rows={rows.map((f) => ({ label: f.label, value: f.value }))} />
                {fs.length > 4 && <button type="button" onClick={() => setMore({ ...more, [g]: !all })} className="w-full border-t border-line bg-surface-2 px-4 py-2.5 text-center text-[13px] font-semibold text-fg transition-colors hover:bg-surface-3">{all ? "Weniger anzeigen" : `Alle ${fs.length} anzeigen`}</button>}
              </Section>
            );
          })}
          {show.deadlines && !!content?.deadlines?.length && (
            <Section title="Fristen & Termine" icon={<CalendarClock size={16} />} count={content.deadlines.length} open={isOpen("dl", true)} onToggle={() => toggle("dl", true)}>
              <KeyValueTable rows={content.deadlines.map((x) => ({ label: fmtDate(x.date), value: x.what }))} />
            </Section>
          )}
          {show.amounts && !!content?.amounts?.length && (
            <Section title="Beträge" icon={<Wallet size={16} />} count={content.amounts.length} open={isOpen("am", false)} onToggle={() => toggle("am", false)}>
              <KeyValueTable rows={content.amounts.map((a) => ({ label: a.label, value: <span className="tnum">{fmtMoney(a.value, a.currency)}</span> }))} />
            </Section>
          )}
          {show.content && content?.full_text && (
            <Section title="Vollständiger Text" open={isOpen("txt", false)} onToggle={() => toggle("txt", false)}>
              <pre className="px-4 py-4 font-sans text-[13px] leading-6 whitespace-pre-wrap text-soft">{content.full_text}</pre>
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
              {image ? <img src={fileUrl} alt={doc.title ?? doc.file_name} className="max-h-[60vh] w-full bg-surface object-contain" /> : officeKind(doc.mime_type, doc.file_name) ? <OfficePreview url={fileUrl} mime={doc.mime_type} name={doc.file_name} /> : doc.mime_type === "application/pdf" ? <PdfPages url={fileUrl} card={isCardDoc(doc)} bare /> : <iframe src={fileUrl} title="Original" className="h-[60vh] w-full bg-surface-2" />}
            </section>
          )}
          <MergedParts doc={doc} onSplit={() => router.push("/")} />
          {!doc.encrypted && <WebSourceCard doc={doc} onChanged={() => void refresh()} />}
          {show.chat && (
            <section className={`${CARD} p-4`}>
              <h2 className="mb-3 text-[15px] font-semibold">Frag zu diesem Dokument</h2>
              {chat.msgs.length > 0 && <div className="mb-4 max-h-[50vh] overflow-y-auto pr-1"><MessageList msgs={chat.msgs} compact busy={chat.busy} onAsk={(q) => void chat.send(q)} onResearch={(i, y) => void chat.research(i, y)} onSave={(i, y) => void chat.saveFound(i, y)} /></div>}
              <Composer plain busy={chat.busy} onSend={(q) => void chat.send(q)} onStop={chat.stop} placeholder="z. B. Wie hoch ist mein Netto?" depth={chat.depth} onDepth={chat.setDepth} />
            </section>
          )}
        </div>
      </div>
    </div>
  );
}
