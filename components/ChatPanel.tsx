"use client";
import { IconTile } from "@/components/ClusterIcon";
import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { AiAvatar } from "@/components/AiAvatar";
import { ArrowUp, Brain, Camera, Check, ChevronDown, CornerDownRight, ExternalLink, FileDown, Globe, Loader2, Mic, Paperclip, Plus, Square, Telescope, X, Zap } from "lucide-react";
import { LogoMark } from "@/components/Logo";
import { Markdown } from "@/components/Markdown";
import { ChatWidget } from "@/components/ChatWidgets";
import { useDetail } from "@/components/DetailPanel";
import { EntityLink } from "@/components/EntityLink";
import { SenderLogo } from "@/components/SenderLogo";
import { fmtDate, useDocs } from "@/lib/docs";
import { useMe } from "@/lib/me";
import { openJson, vaultKey } from "@/lib/vault";
import type { SecretPart } from "@/lib/types";
import { useProjects } from "@/lib/projects";
import { authFetch, supabase } from "@/lib/supabase";

/** Vorschlag, im Internet zu suchen (vom Chat erkannt, Nutzer muss zustimmen) */
export type Research = { query: string; reason: string; docId?: string; state: "ask" | "declined" | "running" | "done" | "failed"; error?: string };
/** Gefundenes Dokument ablegen? */
export type SaveOffer = { title: string; pdfUrl: string; markdown: string; relatedId?: string; query?: string; sourceUrl?: string; state: "ask" | "declined" | "saving" | "saved" | "failed"; error?: string };
export type Msg = { role: "user" | "assistant"; content: string; research?: Research; save?: SaveOffer; attachments?: { id: string; name: string }[] };

const MARKER = /\n?\[\[RECHERCHE:\s*([^|\]]+?)\s*\|\s*([^|\]]*?)\s*(?:\|\s*([^\]]*?)\s*)?\]\]\s*$/;
/** Recherche-Vorschlag aus der Antwort lösen (wird nicht angezeigt) */
function splitMarker(text: string): { text: string; research?: Research } {
  const m = MARKER.exec(text);
  if (!m) return { text: text.replace(/\[\[RECHERCHE[\s\S]*$/, "").trimEnd() };
  const id = /^[0-9a-f-]{36}$/i.test(m[3] ?? "") ? m[3] : undefined;
  return { text: text.slice(0, m.index).trimEnd(), research: { query: m[1].replace(/^[„"]|[“"]$/g, ""), reason: m[2], docId: id, state: "ask" } };
}

const FOLLOW = /\n?\[\[FOLGEFRAGEN:\s*([^\]]*)\]\]/;
/** Antwort zerlegen: Folgefragen, Internet-Links und Recherche-Vorschlag herauslösen, Rest ist Markdown */
function parseAnswer(raw: string) {
  const f = FOLLOW.exec(raw);
  const followUps = f ? f[1].split("|").map((q) => q.trim().replace(/^[„"]|[“"]$/g, "")).filter((q) => q.length > 3).slice(0, 4) : [];
  // halbe Marker während des Streamens nicht anzeigen
  let text = raw.replace(FOLLOW, "").replace(/\n?\[\[(?!RECHERCHE)[^\]]*$/, "");
  const { text: body } = splitMarker(text);
  text = body;
  // externe Links aus „Quellen im Internet“ / „Weiterführende Links“ als Knöpfe
  const links: { title: string; url: string }[] = [];
  text = text.replace(/\n#{1,4}\s*(Quellen im Internet|Weiterführende Links|Links)\s*\n((?:\s*[-*•]\s*\[[^\]]+\]\(https?:[^)]+\)[^\n]*\n?)+)/gi, (_m, _h, list: string) => {
    for (const m of list.matchAll(/\[([^\]]+)\]\((https?:[^)\s]+)\)/g)) links.push({ title: m[1], url: m[2] });
    return "\n";
  });
  text = text.replace(/\n#{1,4}\s*Quellen\s*\n[\s\S]*$/i, "");
  return { text: text.trimEnd(), followUps, links };
}

/** Internet-Links als Knöpfe mit Favicon und Domain */
function WebLinks({ links }: { links: { title: string; url: string }[] }) {
  if (!links.length) return null;
  const host = (u: string) => { try { return new URL(u).hostname.replace(/^www\./, ""); } catch { return u; } };
  return (
    <div className="mt-4">
      <div className="mb-2 text-[12px] font-semibold tracking-wide text-muted uppercase">Im Internet</div>
      <div className="flex flex-wrap gap-2">
        {links.slice(0, 8).map((l) => (
          <a key={l.url} href={l.url} target="_blank" rel="noopener noreferrer" className="inline-flex max-w-full items-center gap-2 rounded-full border border-card-line bg-surface py-1.5 pr-3.5 pl-1.5 text-[13px] font-semibold hover:bg-surface-2">
            <span className="grid h-6 w-6 shrink-0 place-items-center overflow-hidden rounded-full bg-surface-2"><img src={`/api/logo?d=${encodeURIComponent(host(l.url))}`} alt="" width={16} height={16} className="object-contain" /></span>
            <span className="min-w-0 truncate">{l.title}</span>
            <span className="shrink-0 text-[12px] font-medium text-muted">{host(l.url)}</span>
            <ExternalLink size={13} className="shrink-0 text-muted" />
          </a>
        ))}
      </div>
    </div>
  );
}

/** Vorgeschlagene Anschlussfragen – ein Klick schickt sie ab */
function FollowUps({ qs, onAsk }: { qs: string[]; onAsk: (q: string) => void }) {
  if (!qs.length) return null;
  return (
    <div className="mt-4">
      <div className="mb-2 text-[12px] font-semibold tracking-wide text-muted uppercase">Weiter fragen</div>
      <div className="flex flex-col items-start gap-1.5">
        {qs.map((q) => (
          <button key={q} type="button" onClick={() => onAsk(q)} className="inline-flex max-w-full items-center gap-2 rounded-full border border-card-line bg-surface px-3.5 py-2 text-left text-[14px] font-medium hover:border-brand-500/50 hover:bg-lavender">
            <CornerDownRight size={14} className="shrink-0 text-brand-500" /> <span className="min-w-0">{q}</span>
          </button>
        ))}
      </div>
    </div>
  );
}

