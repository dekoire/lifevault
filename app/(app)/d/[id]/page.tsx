"use client";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { use, useEffect, useMemo, useRef, useState } from "react";
import { Archive, ArchiveRestore, CalendarClock, ChevronLeft, ChevronRight, Download, FileDown, FileText, Lock, LockOpen, RefreshCw, Trash2, Wallet } from "lucide-react";
import { Composer, MessageList, useChat } from "@/components/ChatPanel";
import { SenderLogo } from "@/components/SenderLogo";
import { CARD, ICON_BTN, KeyValueTable, Section } from "@/components/ui";
import { VaultUnlock } from "@/components/VaultUnlock";
import { clusterOf } from "@/lib/clusters";
import { chrono, fmtDate, fmtMoney, useDocs } from "@/lib/docs";
import { useProjects } from "@/lib/projects";
import { useMe } from "@/lib/me";
import { openDoc, protectDoc, unprotectDoc } from "@/lib/protect";
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
export default function DocPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const router = useRouter();
  const { docs, allDocs, reprocess, remove, refresh } = useDocs();
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
  const chat = useChat({ docId: id, docText: doc?.encrypted && content ? `${content.summary ?? ""}\n${JSON.stringify(content.key_facts)}\n${content.full_text ?? ""}` : undefined });

  if (!doc) return <p className="py-20 text-center text-muted">Lädt …</p>;
  const c = clusterOf(doc.cluster);
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
          <SenderLogo domain={doc.sender_domain} cluster={doc.cluster} size={52} />
          <div className="min-w-0">
            <h1 className="text-[24px] leading-8 font-[650] tracking-tight md:text-[28px] md:leading-9">{doc.title ?? doc.file_name}</h1>
            <div className="mt-2 flex flex-wrap gap-1.5">
              <Link href={`/c/${c.id}`} className="inline-flex h-7 items-center rounded-full px-2.5 text-[12px] font-semibold" style={{ color: c.color, background: `color-mix(in srgb, ${c.color} 12%, transparent)` }}>{c.label}</Link>
              {doc.archived ? <span className="inline-flex h-7 items-center gap-1 rounded-full bg-surface-3 px-2.5 text-[12px] font-semibold text-soft" title={doc.archived_reason ?? ""}><Archive size={12} /> Archiviert</span> : doc.status === "ready" && <span className="inline-flex h-7 items-center rounded-full bg-positive/10 px-2.5 text-[12px] font-semibold text-positive-text">Aktuell</span>}
              {doc.encrypted && <span className="inline-flex h-7 items-center gap-1 rounded-full bg-lavender px-2.5 text-[12px] font-semibold text-selected"><Lock size={12} /> Verschlüsselt</span>}
            </div>
          </div>
        </div>
        <div className="flex shrink-0 gap-1.5">
          {tools.filter((t) => !t.hidden).map((t) => <button key={t.label} type="button" disabled={busy} onClick={t.onClick} title={t.label} aria-label={t.label} className={`${ICON_BTN} ${t.danger ? "hover:text-negative-text" : ""} disabled:opacity-50`}>{t.icon}</button>)}
        </div>
      </div>

      {doc.status === "processing" && <div className={`${CARD} mb-4 p-4`}><span className="flex items-center gap-2.5"><span className="flex gap-1">{[0, 1, 2].map((i) => <span key={i} className="typing-dot h-1.5 w-1.5 rounded-full bg-brand-500" style={{ animationDelay: `${i * 0.15}s` }} />)}</span><span className="text-shimmer text-[14px] font-medium">Wird ausgelesen und sortiert …</span></span></div>}
      {doc.status === "error" && <p className="mb-4 rounded-xl bg-negative/10 p-4 text-[14px] text-negative-text">{doc.error}</p>}
      {doc.archived && doc.archived_reason && <p className="mb-4 rounded-xl bg-surface-3 px-4 py-3 text-[13px] text-soft"><b>Archiviert:</b> {doc.archived_reason}</p>}
      {doc.encrypted && !unlocked && <div className="mb-4"><VaultUnlock /></div>}

      <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_minmax(0,0.85fr)] lg:items-start">
        {/* links: Daten */}
        <div className="space-y-3">
          {show.summary && content?.summary && <section className={`${CARD} p-4`}><p className="text-[15px] leading-6">{content.summary}</p></section>}
          {show.info && (
            <Section title="Überblick" icon={<FileText size={16} />} open={isOpen("info", true)} onToggle={() => toggle("info", true)}>
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
                { label: "Datei", value: `${doc.file_name} · ${doc.size_bytes < 1048576 ? `${Math.max(1, Math.round(doc.size_bytes / 1024))} KB` : `${(doc.size_bytes / 1048576).toLocaleString("de-DE", { maximumFractionDigits: 1 })} MB`}` },
                ...(doc.tags?.length && show.tags ? [{ label: "Schlagworte", value: doc.tags.join(", ") }] : []),
              ]} />
            </Section>
          )}
          {show.facts && groups.map(([g, fs], i) => (
            <Section key={g} title={g} count={fs.length} open={isOpen(`g:${g}`, i < 3)} onToggle={() => toggle(`g:${g}`, i < 3)}>
              <KeyValueTable rows={fs.map((f) => ({ label: f.label, value: f.value }))} />
            </Section>
          ))}
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
          {show.original && fileUrl && (
            <section className={`${CARD} overflow-hidden`}>
              {image ? <img src={fileUrl} alt={doc.title ?? doc.file_name} className="max-h-[60vh] w-full bg-surface-2 object-contain" /> : <iframe src={fileUrl} title="Original" className="h-[60vh] w-full bg-surface-2" />}
            </section>
          )}
          {show.chat && (
            <section className={`${CARD} p-4`}>
              <h2 className="mb-3 text-[15px] font-semibold">Frag zu diesem Dokument</h2>
              {chat.msgs.length > 0 && <div className="mb-4 max-h-[50vh] overflow-y-auto pr-1"><MessageList msgs={chat.msgs} compact /></div>}
              <Composer busy={chat.busy} onSend={(q) => void chat.send(q)} onStop={chat.stop} placeholder="z. B. Wie hoch ist mein Netto?" />
            </section>
          )}
        </div>
      </div>
    </div>
  );
}
