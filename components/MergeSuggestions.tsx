"use client";
import { useEffect, useMemo, useState } from "react";
import { Combine, Loader2, X } from "lucide-react";
import { SenderLogo } from "@/components/SenderLogo";
import { useDocs } from "@/lib/docs";
import { authFetch, supabase } from "@/lib/supabase";
import type { Doc } from "@/lib/types";

/**
 * Kurz nacheinander hochgeladene Fotos/Seiten, die eigentlich ein Dokument sind (Brief mit Rückseite, Ausweis vorne/hinten …):
 * die KI schlägt Gruppen vor, ein Tipp fügt sie zu einem PDF zusammen. Die Einzeldateien werden danach gelöscht.
 */
type Group = { ids: string[]; title: string; reason: string };
const GAP = 10 * 60_000;
const KEY = "lifevault:merge";
const load = <T,>(k: string, fb: T): T => { try { return JSON.parse(localStorage.getItem(k) ?? "") as T; } catch { return fb; } };
const save = (k: string, v: unknown) => { try { localStorage.setItem(k, JSON.stringify(v)); } catch { /* egal */ } };
const num = (n: string) => Number(n.match(/\((\d+)\)/)?.[1] ?? 0);

/** Upload-Stapel: Dokumente mit weniger als 10 Minuten Abstand, mindestens 2, aus den letzten 30 Tagen */
function batches(docs: Doc[]) {
  const recent = docs.filter((d) => d.status === "ready" && !d.encrypted && !d.archived && Date.now() - Date.parse(d.received_at) < 30 * 86_400_000).sort((a, b) => a.received_at.localeCompare(b.received_at));
  const out: Doc[][] = [];
  for (const d of recent) {
    const last = out[out.length - 1];
    if (last && Date.parse(d.received_at) - Date.parse(last[last.length - 1].received_at) < GAP) last.push(d);
    else out.push([d]);
  }
  return out.filter((b) => b.length >= 2).reverse().slice(0, 3);
}

async function toPdf(docs: Doc[]) {
  const { PDFDocument } = await import("pdf-lib");
  const pdf = await PDFDocument.create();
  for (const d of docs) {
    const { data, error } = await supabase.storage.from("documents").download(d.file_path);
    if (error || !data) throw new Error(`„${d.title ?? d.file_name}“ konnte nicht geladen werden.`);
    if (d.mime_type === "application/pdf") {
      const src = await PDFDocument.load(await data.arrayBuffer(), { ignoreEncryption: true });
      for (const p of await pdf.copyPages(src, src.getPageIndices())) pdf.addPage(p);
      continue;
    }
    // Bild: JPG/PNG direkt, alles andere (HEIC, WebP) über Canvas als JPG; auf A4-Breite skaliert
    let bytes = await data.arrayBuffer(), jpg = d.mime_type === "image/jpeg";
    if (!jpg && d.mime_type !== "image/png") {
      const bmp = await createImageBitmap(data);
      const c = document.createElement("canvas"); c.width = bmp.width; c.height = bmp.height;
      c.getContext("2d")!.drawImage(bmp, 0, 0);
      bytes = await (await new Promise<Blob>((ok) => c.toBlob((b) => ok(b!), "image/jpeg", 0.9))).arrayBuffer();
      jpg = true;
    }
    const img = jpg ? await pdf.embedJpg(bytes) : await pdf.embedPng(bytes);
    const W = 595, scale = W / img.width, H = img.height * scale;
    pdf.addPage([W, H]).drawImage(img, { x: 0, y: 0, width: W, height: H });
  }
  return new Blob([await pdf.save() as BlobPart], { type: "application/pdf" });
}

