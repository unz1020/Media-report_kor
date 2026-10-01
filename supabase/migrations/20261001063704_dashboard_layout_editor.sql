create table public.dashboard_layouts (
  advertiser_id uuid not null references public.advertisers(id),
  page text not null check(page in ('overview','performance','schedule','creative','reports','data-update','team')),
  layout jsonb not null,
  updated_by text not null,
  updated_at timestamptz not null default clock_timestamp(),
  primary key(advertiser_id,page)
);
alter table public.dashboard_layouts enable row level security;
revoke all on public.dashboard_layouts from anon,authenticated;
grant select,insert,update on public.dashboard_layouts to service_role;

-- Only the verified Edge caller may name an editor identity.
create function public.save_dashboard_layout(
  caller_email text, advertiser_id_input uuid, page_input text,
  expected_updated_at_input timestamptz, layout_input jsonb
) returns jsonb language plpgsql security invoker set search_path='' as $$
declare previous public.dashboard_layouts%rowtype; changed_at timestamptz := clock_timestamp();
begin
  if not exists(select 1 from public.workspace_users u
    join public.workspace_user_advertisers m on m.email=u.email
    join public.advertisers a on a.id=m.advertiser_id
    where u.email=caller_email and u.is_active and a.is_active
      and m.advertiser_id=advertiser_id_input and m.access_level in ('owner','editor'))
  then raise exception 'WRITE_ACCESS_DENIED'; end if;
  if page_input not in ('overview','performance','schedule','creative','reports','data-update','team') or page_input is null
    then raise exception 'INVALID_LAYOUT_PAGE'; end if;
  if layout_input is null or jsonb_typeof(layout_input)<>'object' or layout_input->'version' is distinct from '1'::jsonb
    or jsonb_typeof(layout_input->'order') is distinct from 'array'
    or jsonb_typeof(layout_input->'widths') is distinct from 'object'
    then raise exception 'INVALID_LAYOUT'; end if;
  if jsonb_array_length(layout_input->'order')>160
    or (select count(*) from jsonb_object_keys(layout_input->'widths'))>160
    or exists(select 1 from jsonb_array_elements(layout_input->'order') n where jsonb_typeof(n)<>'string' or length(n#>>'{}') not between 1 and 180 or n#>>'{}' in ('__proto__','constructor','prototype') or n#>>'{}' ~ '[[:cntrl:]<>]')
    or (select count(*) from jsonb_array_elements(layout_input->'order'))<>(select count(distinct n) from jsonb_array_elements(layout_input->'order') n)
    or exists(select 1 from jsonb_each(layout_input->'widths') w where not (layout_input->'order' ? w.key) or w.value not in ('12'::jsonb,'15'::jsonb,'20'::jsonb,'30'::jsonb,'40'::jsonb,'60'::jsonb))
    then raise exception 'INVALID_LAYOUT'; end if;
  -- Serializes both first inserts and subsequent edits, including two tabs.
  perform pg_advisory_xact_lock(hashtextextended(advertiser_id_input::text || ':' || page_input,0));
  select * into previous from public.dashboard_layouts where advertiser_id=advertiser_id_input and page=page_input;
  if previous.updated_at is distinct from expected_updated_at_input then raise exception 'LAYOUT_CHANGED'; end if;
  insert into public.dashboard_layouts(advertiser_id,page,layout,updated_by,updated_at)
    values(advertiser_id_input,page_input,layout_input,caller_email,changed_at)
    on conflict(advertiser_id,page) do update set layout=excluded.layout,updated_by=excluded.updated_by,updated_at=excluded.updated_at;
  insert into public.workspace_activity(actor_email,advertiser_id,action,detail)
    values(caller_email,advertiser_id_input,'layout_saved',jsonb_build_object('page',page_input,'layout',layout_input,'previousLayout',previous.layout));
  return jsonb_build_object('layout',layout_input,'updatedAt',changed_at);
end;
$$;
revoke all on function public.save_dashboard_layout(text,uuid,text,timestamptz,jsonb) from public,anon,authenticated;
grant execute on function public.save_dashboard_layout(text,uuid,text,timestamptz,jsonb) to service_role;
