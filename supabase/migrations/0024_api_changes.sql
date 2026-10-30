-- Verbundene Apps holen nur noch, was sich geändert hat (statt jedes Mal alles), und werden angestupst, wenn es etwas Neues gibt.
--
-- 1. Änderungsabfrage: api_changes(cred, cursor) liefert neue und geänderte Dokumente sowie entfernte IDs (gelöscht,
--    archiviert oder nicht mehr freigegeben) in fester Reihenfolge (updated_at, id), seitenweise. Die Lesemarke (cursor)
--    hält die App; Lifevault merkt sich nicht, was eine App gelesen hat.
-- 2. Stups: Eine App hinterlegt eine https-Adresse und ein Geheimnis (api_set_webhook). Ändert sich ein Dokument des
--    Nutzers, wird die App vorgemerkt; ein Zeitplan schickt höchstens einmal pro Minute ein POST ohne Inhalt
--    ({"event": "documents.changed"}), signiert mit HMAC-SHA256 über „<unix>.<Inhalt>“ (Header X-Lifevault-Signature: t=<unix>,v1=<hex>).

-- updated_at bei jeder Änderung setzen (für die Reihenfolge der Änderungsabfrage)
create or replace function public.documents_touch() returns trigger language plpgsql as $$
begin
  new.updated_at := now();
  return new;
end $$;
drop trigger if exists documents_touch on public.documents;
create trigger documents_touch before update on public.documents for each row execute function public.documents_touch();
create index if not exists documents_changes_idx on public.documents (user_id, updated_at, id);

-- Gelöschte Dokumente merken (nur die ID), damit Apps sie entfernen können; 400 Tage aufbewahren
create table if not exists public.document_removed (
  id uuid not null,
  user_id uuid not null references auth.users(id) on delete cascade,
  removed_at timestamptz not null default now(),
  primary key (user_id, id)
);
create index if not exists document_removed_at_idx on public.document_removed (user_id, removed_at, id);
alter table public.document_removed enable row level security;

create or replace function public.documents_removed() returns trigger language plpgsql security definer set search_path = public as $$
begin
  insert into public.document_removed (id, user_id) values (old.id, old.user_id)
    on conflict (user_id, id) do update set removed_at = now();
  return old;
end $$;
drop trigger if exists documents_removed on public.documents;
create trigger documents_removed after delete on public.documents for each row execute function public.documents_removed();

-- Stups-Adresse je App-Zugang: nur https, kein Rechnername ohne Punkt, keine IP-Adresse, nichts Internes
alter table public.api_clients
  add column if not exists webhook_url text,
  add column if not exists webhook_secret text,
  add column if not exists webhook_pending boolean not null default false,
  add column if not exists webhook_sent_at timestamptz;
alter table public.api_clients drop constraint if exists api_clients_webhook_url_check;
alter table public.api_clients add constraint api_clients_webhook_url_check check (
  webhook_url is null or (
    length(webhook_url) <= 500
    and webhook_url ~ '^https://[a-z0-9][a-z0-9.-]*\.[a-z]{2,}(:443)?(/[^\s]*)?$'
    and webhook_url !~ '^https://[^/]*(localhost|\.local|\.internal|\.supabase\.co|\.supabase\.in)(/|:|$)'
  )
);
alter table public.api_clients drop constraint if exists api_clients_webhook_secret_check;
alter table public.api_clients add constraint api_clients_webhook_secret_check check (webhook_secret is null or length(webhook_secret) between 32 and 200);

-- Dokument geändert, neu oder gelöscht: Apps des Nutzers mit Stups-Adresse vormerken (einmal, nicht je Änderung)
create or replace function public.documents_mark_webhooks() returns trigger language plpgsql security definer set search_path = public as $$
declare u uuid := coalesce(new.user_id, old.user_id);
begin
  update public.api_clients set webhook_pending = true
    where user_id = u and webhook_url is not null and not webhook_pending and revoked_at is null and can_read;
  return null;
end $$;
drop trigger if exists documents_mark_webhooks on public.documents;
create trigger documents_mark_webhooks after insert or update or delete on public.documents for each row execute function public.documents_mark_webhooks();

-- Stups-Adresse setzen (oder mit leerer Adresse entfernen) – nur die App selbst für ihren Zugang
create or replace function public.api_set_webhook(p_cred text, p_url text, p_secret text) returns jsonb
language plpgsql security definer set search_path = public as $$
declare c public.api_clients;
begin
  c := public.api_auth(p_cred, 'webhook', false, left(p_url, 200));
  if nullif(trim(coalesce(p_url, '')), '') is null then
    update public.api_clients set webhook_url = null, webhook_secret = null, webhook_pending = false where id = c.id;
    return jsonb_build_object('webhook', null);
  end if;
  update public.api_clients set webhook_url = trim(p_url), webhook_secret = p_secret, webhook_pending = true where id = c.id;
  return jsonb_build_object('webhook', jsonb_build_object('url', trim(p_url)));
