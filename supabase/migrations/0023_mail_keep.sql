-- E-Mail-Import: welche Arten aus Mails behalten werden (Kaufbelege wie IKEA-Bestellungen standardmäßig nicht).
-- documents.from_mail markiert Dokumente aus dem Mail-Import; nach dem Auslesen prüft processDoc die Regeln (lib/mailkeep.ts).
alter table public.mail_inbox add column if not exists keep_rules jsonb;
alter table public.documents add column if not exists from_mail boolean not null default false;
