"use client";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ArrowLeft, FileQuestion, House } from "lucide-react";

/** „Nicht gefunden“: freundlich statt einer grauen Zeile – mit Zurück und Startseite */
export function NotFound({ title = "Nicht gefunden", text = "Das gibt es nicht mehr oder es wurde verschoben, gelöscht oder zusammengeführt.", compact = false }: { title?: string; text?: string; compact?: boolean }) {
  const router = useRouter();
  const back = () => (window.history.length > 1 ? router.back() : router.push("/"));
  return (
    <div className={`mx-auto flex max-w-md flex-col items-center text-center ${compact ? "px-6 py-10" : "py-20"}`}>
      <span className="grid h-16 w-16 place-items-center rounded-[18px] text-brand-500" style={{ background: "linear-gradient(135deg, color-mix(in srgb, #6d4aff 20%, transparent) 0%, color-mix(in srgb, #6d4aff 6%, transparent) 100%)" }}>
        <FileQuestion size={30} strokeWidth={1.75} />
      </span>
      <h1 className="mt-5 text-[22px] leading-8 font-semibold">{title}</h1>
      <p className="mt-1.5 text-[15px] leading-6 text-soft">{text}</p>
      <div className="mt-6 flex flex-wrap justify-center gap-2.5">
        <button type="button" onClick={back} className="inline-flex h-11 items-center gap-2 rounded-full border border-card-line bg-surface px-5 text-[14px] font-semibold hover:bg-surface-2"><ArrowLeft size={16} /> Zurück</button>
        <Link href="/" className="inline-flex h-11 items-center gap-2 rounded-full bg-brand-500 px-5 text-[14px] font-semibold text-white hover:bg-brand-600"><House size={16} /> Zur Startseite</Link>
      </div>
    </div>
  );
}
