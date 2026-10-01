-- Called only by the Edge Function after verifying a Google identity.
-- Import metadata/version history, notes, and audit are updated atomically.
create function public.edit_daily_insight(
  caller_email text, advertiser_id_input uuid, insight_id_input uuid,
  expected_updated_at_input timestamptz, notes_input jsonb
) returns jsonb language plpgsql security invoker set search_path = '' as $$
declare
  parent_id uuid;
  parent public.report_imports%rowtype;
  updated_metadata jsonb;
  changed_at timestamptz := clock_timestamp();
begin
  if not exists (
    select 1 from public.workspace_users u
    join public.workspace_user_advertisers m on m.email=u.email
    join public.advertisers a on a.id=m.advertiser_id
    where u.email=caller_email and u.is_active and a.is_active
      and m.advertiser_id=advertiser_id_input and m.access_level in ('owner','editor')
  ) then raise exception 'WRITE_ACCESS_DENIED'; end if;
  if notes_input is null or jsonb_typeof(notes_input) <> 'array' then
    raise exception 'INVALID_INSIGHT_NOTES';
  end if;
  if jsonb_array_length(notes_input) not between 1 and 80 then
    raise exception 'INVALID_INSIGHT_NOTES';
  end if;
  if exists(select 1 from jsonb_array_elements(notes_input) n
    where jsonb_typeof(n) <> 'string' or length(btrim(n #>> '{}'))=0 or length(n #>> '{}')>4000)
    or (select coalesce(sum(length(n #>> '{}')),0) from jsonb_array_elements(notes_input) n)>80000
  then raise exception 'INVALID_INSIGHT_NOTES'; end if;

  select import_id into parent_id from public.daily_insights
  where id=insight_id_input and advertiser_id=advertiser_id_input;
  if parent_id is null then raise exception 'INSIGHT_NOT_FOUND'; end if;
  select * into parent from public.report_imports
  where id=parent_id and advertiser_id=advertiser_id_input and status='published' for update;
  if not found then raise exception 'INSIGHT_NOT_FOUND'; end if;
  if expected_updated_at_input is null or parent.updated_at is distinct from expected_updated_at_input
  then raise exception 'INSIGHT_CHANGED'; end if;

  updated_metadata := coalesce(parent.metadata,'{}'::jsonb) || jsonb_build_object(
    'insightOverride',jsonb_build_object('notes',notes_input,'updatedBy',caller_email,'updatedAt',changed_at));
  if jsonb_typeof(updated_metadata->'bundle')='object' then
    updated_metadata := jsonb_set(updated_metadata,'{bundle,operationNotes}',notes_input);
  end if;
  if jsonb_typeof(updated_metadata->'input')='object' then
    updated_metadata := jsonb_set(updated_metadata,'{input,notes}',notes_input);
  end if;
  update public.daily_insights set notes=notes_input
    where id=insight_id_input and import_id=parent_id and advertiser_id=advertiser_id_input;
  if not found then raise exception 'INSIGHT_NOT_FOUND'; end if;
  update public.report_imports set metadata=updated_metadata,updated_at=changed_at,updated_by=caller_email
    where id=parent_id;
  insert into public.workspace_activity(actor_email,advertiser_id,action,detail)
    values(caller_email,advertiser_id_input,'insight_edited',jsonb_build_object(
      'insightId',insight_id_input,'importId',parent_id,'reportDate',parent.report_date));
  return jsonb_build_object('importId',parent_id,'updatedAt',changed_at);
end;
$$;
revoke all on function public.edit_daily_insight(text,uuid,uuid,timestamptz,jsonb) from public,anon,authenticated;
grant execute on function public.edit_daily_insight(text,uuid,uuid,timestamptz,jsonb) to service_role;
