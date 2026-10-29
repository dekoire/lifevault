import { FileSearch, FolderTree, HeartPulse, KeyRound, MessageSquare, Receipt, ScanLine, ShieldCheck } from "lucide-react";
import Link from "next/link";
import { Logo } from "@/components/Logo";

const FEATURES = [
  { icon: ScanLine, label: "Fotografieren" },
  { icon: FolderTree, label: "Automatisch sortiert" },
  { icon: FileSearch, label: "Alles durchsuchbar" },
  { icon: MessageSquare, label: "Fragen stellen" },
  { icon: Receipt, label: "Belege & Rechnungen" },
  { icon: HeartPulse, label: "Gesundheit" },
];

const POINTS = [
  { icon: ShieldCheck, title: "Nur du siehst deine Daten", text: "Jedes Dokument liegt in deinem eigenen, privaten Bereich. Server in der EU." },
  { icon: KeyRound, title: "Du gibst frei", text: "Andere Apps sehen nur, was du ausdrücklich freigibst." },
  { icon: FileSearch, title: "Nichts geht verloren", text: "Original und vollständiger Text bleiben immer erhalten." },
];

/** Anmeldung & Registrierung wie bei Finastry: links das Formular, rechts (ab Desktop) das Bild mit lila Schleier. */
export default function AuthLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="relative grid min-h-dvh bg-canvas lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
      <div className="pt-safe flex flex-col px-5 py-8 md:px-10">
        <Link href="/willkommen" aria-label="Startseite" className="w-fit"><Logo /></Link>
        <div className="mx-auto flex w-full max-w-[420px] flex-1 flex-col justify-center py-10">{children}</div>
        <p className="pb-safe flex items-center justify-center gap-1.5 text-xs text-muted">
          <ShieldCheck size={14} className="text-positive" /> Verschlüsselte Verbindung · Server in der EU
        </p>
      </div>
      <aside className="relative hidden overflow-hidden p-12 text-white lg:flex lg:flex-col lg:justify-center">
        <div aria-hidden className="absolute inset-0 bg-cover bg-center" style={{ backgroundImage: "url(/auth/wallpaper.webp)", backgroundColor: "#2a1a6e" }} />
        {/* lila Schleier über dem Bild */}
        {/* Bild in Lila umfärben, dann leicht abdunkeln */}
        <div aria-hidden className="absolute inset-0 bg-[#6d4aff] mix-blend-color" />
        <div aria-hidden className="absolute inset-0 bg-gradient-to-br from-[#6d4aff]/35 via-[#2a1a6e]/30 to-[#120a33]/65" />
        <div className="relative mx-auto w-full max-w-xl">
          <h2 className="text-[32px] leading-[40px] font-[650] tracking-tight">Alle Unterlagen. Ein Tresor.</h2>
          <p className="mt-3 text-[16px] leading-7 text-white/80">Foto machen oder PDF hochladen – Lifevault liest alles aus, sortiert es und beantwortet dir jede Frage dazu.</p>
          <ul className="mt-8 flex flex-wrap gap-2">
            {FEATURES.map(({ icon: Icon, label }) => (
              <li key={label} className="inline-flex items-center gap-1.5 rounded-full bg-white/12 px-3 py-1.5 text-[13px] font-medium"><Icon size={14} strokeWidth={1.9} /> {label}</li>
            ))}
          </ul>
          <ul className="mt-8 grid gap-3 xl:grid-cols-3">
            {POINTS.map(({ icon: Icon, title, text }) => (
              <li key={title} className="rounded-2xl bg-white/10 p-4 backdrop-blur-xl">
                <span className="grid h-9 w-9 place-items-center rounded-xl bg-white/15"><Icon size={17} strokeWidth={1.75} /></span>
                <span className="mt-2.5 block text-[14px] leading-5 font-semibold">{title}</span>
                <span className="mt-1 block text-[13px] leading-5 text-white/75">{text}</span>
              </li>
            ))}
          </ul>
        </div>
      </aside>
    </div>
  );
}
