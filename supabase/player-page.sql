begin;
alter table sideout_private.sessions add column if not exists custom_counts jsonb not null default '{}'::jsonb;
alter table sideout_private.sessions add column if not exists live_state jsonb;
alter table sideout_private.sessions add column if not exists synced_at timestamptz;
alter table sideout_private.arrivals add column if not exists request_hash bytea;
create table if not exists sideout_private.lineup_requests (
 id uuid primary key, session_id uuid not null references sideout_private.sessions on delete cascade,
 requester text not null, players jsonb not null, status text not null default 'pending' check(status in ('pending','approved','declined')),
 created_at timestamptz not null default now()
);
alter table sideout_private.lineup_requests enable row level security;
revoke all on sideout_private.lineup_requests from public,anon,authenticated;
create unique index if not exists request_pending on sideout_private.lineup_requests(session_id,requester) where status='pending';
create or replace function public.sideout_publish(p_session uuid,p_owner text,p_state jsonb)
returns void language plpgsql security definer set search_path='' as $$
begin
 if p_state is null or octet_length(p_state::text)>1000000 then raise exception 'Invalid player view'; end if;
 update sideout_private.sessions set live_state=jsonb_build_object('players',p_state->'players','queue',p_state->'queue','courts',p_state->'courts','completed',p_state->'completed','lineup',p_state->'lineup','next',p_state->'next'),synced_at=now() where id=p_session and owner_hash=sha256(convert_to(p_owner,'UTF8'));
 if not found then raise exception 'Invalid organizer key'; end if;
end $$;
create or replace function public.sideout_player_view(p_session uuid)
returns jsonb language plpgsql stable security definer set search_path='' as $$
declare s sideout_private.sessions;
begin
 select * into s from sideout_private.sessions where id=p_session;
 if not found then raise exception 'Session not found. Ask for a current QR.'; end if;
 return jsonb_build_object('state',s.live_state,'updatedAt',s.synced_at,'closed',s.closed or s.expires_at<now(),'counts',s.custom_counts);
end $$;
create or replace function public.sideout_join_player(p_session uuid,p_id uuid,p_name text,p_secret text)
returns jsonb language plpgsql security definer set search_path='' as $$
declare result jsonb; existed boolean; allowed boolean;
begin
 if p_secret is null or length(p_secret)<>64 then raise exception 'Invalid player key'; end if;
 perform 1 from sideout_private.sessions where id=p_session for update;
 existed=exists(select 1 from sideout_private.arrivals where session_id=p_session and id=p_id::text);
 result=public.sideout_join(p_session,p_id,p_name);
 if not existed then update sideout_private.arrivals set request_hash=sha256(convert_to(p_secret,'UTF8')) where session_id=p_session and id=p_id::text; end if;
 select coalesce(request_hash=sha256(convert_to(p_secret,'UTF8')),false) into allowed from sideout_private.arrivals where session_id=p_session and id=p_id::text;
 return result||jsonb_build_object('canRequest',allowed);
end $$;

create table if not exists sideout_private.lineup_uses (
 id uuid primary key, session_id uuid not null references sideout_private.sessions on delete cascade, players jsonb not null
);
alter table sideout_private.lineup_uses enable row level security;
revoke all on sideout_private.lineup_uses from public,anon,authenticated;
create or replace function public.sideout_publish_live(p_session uuid,p_owner text,p_state jsonb)
returns jsonb language plpgsql security definer set search_path='' as $$
declare s sideout_private.sessions; p jsonb; n integer;
begin
 select * into s from sideout_private.sessions where id=p_session for update;
 if not found or p_owner is null or s.owner_hash<>sha256(convert_to(p_owner,'UTF8')) then raise exception 'Invalid organizer key'; end if;
 perform public.sideout_publish(p_session,p_owner,p_state);
 for p in select value from jsonb_array_elements(p_state->'players') loop
  n=greatest(coalesce((s.custom_counts->>(p->>'id'))::integer,0),least(2,greatest(0,coalesce((p->>'customUsed')::integer,0))));
  s.custom_counts=jsonb_set(s.custom_counts,array[p->>'id'],to_jsonb(n),true);
 end loop;
 update sideout_private.sessions set custom_counts=s.custom_counts where id=p_session;
 return s.custom_counts;
end $$;
create or replace function public.sideout_custom_use(p_session uuid,p_owner text,p_use uuid,p_players jsonb)
returns void language plpgsql security definer set search_path='' as $$
declare s sideout_private.sessions; pid text; n integer;
begin
 select * into s from sideout_private.sessions where id=p_session for update;
 if not found or p_owner is null or s.owner_hash<>sha256(convert_to(p_owner,'UTF8')) then raise exception 'Invalid organizer key'; end if;
 if s.closed or s.expires_at<now() then raise exception 'Close the expired QR before setting a custom lineup'; end if;
 if exists(select 1 from sideout_private.lineup_uses where id=p_use and session_id=p_session) then return; end if;
 if p_players is null or jsonb_typeof(p_players)<>'array' or jsonb_array_length(p_players)<>4 or (select count(distinct value) from jsonb_array_elements_text(p_players))<>4 then raise exception 'Choose four different players'; end if;
 for pid in select value from jsonb_array_elements_text(p_players) loop
  if not coalesce((s.live_state->'queue') ? pid,false) then raise exception 'All selected players must be waiting'; end if;
  n=coalesce((s.custom_counts->>pid)::integer,0);
  if n>=2 then raise exception 'A selected player has already used both custom lineups'; end if;
  s.custom_counts=jsonb_set(s.custom_counts,array[pid],to_jsonb(n+1),true);
 end loop;
 insert into sideout_private.lineup_uses(id,session_id,players) values(p_use,p_session,p_players);
 update sideout_private.sessions set custom_counts=s.custom_counts where id=p_session;