/** Quellen unter einer Antwort: verlinkte Dokumente als Kacheln mit Logo */
export function Sources({ text }: { text: string }) {
  const { allDocs: docs } = useDocs();
  const open = useDetail();
  const ids = [...new Set([...text.matchAll(/\(\/d\/([0-9a-f-]{36})\)/gi)].map((m) => m[1]))];
  const list = ids.map((id) => docs.find((d) => d.id === id)).filter((d): d is NonNullable<typeof d> => !!d);
  if (!list.length) return null;
  return (
    <div className="mt-4">
      <div className="mb-2 text-[12px] font-semibold tracking-wide text-muted uppercase">Quellen</div>
      {/* minmax(0,1fr): lange Titel werden gekürzt statt die Karte über den Rand zu schieben */}
      <div className="grid grid-cols-[minmax(0,1fr)] gap-2 sm:grid-cols-2">
        {list.map((d) => (
          <Link key={d.id} href={`/d/${d.id}`} onClick={(e) => { if (open) { e.preventDefault(); open({ kind: "doc", id: d.id }); } }} className="flex min-w-0 items-center gap-3 rounded-xl border border-card-line bg-surface px-3 py-2.5 hover:bg-surface-2">
            <span className="shrink-0"><SenderLogo domain={d.sender_domain} sender={d.sender} cluster={d.cluster} size={34} /></span>
            <span className="min-w-0 flex-1"><span className="block truncate text-[14px] font-semibold">{d.title ?? d.file_name}</span><span className="block truncate text-[12px] text-muted">{[d.doc_type, d.sender, fmtDate(d.doc_date ?? d.received_at)].filter(Boolean).join(" · ")}</span></span>
          </Link>
        ))}
      </div>
    </div>
  );
}

/** Warten auf die Antwort: links der Avatar, der nachdenkt, daneben schimmernd, was gerade passiert (wie bei Finastry) */
export function Typing({ label = "Durchsuche deine Unterlagen" }: { label?: string }) {
  return (
    <div className="flex min-h-8 items-center gap-2.5" role="status" aria-live="polite">
      <AiAvatar size={36} state="think" className="-my-1 shrink-0" />
      <span className="text-shimmer text-[14px] font-medium">{label}</span>
    </div>
  );
}

const BTN = "inline-flex h-10 items-center justify-center gap-1.5 rounded-full px-4 text-[14px] font-semibold";

function ResearchCard({ r, onAnswer }: { r: Research; onAnswer?: (yes: boolean) => void }) {
  if (r.state === "running") return <div className="mt-3"><Typing label="Recherchiere im Internet …" /></div>;
  // abgelehnt: dieselbe Kachel, als Entscheidung erkennbar – und umkehrbar
  if (r.state === "declined") return (
    <div className="mt-4 rounded-2xl border border-card-line bg-surface p-4">
      <div className="flex items-start gap-3">
        <IconTile icon={Globe} size={36} color="#64748b" />
        <div className="min-w-0 flex-1">
          <span className="flex flex-wrap items-center gap-2"><b className="text-[15px]">Internetrecherche</b><span className="inline-flex items-center gap-1 rounded-full bg-surface-3 px-3 py-2 text-[12px] leading-4 font-semibold text-soft"><X size={11} strokeWidth={3} /> Von dir abgelehnt</span></span>
          {r.reason && <span className="mt-0.5 block text-[13px] text-soft">Fehlt weiterhin: {r.reason}</span>}
          <span className="mt-2 flex items-start gap-1.5 text-[13px] text-muted line-through decoration-line-strong"><Globe size={14} className="mt-0.5 shrink-0" />{r.query}</span>
          <span className="mt-2 block text-[12px] text-muted">Nichts wurde gesendet.</span>
        </div>
      </div>
      {onAnswer && <div className="mt-3"><button type="button" onClick={() => onAnswer(true)} className={`${BTN} border border-card-line bg-surface hover:bg-surface-2`}>Doch recherchieren</button></div>}
    </div>
  );
  if (r.state === "done") return null;
  return (
    <div className="mt-4 rounded-2xl border border-card-line bg-surface p-4">
      <div className="flex items-start gap-3">
        <IconTile icon={Globe} size={36} />
        <div className="min-w-0 flex-1">
          <b className="block text-[15px]">Soll ich im Internet recherchieren?</b>
          {r.reason && <span className="mt-0.5 block text-[13px] text-soft">Fehlt: {r.reason}</span>}
          <span className="mt-2 flex items-start gap-1.5 text-[13px] text-brand-600 italic"><Globe size={14} className="mt-0.5 shrink-0 not-italic" />{r.query}</span>
          <span className="mt-2 block text-[12px] text-muted">Gesendet wird nur diese Suchanfrage – keine persönlichen Daten.</span>
          {r.state === "failed" && <span className="mt-2 block text-[13px] text-negative-text">{r.error ?? "Das hat nicht geklappt."}</span>}
        </div>
      </div>
      <div className="mt-3 flex gap-2">
        <button type="button" onClick={() => onAnswer?.(true)} className={`${BTN} bg-brand-500 text-white hover:bg-brand-600`}>{r.state === "failed" ? "Erneut versuchen" : "Ja, recherchieren"}</button>
        <button type="button" onClick={() => onAnswer?.(false)} className={`${BTN} border border-card-line bg-surface hover:bg-surface-2`}>Nein</button>
      </div>
    </div>
  );
}

