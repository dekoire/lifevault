"use client";
import { Bot, FileText, KeyRound, Users } from "lucide-react";
import { BackLink, PageHeader, TileMenu } from "@/components/ui";
import { useMe } from "@/lib/me";

/** Admin wie bei Finastry: Kacheln mit Unterseiten */
export default function AdminPage() {
  const { isAdmin } = useMe();
  if (!isAdmin) return <p className="py-20 text-center text-muted">Nur für Admins.</p>;
  return (
    <>
      <BackLink href="/einstellungen" label="Einstellungen" />
      <PageHeader title="Admin" subtitle="Benutzer und Einstellungen für alle" />
      <TileMenu tiles={[
        { href: "/admin/benutzer", title: "Benutzer", text: "Angemeldete Benutzer, Admin-Rechte", icon: <Users size={22} strokeWidth={1.75} /> },
        { href: "/admin/sicherheit", title: "Zwei-Faktor", text: "Für alle vorschreiben oder freiwillig", icon: <KeyRound size={22} strokeWidth={1.75} /> },
        { href: "/admin/ki", title: "KI-Modelle", text: "Welches Modell liest, chattet und sortiert Mails vor", icon: <Bot size={22} strokeWidth={1.75} /> },
        { href: "/admin/dokumente", title: "Dokumentansicht", text: "Welche Bereiche in einem Dokument sichtbar sind", icon: <FileText size={22} strokeWidth={1.75} /> },
      ]} />
    </>
  );
}
