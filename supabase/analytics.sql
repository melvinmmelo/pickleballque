-- Anonymous usage analytics for the developer dashboard (analytics.html). Run after sponsors.sql. Safe to re-run.
-- The app sends small events: page visits, seconds the page was on screen, and app actions. Events carry a random
-- per-browser id and a random per-visit id, never names, nicknames, or IP addresses. Events older than 400 days
-- are deleted. Reading requires the developer key; only its SHA-256 hash is stored, in sideout_private.settings:
--   insert into sideout_private.settings(key,value) values('analytics_key_hash','<sha256 hex of the key>')
--   on conflict (key) do update set value=excluded.value;
begin;
create table if not exists sideout_private.events (
 id bigint generated always as identity primary key,
 occurred_at timestamptz not null default now(),
 kind text not null,
 page text not null check (page in ('organizer','player')),
 device uuid,
 visit uuid not null,
 seconds integer not null default 0 check (seconds between 0 and 3600),
 detail text check (detail is null or char_length(detail)<=40)
);
create index if not exists events_occurred_at on sideout_private.events(occurred_at);
alter table sideout_private.events enable row level security;
revoke all on sideout_private.events from public,anon,authenticated;

create table if not exists sideout_private.settings (key text primary key, value text not null);
alter table sideout_private.settings enable row level security;
revoke all on sideout_private.settings from public,anon,authenticated;

-- Events from the app, in batches of up to 25. Anything malformed is skipped quietly so analytics never breaks the app.
create or replace function public.sideout_track(p_events jsonb)
returns void language plpgsql security definer set search_path='' as $$
declare e jsonb; recent integer; secs integer;
 kinds text[]:=array['visit','active','player_added','game_finished','court_added','court_removed','qr_started','session_saved','brand_changed','banner_added','banner_removed','checked_in','guess','left','lineup_requested'];
 id_pattern text:='^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$';
 details text[]:=array['preset','custom_color','club_logo','court_logo','remove_logo','reset','banner_name','banner_link','banner_order'];
begin
 if p_events is null or jsonb_typeof(p_events)<>'array' or jsonb_array_length(p_events)>25 then return; end if;
 select count(*) into recent from sideout_private.events where occurred_at>now()-interval '1 minute';
 if recent>3000 then return; end if;
 for e in select value from jsonb_array_elements(p_events) loop
  continue when jsonb_typeof(e)<>'object' or not (coalesce(e->>'kind','')=any(kinds)) or coalesce(e->>'page','') not in ('organizer','player');
  continue when coalesce(e->>'visit','') !~ id_pattern or (e->>'device' is not null and e->>'device' !~ id_pattern);
  secs=case when coalesce(e->>'seconds','') ~ '^[0-9]{1,6}$' then least(3600,(e->>'seconds')::integer) else 0 end;
  insert into sideout_private.events(kind,page,device,visit,seconds,detail)
   values(e->>'kind',e->>'page',(e->>'device')::uuid,(e->>'visit')::uuid,secs,case when e->>'detail'=any(details) then e->>'detail' end);
 end loop;
 delete from sideout_private.events where id in (select id from sideout_private.events where occurred_at<now()-interval '400 days' limit 500);
end $$;

-- Dashboard numbers for the last p_days days (1–400). Requires the developer key.
create or replace function public.sideout_analytics(p_key text,p_days integer)
returns jsonb language plpgsql stable security definer set search_path='' as $$
declare expected text; since timestamptz; result jsonb;
begin
 select value into expected from sideout_private.settings where key='analytics_key_hash';
 if expected is null or p_key is null or encode(sha256(convert_to(p_key,'UTF8')),'hex')<>expected then raise exception 'Invalid analytics key'; end if;
 -- Days are counted in Philippine time (Asia/Manila), starting at local midnight.
 since=(date_trunc('day',now() at time zone 'Asia/Manila')-make_interval(days=>greatest(1,least(coalesce(p_days,30),400))-1)) at time zone 'Asia/Manila';
 with ev as (select * from sideout_private.events where occurred_at>=since),
 visits as (select visit,max(page) page,sum(seconds) secs from ev group by visit having bool_or(kind='visit')),
 counts as (select kind,count(*) n from ev group by kind)
 select jsonb_build_object(
  'since',since,'until',now(),
  'users',(select count(distinct device) from ev),
  'organizers',(select count(distinct device) from ev where page='organizer'),
  'players',(select count(distinct device) from ev where page='player'),
  'returning',(select count(*) from (select device from ev where device is not null group by device having count(distinct (occurred_at at time zone 'Asia/Manila')::date)>1) r),
  'visits',(select count(*) from visits),
  'visitsByPage',(select coalesce(jsonb_object_agg(page,n),'{}'::jsonb) from (select page,count(*) n from visits group by page) t),
  'activeSeconds',(select coalesce(sum(seconds),0) from ev),
  'avgVisitSeconds',(select coalesce(round(avg(secs)),0) from visits),
  'medianVisitSeconds',(select coalesce(round(percentile_cont(.5) within group (order by secs)),0) from visits),
  'actions',(select coalesce(jsonb_object_agg(kind,n),'{}'::jsonb) from counts where kind not in ('visit','active')),
  'customizations',(select coalesce(jsonb_object_agg(coalesce(detail,'other'),n),'{}'::jsonb) from (select detail,count(*) n from ev where kind='brand_changed' group by detail) t),
  'daily',(select coalesce(jsonb_agg(jsonb_build_object('day',t.local_day,'visits',t.v,'users',t.u,'minutes',t.m) order by t.local_day),'[]'::jsonb) from (
    select (occurred_at at time zone 'Asia/Manila')::date as local_day,count(distinct visit) filter (where kind='visit') v,count(distinct device) u,round(sum(seconds)/60.0) m from ev group by 1) t),
  'now',jsonb_build_object(
    'openQrSessions',(select count(*) from sideout_private.sessions where not closed and expires_at>now()),
    'sessionsWithBranding',(select count(*) from sideout_private.sessions where brand is not null and not closed and expires_at>now()),
    'sessionsWithBanners',(select count(*) from sideout_private.sessions where sponsors is not null and not closed and expires_at>now()),
    'bannersShowing',(select coalesce(sum(jsonb_array_length(sponsors)),0) from sideout_private.sessions where sponsors is not null and not closed and expires_at>now()),
    'savedSessionsInCloud',(select count(*) from sideout_private.archives))
 ) into result;
 return result;
end $$;

revoke all on function public.sideout_track(jsonb),public.sideout_analytics(text,integer) from public,anon,authenticated;
grant execute on function public.sideout_track(jsonb),public.sideout_analytics(text,integer) to anon;
commit;
