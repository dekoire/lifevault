-- Mail-Job ohne offene App: alle 15 Minuten /api/mail/cron (lib/mailjob.ts).
-- Adresse und Geheimnis liegen im Vault (vom Nutzer angelegt, nicht im Repo):
--   mail_cron_url    = https://<deine-domain>/api/mail/cron
--   mail_cron_secret = gleicher Wert wie CRON_SECRET in Vercel
-- Solange beide fehlen, tut der Zeitplan nichts.
create extension if not exists pg_cron;
create extension if not exists pg_net;
select cron.unschedule('mail-cron') where exists (select 1 from cron.job where jobname = 'mail-cron');
select cron.schedule(
  'mail-cron',
  '*/15 * * * *',
  $$
  select net.http_post(
    url := (select decrypted_secret from vault.decrypted_secrets where name = 'mail_cron_url'),
    headers := jsonb_build_object('Authorization', 'Bearer ' || (select decrypted_secret from vault.decrypted_secrets where name = 'mail_cron_secret'), 'Content-Type', 'application/json'),
    body := '{}'::jsonb,
    timeout_milliseconds := 300000
  ) where exists (select 1 from vault.decrypted_secrets where name = 'mail_cron_url')
    and exists (select 1 from vault.decrypted_secrets where name = 'mail_cron_secret')
    and exists (select 1 from public.mail_inbox where auto_sync and cardinality(allowed) > 0);
  $$
);
