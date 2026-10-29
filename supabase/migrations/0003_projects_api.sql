-- Projekte: Dokumente gehören zu genau einem Projekt. „Meine Daten“ ist das Standardprojekt jedes Nutzers.
create table public.projects (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  name text not null check (length(name) between 1 and 80),
  description text check (length(description) <= 300),
  color text not null default '#6d4aff' check (color ~ '^#[0-9a-fA-F]{6}$'),
  is_default boolean not null default false,
  -- alle verbundenen Apps dürfen dieses Projekt lesen (jeweils nur im Rahmen ihrer eigenen Filter)
  all_apps boolean not null default false,
  kind text not null default 'personal' check (kind in ('personal','app')), -- persönlich oder für eine App
  created_at timestamptz not null default now()
);
create unique index projects_one_default on public.projects (user_id) where is_default;
create index projects_user_idx on public.projects (user_id);
alter table public.projects enable row level security;
create policy "own projects read" on public.projects for select to authenticated using (user_id = (select auth.uid()) and (select public.mfa_ok()));
create policy "own projects insert" on public.projects for insert to authenticated with check (user_id = (select auth.uid()) and not is_default and (select public.mfa_ok()));
create policy "own projects update" on public.projects for update to authenticated using (user_id = (select auth.uid()) and (select public.mfa_ok())) with check (user_id = (select auth.uid()));
create policy "own projects delete" on public.projects for delete to authenticated using (user_id = (select auth.uid()) and not is_default and (select public.mfa_ok()));

create or replace function public.guard_project_update() returns trigger
language plpgsql set search_path = public as $$
begin
  if new.is_default is distinct from old.is_default or new.user_id is distinct from old.user_id then
    raise exception 'Standardprojekt und Besitzer können nicht geändert werden';
  end if;
  return new;
end $$;
create trigger projects_guard before update on public.projects for each row execute function public.guard_project_update();

create or replace function public.default_project(p_user uuid) returns uuid
language plpgsql security definer set search_path = public as $$
declare pid uuid;
begin
  select id into pid from public.projects where user_id = p_user and is_default;
  if pid is null then
    insert into public.projects (user_id, name, description, is_default, all_apps)
    values (p_user, 'Meine Daten', 'Allgemeine Unterlagen – Grundlage für alle Apps', true, true)
    on conflict do nothing returning id into pid;
    if pid is null then select id into pid from public.projects where user_id = p_user and is_default; end if;
  end if;
  return pid;
end $$;
revoke execute on function public.default_project(uuid) from public, anon, authenticated;

-- für die App: Standardprojekt sicherstellen
create or replace function public.ensure_default_project() returns uuid
language sql security definer set search_path = public as $$ select public.default_project(auth.uid()) where auth.uid() is not null; $$;
revoke execute on function public.ensure_default_project() from public, anon;
grant execute on function public.ensure_default_project() to authenticated;

alter table public.documents
  add column project_id uuid references public.projects(id) on delete set null,
  add column split_from text;
create index documents_project_idx on public.documents (user_id, project_id);

-- Projekt fehlt → Standardprojekt; fremdes Projekt → Fehler
create or replace function public.documents_project() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if new.project_id is null then
    new.project_id := public.default_project(new.user_id);
  elsif not exists (select 1 from public.projects p where p.id = new.project_id and p.user_id = new.user_id) then
    raise exception 'Projekt gehört nicht zu diesem Konto';
  end if;
  return new;
end $$;
revoke execute on function public.documents_project() from public, anon, authenticated;
create trigger documents_project before insert or update on public.documents for each row execute function public.documents_project();

update public.documents set project_id = public.default_project(user_id) where project_id is null;

