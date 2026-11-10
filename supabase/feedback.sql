-- Feedback, bug reports, and star ratings from the organizer and player pages. Run after analytics.sql
-- (it reuses the developer key stored there). Safe to re-run. Anyone can send; only the developer key can read.
begin;
create table if not exists sideout_private.feedback (
 id bigint generated always as identity primary key,
 created_at timestamptz not null default now(),
 kind text not null check (kind in ('feedback','bug')),
 rating smallint check (rating between 1 and 5),
 message text check (char_length(message)<=2000),
 contact text check (char_length(contact)<=120),
 page text not null check (page in ('organizer','player')),
 context jsonb not null default '{}'::jsonb,
 status text not null default 'open' check (status in ('open','done'))
);
create index if not exists feedback_created on sideout_private.feedback(created_at desc);
alter table sideout_private.feedback enable row level security;
revoke all on sideout_private.feedback from public,anon,authenticated;

create or replace function sideout_private.developer_key_ok(p_key text)
returns boolean language sql stable set search_path='' as $$
 select p_key is not null and coalesce((select value=encode(sha256(convert_to(p_key,'UTF8')),'hex') from sideout_private.settings where key='analytics_key_hash'),false)
$$;
revoke all on function sideout_private.developer_key_ok(text) from public,anon,authenticated;

-- Send feedback or a bug report. Context keeps only a few technical details: version, browser, screen,
-- and counts of courts/players/waiting plus whether QR check-in was on.
create or replace function public.sideout_feedback(p_kind text,p_rating integer,p_message text,p_contact text,p_page text,p_context jsonb)
returns void language plpgsql security definer set search_path='' as $$
declare msg text; contact text; ctx jsonb='{}'::jsonb; k text; v jsonb;
begin
 if p_kind is null or p_kind not in ('feedback','bug') then raise exception 'Choose feedback or a bug report'; end if;
 if p_page is null or p_page not in ('organizer','player') then raise exception 'Unknown page'; end if;
 if p_rating is not null and p_rating not between 1 and 5 then raise exception 'Ratings are 1 to 5 stars'; end if;
 msg=nullif(btrim(coalesce(p_message,'')),'');contact=nullif(btrim(coalesce(p_contact,'')),'');
 if char_length(msg)>2000 then raise exception 'Please keep your message under 2,000 characters'; end if;
 if char_length(contact)>120 then raise exception 'Contact details must be 120 characters or less'; end if;
 if p_kind='bug' and (msg is null or char_length(msg)<10) then raise exception 'Describe what went wrong in at least 10 characters'; end if;
 if p_kind='feedback' and msg is null and p_rating is null then raise exception 'Add a star rating or a message'; end if;
 if (select count(*) from sideout_private.feedback where created_at>now()-interval '1 hour')>=300 then raise exception 'Too many reports right now. Please try again in a little while.'; end if;
 if jsonb_typeof(p_context)='object' then
  foreach k in array array['version','browser','screen'] loop v=p_context->k;
   if jsonb_typeof(v)='string' then ctx=ctx||jsonb_build_object(k,left(v#>>'{}',200)); end if; end loop;
  foreach k in array array['courts','players','waiting'] loop v=p_context->k;
   if jsonb_typeof(v)='number' and (v#>>'{}')::numeric between 0 and 10000 then ctx=ctx||jsonb_build_object(k,round((v#>>'{}')::numeric)::integer); end if; end loop;
  if jsonb_typeof(p_context->'qr')='boolean' then ctx=ctx||jsonb_build_object('qr',p_context->'qr'); end if;
 end if;
 insert into sideout_private.feedback(kind,rating,message,contact,page,context) values(p_kind,p_rating,msg,contact,p_page,ctx);
end $$;

-- Developer only: rating summary and the latest 200 items from the last p_days days (1–400).
create or replace function public.sideout_feedback_list(p_key text,p_days integer)
returns jsonb language plpgsql stable security definer set search_path='' as $$
declare since timestamptz; result jsonb;
begin
 if not sideout_private.developer_key_ok(p_key) then raise exception 'Invalid analytics key'; end if;
 since=(date_trunc('day',now() at time zone 'Asia/Manila')-make_interval(days=>greatest(1,least(coalesce(p_days,30),400))-1)) at time zone 'Asia/Manila';
 with f as (select * from sideout_private.feedback where created_at>=since)
 select jsonb_build_object(
  'total',(select count(*) from f),
  'bugs',(select count(*) from f where kind='bug'),
  'feedback',(select count(*) from f where kind='feedback'),
  'open',(select count(*) from f where status='open'),
  'ratingCount',(select count(rating) from f),
  'avgRating',(select round(avg(rating),1) from f),
  'ratings',(select jsonb_build_object('1',count(*) filter (where rating=1),'2',count(*) filter (where rating=2),'3',count(*) filter (where rating=3),'4',count(*) filter (where rating=4),'5',count(*) filter (where rating=5)) from f),
  'items',(select coalesce(jsonb_agg(jsonb_build_object('id',id,'createdAt',created_at,'kind',kind,'rating',rating,'message',message,'contact',contact,'page',page,'context',context,'status',status) order by created_at desc),'[]'::jsonb)
           from (select * from f order by created_at desc limit 200) latest)
 ) into result;
 return result;
end $$;

-- Developer only: mark an item done or reopen it.
create or replace function public.sideout_feedback_status(p_key text,p_id bigint,p_status text)
returns void language plpgsql security definer set search_path='' as $$
begin
 if not sideout_private.developer_key_ok(p_key) then raise exception 'Invalid analytics key'; end if;
 if p_status is null or p_status not in ('open','done') then raise exception 'Invalid status'; end if;
 update sideout_private.feedback set status=p_status where id=p_id;
 if not found then raise exception 'Feedback not found'; end if;
end $$;

revoke all on function public.sideout_feedback(text,integer,text,text,text,jsonb),public.sideout_feedback_list(text,integer),public.sideout_feedback_status(text,bigint,text) from public,anon,authenticated;
grant execute on function public.sideout_feedback(text,integer,text,text,text,jsonb),public.sideout_feedback_list(text,integer),public.sideout_feedback_status(text,bigint,text) to anon;
commit;
