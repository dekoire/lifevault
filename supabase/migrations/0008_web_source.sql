-- Dokumente aus der Internetrecherche: Quelle und letzte Prüfung (für die regelmäßige Aktualitätsprüfung)
alter table public.documents add column if not exists web_source jsonb
  check (web_source is null or (jsonb_typeof(web_source) = 'object' and pg_column_size(web_source) < 4000));
