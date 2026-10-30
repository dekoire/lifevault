-- „Mit Lifevault verbinden“ (OAuth 2.1, Authorization Code + PKCE S256) für andere Apps wie Finastry.
--
-- Ablauf: Die App schickt den Nutzer auf /connect. Er meldet sich an (oder registriert sich), sieht, was die App will,
-- wählt Projekte und bestätigt. Lifevault legt dafür eine Freigabe (Zeile in api_clients mit app_id) an und gibt der App
-- einen Einmal-Code (5 Minuten). Die App tauscht ihn auf ihrem Server mit ihrem Geheimnis und dem PKCE-Verifier gegen
-- ein Zugriffstoken (1 Stunde) und ein Erneuerungstoken (90 Tage, wird bei jeder Nutzung ersetzt). Die App sieht nie
-- das Passwort. Alle Prüfungen laufen hier in der Datenbank; gespeichert werden nur Hashes.

-- Registrierte Apps (wer eine App baut, legt sie unter Einstellungen › Verbundene Apps › Eigene App an)
create table public.oauth_apps (
  id uuid primary key default gen_random_uuid(),
  owner uuid not null default auth.uid() references auth.users(id) on delete cascade,
  name text not null check (length(name) between 1 and 60),
  description text check (length(description) <= 300),
  homepage text check (homepage ~ '^https://[^\s]{3,200}$'),
  client_id text not null unique check (client_id ~ '^lva_[a-z0-9]{24}$'),
  secret_hash text not null check (secret_hash ~ '^[0-9a-f]{64}$'),
  -- genau diese Adressen dürfen den Code empfangen (https, für Entwicklung auch http://localhost)
  redirect_uris text[] not null check (cardinality(redirect_uris) between 1 and 5),
  revoked_at timestamptz,
  created_at timestamptz not null default now()
);
create index oauth_apps_owner_idx on public.oauth_apps (owner);
alter table public.oauth_apps enable row level security;
create policy "own oauth apps" on public.oauth_apps for all to authenticated
  using (owner = (select auth.uid()) and (select public.mfa_ok())) with check (owner = (select auth.uid()));

create or replace function public.oauth_check_app() returns trigger
language plpgsql set search_path = public as $$
declare u text;
begin
  foreach u in array new.redirect_uris loop
    if not (u ~ '^https://[a-z0-9.-]+(:[0-9]+)?(/[^\s#?]*)?$' or u ~ '^http://localhost(:[0-9]+)?(/[^\s#?]*)?$') then
      raise exception 'Ungültige Rückleitungs-Adresse: %', u;
    end if;
  end loop;
  if tg_op = 'UPDATE' and new.owner is distinct from old.owner then raise exception 'Besitzer kann nicht geändert werden'; end if;
  return new;
end $$;
create trigger oauth_apps_check before insert or update on public.oauth_apps for each row execute function public.oauth_check_app();

-- Freigabe = Zeile in api_clients mit app_id (je Nutzer und App höchstens eine)
alter table public.api_clients
  add column app_id uuid references public.oauth_apps(id) on delete cascade,
  add column own_project uuid references public.projects(id) on delete set null,
  add column kinds text[],                                   -- null = alle Dokumentarten
  add column own_only boolean not null default false;        -- nur Dokumente, die die App selbst abgelegt hat (plus eigenes Projekt)
create unique index api_clients_user_app on public.api_clients (user_id, app_id) where app_id is not null;

-- welche App ein Dokument abgelegt hat
alter table public.documents add column source_client uuid references public.api_clients(id) on delete set null;

create table public.oauth_codes (
  code_hash text primary key,
  client uuid not null references public.api_clients(id) on delete cascade,
  app uuid not null references public.oauth_apps(id) on delete cascade,
  redirect_uri text not null,
  challenge text not null,
  expires_at timestamptz not null,
  used_at timestamptz
);
alter table public.oauth_codes enable row level security;

create table public.oauth_refresh (
  token_hash text primary key,
  client uuid not null references public.api_clients(id) on delete cascade,
  expires_at timestamptz not null,
  used_at timestamptz,
  created_at timestamptz not null default now()
);
create index oauth_refresh_client_idx on public.oauth_refresh (client);
alter table public.oauth_refresh enable row level security;

-- Dokumentart wie lib/kinds.ts (Reihenfolge zählt: das Erste, was passt; erst Art, dann Titel)
create or replace function public.doc_kind(p_type text, p_title text) returns text
language sql immutable set search_path = public as $$
  with k(ord, id, re) as (values
    (1, 'mahnung', 'mahnung|zahlungsaufforderung|vollstreck|zahlungsverzug|verwarnung|bußgeld|anhörung|inkasso|zahlschein'),
    (2, 'gehalt', 'gehalt|entgelt|arbeitslohn|lohnabrechnung|lohnsteuerbescheinigung|lohnzettel|bezüge|vergütungsabrechnung|verdienstabrechnung|sozialversicherungsnachweis|dienstzeit'),
    (3, 'medizin', 'arzt|befund|kranken(akte|haus)|entlass|operation|labor|überweisungsschein|rezept|attest|krankmeldung|arbeitsunfähig'),
    (4, 'ausweis', 'ausweis|reisepass|führerschein|\ykarte\y|karte\y|chipkarte|gesundheitskarte|debitkarte|kreditkarte'),
    (5, 'angebot', 'angebot|kostenvoranschlag|offerte'),
    (6, 'bescheid', 'bescheid|bescheinigung|meldebescheinigung|festsetzung'),
    (7, 'formular', 'formular|fragebogen|verzicht|verpflichtungserklärung|zählerstand|personalunterlage|onboarding'),
    (8, 'bedingungen', 'agb|geschäftsbedingung|bedingungen|belehrung|widerruf|datenschutz|merkblatt|information|hinweis|preisliste|preis- und leistung|leistungsbeschreibung|leistungsverzeichnis|erstinformation|ipid|vorvertraglich|broschüre|hausordnung|arbeitsordnung|richtlinie|stichwortverzeichnis|deckblatt|grundriss|mitteilung'),
    (9, 'rechnung', '(?<!an)rechnung|abrechnung|kassenbon|quittung|beleg|kontoauszug|umsatz|lohnsteuer|zahlungstermin|gutschrift'),
    (10, 'bestaetigung', 'bestätigung|kündigung|eingangs'),
    (11, 'vertrag', 'vertrag|police|versicherungsschein|mandat|antrag|eintrittserklärung|nachtrag|aufnahme'))
  select coalesce(
    (select id from k where lower(coalesce(p_type, '')) ~ re order by ord limit 1),
    (select id from k where lower(coalesce(p_title, '')) ~ re order by ord limit 1),
    'schreiben');
$$;

-- ===== bestehende Prüfungen erweitern =====

-- Projekte: wie bisher, dazu das eigene Projekt der App
create or replace function public.api_project_ok(c public.api_clients, p_project uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.projects p where p.id = p_project and p.user_id = c.user_id
    and (c.all_projects or p.all_apps or p.id = any (c.project_ids) or p.id = c.own_project));
$$;

-- Dokumente: dazu Dokumentart, „nur eigene“ und nie Tresor-Dokumente (Ende-zu-Ende verschlüsselt)
create or replace function public.api_doc_ok(c public.api_clients, d public.documents) returns boolean
language sql stable security definer set search_path = public as $$
  select d.user_id = c.user_id and d.status = 'ready' and not coalesce(d.encrypted, false)
    and public.api_project_ok(c, d.project_id)
    and (not c.own_only or d.source_client = c.id or d.project_id = c.own_project)
    and (c.clusters is null or d.cluster = any (c.clusters))
    and (c.kinds is null or public.doc_kind(d.doc_type, d.title) = any (c.kinds))
    and (c.allow_health or coalesce(d.cluster, '') <> 'gesundheit');
$$;

-- Anmeldung: zusätzlich gesperrte App
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
    select * into c from public.api_clients where client_id = split_part(p_cred, ':', 1) and secret_hash = h and app_id is null;
  end if;
  if c.id is null or c.revoked_at is not null or (c.expires_at is not null and c.expires_at < now()) then raise exception 'unauthorized'; end if;
  if c.app_id is not null and exists (select 1 from public.oauth_apps a where a.id = c.app_id and a.revoked_at is not null) then raise exception 'unauthorized'; end if;
  if p_write and not c.can_write then raise exception 'forbidden'; end if;
  if not p_write and not c.can_read and p_action not in ('token', 'whoami', 'file_own') then raise exception 'forbidden'; end if;
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

-- Hochladen: ohne Angabe ins eigene Projekt der App
create or replace function public.api_upload_check(p_cred text, p_project uuid default null) returns jsonb
language plpgsql security definer set search_path = public as $$
declare c public.api_clients; pid uuid;
begin
  c := public.api_auth(p_cred, 'upload', true);
  pid := coalesce(p_project, c.own_project, public.default_project(c.user_id));
  if not public.api_project_ok(c, pid) then
    if p_project is not null then raise exception 'forbidden_project'; end if;
    select p.id into pid from public.projects p where p.user_id = c.user_id and p.id = any (c.project_ids) order by p.created_at limit 1;
    if pid is null then raise exception 'forbidden_project'; end if;
  end if;
  return jsonb_build_object('project_id', pid);
end $$;

-- Ablegen: merkt sich, welche App das Dokument gebracht hat
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
  insert into public.documents (id, user_id, project_id, source_client, file_path, file_name, mime_type, size_bytes, status, cluster, title, doc_type, sender, sender_domain, doc_date, summary, key_facts, deadlines, amounts, tags, full_text)
  values (did, c.user_id, p_project, c.id, 'inbox/' || did, left(coalesce(nullif(p_file_name, ''), 'upload'), 200), p_mime, length(bytes), 'ready', cl,
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

-- Wer bin ich: dazu App, eigenes Projekt, Dokumentarten
create or replace function public.api_whoami(p_cred text) returns jsonb
language plpgsql security definer set search_path = public as $$
declare c public.api_clients;
begin
  c := public.api_auth(p_cred, 'whoami');
  return jsonb_build_object('app', c.name, 'client_id', case when c.app_id is null then c.client_id end,
    'permissions', jsonb_build_object('read', c.can_read, 'write', c.can_write, 'personal_data', c.allow_personal, 'health_data', c.allow_health, 'full_text', c.allow_personal and c.allow_full_text, 'own_only', c.own_only),
    'clusters', coalesce(to_jsonb(c.clusters), '"alle"'::jsonb),
    'kinds', coalesce(to_jsonb(c.kinds), '"alle"'::jsonb),
    'own_project', (select jsonb_build_object('id', p.id, 'name', p.name) from public.projects p where p.id = c.own_project),
    'projects', (select coalesce(jsonb_agg(jsonb_build_object('id', p.id, 'name', p.name) order by p.is_default desc, p.name), '[]'::jsonb) from public.projects p where p.user_id = c.user_id and public.api_project_ok(c, p.id)),
    'expires_at', c.expires_at);
end $$;

-- Suche: zusätzlich nach Dokumentart filterbar (neue Funktion; die alte api_search bleibt für ältere Aufrufer unverändert)
create or replace function public.api_search_v2(p_cred text, p_query text default null, p_project uuid default null, p_cluster text default null,
  p_since date default null, p_until date default null, p_archived boolean default false, p_limit int default 20, p_offset int default 0, p_kinds text[] default null) returns jsonb
language plpgsql security definer set search_path = public as $$
declare c public.api_clients; q text := nullif(trim(coalesce(p_query, '')), ''); lim int := least(greatest(coalesce(p_limit, 20), 1), 100);
begin
  c := public.api_auth(p_cred, 'search', false, q);
  return jsonb_build_object('documents', (select coalesce(jsonb_agg(public.api_doc_json(c, x, false) || jsonb_build_object('kind', public.doc_kind(x.doc_type, x.title))), '[]'::jsonb) from (
    select d.* from public.documents d
    where d.user_id = c.user_id and public.api_doc_ok(c, d)
      and (p_project is null or d.project_id = p_project)
      and (p_cluster is null or d.cluster = p_cluster)
      and (p_kinds is null or public.doc_kind(d.doc_type, d.title) = any (p_kinds))
      and (p_archived or not d.archived)
      and (p_since is null or coalesce(d.doc_date, d.received_at::date) >= p_since)
      and (p_until is null or coalesce(d.doc_date, d.received_at::date) <= p_until)
      and (q is null or (
        case when c.allow_personal and c.allow_full_text then d.fts @@ websearch_to_tsquery('german', q)
        else concat_ws(' ', d.title, d.sender, d.doc_type, d.summary, array_to_string(d.tags, ' ')) ilike '%' || replace(replace(q, '%', ''), '_', '') || '%' end))
    order by coalesce(d.doc_date, d.received_at::date) desc, d.received_at desc
    limit lim offset greatest(coalesce(p_offset, 0), 0)) x), 'limit', lim, 'offset', greatest(coalesce(p_offset, 0), 0));
end $$;

-- Original-Datei: Rechte prüfen. Liegt sie noch in der API-Inbox, kommt sie direkt; sonst nur der Pfad im eigenen
-- Ordner des Nutzers – den liest der Server dann gezielt (lib/apiFile.ts), nur nach dieser Prüfung.
create or replace function public.api_file(p_cred text, p_id uuid) returns jsonb
language plpgsql security definer set search_path = public as $$
declare c public.api_clients; d public.documents; b bytea;
begin
  c := public.api_auth(p_cred, 'file', false, p_id::text);
  select * into d from public.documents where id = p_id and user_id = c.user_id;
  if d.id is null or not public.api_doc_ok(c, d) then raise exception 'not_found'; end if;
  select data into b from public.api_inbox where document_id = d.id and user_id = c.user_id;
  if b is not null then return jsonb_build_object('name', d.file_name, 'mime', d.mime_type, 'data', encode(b, 'base64')); end if;
  if d.file_path is null or d.file_path not like c.user_id::text || '/%' then raise exception 'not_found'; end if;
  return jsonb_build_object('name', d.file_name, 'mime', d.mime_type, 'path', d.file_path);
end $$;

-- ===== OAuth =====

-- Für die Freigabe-Seite: App prüfen (gibt es sie, ist sie aktiv, passt die Rückleitungs-Adresse genau?)
create or replace function public.oauth_app_info(p_client_id text, p_redirect text) returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare a public.oauth_apps;
begin
  select * into a from public.oauth_apps where client_id = left(p_client_id, 40) and revoked_at is null;
  if a.id is null or not (p_redirect = any (a.redirect_uris)) then raise exception 'invalid_client'; end if;
  return jsonb_build_object('name', a.name, 'description', a.description, 'homepage', a.homepage);
end $$;

-- Bestehende Freigabe des angemeldeten Nutzers für diese App (zum Vorausfüllen)
create or replace function public.oauth_my_grant(p_client_id text) returns jsonb
language sql stable security definer set search_path = public as $$
  select to_jsonb(g) - 'secret_hash' - 'client_id' from public.api_clients g join public.oauth_apps a on a.id = g.app_id
  where a.client_id = left(p_client_id, 40) and g.user_id = auth.uid() and public.mfa_ok();
$$;

-- Nutzer bestätigt: Freigabe anlegen/aktualisieren, Einmal-Code ausgeben
create or replace function public.oauth_approve(p_client_id text, p_redirect text, p_challenge text,
  p_read boolean, p_write boolean, p_projects uuid[], p_own_project text, p_kinds text[], p_own_only boolean,
  p_personal boolean, p_health boolean) returns text
language plpgsql security definer set search_path = public as $$
declare a public.oauth_apps; uid uuid := auth.uid(); gid uuid; own uuid; code text; pname text := nullif(trim(coalesce(p_own_project, '')), '');
begin
  if uid is null or not public.mfa_ok() then raise exception 'unauthorized'; end if;
  select * into a from public.oauth_apps where client_id = left(p_client_id, 40) and revoked_at is null;
  if a.id is null or not (p_redirect = any (a.redirect_uris)) then raise exception 'invalid_client'; end if;
  if p_challenge !~ '^[A-Za-z0-9_-]{43}$' then raise exception 'invalid_request'; end if;
  if not (coalesce(p_read, false) or coalesce(p_write, false)) then raise exception 'invalid_request'; end if;
  if exists (select 1 from unnest(coalesce(p_projects, '{}')) x where not exists (select 1 from public.projects p where p.id = x and p.user_id = uid)) then raise exception 'forbidden_project'; end if;
  if p_kinds is not null and exists (select 1 from unnest(p_kinds) k where k not in ('mahnung','gehalt','medizin','ausweis','angebot','bescheid','formular','bedingungen','rechnung','bestaetigung','vertrag','schreiben')) then raise exception 'invalid_request'; end if;
  select id, own_project into gid, own from public.api_clients where user_id = uid and app_id = a.id;
  -- eigenes Projekt der App: bestehendes behalten, sonst auf Wunsch neu anlegen
  if pname is not null and (own is null or not exists (select 1 from public.projects where id = own and user_id = uid)) then
    insert into public.projects (user_id, name, description, kind) values (uid, left(pname, 80), left('Von ' || a.name || ' abgelegte Dokumente', 300), 'app') returning id into own;
  end if;
  if gid is null then
    insert into public.api_clients (user_id, name, client_id, secret_hash, app_id, can_read, can_write, project_ids, own_project, kinds, own_only, allow_personal, allow_health, expires_at)
    values (uid, a.name, 'lv_' || left(replace(gen_random_uuid()::text, '-', ''), 24), encode(sha256(convert_to(gen_random_uuid()::text || gen_random_uuid()::text, 'UTF8')), 'hex'),
      a.id, coalesce(p_read, false), coalesce(p_write, false), coalesce(p_projects, '{}'), own, p_kinds, coalesce(p_own_only, false), coalesce(p_personal, false), coalesce(p_health, false), null)
    returning id into gid;
  else
    update public.api_clients set name = a.name, can_read = coalesce(p_read, false), can_write = coalesce(p_write, false), project_ids = coalesce(p_projects, '{}'),
      own_project = own, kinds = p_kinds, own_only = coalesce(p_own_only, false), allow_personal = coalesce(p_personal, false), allow_health = coalesce(p_health, false),
      all_projects = false, revoked_at = null
    where id = gid;
  end if;
  code := 'lvc_' || replace(gen_random_uuid()::text, '-', '') || replace(gen_random_uuid()::text, '-', '');
  delete from public.oauth_codes where client = gid and (used_at is not null or expires_at < now());
  insert into public.oauth_codes (code_hash, client, app, redirect_uri, challenge, expires_at)
  values (encode(sha256(convert_to(code, 'UTF8')), 'hex'), gid, a.id, p_redirect, p_challenge, now() + interval '5 minutes');
  insert into public.api_audit (client, user_id, action, detail) values (gid, uid, 'connect', 'Freigabe erteilt');
  return code;
end $$;

-- intern: App mit Geheimnis prüfen
create or replace function public.oauth_app_auth(p_client_id text, p_secret text) returns public.oauth_apps
language plpgsql security definer set search_path = public as $$
declare a public.oauth_apps;
begin
  select * into a from public.oauth_apps where client_id = left(coalesce(p_client_id, ''), 40)
    and secret_hash = encode(sha256(convert_to(left(coalesce(p_secret, ''), 200), 'UTF8')), 'hex') and revoked_at is null;
  if a.id is null then raise exception 'invalid_client'; end if;
  return a;
end $$;
revoke execute on function public.oauth_app_auth(text, text) from public, anon, authenticated;

-- intern: neues Token-Paar
create or replace function public.oauth_issue(p_client uuid) returns jsonb
language plpgsql security definer set search_path = public as $$
declare t text; r text;
begin
  delete from public.api_tokens where client = p_client and expires_at < now();
  delete from public.oauth_refresh where client = p_client and (expires_at < now() or used_at < now() - interval '1 day');
  t := 'lvt_' || replace(gen_random_uuid()::text, '-', '') || replace(gen_random_uuid()::text, '-', '');
  r := 'lvr_' || replace(gen_random_uuid()::text, '-', '') || replace(gen_random_uuid()::text, '-', '');
  insert into public.api_tokens (token_hash, client, expires_at) values (encode(sha256(convert_to(t, 'UTF8')), 'hex'), p_client, now() + interval '1 hour');
  insert into public.oauth_refresh (token_hash, client, expires_at) values (encode(sha256(convert_to(r, 'UTF8')), 'hex'), p_client, now() + interval '90 days');
  return jsonb_build_object('access_token', t, 'token_type', 'Bearer', 'expires_in', 3600, 'refresh_token', r);
end $$;
revoke execute on function public.oauth_issue(uuid) from public, anon, authenticated;

-- Code gegen Token tauschen (Server der App: Geheimnis + PKCE-Verifier)
create or replace function public.oauth_exchange(p_client_id text, p_secret text, p_code text, p_verifier text, p_redirect text) returns jsonb
language plpgsql security definer set search_path = public as $$
declare a public.oauth_apps; k public.oauth_codes; g public.api_clients;
begin
  a := public.oauth_app_auth(p_client_id, p_secret);
  if p_verifier is null or p_verifier !~ '^[A-Za-z0-9._~-]{43,128}$' then raise exception 'invalid_grant'; end if;
  select * into k from public.oauth_codes where code_hash = encode(sha256(convert_to(coalesce(p_code, ''), 'UTF8')), 'hex') for update;
  if k.code_hash is null or k.app <> a.id or k.redirect_uri <> p_redirect or k.expires_at < now() then raise exception 'invalid_grant'; end if;
  if k.used_at is not null then
    -- Code doppelt benutzt: Angriffsversuch → Freigabe sperren
    update public.api_clients set revoked_at = now() where id = k.client;
    raise exception 'invalid_grant';
  end if;
  if rtrim(translate(encode(sha256(convert_to(p_verifier, 'UTF8')), 'base64'), '+/', '-_'), '=') <> k.challenge then raise exception 'invalid_grant'; end if;
  update public.oauth_codes set used_at = now() where code_hash = k.code_hash;
  select * into g from public.api_clients where id = k.client;
  if g.id is null or g.revoked_at is not null then raise exception 'invalid_grant'; end if;
  insert into public.api_audit (client, user_id, action, detail) values (g.id, g.user_id, 'token', 'Verbunden');
  return public.oauth_issue(g.id);
end $$;

-- Token erneuern (Erneuerungstoken wird ersetzt; ein altes zweimal benutzt = gestohlen → Freigabe sperren)
create or replace function public.oauth_refresh_token(p_client_id text, p_secret text, p_refresh text) returns jsonb
language plpgsql security definer set search_path = public as $$
declare a public.oauth_apps; r public.oauth_refresh; g public.api_clients;
begin
  a := public.oauth_app_auth(p_client_id, p_secret);
  select * into r from public.oauth_refresh where token_hash = encode(sha256(convert_to(coalesce(p_refresh, ''), 'UTF8')), 'hex') for update;
  if r.token_hash is null then raise exception 'invalid_grant'; end if;
  select * into g from public.api_clients where id = r.client;
  if g.id is null or g.app_id is distinct from a.id then raise exception 'invalid_grant'; end if;
  if r.used_at is not null then
    update public.api_clients set revoked_at = now() where id = g.id;
    delete from public.api_tokens where client = g.id;
    raise exception 'invalid_grant';
  end if;
  if r.expires_at < now() or g.revoked_at is not null or (g.expires_at is not null and g.expires_at < now()) then raise exception 'invalid_grant'; end if;
  update public.oauth_refresh set used_at = now() where token_hash = r.token_hash;
  return public.oauth_issue(g.id);
end $$;

-- App trennt die Verbindung selbst (z. B. „Trennen“ in Finastry)
create or replace function public.oauth_revoke(p_client_id text, p_secret text, p_token text) returns void
language plpgsql security definer set search_path = public as $$
declare a public.oauth_apps; gid uuid; h text := encode(sha256(convert_to(coalesce(p_token, ''), 'UTF8')), 'hex');
begin
  a := public.oauth_app_auth(p_client_id, p_secret);
  select coalesce((select t.client from public.api_tokens t where t.token_hash = h), (select r.client from public.oauth_refresh r where r.token_hash = h)) into gid;
  if gid is null or not exists (select 1 from public.api_clients where id = gid and app_id = a.id) then return; end if;
  update public.api_clients set revoked_at = now() where id = gid;
  delete from public.api_tokens where client = gid;
  delete from public.oauth_refresh where client = gid;
  insert into public.api_audit (client, user_id, action, detail) select gid, user_id, 'disconnect', 'Von der App getrennt' from public.api_clients where id = gid;
end $$;

-- Nutzer sperrt in Lifevault: Tokens sofort weg
create or replace function public.api_clients_revoked() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if new.revoked_at is not null and old.revoked_at is null then
    delete from public.api_tokens where client = new.id;
    delete from public.oauth_refresh where client = new.id;
  end if;
  return new;
end $$;
revoke execute on function public.api_clients_revoked() from public, anon, authenticated;
create trigger api_clients_revoked after update on public.api_clients for each row execute function public.api_clients_revoked();

revoke execute on function public.api_search_v2(text, text, uuid, text, date, date, boolean, int, int, text[]), public.api_file(text, uuid),
  public.oauth_app_info(text, text), public.oauth_exchange(text, text, text, text, text), public.oauth_refresh_token(text, text, text), public.oauth_revoke(text, text, text),
  public.oauth_my_grant(text), public.oauth_approve(text, text, text, boolean, boolean, uuid[], text, text[], boolean, boolean, boolean) from public;
grant execute on function public.api_search_v2(text, text, uuid, text, date, date, boolean, int, int, text[]), public.api_file(text, uuid),
  public.oauth_app_info(text, text), public.oauth_exchange(text, text, text, text, text), public.oauth_refresh_token(text, text, text), public.oauth_revoke(text, text, text) to anon, authenticated;
grant execute on function public.oauth_my_grant(text), public.oauth_approve(text, text, text, boolean, boolean, uuid[], text, text[], boolean, boolean, boolean) to authenticated;
