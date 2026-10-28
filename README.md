# Lifevault

Dein Tresor für alle Unterlagen: Foto machen oder PDF hochladen – Lifevault liest alles aus, ordnet es einem Bereich zu, schreibt Key-Fakten und Fristen heraus und beantwortet dir jede Frage dazu, immer mit Quelle.

- `app/(auth)` – Anmelden, Registrieren
- `app/(app)` – Start (Hochladen, Fristen, Bereiche), Bereich, Dokument, Chat
- `app/api/process` – liest ein Dokument aus (Text, Bereich, Key-Fakten, Fristen, Beträge)
- `app/api/chat` – Chat über alle eigenen Dokumente
- `supabase/migrations` – Tabelle `documents`, Suche, Speicher, RLS
