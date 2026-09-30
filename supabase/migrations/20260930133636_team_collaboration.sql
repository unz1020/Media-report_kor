-- Google identities are validated by Edge Functions. These tables/RPCs are
-- service-role only; no client may nominate its own caller identity.
alter table public.workspace_users add column last_seen_at timestamptz;
alter table public.workspace_users add column invited_by text;
alter table public.report_imports add column updated_by text;

create table public.workspace_activity (
  id uuid primary key default gen_random_uuid(),
  actor_email text not null,
  action text not null,
  target_email text,
  advertiser_id uuid references public.advertisers(id),
  detail jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);
create index workspace_activity_advertiser_date on public.workspace_activity(advertiser_id, created_at desc);
alter table public.workspace_activity enable row level security;
revoke all on public.workspace_activity from anon, authenticated;
grant all on public.workspace_activity to service_role;

create table public.report_import_versions (
  id uuid primary key default gen_random_uuid(),
  import_id uuid not null,
  advertiser_id uuid not null references public.advertisers(id),
  report_date date not null,
  actor_email text,
  snapshot jsonb not null,
  captured_at timestamptz not null default now()
);
create index report_import_versions_lookup on public.report_import_versions(import_id,captured_at desc);
alter table public.report_import_versions enable row level security;
revoke all on public.report_import_versions from anon, authenticated;
grant select,insert on public.report_import_versions to service_role;

-- Capture the existing parsed reports before any further updates.
insert into public.report_import_versions(import_id,advertiser_id,report_date,actor_email,snapshot)
select id,advertiser_id,report_date,updated_by,to_jsonb(r) from public.report_imports r;

create function public.capture_report_import_version() returns trigger
language plpgsql security invoker set search_path = '' as $$
begin
  insert into public.report_import_versions(import_id,advertiser_id,report_date,actor_email,snapshot)
  values(new.id,new.advertiser_id,new.report_date,new.updated_by,to_jsonb(new));
  return new;
end;
$$;
revoke all on function public.capture_report_import_version() from public,anon,authenticated;
create trigger report_import_version_after_write after insert or update on public.report_imports
for each row execute function public.capture_report_import_version();

create function public.manage_workspace_member(
  caller_email text, member_email text, member_name text,
  member_access text, advertiser_ids uuid[], revoke_access boolean default false
) returns void language plpgsql security invoker set search_path = '' as $$
declare target_role text;
begin
  if not exists(select 1 from public.workspace_users where email=caller_email and is_active and role='admin') then
    raise exception 'TEAM_ADMIN_REQUIRED';
  end if;
  if caller_email=member_email then raise exception 'SELF_CHANGE_DENIED'; end if;
  -- Serializes changes to the same account and makes audit + membership atomic.
  perform pg_advisory_xact_lock(hashtextextended(member_email,0));
  select role into target_role from public.workspace_users where email=member_email;
  if target_role='admin' then raise exception 'ADMIN_CHANGE_DENIED'; end if;
  if revoke_access then
    update public.workspace_users set is_active=false where email=member_email;
    if not found then raise exception 'MEMBER_NOT_FOUND'; end if;
    insert into public.workspace_activity(actor_email,action,target_email)
    values(caller_email,'member_revoked',member_email);
    return;
  end if;
  if member_access not in ('editor','viewer') or coalesce(cardinality(advertiser_ids),0)=0 then
    raise exception 'INVALID_MEMBER_ACCESS';
  end if;
  if exists(
    select 1 from unnest(advertiser_ids) id where not exists(
      select 1 from public.workspace_user_advertisers m join public.advertisers a on a.id=m.advertiser_id
      where m.email=caller_email and m.advertiser_id=id and m.access_level='owner' and a.is_active
    )
  ) then raise exception 'ADVERTISER_ACCESS_DENIED'; end if;
  insert into public.workspace_users(email,display_name,role,is_active,invited_by)
  values(member_email,member_name,'ae',true,caller_email)
  on conflict(email) do update set display_name=excluded.display_name,is_active=true;
  delete from public.workspace_user_advertisers where email=member_email;
  insert into public.workspace_user_advertisers(email,advertiser_id,access_level)
  select member_email,id,member_access from (select distinct unnest(advertiser_ids) id) ids;
  insert into public.workspace_activity(actor_email,action,target_email,detail)
  values(caller_email,'member_saved',member_email,jsonb_build_object('access',member_access,'advertiserIds',advertiser_ids));
end;
$$;
revoke all on function public.manage_workspace_member(text,text,text,text,uuid[],boolean) from public,anon,authenticated;
grant execute on function public.manage_workspace_member(text,text,text,text,uuid[],boolean) to service_role;