function SaveCard({ o, onAnswer }: { o: SaveOffer; onAnswer?: (yes: boolean) => void }) {
  const { allDocs } = useDocs();
  const related = o.relatedId ? allDocs.find((d) => d.id === o.relatedId) : undefined;
  if (o.state === "declined") return <p className="mt-3 text-[13px] text-muted">Nicht abgelegt.</p>;
  if (o.state === "saved") return <p className="mt-3 text-[13px] text-positive-text">Abgelegt{related ? ` zu „${related.title}“` : ""} · wird ausgelesen</p>;
  return (
    <div className="mt-4 rounded-2xl border border-card-line bg-surface p-4">
      <div className="flex items-start gap-3">
        <IconTile icon={FileDown} size={36} />
        <div className="min-w-0 flex-1">
          <b className="block text-[15px]">Soll ich das in Lifevault ablegen?</b>
          <span className="mt-0.5 block text-[13px] text-soft">„{o.title}“ {o.pdfUrl ? "als PDF (Original aus dem Internet)" : "als Notiz mit Quellen"}{related ? <> – als Ergänzung zu <Link href={`/d/${related.id}`} className="font-semibold text-selected">{related.title}</Link></> : null}</span>
          {o.state === "failed" && <span className="mt-2 block text-[13px] text-negative-text">{o.error ?? "Das hat nicht geklappt."}</span>}
        </div>
      </div>
      <div className="mt-3 flex gap-2">
        <button type="button" disabled={o.state === "saving"} onClick={() => onAnswer?.(true)} className={`${BTN} bg-brand-500 text-white hover:bg-brand-600 disabled:opacity-60`}>{o.state === "saving" ? <><Loader2 size={15} className="animate-spin" /> Lege ab …</> : "Ja, ablegen"}</button>
        <button type="button" disabled={o.state === "saving"} onClick={() => onAnswer?.(false)} className={`${BTN} border border-card-line bg-surface hover:bg-surface-2`}>Nein</button>
      </div>
    </div>
  );
}

export function MessageList({ msgs, compact, onResearch, onSave, onAsk, busy }: { msgs: Msg[]; compact?: boolean; onResearch?: (i: number, yes: boolean) => void; onSave?: (i: number, yes: boolean) => void; onAsk?: (q: string) => void; busy?: boolean }) {
  const lastAnswer = msgs.map((m) => m.role).lastIndexOf("assistant");
  return (
    <div className={compact ? "space-y-5" : "space-y-6"}>
      {msgs.map((m, i) =>
        m.role === "user" ? (
          <div key={i} className="flex flex-col items-end gap-1.5">
            {m.attachments?.length ? <div className="flex max-w-[85%] flex-wrap justify-end gap-1">{m.attachments.map((a) => <EntityLink key={a.id} href={`/d/${a.id}`} label={a.name} />)}</div> : null}
            <div className="max-w-[85%] rounded-[20px] rounded-br-md bg-surface px-4 py-2.5 shadow-card text-[15px] leading-6 whitespace-pre-wrap">{m.content}</div>
          </div>
        ) : (
          // noch keine Antwort: der denkende Avatar steht statt des Logos vorne
          !m.content && !m.research && !m.save ? <Typing key={i} /> : (
          <div key={i} className="flex gap-3">
            <span className="mt-0.5 shrink-0"><LogoMark size={26} /></span>
            <div className="min-w-0 flex-1">
              {m.content ? (() => {
                const a = parseAnswer(m.content);
                return <><Markdown text={a.text} widget={(k, b) => <ChatWidget kind={k} body={b} />} /><Sources text={m.content} /><WebLinks links={a.links} />{onAsk && i === lastAnswer && !busy && !m.research && <FollowUps qs={a.followUps} onAsk={onAsk} />}</>;
              })() : <Typing />}
              {m.research && <ResearchCard r={m.research} onAnswer={(yes) => onResearch?.(i, yes)} />}
              {m.save && <SaveCard o={m.save} onAnswer={(yes) => onSave?.(i, yes)} />}
            </div>
          </div>
          )
        ),
      )}
    </div>
  );
}

export type Depth = "kurz" | "normal" | "gruendlich";
const DEPTHS: { id: Depth; label: string; text: string; icon: typeof Zap }[] = [
  { id: "kurz", label: "Kurz", text: "Knapp auf den Punkt", icon: Zap },
  { id: "normal", label: "Normal", text: "Mit Erklärung und Tipps", icon: Brain },
  { id: "gruendlich", label: "Gründlich", text: "Alle Dokumente, Rechnungen, Plan", icon: Telescope },
];
export type Attachment = { key: string; name: string; id?: string; failed?: boolean };

/* Spracheingabe über die Spracherkennung des Browsers (Safari, Chrome) – wie bei Finastry: Text erscheint live im Feld */
type Rec = { lang: string; continuous: boolean; interimResults: boolean; start(): void; stop(): void; abort?(): void; onresult: ((e: { resultIndex: number; results: ArrayLike<{ isFinal: boolean; 0: { transcript: string } }> }) => void) | null; onend: (() => void) | null; onerror: ((e: { error?: string }) => void) | null };
const speechRec = () => typeof window === "undefined" ? undefined : ((window as unknown as { SpeechRecognition?: new () => Rec; webkitSpeechRecognition?: new () => Rec }).SpeechRecognition ?? (window as unknown as { webkitSpeechRecognition?: new () => Rec }).webkitSpeechRecognition);
const DICTATION_ERRORS: Record<string, string> = {
  "not-allowed": "Das Mikrofon ist für Lifevault blockiert. Erlaube es im Browser (Schloss-Symbol links neben der Adresse › Mikrofon) und versuch es noch einmal.",
  "service-not-allowed": "Die Spracherkennung ist auf diesem Gerät aus. Am Mac: Systemeinstellungen › Tastatur › Diktieren einschalten, dann neu laden.",
  "audio-capture": "Kein Mikrofon gefunden. Ist eins angeschlossen und erlaubt?",
  network: "Die Spracherkennung braucht gerade Internet (Chrome und Edge erkennen die Sprache online).",
  "no-speech": "Nichts gehört – sprich etwas näher ans Mikrofon.",
  "language-not-supported": "Deutsch wird von der Spracherkennung dieses Browsers nicht unterstützt.",
};
const DICTATION_UNSUPPORTED = "Dieser Browser kann keine Spracheingabe (z. B. Firefox). Nimm Chrome, Edge oder Safari – oder die Diktier-Taste der Tastatur.";

