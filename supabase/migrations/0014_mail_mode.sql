-- Weiterleitungsadresse: was gelesen wird – attachments = nur Anhänge; fallback = Anhänge, sonst Mailtext (z. B. Apple ohne PDF); both = Anhänge und Mailtext
alter table public.mail_inbox
  add column if not exists mode text not null default 'fallback' check (mode in ('attachments','fallback','both'));
