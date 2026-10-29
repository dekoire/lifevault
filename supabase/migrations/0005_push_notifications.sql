-- Mitteilungen bei Fristen: Geräte-Abos, Einstellungen, Warteschlange (vom Browser des Nutzers berechnet)
create extension if not exists pg_cron;
create extension if not exists pg_net;

create table public.push_subscriptions (
  endpoint text primary key check (char_length(endpoint) <= 1000),
  user_id uuid not null default auth.uid() references auth.users on delete cascade,
  p256dh text not null check (char_length(p256dh) <= 200),
  auth text not null check (char_length(auth) <= 100),
  created_at timestamptz not null default now()
);
alter table public.push_subscriptions enable row level security;
create policy "push_subscriptions own" on public.push_subscriptions for all to authenticated
  using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));

create table public.notify_settings (
  user_id uuid primary key default auth.uid() references auth.users on delete cascade,
  prefs jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now()
);
alter table public.notify_settings enable row level security;
create policy "notify_settings own" on public.notify_settings for all to authenticated
  using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));

create table public.push_queue (
  user_id uuid not null default auth.uid() references auth.users on delete cascade,
  key text not null check (char_length(key) <= 200),
  send_at timestamptz not null,
  title text not null check (char_length(title) <= 120),
  body text not null check (char_length(body) <= 300),
  url text not null default '/' check (char_length(url) <= 200),
  sent_at timestamptz,
  primary key (user_id, key)
);
alter table public.push_queue enable row level security;
create policy "push_queue own" on public.push_queue for all to authenticated
  using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));
create index push_queue_due on public.push_queue (send_at) where sent_at is null;

-- Für den stündlichen Versand: nur mit dem Geheimnis aus dem Supabase Vault („lifevault_cron“), das auch in Vercel als CRON_SECRET steht.
-- Kein Dienstschlüssel nötig: die Funktion gibt nur fällige Mitteilungen samt Geräte-Abo heraus und markiert sie als gesendet.
create or replace function public.push_claim(p_secret text)
returns table (endpoint text, p256dh text, auth text, title text, body text, url text, tag text)
language plpgsql security definer set search_path = public as $$
declare s text;
begin
  select decrypted_secret into s from vault.decrypted_secrets where name = 'lifevault_cron' limit 1;
  if s is null or p_secret is null or length(p_secret) < 16 or p_secret <> s then return; end if;
  return query
    with due as (
      update public.push_queue q set sent_at = now()
      where q.sent_at is null and q.send_at <= now() and q.send_at > now() - interval '3 days'
      returning q.user_id, q.key, q.title, q.body, q.url
    )
    select ps.endpoint, ps.p256dh, ps.auth, due.title, due.body, due.url, due.key
    from due join public.push_subscriptions ps on ps.user_id = due.user_id;
end $$;
revoke execute on function public.push_claim(text) from public;
grant execute on function public.push_claim(text) to anon, authenticated;

create or replace function public.push_drop(p_secret text, p_endpoint text)
returns void language plpgsql security definer set search_path = public as $$
declare s text;
begin
  select decrypted_secret into s from vault.decrypted_secrets where name = 'lifevault_cron' limit 1;
  if s is null or p_secret is null or p_secret <> s then return; end if;
  delete from public.push_subscriptions where endpoint = p_endpoint;
end $$;
revoke execute on function public.push_drop(text, text) from public;
grant execute on function public.push_drop(text, text) to anon, authenticated;

-- stündlich (Minute 5) den Versand auf Vercel anstoßen; das Geheimnis kommt zur Laufzeit aus dem Vault
select cron.schedule('lifevault-push', '5 * * * *', $$
  select net.http_post(
    url := 'https://lifevault-nu-mauve.vercel.app/api/push/cron',
    headers := jsonb_build_object('Authorization', 'Bearer ' || coalesce((select decrypted_secret from vault.decrypted_secrets where name = 'lifevault_cron' limit 1), '')),
    timeout_milliseconds := 30000
  );
$$);
