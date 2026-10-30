-- Wiederverwendung erkennen: Die Sperre muss bestehen bleiben. Eine Ausnahme (raise) würde sie mit zurückrollen –
-- deshalb hier sperren und einen Fehler als Ergebnis zurückgeben ({ "error": "invalid_grant" }); die Route macht daraus 400.
create or replace function public.oauth_exchange(p_client_id text, p_secret text, p_code text, p_verifier text, p_redirect text) returns jsonb
language plpgsql security definer set search_path = public as $$
declare a public.oauth_apps; k public.oauth_codes; g public.api_clients;
begin
  a := public.oauth_app_auth(p_client_id, p_secret);
  if p_verifier is null or p_verifier !~ '^[A-Za-z0-9._~-]{43,128}$' then raise exception 'invalid_grant'; end if;
  select * into k from public.oauth_codes where code_hash = encode(sha256(convert_to(coalesce(p_code, ''), 'UTF8')), 'hex') for update;
  if k.code_hash is null or k.app <> a.id or k.redirect_uri <> p_redirect or k.expires_at < now() then raise exception 'invalid_grant'; end if;
  if k.used_at is not null then
    update public.api_clients set revoked_at = now() where id = k.client and revoked_at is null;
    insert into public.api_audit (client, user_id, action, detail) select g2.id, g2.user_id, 'blocked', 'Code doppelt benutzt – Verbindung gesperrt' from public.api_clients g2 where g2.id = k.client;
    return jsonb_build_object('error', 'invalid_grant');
  end if;
  if rtrim(translate(encode(sha256(convert_to(p_verifier, 'UTF8')), 'base64'), '+/', '-_'), '=') <> k.challenge then raise exception 'invalid_grant'; end if;
  update public.oauth_codes set used_at = now() where code_hash = k.code_hash;
  select * into g from public.api_clients where id = k.client;
  if g.id is null or g.revoked_at is not null then raise exception 'invalid_grant'; end if;
  insert into public.api_audit (client, user_id, action, detail) values (g.id, g.user_id, 'token', 'Verbunden');
  return public.oauth_issue(g.id);
end $$;

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
    -- altes Erneuerungstoken noch einmal benutzt: gestohlen → Verbindung sperren (Trigger löscht alle Tokens)
    update public.api_clients set revoked_at = now() where id = g.id and revoked_at is null;
    insert into public.api_audit (client, user_id, action, detail) values (g.id, g.user_id, 'blocked', 'Erneuerungstoken doppelt benutzt – Verbindung gesperrt');
    return jsonb_build_object('error', 'invalid_grant');
  end if;
  if r.expires_at < now() or g.revoked_at is not null or (g.expires_at is not null and g.expires_at < now()) then raise exception 'invalid_grant'; end if;
  update public.oauth_refresh set used_at = now() where token_hash = r.token_hash;
  return public.oauth_issue(g.id);
end $$;
