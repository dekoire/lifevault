-- Eigene Empfangsadresse: lv-<token>@finastry.com (Resend). Nur Mails von erlaubten Absendern werden übernommen.
create table public.mail_inbox (
  user_id uuid primary key default auth.uid() references auth.users on delete cascade,
  token text not null unique check (token ~ '^[a-z0-9]{8,32}$'),
  allowed text[] not null default '{}' check (cardinality(allowed) <= 20),
  auto_sync boolean not null default true,
  last_sync_at timestamptz,
  updated_at timestamptz not null default now()
);
alter table public.mail_inbox enable row level security;
create policy "mail_inbox own" on public.mail_inbox for all to authenticated
  using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));