function useDictation(onText: (t: string) => void, onError: (message: string) => void) {
  const rec = useRef<Rec>(undefined);
  const [listening, setListening] = useState(false);
  // Pegel 0–1 für die Wellenform: am Mikrofon gemessen (nicht auf iPhone/iPad – dort blockiert das die Erkennung), sonst geschätzt
  const level = useRef(0);
  const meter = useRef<{ stop(): void; since: number }>(undefined);
  const base = useRef("");
  const last = useRef("");
  const stopping = useRef(false);
  const stopMeter = () => { meter.current?.stop(); meter.current = undefined; level.current = 0; };
  const release = () => {
    const old = rec.current;
    rec.current = undefined;
    if (!old) return;
    old.onresult = null; old.onend = null; old.onerror = null;
    try { (old.abort ?? old.stop).call(old); } catch { /* egal */ }
  };
  useEffect(() => () => { release(); stopMeter(); }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const startMeter = async (r: Rec) => {
    const ios = /iP(hone|ad|od)/.test(navigator.userAgent) || (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1);
    try { if (ios || sessionStorage.getItem("lifevault:no-meter") || !navigator.mediaDevices?.getUserMedia) return; } catch { return; }
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: true, noiseSuppression: true } });
      if (rec.current !== r || stopping.current) return stream.getTracks().forEach((t) => t.stop());
      const AC = window.AudioContext ?? (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
      const ctx = new AC();
      const analyser = ctx.createAnalyser();
      analyser.fftSize = 512;
      ctx.createMediaStreamSource(stream).connect(analyser);
      const buf = new Uint8Array(analyser.fftSize);
      let raf = 0;
      const loop = () => {
        analyser.getByteTimeDomainData(buf);
        let sum = 0;
        for (const v of buf) sum += ((v - 128) / 128) ** 2;
        level.current = Math.max(level.current * 0.86, Math.min(1, Math.sqrt(sum / buf.length) * 5));
        raf = requestAnimationFrame(loop);
      };
      loop();
      meter.current = { since: Date.now(), stop: () => { cancelAnimationFrame(raf); stream.getTracks().forEach((t) => t.stop()); void ctx.close(); } };
    } catch { /* kein Zugriff: Wellenform folgt den Erkennungs-Ereignissen */ }
  };

  const start = (text: string, keepBase = false, retry = true) => {
    const Ctor = speechRec();
    if (!Ctor) { onError(DICTATION_UNSUPPORTED); return; }
    release();
    const r = new Ctor();
    r.lang = "de-DE";
    r.continuous = true;
    r.interimResults = true;
    if (!keepBase) base.current = text;
    stopping.current = false;
    let done = text ? `${text.trim()} ` : "";
    last.current = text;
    r.onresult = (e) => {
      if (rec.current !== r || stopping.current) return;
      let interim = "";
      for (let i = e.resultIndex; i < e.results.length; i++) {
        const res = e.results[i];
        if (res.isFinal) done += `${res[0].transcript.trim()} `;
        else interim += res[0].transcript;
      }
      last.current = (done + interim).trimStart();
      if (!meter.current) level.current = Math.max(level.current, 0.35 + Math.random() * 0.45);
      onText(last.current);
    };
    r.onend = () => {
      if (rec.current !== r) return;
      // manche Geräte beenden die Erkennung, sobald zusätzlich gemessen wird: dann ohne Messung weiter
      if (!stopping.current && meter.current && Date.now() - meter.current.since < 1500) {
        try { sessionStorage.setItem("lifevault:no-meter", "1"); } catch { /* egal */ }
        stopMeter();
        start(last.current, true);
        return;
      }
      stopMeter();
      rec.current = undefined;
      setListening(false);
    };
    r.onerror = (e) => {
      if (rec.current !== r) return;
      rec.current = undefined;
      stopMeter();
      setListening(false);
      if (e?.error && e.error !== "aborted") onError(DICTATION_ERRORS[e.error] ?? `Die Spracheingabe hat nicht geklappt (${e.error}).`);
    };
    rec.current = r;
    try {
      r.start();
      setListening(true);
      void startMeter(r);
    } catch {
      rec.current = undefined;
      setListening(false);
      if (retry) setTimeout(() => start(text, keepBase, false), 350);
      else onError("Die Spracheingabe ließ sich nicht starten. Tipp bitte noch einmal aufs Mikrofon.");
    }
  };
  const stop = () => {
    stopping.current = true;
    const r = rec.current;
    rec.current = undefined;
    if (r) { r.onresult = null; r.onend = null; r.onerror = null; try { r.stop(); } catch { /* egal */ } }
    stopMeter();
    setListening(false);
  };
  /** Abbrechen: Aufnahme verwerfen, der Text von vorher kommt zurück */
  const cancel = () => { stop(); onText(base.current); };
  return { listening, start, stop, cancel, level };
}

/** Wellenform: rechts kommt laufend der aktuelle Pegel dazu und wandert nach links, Stille als Punkt */
function VoiceWave({ level }: { level: React.RefObject<number> }) {
  const cv = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    const c = cv.current;
    const g = c?.getContext("2d");
    if (!c || !g) return;
    const STEP = 6, BAR = 3, EVERY = 70;
    const samples: number[] = [];
    const color = getComputedStyle(c).color;
    let lastAt = performance.now(), raf = 0;
    const draw = (now: number) => {
      const w = c.clientWidth, h = c.clientHeight, dpr = window.devicePixelRatio || 1;
      if (c.width !== Math.round(w * dpr) || c.height !== Math.round(h * dpr)) { c.width = Math.round(w * dpr); c.height = Math.round(h * dpr); }
      const n = Math.ceil(w / STEP) + 1;
      while (now - lastAt >= EVERY) { samples.push(level.current ?? 0); lastAt += EVERY; }
      if (samples.length > n) samples.splice(0, samples.length - n);
      const shift = ((now - lastAt) / EVERY) * STEP;
      g.setTransform(dpr, 0, 0, dpr, 0, 0);
      g.clearRect(0, 0, w, h);
      g.fillStyle = color;
      for (let i = 0; i < n; i++) {
        const v = samples[samples.length - n + i] ?? 0;
        const x = w - (n - i) * STEP - shift + STEP;
        if (x < -BAR) continue;
        g.beginPath();
        if (v < 0.07) g.arc(x + BAR / 2, h / 2, 1.5, 0, Math.PI * 2);
        else { const bh = Math.max(6, Math.min(h, v * h * 1.15)); if (g.roundRect) g.roundRect(x, (h - bh) / 2, BAR, bh, BAR / 2); else g.rect(x, (h - bh) / 2, BAR, bh); }
        g.fill();
      }
      raf = requestAnimationFrame(draw);
    };
    raf = requestAnimationFrame(draw);
    return () => cancelAnimationFrame(raf);
  }, [level]);
  return <canvas ref={cv} aria-label="Aufnahme läuft" role="img" className="h-8 min-w-0 flex-1 text-fg [mask-image:linear-gradient(to_right,transparent,#000_24px)]" />;
}

