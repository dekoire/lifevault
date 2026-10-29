"use client";
import { Building2, Cable, FolderKanban, KeyRound, LockKeyhole, LogOut, ShieldCheck, UserRound } from "lucide-react";
import { PageHeader, TileMenu } from "@/components/ui";
import { useMe } from "@/lib/me";
import { supabase, useSession } from "@/lib/supabase";

/** Einstellungen als Kachel-Menü wie bei Finastry */
export default function SettingsPage() {
  const session = useSession();
  const { isAdmin } = useMe();
  return (
    <>
      <PageHeader title="Einstellungen" subtitle={session?.user.email} action={<button type="button" onClick={() => void supabase.auth.signOut()} className="inline-flex h-11 items-center gap-2 rounded-full bg-negative px-5 text-sm font-semibold text-white hover:brightness-105"><LogOut size={17} /> Abmelden</button>} />
      <TileMenu tiles={[
        { href: "/partner", title: "Partner", text: "Vertragspartner, Händler und alle Kunden- und Vertragsnummern", icon: <Building2 size={22} strokeWidth={1.75} /> },
        { href: "/einstellungen/projekte", title: "Projekte", text: "Unterlagen trennen, z. B. Steuer, Wohnung, Firma", icon: <FolderKanban size={22} strokeWidth={1.75} /> },
        { href: "/einstellungen/api", title: "API & MCP", text: "Andere Apps und KI-Agenten verbinden, Rechte festlegen", icon: <Cable size={22} strokeWidth={1.75} /> },
        { href: "/einstellungen/sicherheit", title: "Zwei-Faktor", text: "Code aus der Authenticator-App beim Anmelden", icon: <KeyRound size={22} strokeWidth={1.75} /> },
        { href: "/einstellungen/tresor", title: "Tresor & Verschlüsselung", text: "Bereiche oder einzelne Dateien Ende-zu-Ende verschlüsseln", icon: <LockKeyhole size={22} strokeWidth={1.75} /> },
        { href: "/einstellungen/konto", title: "Konto", text: "E-Mail, Passwort, Daten", icon: <UserRound size={22} strokeWidth={1.75} /> },
        ...(isAdmin ? [{ href: "/admin", title: "Admin", text: "Benutzer, Zwei-Faktor-Pflicht, Dokumentansicht", icon: <ShieldCheck size={22} strokeWidth={1.75} /> }] : []),
      ]} />
    </>
  );
}
