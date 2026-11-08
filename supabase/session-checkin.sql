begin;
create schema if not exists sideout_private;
revoke all on schema sideout_private from public, anon, authenticated;
create table if not exists sideout_private.sessions (
 id uuid primary key, owner_hash bytea not null,
 expires_at timestamptz not null default now() + interval '12 hours',
 closed boolean not null default false
);
create table if not exists sideout_private.arrivals (
 session_id uuid not null references sideout_private.sessions on delete cascade,
 id text not null, nickname text not null check (char_length(nickname) between 1 and 30),
 sequence bigint generated always as identity,
 primary key(session_id,id)
);
create unique index if not exists arrivals_unique_name on sideout_private.arrivals(session_id,lower(nickname));
alter table sideout_private.sessions enable row level security;
alter table sideout_private.arrivals enable row level security;
revoke all on all tables in schema sideout_private from public, anon, authenticated;

create or replace function public.sideout_create(p_session uuid,p_owner text,p_players jsonb)
returns jsonb language plpgsql security definer set search_path='' as $$
declare s sideout_private.sessions; p jsonb;
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
  insert into sideout_private.arrivals(session_id,id,nickname) values(p_session,p->>'id',trim(regexp_replace(p->>'name','\s+',' ','g'))) on conflict do nothing;
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
 clean=trim(regexp_replace(p_name,'\s+',' ','g'));
 if clean is null or length(clean)<1 or length(clean)>30 then raise exception 'Enter a nickname of 1–30 characters'; end if;
 if exists(select 1 from sideout_private.arrivals where session_id=p_session and lower(nickname)=lower(clean)) then raise exception 'Nickname already used. Choose a different nickname.'; end if;
 if (select count(*) from sideout_private.arrivals where session_id=p_session)>=200 then raise exception 'Session is full'; end if;
 insert into sideout_private.arrivals(session_id,id,nickname) values(p_session,p_id::text,clean);
 return jsonb_build_object('name',clean);
end $$;

create or replace function public.sideout_poll(p_session uuid,p_owner text)
returns jsonb language plpgsql security definer set search_path='' as $$
declare s sideout_private.sessions; arrivals jsonb;
begin
 select * into s from sideout_private.sessions where id=p_session;
 if not found or p_owner is null or s.owner_hash<>sha256(convert_to(p_owner,'UTF8')) then raise exception 'Invalid organizer key'; end if;
 select coalesce(jsonb_agg(jsonb_build_object('id',id,'name',nickname) order by sequence),'[]'::jsonb) into arrivals from sideout_private.arrivals where session_id=p_session;
 return jsonb_build_object('closed',s.closed or s.expires_at<now(),'arrivals',arrivals);
end $$;

create or replace function public.sideout_close(p_session uuid,p_owner text)
returns void language plpgsql security definer set search_path='' as $$
begin
 update sideout_private.sessions set closed=true where id=p_session and owner_hash=sha256(convert_to(p_owner,'UTF8'));
 if not found then raise exception 'Invalid organizer key'; end if;
end $$;
revoke all on function public.sideout_create(uuid,text,jsonb),public.sideout_join(uuid,uuid,text),public.sideout_poll(uuid,text),public.sideout_close(uuid,text) from public,anon,authenticated;
grant execute on function public.sideout_create(uuid,text,jsonb),public.sideout_join(uuid,uuid,text),public.sideout_poll(uuid,text),public.sideout_close(uuid,text) to anon;
commit;