exception when check_violation then
  raise exception 'invalid_request';
end $$;

-- Änderungen seit der Lesemarke: Dokumente (sichtbar → documents, sonst → removed) und gelöschte IDs, nach (Zeit, ID)
-- Lesemarke: „<Zeitpunkt>|<ID>“ des letzten gelieferten Eintrags; leer = alles von Anfang an
create or replace function public.api_changes(p_cred text, p_cursor text default null, p_limit int default 100) returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  c public.api_clients;
  lim int := least(greatest(coalesce(p_limit, 100), 1), 200);
  at0 timestamptz := '-infinity';
  id0 uuid := '00000000-0000-0000-0000-000000000000';
  rows jsonb;
  more boolean;
  last_at timestamptz;
  last_id uuid;
begin
  c := public.api_auth(p_cred, 'changes', false, left(p_cursor, 100));
  if nullif(p_cursor, '') is not null then
    begin
      at0 := split_part(p_cursor, '|', 1)::timestamptz;
      id0 := split_part(p_cursor, '|', 2)::uuid;
    exception when others then
      raise exception 'invalid_request';
    end;
  end if;
  with ch as (
    select d.id, d.updated_at as at, d as doc, false as gone from public.documents d
      where d.user_id = c.user_id and (d.updated_at, d.id) > (at0, id0)
    union all
    select r.id, r.removed_at, null::public.documents, true from public.document_removed r
      where r.user_id = c.user_id and (r.removed_at, r.id) > (at0, id0)
  ), page as (
    select * from ch order by at, id limit lim + 1
  ), cut as (
    select * from page order by at, id limit lim
  )
  select
    jsonb_build_object(
      'documents', coalesce((select jsonb_agg(public.api_doc_json(c, x.doc, false) || jsonb_build_object('kind', public.doc_kind((x.doc).doc_type, (x.doc).title), 'updated_at', x.at) order by x.at, x.id)
        from cut x where not x.gone and not (x.doc).archived and public.api_doc_ok(c, x.doc)), '[]'::jsonb),
      'removed', coalesce((select jsonb_agg(x.id order by x.at, x.id)
        from cut x where x.gone or (x.doc).archived or not public.api_doc_ok(c, x.doc)), '[]'::jsonb)
    ),
    (select count(*) > lim from page),
    (select at from cut order by at desc, id desc limit 1),
    (select id from cut order by at desc, id desc limit 1)
  into rows, more, last_at, last_id;
  return rows || jsonb_build_object(
    'cursor', case when last_at is null then p_cursor else to_char(last_at at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.US"Z"') || '|' || last_id end,
    'more', more);
end $$;

revoke execute on function public.api_changes(text, text, int), public.api_set_webhook(text, text, text) from public;
grant execute on function public.api_changes(text, text, int), public.api_set_webhook(text, text, text) to anon, authenticated;
revoke execute on function public.documents_touch(), public.documents_removed(), public.documents_mark_webhooks() from public, anon, authenticated;

-- Stupse verschicken (Zeitplan jede Minute): je vorgemerkter App ein signiertes POST ohne Inhalt
create or replace function public.api_send_webhooks() returns int language plpgsql security definer set search_path = public, extensions as $$
declare r record; payload jsonb := '{"event":"documents.changed"}'; ts text; n int := 0;
begin
  delete from public.document_removed where removed_at < now() - interval '400 days';
  for r in update public.api_clients set webhook_pending = false, webhook_sent_at = now()
      where webhook_pending and webhook_url is not null and webhook_secret is not null and revoked_at is null
      returning webhook_url, webhook_secret loop
    ts := extract(epoch from now())::bigint::text;
    perform net.http_post(
      url := r.webhook_url,
      body := payload,
      headers := jsonb_build_object('Content-Type', 'application/json',
        'X-Lifevault-Signature', 't=' || ts || ',v1=' || encode(extensions.hmac(ts || '.' || payload::text, r.webhook_secret, 'sha256'), 'hex')),
      timeout_milliseconds := 5000);
    n := n + 1;
  end loop;
  return n;
end $$;
revoke execute on function public.api_send_webhooks() from public, anon, authenticated;

select cron.unschedule(jobid) from cron.job where jobname = 'lifevault-api-webhooks';
select cron.schedule('lifevault-api-webhooks', '* * * * *', 'select public.api_send_webhooks()');
