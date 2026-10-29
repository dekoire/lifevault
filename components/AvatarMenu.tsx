"use client";
import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { LogOut, Settings, UserRound } from "lucide-react";
import { supabase } from "@/lib/supabase";

/** „nael.ahmed@…“ → „Nael Ahmed“ */
export const nameFromEmail = (email: string) => email.split("@")[0].split(/[._-]+/).filter(Boolean).map((w) => w[0].toUpperCase() + w.slice(1)).join(" ") || email;
const initials = (name: string) => { const p = name.split(" ").filter(Boolean); return ((p[0]?.[0] ?? "") + (p.length > 1 ? p[p.length - 1][0] : p[0]?.[1] ?? "")).toUpperCase(); };

export function Avatar({ email, size = 36 }: { email: string; size?: number }) {
  return <span className="grid shrink-0 place-items-center rounded-full bg-fg font-semibold text-canvas" style={{ width: size, height: size, fontSize: size * 0.38 }}>{initials(nameFromEmail(email))}</span>;
}

/** Avatar oben rechts mit Menü: Profil, Einstellungen, Abmelden */
export function AvatarMenu({ email }: { email: string }) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    const close = (e: MouseEvent) => { if (!ref.current?.contains(e.target as Node)) setOpen(false); };
    document.addEventListener("mousedown", close);
    return () => document.removeEventListener("mousedown", close);
  }, [open]);
  const item = "flex h-10 w-full items-center gap-2.5 rounded-xl px-2.5 text-left text-[14px] font-medium hover:bg-surface-2";
  return (
    <div ref={ref} className="relative">
      <button type="button" onClick={() => setOpen(!open)} aria-label="Konto" aria-expanded={open} className="rounded-full ring-offset-2 ring-offset-page hover:ring-2 hover:ring-card-line"><Avatar email={email} /></button>
      {open && (
        <div className="sheet-up absolute top-full right-0 z-50 mt-2 w-64 rounded-2xl border border-card-line bg-surface p-1.5 shadow-[0_12px_32px_rgba(16,24,40,.14)]">
          <div className="flex items-center gap-2.5 px-2.5 py-2"><Avatar email={email} size={34} /><span className="min-w-0"><b className="block truncate text-[14px]">{nameFromEmail(email)}</b><span className="block truncate text-[12px] text-muted">{email}</span></span></div>
          <div className="my-1 h-px bg-line" />
          <Link href="/profil" onClick={() => setOpen(false)} className={item}><UserRound size={16} /> Profil</Link>
          <Link href="/einstellungen" onClick={() => setOpen(false)} className={item}><Settings size={16} /> Einstellungen</Link>
          <button type="button" onClick={() => void supabase.auth.signOut()} className={`${item} text-negative-text`}><LogOut size={16} /> Abmelden</button>
        </div>
      )}
    </div>
  );
}