export function MergeSuggestions() {
  const { allDocs, upload, remove } = useDocs();
  const stacks = useMemo(() => batches(allDocs), [allDocs]);
  const [found, setFound] = useState<Record<string, Group[]>>(() => load(`${KEY}:found`, {}));
  const [gone, setGone] = useState<string[]>(() => load(`${KEY}:dismissed`, []));
  const [busy, setBusy] = useState<string>();
  const [error, setError] = useState<string>();

  // je Stapel einmal fragen (Ergebnis merken)
  useEffect(() => {
    for (const b of stacks) {
      const key = b.map((d) => d.id).sort().join(",");
      if (found[key]) continue;
      setFound((f) => ({ ...f, [key]: [] }));
      void authFetch("/api/group", { method: "POST", body: JSON.stringify({ ids: b.map((d) => d.id) }) })
        .then((r) => r.json()).then((j: { groups?: Group[] }) => setFound((f) => { const n = { ...f, [key]: j.groups ?? [] }; save(`${KEY}:found`, n); return n; }))
        .catch(() => undefined);
    }
  }, [stacks, found]);

  const byId = new Map(allDocs.map((d) => [d.id, d]));
  const groups = Object.values(found).flat()
    .map((g) => ({ ...g, docs: g.ids.map((id) => byId.get(id)).filter((d): d is Doc => !!d) }))
    .filter((g) => g.docs.length >= 2 && !gone.includes(g.ids.join(",")));
  if (!groups.length) return null;

  const dismiss = (g: Group) => { const n = [...gone, g.ids.join(",")]; setGone(n); save(`${KEY}:dismissed`, n); };
  const merge = async (g: Group & { docs: Doc[] }) => {
    setBusy(g.ids.join(",")); setError(undefined);
    try {
      // Reihenfolge der KI; bei gleicher Quelle (Fotos) hilft die Nummer im Dateinamen
      const pdf = await toPdf(g.docs);
      const name = `${g.title.replace(/[\\/:*?"<>|]/g, "").slice(0, 120) || "Dokument"}.pdf`;
      const ids = await upload([new File([pdf], name, { type: "application/pdf" })], { projectId: g.docs[0].project_id });
      if (!ids.length) throw new Error("Hochladen hat nicht geklappt – die Einzelseiten bleiben erhalten.");
      for (const d of g.docs) await remove(d);
      dismiss(g);
    } catch (e) { setError((e as Error).message); }
    finally { setBusy(undefined); }
  };

  return (
    <section className="overflow-hidden rounded-2xl border border-card-line bg-surface shadow-card">
      <div className="flex items-center gap-3 px-4 pt-4 pb-3">
        <span className="grid h-9 w-9 shrink-0 place-items-center rounded-full bg-brand-500 text-white"><Combine size={17} /></span>
        <span className="min-w-0 flex-1"><b className="block text-[15px]">Gehören zusammen?</b><span className="text-[12.5px] text-muted">Kurz nacheinander hochgeladen – sieht nach einem Dokument aus</span></span>
      </div>
      <ul className="divide-y divide-line border-t border-line">
        {groups.map((g) => {
          const k = g.ids.join(",");
          return (
            <li key={k} className="flex flex-wrap items-center gap-3 px-4 py-3">
              <SenderLogo domain={g.docs[0].sender_domain} sender={g.docs[0].sender} cluster={g.docs[0].cluster} size={34} />
              <span className="min-w-0 flex-1">
                <b className="block truncate text-[14px]">{g.title}</b>
                <span className="block text-[12px] text-muted">{g.docs.length} Teile · {g.reason}</span>
                <span className="mt-1 flex flex-wrap gap-1">{[...g.docs].sort((a, b) => num(a.file_name) - num(b.file_name)).map((d) => <span key={d.id} className="max-w-[14rem] truncate rounded-full border border-card-line px-2 py-0.5 text-[11px] text-soft">{d.title ?? d.file_name}</span>)}</span>
              </span>
              <span className="flex shrink-0 gap-2">
                <button type="button" onClick={() => dismiss(g)} className="inline-flex h-9 items-center gap-1 rounded-full border border-card-line px-3 text-[12.5px] font-semibold hover:bg-surface-2"><X size={13} /> Nein</button>
                <button type="button" disabled={!!busy} onClick={() => void merge(g)} className="inline-flex h-9 items-center gap-1.5 rounded-full bg-fg px-3.5 text-[12.5px] font-semibold text-canvas disabled:opacity-60">{busy === k ? <Loader2 size={13} className="animate-spin" /> : <Combine size={13} />} Zusammenführen</button>
              </span>
            </li>
          );
        })}
      </ul>
      {error && <p role="alert" className="border-t border-line px-4 py-3 text-[13px] text-negative-text">{error}</p>}
    </section>
  );
}
