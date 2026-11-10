-- Players can leave a session from their own phone. Run after player-page.sql. Safe to re-run.
-- Leaving is recorded as a counter on the player's check-in. The organizer's page sees the counter
-- rise on its next poll and moves that player to "Left", keeping their game count. A counter (not a
-- flag) lets a player leave again after the organizer returns them to the queue.
begin;
alter table sideout_private.arrivals add column if not exists leaves integer not null default 0;

-- Only the phone that checked in (holding the private device key) can leave as that player.
create or replace function public.sideout_leave(p_session uuid,p_id uuid,p_secret text)
returns jsonb language plpgsql security definer set search_path='' as $$
declare s sideout_private.sessions; n integer;
begin
 select * into s from sideout_private.sessions where id=p_session for update;
 if not found or s.closed or s.expires_at<now() then raise exception 'This session has ended.'; end if;
 update sideout_private.arrivals set leaves=leaves+1
  where session_id=p_session and id=p_id::text and p_secret is not null and request_hash=sha256(convert_to(p_secret,'UTF8'))
  returning leaves into n;
 if not found then raise exception 'Join from this phone to leave the session'; end if;
 return jsonb_build_object('leaves',n);
end $$;

-- Same as session-checkin.sql, plus each arrival's leave counter.
create or replace function public.sideout_poll(p_session uuid,p_owner text)
returns jsonb language plpgsql security definer set search_path='' as $$
declare s sideout_private.sessions; arrivals jsonb;
begin
 select * into s from sideout_private.sessions where id=p_session;
 if not found or p_owner is null or s.owner_hash<>sha256(convert_to(p_owner,'UTF8')) then raise exception 'Invalid organizer key'; end if;
 select coalesce(jsonb_agg(jsonb_build_object('id',id,'name',nickname,'leaves',leaves) order by sequence),'[]'::jsonb) into arrivals from sideout_private.arrivals where session_id=p_session;
 return jsonb_build_object('closed',s.closed or s.expires_at<now(),'arrivals',arrivals);
end $$;

-- Same as player-page.sql, plus the list of players who left, so their phones can show it.
create or replace function public.sideout_publish(p_session uuid,p_owner text,p_state jsonb)
returns void language plpgsql security definer set search_path='' as $$
begin
 if p_state is null or octet_length(p_state::text)>1000000 then raise exception 'Invalid player view'; end if;
 update sideout_private.sessions set live_state=jsonb_build_object('players',p_state->'players','queue',p_state->'queue','courts',p_state->'courts','completed',p_state->'completed','lineup',p_state->'lineup','next',p_state->'next','left',p_state->'left'),synced_at=now() where id=p_session and owner_hash=sha256(convert_to(p_owner,'UTF8'));
 if not found then raise exception 'Invalid organizer key'; end if;
end $$;

revoke all on function public.sideout_leave(uuid,uuid,text),public.sideout_poll(uuid,text),public.sideout_publish(uuid,text,jsonb) from public,anon,authenticated;
grant execute on function public.sideout_leave(uuid,uuid,text),public.sideout_poll(uuid,text),public.sideout_publish(uuid,text,jsonb) to anon;
commit;
