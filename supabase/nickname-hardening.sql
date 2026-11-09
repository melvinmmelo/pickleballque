-- Run after session-checkin.sql (and after player-page.sql if installed). Safe to re-run.
-- Rejects nicknames with no visible characters. PostgreSQL's \s and trim() miss
-- no-break and zero-width spaces, which the organizer page treats as blank.
begin;
create or replace function sideout_private.clean_nickname(p_name text)
returns text language sql immutable set search_path='' as $$
 select case when regexp_replace(cleaned,'[\u0001-\u001f\u007f-\u009f­؜᠎​-‏‪-‮⁠-⁤⁦-⁯﻿]','','g')='' then null else cleaned end
 from (select btrim(regexp_replace(coalesce(p_name,''),'[\s\u0085   -     　﻿]+',' ','g'),' ') as cleaned) n
$$;
revoke all on function sideout_private.clean_nickname(text) from public,anon,authenticated;

create or replace function public.sideout_create(p_session uuid,p_owner text,p_players jsonb)
returns jsonb language plpgsql security definer set search_path='' as $$
declare s sideout_private.sessions; p jsonb; clean text;
begin
 if p_owner is null or length(p_owner)<64 then raise exception 'Invalid organizer key'; end if;
 if p_players is null or jsonb_typeof(p_players)<>'array' or jsonb_array_length(p_players)>200 then raise exception 'Session supports up to 200 players'; end if;
 delete from sideout_private.sessions where expires_at<now()-interval '7 days';
 if (select count(*) from sideout_private.sessions)>500 then raise exception 'Session capacity reached'; end if;
 insert into sideout_private.sessions(id,owner_hash) values(p_session,sha256(convert_to(p_owner,'UTF8'))) on conflict do nothing;
 select * into s from sideout_private.sessions where id=p_session for update;
 if s.owner_hash<>sha256(convert_to(p_owner,'UTF8')) then raise exception 'Invalid organizer key'; end if;
 if s.closed or s.expires_at<now() then raise exception 'Session closed or expired'; end if;
 for p in select value from jsonb_array_elements(p_players) loop
  clean=sideout_private.clean_nickname(p->>'name');
  if clean is not null and char_length(clean)<=30 and p->>'id' is not null then
   insert into sideout_private.arrivals(session_id,id,nickname) values(p_session,p->>'id',clean) on conflict do nothing;
  end if;
 end loop;
 return jsonb_build_object('expiresAt',s.expires_at);
end $$;

create or replace function public.sideout_join(p_session uuid,p_id uuid,p_name text)
returns jsonb language plpgsql security definer set search_path='' as $$
declare s sideout_private.sessions; a sideout_private.arrivals; clean text;
begin
 select * into s from sideout_private.sessions where id=p_session for update;
 if not found or s.closed or s.expires_at<now() then raise exception 'Session closed or expired. Ask the organizer for a new QR.'; end if;
 select * into a from sideout_private.arrivals where session_id=p_session and id=p_id::text;
 if found then return jsonb_build_object('name',a.nickname); end if;
 clean=sideout_private.clean_nickname(p_name);
 if clean is null or char_length(clean)>30 then raise exception 'Enter a nickname of 1–30 characters'; end if;
 if exists(select 1 from sideout_private.arrivals where session_id=p_session and lower(nickname)=lower(clean)) then raise exception 'Nickname already used. Choose a different nickname.'; end if;
 if (select count(*) from sideout_private.arrivals where session_id=p_session)>=200 then raise exception 'Session is full'; end if;
 insert into sideout_private.arrivals(session_id,id,nickname) values(p_session,p_id::text,clean);
 return jsonb_build_object('name',clean);
end $$;
revoke all on function public.sideout_create(uuid,text,jsonb),public.sideout_join(uuid,uuid,text) from public,anon,authenticated;
grant execute on function public.sideout_create(uuid,text,jsonb),public.sideout_join(uuid,uuid,text) to anon;
commit;
