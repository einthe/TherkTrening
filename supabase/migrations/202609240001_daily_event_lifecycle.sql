begin;

alter table public.events add column auto_lock_at timestamptz, add column daily_lock_applied boolean not null default false;
create index events_pending_auto_lock on public.events(user_id,auto_lock_at) where not is_locked and auto_lock_at is not null;

create function public.workout_lock_time(occurred timestamptz, zone text) returns timestamptz language plpgsql stable set search_path = '' as $$
begin
  if not exists(select 1 from pg_catalog.pg_timezone_names where name=zone) then raise exception 'Invalid time zone'; end if;
  return (((occurred at time zone zone)::date + 1)::timestamp at time zone zone);
end $$;

-- Expiry is also enforced in mutate_workspace, so a stale client cannot edit
-- an expired workout even before its persisted lock is materialized on load.
create function public.lock_expired_workouts(zone text default 'UTC') returns void language plpgsql security definer set search_path = '' as $$
begin
  if not public.is_approved() then raise exception 'Approved account required' using errcode='42501'; end if;
  -- Existing records receive the same lifecycle on first load in the user's zone.
  -- Explicit locks/unlocks mark this applied, so an unlock is never undone on load.
  update public.events set daily_lock_applied=true,
    auto_lock_at=case when event_type='workout' then public.workout_lock_time(occurred_at,zone) else null end,
    is_locked=is_locked or event_type='pain_measurement' or (event_type='workout' and public.workout_lock_time(occurred_at,zone) <= clock_timestamp()),
    updated_at=clock_timestamp()
    where user_id=auth.uid() and not daily_lock_applied and event_type in ('pain_measurement','workout');
  update public.events set is_locked=true,auto_lock_at=null,updated_at=clock_timestamp()
    where user_id=auth.uid() and not is_locked and auto_lock_at <= clock_timestamp();
end $$;
revoke all on function public.lock_expired_workouts(text) from public,anon;
grant execute on function public.lock_expired_workouts(text) to authenticated;

