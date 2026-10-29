-- Von Hand (ent)archiviert: die Alterungsregeln (lib/aging.ts) lassen das Dokument dann in Ruhe
alter table public.documents add column if not exists archive_manual boolean not null default false;
