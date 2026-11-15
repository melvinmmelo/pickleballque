-- Players who left can rejoin with the same nickname from the phone they checked in on. Run after match-guesses.sql.
-- Safe to re-run. Rejoining is a counter on the check-in, like leaving. The organizer's page sees it rise on its
-- next poll and moves that player from "Left" to the end of the queue, keeping their game count.
-- Only the phone holding the player's private device key can rejoin as them. Typing a departed player's nickname
-- on another phone is still refused, so nobody can take over a player whose name is shown as Left; the organizer
-- can use Return for someone who lost their phone's check-in.
begin;
alter table sideout_private.arrivals add column if not exists rejoins integer not null default 0;

create or replace function public.sideout_rejoin(p_session uuid,p_id uuid,p_secret text)
returns jsonb language plpgsql security definer set search_path='' as $$
declare s sideout_private.sessions; n integer;
begin
 select * into s from sideout_private.sessions where id=p_session for update;
 if not found or s.closed or s.expires_at<now() then raise exception 'This session has ended.'; end if;
 if not exists(select 1 from sideout_private.arrivals where session_id=p_session and id=p_id::text and p_secret is not null and request_hash=sha256(convert_to(p_secret,'UTF8'))) then
  raise exception 'Join from this phone to rejoin the session';
 end if;
 if not (coalesce(s.live_state->'left','[]'::jsonb) ? p_id::text) then raise exception 'You’re already back in this session.'; end if;
 update sideout_private.arrivals set rejoins=rejoins+1 where session_id=p_session and id=p_id::text returning rejoins into n;
 return jsonb_build_object('rejoins',n);
end $$;

-- Same as match-guesses.sql, plus each arrival's rejoin counter.
create or replace function public.sideout_poll(p_session uuid,p_owner text)
returns jsonb language plpgsql security definer set search_path='' as $$
declare s sideout_private.sessions; arrivals jsonb;
begin
 select * into s from sideout_private.sessions where id=p_session;
 if not found or p_owner is null or s.owner_hash<>sha256(convert_to(p_owner,'UTF8')) then raise exception 'Invalid organizer key'; end if;
 select coalesce(jsonb_agg(jsonb_build_object('id',id,'name',nickname,'leaves',leaves,'rejoins',rejoins) order by sequence),'[]'::jsonb) into arrivals from sideout_private.arrivals where session_id=p_session;
 return jsonb_build_object('closed',s.closed or s.expires_at<now(),'arrivals',arrivals,'guesses',sideout_private.guess_counts(p_session,s.live_state));
end $$;

revoke all on function public.sideout_rejoin(uuid,uuid,text),public.sideout_poll(uuid,text) from public,anon,authenticated;
grant execute on function public.sideout_rejoin(uuid,uuid,text),public.sideout_poll(uuid,text) to anon;
commit;
