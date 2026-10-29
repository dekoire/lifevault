-- Aufbereitete Ansicht je Dokument (KI, einmal erzeugt): drei Kacheln, wichtigste Frist, Inhalt, Kosten (Stand heute).
-- Nur für unverschlüsselte Dokumente – bei verschlüsselten bleibt der Inhalt im Tresor.
alter table public.documents add column if not exists view jsonb;