/** Eingabe wie bei Finastry: Feld oben, darunter Plus (Foto/Datei), Antworttiefe, Mikrofon und Senden */
export function Composer({ busy, onSend, onStop, placeholder = "Frag etwas zu deinen Unterlagen …", onFiles, attachments = [], onRemoveAttachment, depth, onDepth, plain = false, onTextChange }: {
  /** Text vorhanden ja/nein (der große Avatar weicht beim Tippen) */ onTextChange?: (has: boolean) => void;
  busy: boolean; onSend: (q: string) => void; onStop: () => void; placeholder?: string; plain?: boolean;
  onFiles?: (files: File[]) => void; attachments?: Attachment[]; onRemoveAttachment?: (key: string) => void; depth?: Depth; onDepth?: (d: Depth) => void;
}) {
  const { allDocs } = useDocs();
  const [text, setText] = useState("");
  const [menu, setMenu] = useState<"" | "plus" | "depth">("");
  const area = useRef<HTMLTextAreaElement>(null);
  const cam = useRef<HTMLInputElement>(null);
  const files = useRef<HTMLInputElement>(null);
  const [err, setErr] = useState<string>();
  const dict = useDictation(setText, setErr);
  const docOf = (a: Attachment) => (a.id ? allDocs.find((d) => d.id === a.id) : undefined);
  const pending = attachments.some((a) => !a.failed && docOf(a)?.status !== "ready" && docOf(a)?.status !== "error");
  const send = () => { if ((text.trim() || attachments.length) && !busy && !pending) { onSend(text.trim() || "Was steht in dem Dokument, und was muss ich tun?"); if (dict.listening) dict.stop(); setText(""); onTextChange?.(false); } };
  const pick = (e: React.ChangeEvent<HTMLInputElement>) => { const l = [...(e.target.files ?? [])]; e.target.value = ""; if (l.length) onFiles?.(l); setMenu(""); };
  const cur = DEPTHS.find((d) => d.id === depth) ?? DEPTHS[1];
  const ready = attachments.map(docOf).find((d) => d?.status === "ready");
  return (
    <form onSubmit={(e) => { e.preventDefault(); send(); }} className={plain ? "relative rounded-2xl border border-card-line bg-surface p-2 focus-within:border-line-strong" : "chat-box relative rounded-[22px] border bg-surface p-2"}>
      <input ref={cam} type="file" accept="image/*" capture="environment" className="hidden" onChange={pick} />
      <input ref={files} type="file" accept="image/*,application/pdf,.pptx,.docx,.xlsx" multiple className="hidden" onChange={pick} />
      {attachments.length > 0 && (
        <div className="flex flex-wrap gap-1.5 px-2 pt-1 pb-2">
          {attachments.map((a) => {
            const d = docOf(a);
            const state = a.failed || d?.status === "error" ? "fehler" : d?.status === "ready" ? "ok" : "läuft";
            return (
              <span key={a.key} className="inline-flex max-w-full items-center gap-1.5 rounded-full border border-card-line bg-surface py-1 pr-1 pl-2.5 text-[12px] font-semibold">
                {state === "läuft" ? <Loader2 size={13} className="animate-spin" /> : state === "ok" ? <Check size={13} className="text-positive-text" /> : <X size={13} className="text-negative-text" />}
                <span className="max-w-[12rem] truncate">{d?.status === "ready" ? d.title ?? a.name : a.name}</span>
                {state === "läuft" && <span className="font-normal text-muted">wird ausgelesen</span>}
                <button type="button" onClick={() => onRemoveAttachment?.(a.key)} aria-label="Entfernen" className="grid h-5 w-5 place-items-center rounded-full text-muted hover:bg-surface-3"><X size={12} /></button>
              </span>
            );
          })}
        </div>
      )}
      <div className="flex items-start gap-1">
        <textarea
          ref={area}
          value={text}
          onChange={(e) => { setText(e.target.value); onTextChange?.(!!e.target.value.trim()); e.target.style.height = "auto"; e.target.style.height = `${Math.min(160, e.target.scrollHeight)}px`; }}
          onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey && !e.nativeEvent.isComposing) { e.preventDefault(); send(); } }}
          rows={plain ? 3 : 1}
          maxLength={2000}
          placeholder={dict.listening ? "Ich höre zu …" : ready ? `Frag etwas zu „${ready.title}“ …` : placeholder}
          data-own-focus
          className="block max-h-40 min-h-10 min-w-0 flex-1 resize-none bg-transparent px-2.5 py-2 text-[16px] leading-6 outline-none placeholder:text-muted"
        />
      </div>
      {err && (
        <div role="alert" className="mx-1 mb-1 flex items-start gap-2 rounded-xl bg-negative/10 px-3 py-2 text-[13px] text-negative-text">
          <span className="min-w-0 flex-1">{err}</span>
          <button type="button" onClick={() => setErr(undefined)} aria-label="Hinweis schließen" className="shrink-0 opacity-70 hover:opacity-100"><X size={14} /></button>
        </div>
      )}
      {dict.listening ? (
        // Aufnahme: Verwerfen, Wellenform, Stopp (Quadrat), Senden – wie bei Finastry
        <div className="flex items-center gap-2 px-0.5 pt-1">
          <button type="button" onClick={dict.cancel} aria-label="Aufnahme verwerfen" title="Verwerfen" className="grid h-10 w-10 shrink-0 place-items-center rounded-full bg-surface-2 text-fg hover:bg-surface-3"><X size={19} /></button>
          <VoiceWave level={dict.level} />
          <button type="button" onClick={dict.stop} aria-label="Aufnahme beenden" title="Aufnahme beenden" className="grid h-10 w-10 shrink-0 place-items-center rounded-full bg-surface-2 text-fg hover:bg-surface-3"><Square size={14} fill="currentColor" /></button>
          <button type="submit" disabled={!text.trim() || pending} aria-label="Senden" className="grid h-10 w-10 shrink-0 place-items-center rounded-full bg-brand-500 text-white transition disabled:bg-surface-3 disabled:text-muted"><ArrowUp size={19} strokeWidth={2.4} /></button>
        </div>
      ) : (
      <div className="flex items-center gap-1.5 px-0.5 pt-1">
        {onFiles && (
          <button type="button" onClick={() => setMenu(menu === "plus" ? "" : "plus")} aria-label="Datei oder Foto hinzufügen" aria-expanded={menu === "plus"} className="grid h-9 w-9 place-items-center rounded-full border border-card-line text-fg hover:bg-surface-2"><Plus size={18} /></button>
        )}
        {onDepth && (
          <button type="button" onClick={() => setMenu(menu === "depth" ? "" : "depth")} aria-expanded={menu === "depth"} title="Antworttiefe" className="inline-flex h-9 items-center gap-1.5 rounded-full border border-card-line px-3 text-[13px] font-semibold text-soft hover:bg-surface-2 hover:text-fg"><cur.icon size={14} /> {cur.label} <ChevronDown size={13} /></button>
        )}
        <span className="flex-1" />
        <button type="button" onClick={() => { setErr(undefined); dict.start(text); }} aria-label="Spracheingabe" title="Sprechen statt tippen" className="grid h-9 w-9 place-items-center rounded-full text-soft hover:bg-surface-2 hover:text-fg"><Mic size={18} /></button>
        {busy ? (
          <button type="button" onClick={onStop} aria-label="Stoppen" className="grid h-10 w-10 shrink-0 place-items-center rounded-full bg-fg text-canvas"><Square size={14} fill="currentColor" /></button>
        ) : (
          <button type="submit" disabled={(!text.trim() && !attachments.length) || pending} aria-label="Senden" title={pending ? "Warte, bis die Datei ausgelesen ist" : "Senden"} className="grid h-10 w-10 shrink-0 place-items-center rounded-full bg-brand-500 text-white transition disabled:bg-surface-3 disabled:text-muted"><ArrowUp size={19} strokeWidth={2.4} /></button>
        )}
      </div>
      )}
      {menu && <div className="fixed inset-0 z-10" onClick={() => setMenu("")} aria-hidden />}
      {menu === "plus" && (
        <div className="sheet-up absolute bottom-full left-2 z-20 mb-2 w-64 rounded-2xl border border-card-line bg-surface p-1.5 shadow-[0_12px_32px_rgba(16,24,40,.14)]">
          <button type="button" onClick={() => cam.current?.click()} className="flex w-full items-center gap-3 rounded-xl px-2.5 py-2 text-left text-[14px] hover:bg-surface-2"><IconTile icon={Camera} size={36} /><span><b className="block">Fotografieren</b><span className="text-[12px] text-muted">Brief, Bon, Rechnung</span></span></button>
          <button type="button" onClick={() => files.current?.click()} className="flex w-full items-center gap-3 rounded-xl px-2.5 py-2 text-left text-[14px] hover:bg-surface-2"><IconTile icon={Paperclip} size={36} /><span><b className="block">Foto oder PDF</b><span className="text-[12px] text-muted">wird abgelegt und im Chat genutzt</span></span></button>
        </div>
      )}
      {menu === "depth" && onDepth && (
        <div className="sheet-up absolute bottom-full left-12 z-20 mb-2 w-72 rounded-2xl border border-card-line bg-surface p-1.5 shadow-[0_12px_32px_rgba(16,24,40,.14)]">
          <div className="px-2.5 pt-1 pb-1 text-[12px] font-semibold text-muted">Antworttiefe</div>
          {DEPTHS.map((d) => (
            <button key={d.id} type="button" onClick={() => { onDepth(d.id); setMenu(""); }} className={`flex w-full items-center gap-3 rounded-xl px-2.5 py-2 text-left text-[14px] hover:bg-surface-2 ${d.id === cur.id ? "bg-surface-2" : ""}`}>
              <IconTile icon={d.icon} size={36} color={d.id === cur.id ? "#6d4aff" : "#475569"} />
              <span className="min-w-0 flex-1"><b className="block">{d.label}</b><span className="text-[12px] text-muted">{d.text}</span></span>
              {d.id === cur.id && <Check size={15} className="text-selected" />}
            </button>
          ))}
        </div>
      )}
    </form>
  );
}