create or replace function public.mutate_workspace(mutation jsonb) returns void language plpgsql security definer set search_path = '' as $$
declare action text := mutation->>'action'; item jsonb; old public.events; inst public.user_component_instances; target uuid; stamp timestamptz := clock_timestamp(); ids uuid[]; n integer := 0; zone text := coalesce(mutation->>'timeZone','UTC'); deadline timestamptz;
begin
  if not public.is_approved() then raise exception 'Approved account required' using errcode='42501'; end if;
  if action='createEvents' then
    if jsonb_typeof(mutation->'events') is distinct from 'array' then raise exception 'Invalid events'; end if;
    if jsonb_array_length(mutation->'events') not between 1 and 100 then raise exception 'Invalid batch size'; end if;
    -- Parents inserted first; the entire RPC is one transaction.
    for item in select value from jsonb_array_elements(mutation->'events') order by case when value->>'parentEventId' is null then 0 else 1 end loop
      perform public.validate_event(item);
      deadline := case when item->>'eventType'='workout' then public.workout_lock_time((item->>'occurredAt')::timestamptz,zone) else null end;
      insert into public.events(id,user_id,event_type,schema_version,occurred_at,started_at,ended_at,parent_event_id,batch_id,payload,notes,is_locked,auto_lock_at,daily_lock_applied)
      values((item->>'id')::uuid,auth.uid(),item->>'eventType',(item->>'schemaVersion')::integer,(item->>'occurredAt')::timestamptz,(item->>'startedAt')::timestamptz,(item->>'endedAt')::timestamptz,(item->>'parentEventId')::uuid,(item->>'batchId')::uuid,item->'payload',item->>'notes',item->>'eventType'='pain_measurement' or coalesce(deadline <= stamp,false),deadline,true);
    end loop;
  elsif action in ('editEvent','deleteEvent','lockEvent') then
    target := coalesce(mutation->'event'->>'id',mutation->>'id')::uuid;
    select * into old from public.events where id=target and user_id=auth.uid() for update;
    if not found then raise exception 'Event not found'; end if;
    if old.updated_at is distinct from (mutation->>'expectedUpdatedAt')::timestamptz then raise exception 'This event changed elsewhere. Refresh and try again.'; end if;
    if action='lockEvent' then
      if jsonb_typeof(mutation->'locked') is distinct from 'boolean' then raise exception 'Invalid lock state'; end if;
      update public.events set daily_lock_applied=true,auto_lock_at=null,is_locked=(mutation->>'locked')::boolean,updated_at=stamp where id=target;
    else
      if old.is_locked or old.auto_lock_at <= clock_timestamp() or (not old.daily_lock_applied and (old.event_type='pain_measurement' or (old.event_type='workout' and public.workout_lock_time(old.occurred_at,zone) <= clock_timestamp()))) then raise exception 'Unlock this event before editing or deleting it.'; end if;
      if action='deleteEvent' then
        if exists(select 1 from public.events where parent_event_id=target) then raise exception 'Delete or detach the exercises in this workout first.'; end if;
        delete from public.events where id=target;
      else
        item := mutation->'event'; perform public.validate_event(item);
        deadline := case when item->>'eventType'='workout' then public.workout_lock_time((item->>'occurredAt')::timestamptz,zone) else null end;
        if item->>'eventType' <> old.event_type then raise exception 'Event type cannot be changed.'; end if;
        update public.events set occurred_at=(item->>'occurredAt')::timestamptz, started_at=(item->>'startedAt')::timestamptz,ended_at=(item->>'endedAt')::timestamptz,parent_event_id=(item->>'parentEventId')::uuid,batch_id=(item->>'batchId')::uuid,payload=item->'payload',notes=item->>'notes',updated_at=stamp,is_locked=item->>'eventType'='pain_measurement' or coalesce(deadline <= stamp,false),auto_lock_at=deadline,daily_lock_applied=true where id=target;
      end if;
    end if;
  elsif action='saveInstance' then
    item := mutation->'instance'; perform public.validate_component(item);
    select * into inst from public.user_component_instances where id=(item->>'id')::uuid for update;
    if found then
      if inst.user_id <> auth.uid() then raise exception 'Invalid component owner'; end if;
      if inst.updated_at is distinct from (mutation->>'expectedUpdatedAt')::timestamptz then raise exception 'Component changed elsewhere. Refresh and try again.'; end if;
      if inst.component_definition_id <> item->>'componentDefinitionId' then raise exception 'Component type cannot be changed.'; end if;
      update public.user_component_instances set title=item->>'title',enabled=(item->>'enabled')::boolean,position=(item->>'position')::integer,config=item->'config',updated_at=stamp where id=inst.id;
    else
      if (select count(*) from public.user_component_instances where user_id=auth.uid()) >= 100 then raise exception 'Invalid component count: maximum 100'; end if;
      insert into public.user_component_instances(id,user_id,component_definition_id,version,title,enabled,position,config) values((item->>'id')::uuid,auth.uid(),item->>'componentDefinitionId',1,item->>'title',(item->>'enabled')::boolean,(item->>'position')::integer,item->'config');
    end if;
  elsif action='removeInstance' then delete from public.user_component_instances where id=(mutation->>'id')::uuid and user_id=auth.uid();
  elsif action='reorder' then
    -- Serializes ordering and validates full ownership before touching any rows.
    perform 1 from public.profiles where id=auth.uid() for update;
    select array_agg(value::uuid) into ids from jsonb_array_elements_text(mutation->'ids');
    if coalesce(cardinality(ids),0) <> (select count(*) from public.user_component_instances where user_id=auth.uid()) or coalesce(cardinality(ids),0) <> (select count(distinct x) from unnest(ids) x) or exists(select 1 from unnest(ids) x where not exists(select 1 from public.user_component_instances where id=x and user_id=auth.uid())) then raise exception 'Refresh your component list before reordering.'; end if;
    if ids is not null then foreach target in array ids loop update public.user_component_instances set position=n,updated_at=stamp where id=target and user_id=auth.uid(); n := n+1; end loop; end if;
  else raise exception 'Invalid action'; end if;
end $$;

commit;