end $$;
create or replace function public.sideout_request_lineup(p_session uuid,p_id uuid,p_secret text,p_request uuid,p_players jsonb)
returns void language plpgsql security definer set search_path='' as $$
declare s sideout_private.sessions;
begin
 select * into s from sideout_private.sessions where id=p_session for update;
 if not found or s.closed or s.expires_at<now() then raise exception 'Session closed or expired'; end if;
 if not exists(select 1 from sideout_private.arrivals where session_id=p_session and id=p_id::text and request_hash=sha256(convert_to(p_secret,'UTF8'))) then raise exception 'Join from this device to send requests'; end if;
 if p_players is null or jsonb_typeof(p_players)<>'array' or jsonb_array_length(p_players)<>4 then raise exception 'Choose four players'; end if;
 if (select count(distinct value) from jsonb_array_elements_text(p_players))<>4 or not p_players ? p_id::text then raise exception 'Choose yourself and three different players'; end if;
 if s.live_state is null or exists(select 1 from jsonb_array_elements_text(p_players) p where not coalesce((s.live_state->'queue') ? p.value,false)) then raise exception 'All four players must be waiting. Refresh and try again.'; end if;
 if exists(select 1 from jsonb_array_elements_text(p_players) p where coalesce((s.custom_counts->>p.value)::integer,0)>=2) then raise exception 'A selected player has already used both custom lineups'; end if;
 if exists(select 1 from sideout_private.lineup_requests where id=p_request and session_id=p_session and requester=p_id::text) then return; end if;
 if exists(select 1 from sideout_private.lineup_requests where session_id=p_session and requester=p_id::text and status='pending') then raise exception 'You already have a pending request'; end if;
 if (select count(*) from sideout_private.lineup_requests where session_id=p_session)>=200 then raise exception 'Session request limit reached'; end if;
 insert into sideout_private.lineup_requests(id,session_id,requester,players) values(p_request,p_session,p_id::text,p_players);
end $$;
create or replace function public.sideout_requests(p_session uuid,p_owner text)
returns jsonb language plpgsql stable security definer set search_path='' as $$
declare result jsonb;
begin
 if not exists(select 1 from sideout_private.sessions where id=p_session and owner_hash=sha256(convert_to(p_owner,'UTF8'))) then raise exception 'Invalid organizer key'; end if;
 select coalesce(jsonb_agg(jsonb_build_object('id',id,'requester',requester,'players',players,'status',status) order by created_at),'[]'::jsonb) into result from sideout_private.lineup_requests where session_id=p_session and status='pending';return result;
end $$;
create or replace function public.sideout_decide(p_session uuid,p_owner text,p_request uuid,p_status text)
returns void language plpgsql security definer set search_path='' as $$
declare chosen jsonb;
begin
 if p_status not in ('approved','declined') or p_status is null then raise exception 'Invalid decision'; end if;
 if not exists(select 1 from sideout_private.sessions where id=p_session and owner_hash=sha256(convert_to(p_owner,'UTF8'))) then raise exception 'Invalid organizer key'; end if;
 select players into chosen from sideout_private.lineup_requests where session_id=p_session and id=p_request;
 if p_status='approved' then perform public.sideout_custom_use(p_session,p_owner,p_request,chosen); end if;
 update sideout_private.lineup_requests set status=p_status where session_id=p_session and id=p_request;
 if not found then raise exception 'Request not found'; end if;
end $$;
create or replace function public.sideout_my_requests(p_session uuid,p_id uuid,p_secret text)
returns jsonb language plpgsql stable security definer set search_path='' as $$
declare result jsonb;
begin
 if not exists(select 1 from sideout_private.arrivals where session_id=p_session and id=p_id::text and request_hash=sha256(convert_to(p_secret,'UTF8'))) then raise exception 'Join from this device to send requests'; end if;
 select coalesce(jsonb_agg(jsonb_build_object('id',id,'status',status,'players',players) order by created_at desc),'[]'::jsonb) into result from sideout_private.lineup_requests where session_id=p_session and requester=p_id::text;return result;
end $$;
revoke all on function public.sideout_publish_live(uuid,text,jsonb),public.sideout_custom_use(uuid,text,uuid,jsonb),public.sideout_publish(uuid,text,jsonb),public.sideout_player_view(uuid),public.sideout_join_player(uuid,uuid,text,text),public.sideout_request_lineup(uuid,uuid,text,uuid,jsonb),public.sideout_requests(uuid,text),public.sideout_decide(uuid,text,uuid,text),public.sideout_my_requests(uuid,uuid,text) from public,anon,authenticated;
grant execute on function public.sideout_publish_live(uuid,text,jsonb),public.sideout_custom_use(uuid,text,uuid,jsonb),public.sideout_publish(uuid,text,jsonb),public.sideout_player_view(uuid),public.sideout_join_player(uuid,uuid,text,text),public.sideout_request_lineup(uuid,uuid,text,uuid,jsonb),public.sideout_requests(uuid,text),public.sideout_decide(uuid,text,uuid,text),public.sideout_my_requests(uuid,uuid,text) to anon;
commit;
