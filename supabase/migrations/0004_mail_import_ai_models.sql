-- KI-Modelle je Aufgabe (Admin), leer = Standard aus lib/ai.ts
alter table public.app_settings add column if not exists ai_models jsonb not null default '{}'::jsonb;

-- Postfächer: letzter Abruf je Quelle (z. B. "gmail:name@gmail.com", "eml")
create table public.mail_sources (
  user_id uuid not null default auth.uid() references auth.users on delete cascade,
  source text not null check (char_length(source) <= 200),
  last_sync_at timestamptz,
  updated_at timestamptz not null default now(),
  primary key (user_id, source)
);
alter table public.mail_sources enable row level security;
create policy "mail_sources own" on public.mail_sources for all to authenticated
  using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));

-- Geprüfte Mails: nicht doppelt prüfen/importieren; Grund der KI und importierte Dokumente
create table public.mail_seen (
  user_id uuid not null default auth.uid() references auth.users on delete cascade,
  msg_id text not null check (char_length(msg_id) <= 300),
  source text not null check (char_length(source) <= 200),
  subject text check (char_length(subject) <= 500),
  sender text check (char_length(sender) <= 300),
  mail_date timestamptz,
  relevant boolean,
  reason text check (char_length(reason) <= 500),
  doc_ids uuid[] not null default '{}',
  created_at timestamptz not null default now(),
  primary key (user_id, msg_id)
);
alter table public.mail_seen enable row level security;
create policy "mail_seen own" on public.mail_seen for all to authenticated
  using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));
create index mail_seen_recent on public.mail_seen (user_id, created_at desc);

-- Partner zusammengeführt/umbenannt: alte Absender je Dokument, damit es rückgängig gemacht werden kann
create table public.partner_merges (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users on delete cascade,
  target_name text not null check (char_length(target_name) <= 300),
  target_domain text check (char_length(target_domain) <= 200),
  kind text not null default 'merge' check (kind in ('merge', 'rename')),
  entries jsonb not null default '[]'::jsonb,
  created_at timestamptz not null default now(),
  undone_at timestamptz
);
alter table public.partner_merges enable row level security;
create policy "partner_merges own" on public.partner_merges for all to authenticated
  using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));
create index partner_merges_recent on public.partner_merges (user_id, created_at desc);
