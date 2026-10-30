-- Für die Liste „Verbundene Apps“: Webseite der Apps, mit denen der Nutzer verbunden ist (für das App-Icon).
-- oauth_apps selbst darf nur der Besitzer der App lesen.
create or replace function public.oauth_my_apps() returns table (app_id uuid, homepage text)
language sql stable security definer set search_path = public as $$
  select a.id, a.homepage from public.oauth_apps a join public.api_clients g on g.app_id = a.id
  where g.user_id = auth.uid() and public.mfa_ok();
$$;
revoke execute on function public.oauth_my_apps() from public, anon;
grant execute on function public.oauth_my_apps() to authenticated;