/**
 * Chat-Logik: Frage senden, Antwort streamen, Verlauf in der Datenbank speichern (Tabelle chats).
 * docId: Chat zu einem Dokument (docText = entschlüsselter Inhalt bei verschlüsselten Dokumenten).
 */
/** Fragen, die offensichtlich sensible (meist verschlüsselte) Unterlagen brauchen */
const SENSITIVE_Q = /arzt|ärzt|befund|diagnos|krank|gesundheit|medikament|klinik|therapie|operation|\bop\b|labor|ausweis|reisepass|steuer|gehalt|lohn|netto|brutto|iban|konto|versicher|sozialversicher|verschlüssel|tresor/i;

/** Verschlüsselte Dokumente für eine Antwort im Browser öffnen: Zusammenfassung + Fakten aller, Volltext der passendsten */
async function decryptForChat(docs: { id: string; title: string | null; sender: string | null; doc_date: string | null; secret: { iv: string; ct: string } | null }[], question: string) {
  const words = (question.toLowerCase().match(/[\p{L}\p{N}]{4,}/gu) ?? []);
  const out: { id: string; title: string; text: string }[] = [];
  for (const d of docs.slice(0, 40)) {
    try {
      const p = await openJson<SecretPart>(d.secret!);
      const hay = `${d.title} ${d.sender} ${p.summary}`.toLowerCase();
      const match = words.some((w) => hay.includes(w));
      const facts = (p.key_facts ?? []).slice(0, 20).map((f) => `${f.label}: ${f.value}`).join("; ");
      out.push({ id: d.id, title: d.title ?? "Dokument", text: `${d.sender ?? ""} · ${d.doc_date ?? ""}\n${p.summary ?? ""}\nFakten: ${facts}${match ? `\n${(p.full_text ?? "").slice(0, 6000)}` : ""}` });
    } catch { /* nicht lesbar: auslassen */ }
  }
  return out;
}

