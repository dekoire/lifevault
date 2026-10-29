-- Profile (Spiegel von auth.users) mit Admin-Kennzeichen
create table public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  email text,
  is_admin boolean not null default false,
  created_at timestamptz not null default now(),
  last_sign_in_at timestamptz
);

create or replace function public.sync_profile() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  insert into public.profiles (id, email, created_at, last_sign_in_at)
  values (new.id, new.email, new.created_at, new.last_sign_in_at)
  on conflict (id) do update set email = excluded.email, last_sign_in_at = excluded.last_sign_in_at;
  return new;
end $$;
revoke execute on function public.sync_profile() from public, anon, authenticated;
create trigger on_auth_user_sync after insert or update of email, last_sign_in_at on auth.users for each row execute function public.sync_profile();
insert into public.profiles (id, email, created_at, last_sign_in_at) select id, email, created_at, last_sign_in_at from auth.users on conflict (id) do nothing;

create or replace function public.is_admin() returns boolean
language sql stable security definer set search_path = public as $$
  select coalesce((select is_admin from public.profiles where id = auth.uid()), false);
$$;
revoke execute on function public.is_admin() from public, anon;
grant execute on function public.is_admin() to authenticated;

alter table public.profiles enable row level security;
create policy "profile self or admin read" on public.profiles for select to authenticated using (id = (select auth.uid()) or (select public.is_admin()));
create policy "admin update profiles" on public.profiles for update to authenticated using ((select public.is_admin())) with check ((select public.is_admin()));
-- niemand entzieht sich selbst die Admin-Rechte oder vergibt sie sich selbst: nur über andere Admins
create or replace function public.guard_profile_update() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if new.id = auth.uid() and new.is_admin is distinct from old.is_admin then
    raise exception 'Eigene Admin-Rechte können nicht geändert werden';
  end if;
  new.email := old.email; new.created_at := old.created_at;
  return new;
end $$;
revoke execute on function public.guard_profile_update() from public, anon, authenticated;
create trigger profiles_guard before update on public.profiles for each row execute function public.guard_profile_update();

-- App-Einstellungen (eine Zeile): Zwei-Faktor-Pflicht, sichtbare Bereiche der Dokumentseite
create table public.app_settings (
  id int primary key default 1 check (id = 1),
  mfa_required boolean not null default false,
  doc_sections jsonb not null default '{"summary":true,"info":true,"facts":true,"deadlines":true,"amounts":true,"tags":true,"content":true,"original":true,"chat":true}'::jsonb,
  updated_at timestamptz not null default now()
);
insert into public.app_settings (id) values (1) on conflict do nothing;
alter table public.app_settings enable row level security;
create policy "settings read" on public.app_settings for select to authenticated using (true);
create policy "settings admin write" on public.app_settings for update to authenticated using ((select public.is_admin())) with check ((select public.is_admin()));

-- Zwei-Faktor serverseitig erzwingen, wenn eingeschaltet
create or replace function public.mfa_ok() returns boolean
language sql stable security definer set search_path = public as $$
  select not coalesce((select mfa_required from public.app_settings where id = 1), false) or coalesce(auth.jwt()->>'aal', 'aal1') = 'aal2';
$$;
grant execute on function public.mfa_ok() to authenticated;

-- Dokumente: Logo/Domain, Archiv, Verschlüsselung
alter table public.documents
  add column sender_domain text,
  add column archived boolean not null default false,
  add column archived_reason text,
  add column encrypted boolean not null default false,
  add column secret jsonb;

drop policy "own documents select" on public.documents;
drop policy "own documents insert" on public.documents;
drop policy "own documents update" on public.documents;
drop policy "own documents delete" on public.documents;
create policy "own documents select" on public.documents for select to authenticated using (user_id = (select auth.uid()) and (select public.mfa_ok()));
create policy "own documents insert" on public.documents for insert to authenticated with check (user_id = (select auth.uid()) and (select public.mfa_ok()));
create policy "own documents update" on public.documents for update to authenticated using (user_id = (select auth.uid()) and (select public.mfa_ok())) with check (user_id = (select auth.uid()));
create policy "own documents delete" on public.documents for delete to authenticated using (user_id = (select auth.uid()) and (select public.mfa_ok()));

drop policy "own files read" on storage.objects;
drop policy "own files insert" on storage.objects;
drop policy "own files delete" on storage.objects;
create policy "own files read" on storage.objects for select to authenticated using (bucket_id = 'documents' and (storage.foldername(name))[1] = (select auth.uid())::text and (select public.mfa_ok()));
create policy "own files insert" on storage.objects for insert to authenticated with check (bucket_id = 'documents' and (storage.foldername(name))[1] = (select auth.uid())::text and (select public.mfa_ok()));
create policy "own files update" on storage.objects for update to authenticated using (bucket_id = 'documents' and (storage.foldername(name))[1] = (select auth.uid())::text and (select public.mfa_ok()));
create policy "own files delete" on storage.objects for delete to authenticated using (bucket_id = 'documents' and (storage.foldername(name))[1] = (select auth.uid())::text and (select public.mfa_ok()));

-- Tresor (Verschlüsselung je Nutzer): Salz, Prüfwert, geschützte Bereiche
create table public.vaults (
  user_id uuid primary key default auth.uid() references auth.users(id) on delete cascade,
  salt text not null,
  verifier jsonb not null,
  protected_clusters text[] not null default '{gesundheit}',
  created_at timestamptz not null default now()
);
alter table public.vaults enable row level security;
create policy "own vault" on public.vaults for all to authenticated using (user_id = (select auth.uid()) and (select public.mfa_ok())) with check (user_id = (select auth.uid()));

-- Chats (Verlauf), optional zu einem Dokument
create table public.chats (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  doc_id uuid references public.documents(id) on delete cascade,
  title text not null default 'Neuer Chat',
  messages jsonb not null default '[]'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index chats_user_idx on public.chats (user_id, updated_at desc);
alter table public.chats enable row level security;
create policy "own chats" on public.chats for all to authenticated using (user_id = (select auth.uid()) and (select public.mfa_ok())) with check (user_id = (select auth.uid()));

-- Lebensprofil (aus den Dokumenten erstellt)
create table public.life_profiles (
  user_id uuid primary key default auth.uid() references auth.users(id) on delete cascade,
  data jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now()
);
alter table public.life_profiles enable row level security;
create policy "own life profile" on public.life_profiles for all to authenticated using (user_id = (select auth.uid()) and (select public.mfa_ok())) with check (user_id = (select auth.uid()));

create or replace function public.documents_fts_update() returns trigger
language plpgsql set search_path = public as $$
begin
  new.fts := to_tsvector('german', coalesce(new.title,'') || ' ' || coalesce(new.sender,'') || ' ' || coalesce(new.doc_type,'') || ' ' || coalesce(new.summary,'') || ' ' || coalesce(array_to_string(new.tags,' '),'') || ' ' || coalesce(new.key_facts::text,'') || ' ' || coalesce(new.full_text,''));
  new.updated_at := now();
  return new;
end $$;

-- Ersten Admin von Hand setzen (E-Mail eintragen):
-- update public.profiles set is_admin = true where email = '<deine E-Mail>';