-- Verbundene Apps (API & MCP). Das Geheimnis erzeugt der Browser; gespeichert wird nur sein SHA-256-Hash.
create table public.api_clients (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  name text not null check (length(name) between 1 and 80),
  client_id text not null unique check (client_id ~ '^lv_[a-z0-9]{24}$'),
  secret_hash text not null check (secret_hash ~ '^[0-9a-f]{64}$'),
  can_read boolean not null default true,
  can_write boolean not null default false,
  all_projects boolean not null default false,
  project_ids uuid[] not null default '{}',
  clusters text[],                                  -- null = alle Bereiche
  allow_personal boolean not null default false,    -- personenbezogene Fakten (Name, Adresse, IBAN …)
  allow_health boolean not null default false,      -- Bereich Gesundheit
  allow_full_text boolean not null default false,   -- vollständiger Text (nur zusammen mit allow_personal)
  expires_at timestamptz,
  revoked_at timestamptz,
  last_used_at timestamptz,
  created_at timestamptz not null default now()
);
create index api_clients_user_idx on public.api_clients (user_id);
alter table public.api_clients enable row level security;
create policy "own api clients" on public.api_clients for all to authenticated using (user_id = (select auth.uid()) and (select public.mfa_ok())) with check (user_id = (select auth.uid()));

-- Kurzlebige Zugriffstoken (1 Stunde), nur als Hash
create table public.api_tokens (
  token_hash text primary key,
  client uuid not null references public.api_clients(id) on delete cascade,
  expires_at timestamptz not null
);
create index api_tokens_client_idx on public.api_tokens (client);
alter table public.api_tokens enable row level security;

