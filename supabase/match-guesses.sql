-- Players guess which team wins a game in progress. Run after branding.sql and player-leave.sql. Safe to re-run.
-- Each game on court carries a random "game" id in the organizer's published state. Guesses are tied to that
-- id, so they close automatically when the game ends and never carry over to the next game on that court.
begin;
create table if not exists sideout_private.guesses (
 session_id uuid not null references sideout_private.sessions on delete cascade,
 game text not null check (char_length(game) between 1 and 64),
 player text not null,
 team text not null check (team in ('A','B')),
 updated_at timestamptz not null default now(),
 primary key(session_id,game,player)
);
alter table sideout_private.guesses enable row level security;
revoke all on sideout_private.guesses from public,anon,authenticated;

-- {"<game id>":{"A":n,"B":n}} for games currently on court in the given published state.
create or replace function sideout_private.guess_counts(p_session uuid,p_state jsonb)
returns jsonb language sql stable set search_path='' as $$
 select coalesce(jsonb_object_agg(t.game,jsonb_build_object('A',t.a,'B',t.b)),'{}'::jsonb) from (
  select g.game,count(*) filter (where g.team='A') a,count(*) filter (where g.team='B') b
  from sideout_private.guesses g
  where g.session_id=p_session and g.game in (
   select c->>'game' from jsonb_array_elements(case when jsonb_typeof(p_state->'courts')='array' then p_state->'courts' else '[]'::jsonb end) c where c->>'game' is not null)
  group by g.game) t
$$;
revoke all on function sideout_private.guess_counts(uuid,jsonb) from public,anon,authenticated;

-- One guess per player per game, changeable until the game ends. Requires the phone's device key.
-- Players in the game cannot guess on it.
create or replace function public.sideout_guess(p_session uuid,p_id uuid,p_secret text,p_game text,p_team text)
returns jsonb language plpgsql security definer set search_path='' as $$
declare s sideout_private.sessions; court jsonb;
begin
 select * into s from sideout_private.sessions where id=p_session;
 if not found or s.closed or s.expires_at<now() then raise exception 'This session has ended.'; end if;
 if p_team is null or p_team not in ('A','B') then raise exception 'Choose a team'; end if;
 if not exists(select 1 from sideout_private.arrivals where session_id=p_session and id=p_id::text and p_secret is not null and request_hash=sha256(convert_to(p_secret,'UTF8'))) then raise exception 'Join from this phone to guess'; end if;
 select c into court from jsonb_array_elements(case when jsonb_typeof(s.live_state->'courts')='array' then s.live_state->'courts' else '[]'::jsonb end) c
  where p_game is not null and c->>'game'=p_game limit 1;
 if court is null then raise exception 'This game has finished, so guesses are closed.'; end if;
 if coalesce(court->'current' ? p_id::text,false) then raise exception 'You’re playing in this game, so you can’t guess on it.'; end if;
 if (select count(*) from sideout_private.guesses where session_id=p_session)>=5000 then raise exception 'This session has reached its guess limit'; end if;
 insert into sideout_private.guesses(session_id,game,player,team) values(p_session,p_game,p_id::text,p_team)
  on conflict (session_id,game,player) do update set team=excluded.team,updated_at=now();
 return coalesce(sideout_private.guess_counts(p_session,s.live_state)->p_game,jsonb_build_object('A',0,'B',0));
end $$;

-- Same as player-leave.sql, plus guess counts for the organizer's courts.
create or replace function public.sideout_poll(p_session uuid,p_owner text)
returns jsonb language plpgsql security definer set search_path='' as $$
declare s sideout_private.sessions; arrivals jsonb;
begin
 select * into s from sideout_private.sessions where id=p_session;
 if not found or p_owner is null or s.owner_hash<>sha256(convert_to(p_owner,'UTF8')) then raise exception 'Invalid organizer key'; end if;
 select coalesce(jsonb_agg(jsonb_build_object('id',id,'name',nickname,'leaves',leaves) order by sequence),'[]'::jsonb) into arrivals from sideout_private.arrivals where session_id=p_session;
 return jsonb_build_object('closed',s.closed or s.expires_at<now(),'arrivals',arrivals,'guesses',sideout_private.guess_counts(p_session,s.live_state));
end $$;

-- Same as branding.sql, plus guess counts for players' phones.
create or replace function public.sideout_player_view(p_session uuid)
returns jsonb language plpgsql stable security definer set search_path='' as $$
declare s sideout_private.sessions;
begin
 select * into s from sideout_private.sessions where id=p_session;
 if not found then raise exception 'Session not found. Ask for a current QR.'; end if;
 return jsonb_build_object('state',s.live_state,'updatedAt',s.synced_at,'closed',s.closed or s.expires_at<now(),'counts',s.custom_counts,'brandVersion',s.brand_version,'guesses',sideout_private.guess_counts(p_session,s.live_state));
end $$;

revoke all on function public.sideout_guess(uuid,uuid,text,text,text),public.sideout_poll(uuid,text),public.sideout_player_view(uuid) from public,anon,authenticated;
grant execute on function public.sideout_guess(uuid,uuid,text,text,text),public.sideout_poll(uuid,text),public.sideout_player_view(uuid) to anon;
commit;
