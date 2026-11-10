-- Sponsor banners for the player page. Run after match-guesses.sql. Safe to re-run.
-- The organizer sends banners only when they change; players see a version on every refresh and
-- download the banners themselves only when that version changes.
begin;
alter table sideout_private.sessions add column if not exists sponsors jsonb;
alter table sideout_private.sessions add column if not exists sponsors_version text;

-- Up to 6 banners, each a small base64 PNG/WebP/JPEG, a 1–60 character name, and an optional https link.
create or replace function sideout_private.clean_sponsors(p jsonb)
returns jsonb language plpgsql immutable set search_path='' as $$
declare item jsonb; result jsonb='[]'::jsonb; img text; nm text; lnk text;
begin
 if p is null or jsonb_typeof(p)<>'array' then raise exception 'Invalid sponsor banners'; end if;
 if jsonb_array_length(p)>6 then raise exception 'You can have up to 6 sponsor banners'; end if;
 for item in select value from jsonb_array_elements(p) loop
  if jsonb_typeof(item)<>'object' then raise exception 'Invalid sponsor banner'; end if;
  img=item->>'image';
  nm=btrim(regexp_replace(coalesce(item->>'name',''),'\s+',' ','g'));
  lnk=nullif(btrim(coalesce(item->>'link','')),'');
  if img is null or octet_length(img)>140000 or img !~ '^data:image/(png|webp|jpeg);base64,[A-Za-z0-9+/]+={0,2}$' then raise exception 'Banners must be PNG, WebP or JPEG images under about 100 KB'; end if;
  if char_length(nm) not between 1 and 60 then raise exception 'Each banner needs a sponsor name of 1–60 characters'; end if;
  if lnk is not null and (char_length(lnk)>208 or lnk !~ '^https://[^[:space:]"''<>\\]+$') then raise exception 'Sponsor links must start with https://'; end if;
  result=result||jsonb_build_array(jsonb_build_object('image',img,'name',nm,'link',lnk));
 end loop;
 return result;
end $$;
revoke all on function sideout_private.clean_sponsors(jsonb) from public,anon,authenticated;

-- Organizer only. Null or an empty list clears the banners.
create or replace function public.sideout_set_sponsors(p_session uuid,p_owner text,p_sponsors jsonb)
returns text language plpgsql security definer set search_path='' as $$
declare cleaned jsonb; version text;
begin
 if p_sponsors is not null and octet_length(p_sponsors::text)>850000 then raise exception 'Sponsor banners are too large'; end if;
 cleaned=case when p_sponsors is null or jsonb_typeof(p_sponsors)='null' or (jsonb_typeof(p_sponsors)='array' and jsonb_array_length(p_sponsors)=0) then null else sideout_private.clean_sponsors(p_sponsors) end;
 version=case when cleaned is null then null else md5(cleaned::text) end;
 update sideout_private.sessions set sponsors=cleaned,sponsors_version=version
  where id=p_session and p_owner is not null and owner_hash=sha256(convert_to(p_owner,'UTF8'));
 if not found then raise exception 'Invalid organizer key'; end if;
 return version;
end $$;

-- Anyone with the session link, like the player view.
create or replace function public.sideout_sponsors(p_session uuid)
returns jsonb language plpgsql stable security definer set search_path='' as $$
declare s sideout_private.sessions;
begin
 select * into s from sideout_private.sessions where id=p_session;
 if not found then raise exception 'Session not found. Ask for a current QR.'; end if;
 return jsonb_build_object('version',s.sponsors_version,'sponsors',coalesce(s.sponsors,'[]'::jsonb));
end $$;

-- Same as match-guesses.sql, plus sponsorsVersion so phones know when to fetch banners.
create or replace function public.sideout_player_view(p_session uuid)
returns jsonb language plpgsql stable security definer set search_path='' as $$
declare s sideout_private.sessions;
begin
 select * into s from sideout_private.sessions where id=p_session;
 if not found then raise exception 'Session not found. Ask for a current QR.'; end if;
 return jsonb_build_object('state',s.live_state,'updatedAt',s.synced_at,'closed',s.closed or s.expires_at<now(),'counts',s.custom_counts,'brandVersion',s.brand_version,'guesses',sideout_private.guess_counts(p_session,s.live_state),'sponsorsVersion',s.sponsors_version);
end $$;

revoke all on function public.sideout_set_sponsors(uuid,text,jsonb),public.sideout_sponsors(uuid),public.sideout_player_view(uuid) from public,anon,authenticated;
grant execute on function public.sideout_set_sponsors(uuid,text,jsonb),public.sideout_sponsors(uuid),public.sideout_player_view(uuid) to anon;
commit;