-- Protokoll jedes Aufrufs (für Nutzer sichtbar) und Grundlage der Ratenbegrenzung
create table public.api_audit (
  id bigint generated always as identity primary key,
  client uuid not null references public.api_clients(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  at timestamptz not null default now(),
  action text not null,
  detail text
);
create index api_audit_client_idx on public.api_audit (client, at desc);
alter table public.api_audit enable row level security;
create policy "own api audit" on public.api_audit for select to authenticated using (user_id = (select auth.uid()) and (select public.mfa_ok()));

-- Original-Dateien, die über die API kamen: die App holt sie beim nächsten Öffnen in den eigenen Speicher
create table public.api_inbox (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  client uuid references public.api_clients(id) on delete set null,
  document_id uuid not null references public.documents(id) on delete cascade,
  file_name text not null,
  mime_type text not null,
  data bytea not null,
  created_at timestamptz not null default now()
);
alter table public.api_inbox enable row level security;
create policy "own api inbox" on public.api_inbox for all to authenticated using (user_id = (select auth.uid()) and (select public.mfa_ok())) with check (user_id = (select auth.uid()));

-- ===== API-Funktionen (Prüfung von Zugang, Rechten und Filtern in der Datenbank) =====

create or replace function public.api_auth(p_cred text, p_action text, p_write boolean default false, p_detail text default null)
returns public.api_clients
language plpgsql security definer set search_path = public as $$
declare c public.api_clients; h text; n int;
begin
  if p_cred is null or length(p_cred) > 300 then raise exception 'unauthorized'; end if;
  if p_cred like 'lvt\_%' then
    h := encode(sha256(convert_to(p_cred, 'UTF8')), 'hex');
    select a.* into c from public.api_tokens t join public.api_clients a on a.id = t.client where t.token_hash = h and t.expires_at > now();
  elsif p_cred like 'lv\_%:%' then
    h := encode(sha256(convert_to(split_part(p_cred, ':', 2), 'UTF8')), 'hex');
    select * into c from public.api_clients where client_id = split_part(p_cred, ':', 1) and secret_hash = h;
  end if;
  if c.id is null or c.revoked_at is not null or (c.expires_at is not null and c.expires_at < now()) then raise exception 'unauthorized'; end if;
  if p_write and not c.can_write then raise exception 'forbidden'; end if;
  if not p_write and not c.can_read and p_action not in ('token', 'whoami') then raise exception 'forbidden'; end if;
  select count(*) into n from public.api_audit where client = c.id and at > now() - interval '1 minute';
  if n >= 120 then raise exception 'rate_limited'; end if;
  if p_action = 'upload' then
    select count(*) into n from public.api_audit where client = c.id and action = 'upload' and at > now() - interval '1 hour';
    if n >= 60 then raise exception 'rate_limited'; end if;
  end if;
  insert into public.api_audit (client, user_id, action, detail) values (c.id, c.user_id, p_action, left(p_detail, 200));
  update public.api_clients set last_used_at = now() where id = c.id;
  return c;
end $$;
revoke execute on function public.api_auth(text, text, boolean, text) from public, anon, authenticated;

-- Welche Projekte darf die App sehen?
create or replace function public.api_project_ok(c public.api_clients, p_project uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.projects p where p.id = p_project and p.user_id = c.user_id
    and (c.all_projects or p.all_apps or p.id = any (c.project_ids)));
$$;
revoke execute on function public.api_project_ok(public.api_clients, uuid) from public, anon, authenticated;

create or replace function public.api_doc_ok(c public.api_clients, d public.documents) returns boolean
language sql stable security definer set search_path = public as $$
  select d.user_id = c.user_id and d.status = 'ready'
    and public.api_project_ok(c, d.project_id)
    and (c.clusters is null or d.cluster = any (c.clusters))
    and (c.allow_health or coalesce(d.cluster, '') <> 'gesundheit');
$$;
revoke execute on function public.api_doc_ok(public.api_clients, public.documents) from public, anon, authenticated;

-- Dokument als JSON, personenbezogene Fakten und Volltext nur mit Freigabe
create or replace function public.api_doc_json(c public.api_clients, d public.documents, p_full boolean) returns jsonb
language sql stable security definer set search_path = public as $$
  select jsonb_build_object(
    'id', d.id,
    'project', (select jsonb_build_object('id', p.id, 'name', p.name) from public.projects p where p.id = d.project_id),
    'cluster', d.cluster, 'title', d.title, 'doc_type', d.doc_type, 'sender', d.sender, 'sender_domain', d.sender_domain,
    'doc_date', d.doc_date, 'received_at', d.received_at, 'file_name', d.file_name, 'mime_type', d.mime_type,
    'archived', d.archived, 'archived_reason', d.archived_reason, 'encrypted', d.encrypted,
    'summary', d.summary, 'tags', to_jsonb(d.tags), 'deadlines', d.deadlines, 'amounts', d.amounts,
    'key_facts', (select coalesce(jsonb_agg(f), '[]'::jsonb) from jsonb_array_elements(coalesce(d.key_facts, '[]'::jsonb)) f
      where c.allow_personal or not (
        coalesce((f ->> 'personal')::boolean, false)
        or coalesce(f ->> 'group', '') ~* '(persönlich|personal|kontakt|patient)'
        or coalesce(f ->> 'label', '') ~* '(name|adresse|anschrift|straße|wohnort|geburt|iban|bic|kontonummer|konto|sv-?nummer|sozialversicherung|steuer-?id|identifikationsnummer|personalnummer|versichertennummer|kundennummer|vertragsnummer|telefon|rufnummer|e-?mail|patient)'
      )),
    'redacted', jsonb_build_object('personal', not c.allow_personal, 'full_text', not (c.allow_personal and c.allow_full_text))
  ) || case when p_full and c.allow_personal and c.allow_full_text then jsonb_build_object('full_text', d.full_text) else '{}'::jsonb end;
$$;
revoke execute on function public.api_doc_json(public.api_clients, public.documents, boolean) from public, anon, authenticated;

-- Zugriffstoken holen (OAuth2 Client Credentials)
create or replace function public.api_token(p_client_id text, p_client_secret text) returns jsonb
language plpgsql security definer set search_path = public as $$
declare c public.api_clients; t text;
begin
  c := public.api_auth(p_client_id || ':' || p_client_secret, 'token');
  delete from public.api_tokens where client = c.id and expires_at < now();
  t := 'lvt_' || replace(gen_random_uuid()::text, '-', '') || replace(gen_random_uuid()::text, '-', '');
  insert into public.api_tokens (token_hash, client, expires_at) values (encode(sha256(convert_to(t, 'UTF8')), 'hex'), c.id, now() + interval '1 hour');
  return jsonb_build_object('access_token', t, 'token_type', 'Bearer', 'expires_in', 3600);
end $$;

create or replace function public.api_whoami(p_cred text) returns jsonb
language plpgsql security definer set search_path = public as $$
declare c public.api_clients;
begin
  c := public.api_auth(p_cred, 'whoami');
  return jsonb_build_object('app', c.name, 'client_id', c.client_id,
    'permissions', jsonb_build_object('read', c.can_read, 'write', c.can_write, 'personal_data', c.allow_personal, 'health_data', c.allow_health, 'full_text', c.allow_personal and c.allow_full_text),
    'clusters', coalesce(to_jsonb(c.clusters), '"alle"'::jsonb),
    'projects', (select coalesce(jsonb_agg(jsonb_build_object('id', p.id, 'name', p.name) order by p.is_default desc, p.name), '[]'::jsonb) from public.projects p where p.user_id = c.user_id and public.api_project_ok(c, p.id)),
    'expires_at', c.expires_at);
end $$;

create or replace function public.api_list_projects(p_cred text) returns jsonb
language plpgsql security definer set search_path = public as $$
declare c public.api_clients;
begin
  c := public.api_auth(p_cred, 'projects');
  return (select coalesce(jsonb_agg(jsonb_build_object('id', p.id, 'name', p.name, 'description', p.description, 'is_default', p.is_default,
    'documents', (select count(*) from public.documents d where d.project_id = p.id and public.api_doc_ok(c, d))) order by p.is_default desc, p.name), '[]'::jsonb)
    from public.projects p where p.user_id = c.user_id and public.api_project_ok(c, p.id));
end $$;

create or replace function public.api_search(p_cred text, p_query text default null, p_project uuid default null, p_cluster text default null,
  p_since date default null, p_until date default null, p_archived boolean default false, p_limit int default 20, p_offset int default 0) returns jsonb
language plpgsql security definer set search_path = public as $$
declare c public.api_clients; q text := nullif(trim(coalesce(p_query, '')), ''); lim int := least(greatest(coalesce(p_limit, 20), 1), 100);
begin
  c := public.api_auth(p_cred, 'search', false, q);
  return jsonb_build_object('documents', (select coalesce(jsonb_agg(public.api_doc_json(c, x, false)), '[]'::jsonb) from (
    select d.* from public.documents d
    where d.user_id = c.user_id and public.api_doc_ok(c, d)
      and (p_project is null or d.project_id = p_project)
      and (p_cluster is null or d.cluster = p_cluster)
      and (p_archived or not d.archived)
      and (p_since is null or coalesce(d.doc_date, d.received_at::date) >= p_since)
      and (p_until is null or coalesce(d.doc_date, d.received_at::date) <= p_until)
      and (q is null or (
        -- ohne Freigabe für persönliche Daten nur in Titel, Absender, Art, Zusammenfassung und Schlagworten suchen
        case when c.allow_personal and c.allow_full_text then d.fts @@ websearch_to_tsquery('german', q)
        else concat_ws(' ', d.title, d.sender, d.doc_type, d.summary, array_to_string(d.tags, ' ')) ilike '%' || replace(replace(q, '%', ''), '_', '') || '%' end))
    order by coalesce(d.doc_date, d.received_at::date) desc, d.received_at desc
    limit lim offset greatest(coalesce(p_offset, 0), 0)) x), 'limit', lim, 'offset', greatest(coalesce(p_offset, 0), 0));
end $$;

create or replace function public.api_get_document(p_cred text, p_id uuid) returns jsonb
language plpgsql security definer set search_path = public as $$
declare c public.api_clients; d public.documents;
begin
  c := public.api_auth(p_cred, 'get', false, p_id::text);
  select * into d from public.documents where id = p_id and user_id = c.user_id;
  if d.id is null or not public.api_doc_ok(c, d) then raise exception 'not_found'; end if;
  return public.api_doc_json(c, d, true);
end $$;

-- Rechte für das Hochladen prüfen, bevor die KI arbeitet
create or replace function public.api_upload_check(p_cred text, p_project uuid default null) returns jsonb
language plpgsql security definer set search_path = public as $$
declare c public.api_clients; pid uuid;
begin
  c := public.api_auth(p_cred, 'upload', true);
  pid := coalesce(p_project, public.default_project(c.user_id));
  if not public.api_project_ok(c, pid) then
    if p_project is not null then raise exception 'forbidden_project'; end if;
    select p.id into pid from public.projects p where p.user_id = c.user_id and p.id = any (c.project_ids) order by p.created_at limit 1;
    if pid is null then raise exception 'forbidden_project'; end if;
  end if;
  return jsonb_build_object('project_id', pid);
end $$;

-- Ausgelesenes Dokument speichern; die Original-Datei wartet in der Inbox auf die App
create or replace function public.api_upload(p_cred text, p_project uuid, p_file_name text, p_mime text, p_data text, p_doc jsonb) returns jsonb
language plpgsql security definer set search_path = public as $$
declare c public.api_clients; bytes bytea; did uuid := gen_random_uuid(); d public.documents; cl text;
begin
  c := public.api_auth(p_cred, 'upload_save', true, p_file_name);
  if not public.api_project_ok(c, p_project) then raise exception 'forbidden_project'; end if;
  if p_mime not in ('application/pdf', 'image/jpeg', 'image/png', 'image/webp', 'text/plain', 'text/markdown') then raise exception 'unsupported_type'; end if;
  bytes := decode(p_data, 'base64');
  if length(bytes) = 0 or length(bytes) > 10485760 then raise exception 'too_large'; end if;
  cl := p_doc ->> 'cluster';
  if cl is null or cl not in ('gesundheit','rechnungen','belege','vertraege','arbeit','versicherungen','wohnen','steuer','mobilitaet','finanzen','angebote','persoenlich','sonstiges') then cl := 'sonstiges'; end if;
  insert into public.documents (id, user_id, project_id, file_path, file_name, mime_type, size_bytes, status, cluster, title, doc_type, sender, sender_domain, doc_date, summary, key_facts, deadlines, amounts, tags, full_text)
  values (did, c.user_id, p_project, 'inbox/' || did, left(coalesce(nullif(p_file_name, ''), 'upload'), 200), p_mime, length(bytes), 'ready', cl,
    left(p_doc ->> 'title', 200), left(p_doc ->> 'doc_type', 80), left(p_doc ->> 'sender', 200),
    case when p_doc ->> 'sender_domain' ~ '^[a-z0-9.-]+\.[a-z]{2,}$' then p_doc ->> 'sender_domain' end,
    case when p_doc ->> 'doc_date' ~ '^\d{4}-\d{2}-\d{2}$' then (p_doc ->> 'doc_date')::date end,
    left(p_doc ->> 'summary', 2000),
    case when jsonb_typeof(p_doc -> 'key_facts') = 'array' then p_doc -> 'key_facts' else '[]'::jsonb end,
    case when jsonb_typeof(p_doc -> 'deadlines') = 'array' then p_doc -> 'deadlines' else '[]'::jsonb end,
    case when jsonb_typeof(p_doc -> 'amounts') = 'array' then p_doc -> 'amounts' else '[]'::jsonb end,
    coalesce((select array_agg(left(t, 40)) from jsonb_array_elements_text(case when jsonb_typeof(p_doc -> 'tags') = 'array' then p_doc -> 'tags' else '[]'::jsonb end) t), '{}'),
    p_doc ->> 'full_text');
  insert into public.api_inbox (user_id, client, document_id, file_name, mime_type, data) values (c.user_id, c.id, did, left(coalesce(nullif(p_file_name, ''), 'upload'), 200), p_mime, bytes);
  select * into d from public.documents where id = did;
  return jsonb_build_object('id', did, 'visible', public.api_doc_ok(c, d), 'document', case when public.api_doc_ok(c, d) then public.api_doc_json(c, d, false) end);
end $$;

revoke execute on function public.api_token(text, text), public.api_whoami(text), public.api_list_projects(text),
  public.api_search(text, text, uuid, text, date, date, boolean, int, int), public.api_get_document(text, uuid),
  public.api_upload_check(text, uuid), public.api_upload(text, uuid, text, text, text, jsonb) from public;
grant execute on function public.api_token(text, text), public.api_whoami(text), public.api_list_projects(text),
  public.api_search(text, text, uuid, text, date, date, boolean, int, int), public.api_get_document(text, uuid),
  public.api_upload_check(text, uuid), public.api_upload(text, uuid, text, text, text, jsonb) to anon, authenticated;
