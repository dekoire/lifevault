# Hinweise für Claude

- Lifevault: persönlicher Dokumenten-Tresor mit KI-Assistent. Next.js (App Router), Tailwind v4, Supabase (Projekt `kftviweirkiqwjcgcofq`, Frankfurt), KI über Vercel AI Gateway (auf Vercel per OIDC).
- UI-Sprache Deutsch, Design wie Finastry, Hauptfarbe Lila (#6d4aff), mobil zuerst.
- Datenzugriff nur im Namen des Nutzers (sein Token) – RLS auf `documents` und Storage-Bucket `documents` (Ordner = User-ID). Kein Service-Role-Key im Code.
  - Einzige Ausnahme: der Mail-Job ohne offene App (`lib/mailjob.ts`, `/api/mail/cron` mit `CRON_SECRET`). Nur dort `SUPABASE_SERVICE_ROLE_KEY`; jede Abfrage ausdrücklich auf `user_id` des Adress-Besitzers begrenzt. Funktionen, die er mitbenutzt (`lib/processDoc.ts`, `lib/rank.ts`, `lib/unify.ts`), filtern deshalb immer zusätzlich nach `user_id`.
- Geheimnisse nie ins Repo oder in den Chat.
- Vor jedem Push: `npx tsc --noEmit` und `npm run build`.
- Manuelle Schritte für den Nutzer immer fertig zum Kopieren mit Direktlinks.
- Pull Requests nach bestandener Prüfung (`npx tsc --noEmit`, `npm run build`) direkt mergen – nicht nachfragen.
