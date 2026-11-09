begin;
create table if not exists sideout_private.archives (
 id uuid primary key,
 owner_hash bytea not null,
 name text not null check(char_length(name) between 1 and 80),
 saved_at timestamptz not null default now(),
 snapshot jsonb not null
);
create index if not exists archives_owner on sideout_private.archives(owner_hash,saved_at desc);
alter table sideout_private.archives enable row level security;
revoke all on sideout_private.archives from public,anon,authenticated;
create or replace function public.sideout_archive_save(p_id uuid,p_owner text,p_name text,p_snapshot jsonb)
returns void language plpgsql security definer set search_path='' as $$
declare owner_digest bytea;
begin
 if p_owner is null or length(p_owner)<>64 then raise exception 'Invalid archive key'; end if;
 if p_name is null or length(trim(p_name)) not between 1 and 80 then raise exception 'Enter a session name'; end if;
 if p_snapshot is null or jsonb_typeof(p_snapshot)<>'object' or octet_length(p_snapshot::text)>1000000 or p_snapshot ? 'checkin' then raise exception 'Invalid session snapshot'; end if;
 owner_digest=sha256(convert_to(p_owner,'UTF8'));
 perform pg_advisory_xact_lock(hashtextextended(p_owner,0));
 if exists(select 1 from sideout_private.archives where id=p_id) then
  if not exists(select 1 from sideout_private.archives where id=p_id and owner_hash=owner_digest) then raise exception 'Invalid archive key'; end if;
  return;
 end if;
 if (select count(*) from sideout_private.archives where owner_hash=owner_digest)>=100 then raise exception 'Cloud archive limit reached (100 saved sessions). Download a copy instead.'; end if;
 insert into sideout_private.archives(id,owner_hash,name,snapshot) values(p_id,owner_digest,trim(p_name),p_snapshot);
end $$;
create or replace function public.sideout_archive_list(p_owner text)
returns jsonb language sql stable security definer set search_path='' as $$
 select coalesce(jsonb_agg(jsonb_build_object('id',id,'name',name,'savedAt',saved_at) order by saved_at desc),'[]'::jsonb)
 from sideout_private.archives where owner_hash=sha256(convert_to(p_owner,'UTF8'));
$$;
create or replace function public.sideout_archive_get(p_id uuid,p_owner text)
returns jsonb language plpgsql stable security definer set search_path='' as $$
declare result jsonb;
begin
 select snapshot into result from sideout_private.archives where id=p_id and owner_hash=sha256(convert_to(p_owner,'UTF8'));
 if not found then raise exception 'Saved session not found'; end if;
 return result;
end $$;
revoke all on function public.sideout_archive_save(uuid,text,text,jsonb),public.sideout_archive_list(text),public.sideout_archive_get(uuid,text) from public,anon,authenticated;
grant execute on function public.sideout_archive_save(uuid,text,text,jsonb),public.sideout_archive_list(text),public.sideout_archive_get(uuid,text) to anon;
commit;
