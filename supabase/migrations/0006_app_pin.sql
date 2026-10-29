-- App-Sperre mit PIN: Hash nur in der Datenbank (bcrypt), kein direkter Zugriff – nur über die Funktionen unten
create table public.app_pins (
  user_id uuid primary key references auth.users on delete cascade,
  pin_hash text not null,
  fails int not null default 0,
  updated_at timestamptz not null default now()
);
alter table public.app_pins enable row level security; -- keine Richtlinien: niemand liest die Tabelle direkt

create or replace function public.pin_status() returns boolean
language sql stable security definer set search_path = public, extensions as $$
  select exists (select 1 from public.app_pins where user_id = auth.uid());
$$;

-- PIN setzen/ändern; zum Ändern muss die alte stimmen
create or replace function public.pin_set(p_new text, p_current text default null) returns boolean
language plpgsql security definer set search_path = public, extensions as $$
declare h text;
begin
  if auth.uid() is null or p_new !~ '^[0-9]{4}$' then return false; end if;
  select pin_hash into h from public.app_pins where user_id = auth.uid();
  if h is not null and (p_current is null or crypt(p_current, h) <> h) then return false; end if;
  insert into public.app_pins (user_id, pin_hash, fails, updated_at) values (auth.uid(), crypt(p_new, gen_salt('bf', 8)), 0, now())
  on conflict (user_id) do update set pin_hash = excluded.pin_hash, fails = 0, updated_at = now();
  return true;
end $$;

-- PIN prüfen; nach 5 Fehlversuchen wird die PIN gelöscht (dann neu anmelden mit Passwort)
create or replace function public.pin_verify(p_pin text) returns jsonb
language plpgsql security definer set search_path = public, extensions as $$
declare h text; f int;
begin
  if auth.uid() is null then return jsonb_build_object('ok', false, 'left', 0); end if;
  select pin_hash, fails into h, f from public.app_pins where user_id = auth.uid() for update;
  if h is null then return jsonb_build_object('ok', true); end if;
  if crypt(coalesce(p_pin, ''), h) = h then
    update public.app_pins set fails = 0 where user_id = auth.uid();
    return jsonb_build_object('ok', true);
  end if;
  f := f + 1;
  if f >= 5 then
    delete from public.app_pins where user_id = auth.uid();
    return jsonb_build_object('ok', false, 'left', 0, 'signOut', true);
  end if;
  update public.app_pins set fails = f where user_id = auth.uid();
  return jsonb_build_object('ok', false, 'left', 5 - f);
end $$;

create or replace function public.pin_remove(p_current text) returns boolean
language plpgsql security definer set search_path = public, extensions as $$
declare h text;
begin
  select pin_hash into h from public.app_pins where user_id = auth.uid();
  if h is null or crypt(coalesce(p_current, ''), h) <> h then return false; end if;
  delete from public.app_pins where user_id = auth.uid();
  return true;
end $$;

revoke execute on function public.pin_status(), public.pin_set(text, text), public.pin_verify(text), public.pin_remove(text) from public, anon;
grant execute on function public.pin_status(), public.pin_set(text, text), public.pin_verify(text), public.pin_remove(text) to authenticated;