export function useChat({ chatId, docId, docText, onSaved }: { chatId?: string; docId?: string; docText?: string; onSaved?: (id: string) => void }) {
  const { current } = useProjects();
  const { upload, allDocs } = useDocs();
  const { vault, unlocked } = useMe();
  // Frage braucht verschlüsselte Inhalte, Tresor gesperrt: erst fragen, dann weiter
  const [gate, setGate] = useState<{ q: string; base: Msg[] } | null>(null);
  // einmal „Ohne Tresor fragen“ gewählt: in diesem Gespräch nicht noch einmal nach dem Passwort fragen
  const noVault = useRef(false);
  const [depth, setDepthState] = useState<Depth>("normal");
  useEffect(() => { try { const d = localStorage.getItem("lifevault:depth"); if (d === "kurz" || d === "normal" || d === "gruendlich") setDepthState(d); } catch { /* egal */ } }, []);
  const setDepth = (d: Depth) => { setDepthState(d); try { localStorage.setItem("lifevault:depth", d); } catch { /* egal */ } };
  const [attachments, setAttachments] = useState<Attachment[]>([]);
  /** Datei im Chat: wird normal abgelegt (ohne Fortschritts-Fenster) und hängt an der nächsten Frage */
  const attach = async (files: File[]) => {
    const items = files.slice(0, 5).map((f) => ({ key: crypto.randomUUID(), name: f.name }));
    setAttachments((a) => [...a, ...items]);
    for (const [i, f] of files.slice(0, 5).entries()) {
      const [id] = await upload([f], { silent: true });
      setAttachments((a) => a.map((x) => (x.key === items[i].key ? { ...x, id, failed: !id } : x)));
    }
  };
  const removeAttachment = (key: string) => setAttachments((a) => a.filter((x) => x.key !== key));
  const [msgs, setMsgs] = useState<Msg[]>([]);
  const [busy, setBusy] = useState(false);
  const [id, setId] = useState(chatId);
  const abort = useRef<AbortController>(null);
  // gespeicherten Chat laden
  useEffect(() => {
    setId(chatId);
    noVault.current = false;
    if (!chatId) { setMsgs([]); return; }
    void supabase.from("chats").select("messages").eq("id", chatId).maybeSingle().then(({ data }) => setMsgs((data?.messages as Msg[]) ?? []));
  }, [chatId]);
  // Dokument-Chat: letzten Verlauf zu diesem Dokument laden
  useEffect(() => {
    if (!docId || chatId) return;
    void supabase.from("chats").select("id,messages").eq("doc_id", docId).order("updated_at", { ascending: false }).limit(1).maybeSingle().then(({ data }) => { if (data) { setId(data.id); setMsgs(data.messages as Msg[]); } });
  }, [docId, chatId]);

  const save = async (all: Msg[]) => {
    const title = (all.find((m) => m.role === "user")?.content ?? "Neuer Chat").slice(0, 80);
    if (id) await supabase.from("chats").update({ messages: all, updated_at: new Date().toISOString() }).eq("id", id);
    else {
      const { data } = await supabase.from("chats").insert({ title, messages: all, doc_id: docId ?? null }).select("id").single();
      if (data) { setId(data.id); onSaved?.(data.id); }
    }
  };

  const END = /\n?\[\[(ENDE|FEHLER):[^\]]*\]\]\s*$/;
  const send = async (q: string, base = msgs, opts: { skipGate?: boolean } = {}) => {
    const question = q.trim();
    if (!question || busy) return;
    const encDocs = allDocs.filter((d) => d.encrypted && d.secret);
    if (!docId && !opts.skipGate && !noVault.current && vault && !vaultKey() && encDocs.length && SENSITIVE_Q.test(question)) { setGate({ q: question, base }); return; }
    setGate(null);
    const secretDocs = !docId && vaultKey() && encDocs.length ? await decryptForChat(encDocs, question) : undefined;
    const att = attachments.filter((a) => a.id).map((a) => ({ id: a.id!, name: a.name }));
    setAttachments([]);
    const next: Msg[] = [...base, { role: "user", content: question, ...(att.length ? { attachments: att } : {}) }];
    setMsgs([...next, { role: "assistant", content: "" }]);
    setBusy(true);
    const ctrl = new AbortController();
    abort.current = ctrl;
    let out = "";
    try {
      const res = await authFetch("/api/chat", { method: "POST", body: JSON.stringify({ messages: next.map(({ role, content }) => ({ role, content })), docId, docText, secretDocs, projectId: current !== "all" ? current : undefined, depth, attachIds: att.map((a) => a.id) }), signal: ctrl.signal });
      if (!res.ok || !res.body) throw new Error((await res.json().catch(() => ({}))).error ?? `Fehler ${res.status}`);
      const reader = res.body.getReader();
      const dec = new TextDecoder();
      for (;;) {
        const { value, done } = await reader.read();
        if (done) break;
        out += dec.decode(value, { stream: true });
        setMsgs([...next, { role: "assistant", content: out.replace(END, "") }]);
      }
      // Ende-Zeile vom Server: fehlt sie oder meldet sie einen Fehler, ist die Antwort unvollständig
      const end = END.exec(out);
      out = out.replace(END, "").trimEnd();
      if (!end || end[1] === "FEHLER") out = `${out}${out ? "\n\n" : ""}_Die Antwort wurde unterbrochen. Bitte die Frage noch einmal senden._`;
      if (!out.trim()) out = "Dazu habe ich gerade keine Antwort bekommen. Bitte noch einmal fragen.";
    } catch (e) {
      if ((e as Error).name === "AbortError") out = out || "(abgebrochen)";
      else { const m = (e as Error).message; out = /load failed|failed to fetch|network/i.test(m) ? "Die Verbindung ist abgebrochen. Bitte die Frage noch einmal senden." : m; }
    } finally {
      // Folgefragen dürfen vor oder nach der Recherche-Zeile stehen: vorher herauslösen, danach wieder anhängen
      const follow = FOLLOW.exec(out)?.[0].trim();
      const { text: body, research } = splitMarker(out.replace(FOLLOW, "").trimEnd());
      const text = follow ? `${body}\n\n${follow}` : body;
      const all: Msg[] = [...next, { role: "assistant", content: text, ...(research ? { research: { ...research, docId: research.docId ?? docId } } : {}) }];
      setMsgs(all);
      setBusy(false);
      abort.current = null;
      await save(all).catch(() => undefined);
    }
  };
  const reset = () => { abort.current?.abort(); setMsgs([]); setId(undefined); noVault.current = false; };

  // Nachricht i ändern und speichern
  const update = async (list: Msg[]) => { setMsgs(list); await save(list).catch(() => undefined); };

  /** Internetrecherche nach Zustimmung: Ergebnis als neue Antwort, danach Angebot zum Ablegen */
  const research = async (i: number, yes: boolean) => {
    const m = msgs[i];
    if (!m?.research || busy) return;
    if (!yes) return update(msgs.map((x, k) => (k === i ? { ...x, research: { ...m.research!, state: "declined" } } : x)));
    const running = msgs.map((x, k) => (k === i ? { ...x, research: { ...m.research!, state: "running" as const } } : x));
    setMsgs(running);
    setBusy(true);
    try {
      const question = [...msgs.slice(0, i)].reverse().find((x) => x.role === "user")?.content ?? "";
      const res = await authFetch("/api/research", { method: "POST", body: JSON.stringify({ query: m.research.query, reason: m.research.reason, question }) });
      const r = (await res.json().catch(() => ({}))) as { error?: string; answer?: string; sources?: { title: string; url: string }[]; document?: { title: string; pdfUrl: string; markdown: string } | null };
      if (!res.ok || !r.answer) throw new Error(r.error ?? `Fehler ${res.status}`);
      const sources = (r.sources ?? []).map((s) => `- [${s.title.replace(/[[\]]/g, "")}](${s.url})`).join("\n");
      const answer: Msg = {
        role: "assistant",
        content: `${r.answer}${sources ? `\n\n### Quellen im Internet\n${sources}` : ""}`,
        ...(r.document ? { save: { ...r.document, relatedId: m.research.docId, query: m.research.query, sourceUrl: r.document.pdfUrl || r.sources?.[0]?.url, state: "ask" as const } } : {}),
      };
      await update([...running.map((x, k) => (k === i ? { ...x, research: { ...m.research!, state: "done" as const } } : x)), answer]);
    } catch (e) {
      await update(msgs.map((x, k) => (k === i ? { ...x, research: { ...m.research!, state: "failed", error: (e as Error).message } } : x)));
    } finally {
      setBusy(false);
    }
  };

  /** Gefundenes Dokument ablegen: Original-PDF, sonst Notiz mit Quellen und Bezug */
  const saveFound = async (i: number, yes: boolean) => {
    const m = msgs[i];
    if (!m?.save) return;
    if (!yes) return update(msgs.map((x, k) => (k === i ? { ...x, save: { ...m.save!, state: "declined" } } : x)));
    setMsgs(msgs.map((x, k) => (k === i ? { ...x, save: { ...m.save!, state: "saving" } } : x)));
    const name = m.save.title.replace(/[\\/:*?"<>|]/g, "").slice(0, 120) || "Recherche";
    try {
      let file: File | undefined;
      if (m.save.pdfUrl) {
        const res = await authFetch("/api/research/fetch", { method: "POST", body: JSON.stringify({ url: m.save.pdfUrl }) });
        if (res.ok) file = new File([await res.blob()], `${name}.pdf`, { type: "application/pdf" });
      }
      if (!file) {
        const head = `# ${m.save.title}\n\n_Internetrecherche vom ${new Date().toLocaleDateString("de-DE")}${m.save.relatedId ? ` · Ergänzung zu Dokument /d/${m.save.relatedId}` : ""}_\n\n`;
        file = new File([head + m.save.markdown], `${name}.md`, { type: "text/markdown" });
      }
      const ids = await upload([file]);
      // als „aus dem Internet“ markieren: wird regelmäßig auf Aktualität geprüft
      const now = new Date().toISOString();
      if (ids.length) await supabase.from("documents").update({ web_source: { query: m.save.query ?? m.save.title, url: m.save.sourceUrl, title: m.save.title, imported_at: now, checked_at: now } }).in("id", ids);
      await update(msgs.map((x, k) => (k === i ? { ...x, save: { ...m.save!, state: "saved" } } : x)));
    } catch (e) {
      await update(msgs.map((x, k) => (k === i ? { ...x, save: { ...m.save!, state: "failed", error: (e as Error).message } } : x)));
    }
  };

  // nach dem Entsperren die zurückgehaltene Frage automatisch senden
  useEffect(() => { if (gate && unlocked) void send(gate.q, gate.base, { skipGate: true }); /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, [unlocked]);
  const skipGate = () => { noVault.current = true; if (gate) void send(gate.q, gate.base, { skipGate: true }); };
  return { msgs, busy, send, stop: () => abort.current?.abort(), reset, id, research, saveFound, depth, setDepth, attachments, attach, removeAttachment, gate, skipGate, cancelGate: () => setGate(null) };
}
