-- Club branding for the player page. Run after player-page.sql. Safe to re-run.
-- The organizer sends colors and logos only when they change. Players see a version string on every
-- refresh and download the branding itself only when that version changes.
begin;
alter table sideout_private.sessions add column if not exists brand jsonb;
alter table sideout_private.sessions add column if not exists brand_version text;

-- Keep only known keys: four #rrggbb colors and two small base64 PNG/WebP/JPEG logos (no SVG, no URLs).
create or replace function sideout_private.clean_brand(p jsonb)
returns jsonb language plpgsql immutable set search_path='' as $$
declare k text; v text; colors jsonb='{}'::jsonb; result jsonb;
begin
 if p is null or jsonb_typeof(p)<>'object' then raise exception 'Invalid branding'; end if;
 if jsonb_typeof(p->'colors')='object' then
  foreach k in array array['court','kitchen','apron','accent'] loop
   v=p->'colors'->>k;
   if v is not null then
    if v !~ '^#[0-9A-Fa-f]{6}$' then raise exception 'Colors must be #rrggbb values'; end if;
    colors=colors||jsonb_build_object(k,lower(v));
   end if;
  end loop;
 end if;
 result=jsonb_build_object('colors',colors);
 foreach k in array array['clubLogo','courtLogo'] loop
  v=p->>k;
  if v is not null then
   if octet_length(v)>120000 or v !~ '^data:image/(png|webp|jpeg);base64,[A-Za-z0-9+/]+={0,2}$' then raise exception 'Logos must be PNG, WebP or JPEG images under about 90 KB'; end if;
   result=result||jsonb_build_object(k,v);
  end if;
 end loop;
 return result;
end $$;
revoke all on function sideout_private.clean_brand(jsonb) from public,anon,authenticated;

-- Organizer only. p_brand null clears branding.
create or replace function public.sideout_set_brand(p_session uuid,p_owner text,p_brand jsonb)
returns text language plpgsql security definer set search_path='' as $$
declare cleaned jsonb; version text;
begin
 if p_brand is not null and octet_length(p_brand::text)>260000 then raise exception 'Branding is too large'; end if;
 cleaned=case when p_brand is null or jsonb_typeof(p_brand)='null' then null else sideout_private.clean_brand(p_brand) end;
 version=case when cleaned is null then null else md5(cleaned::text) end;
 update sideout_private.sessions set brand=cleaned,brand_version=version
  where id=p_session and p_owner is not null and owner_hash=sha256(convert_to(p_owner,'UTF8'));
 if not found then raise exception 'Invalid organizer key'; end if;
 return version;
end $$;

-- Anyone with the session link, like the player view.
create or replace function public.sideout_brand(p_session uuid)
returns jsonb language plpgsql stable security definer set search_path='' as $$
declare s sideout_private.sessions;
begin
 select * into s from sideout_private.sessions where id=p_session;
 if not found then raise exception 'Session not found. Ask for a current QR.'; end if;
 return jsonb_build_object('version',s.brand_version,'brand',s.brand);
end $$;

-- Same as player-page.sql, plus brandVersion so players know when to fetch branding.
create or replace function public.sideout_player_view(p_session uuid)
returns jsonb language plpgsql stable security definer set search_path='' as $$
declare s sideout_private.sessions;
begin
 select * into s from sideout_private.sessions where id=p_session;
 if not found then raise exception 'Session not found. Ask for a current QR.'; end if;
 return jsonb_build_object('state',s.live_state,'updatedAt',s.synced_at,'closed',s.closed or s.expires_at<now(),'counts',s.custom_counts,'brandVersion',s.brand_version);
end $$;

revoke all on function public.sideout_set_brand(uuid,text,jsonb),public.sideout_brand(uuid),public.sideout_player_view(uuid) from public,anon,authenticated;
grant execute on function public.sideout_set_brand(uuid,text,jsonb),public.sideout_brand(uuid),public.sideout_player_view(uuid) to anon;
commit;
