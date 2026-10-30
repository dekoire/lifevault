import { NotFound } from "@/components/NotFound";

/** unbekannte Adresse innerhalb der App */
export default function Missing() {
  return <NotFound title="Seite nicht gefunden" text="Diese Seite gibt es nicht. Geh einen Schritt zurück oder zur Startseite." />;
}
