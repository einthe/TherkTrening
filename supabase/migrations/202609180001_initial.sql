-- One shared project, private owner-scoped data. Mutations run only through validated RPCs.
create table public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  username text not null check (username ~ '^[a-zA-Z0-9_]{3,30}$'),
  role text not null default 'user' check (role in ('user','admin')),
  account_status text not null default 'pending' check (account_status in ('pending','approved','rejected','disabled')),
  created_at timestamptz not null default now(), updated_at timestamptz not null default now()
);
create unique index profiles_username_unique on public.profiles(lower(username));
create table public.event_type_definitions (key text primary key, name text not null, version integer not null default 1, active boolean not null default true, metadata jsonb not null default '{}', created_at timestamptz not null default now());
create table public.component_definitions (key text primary key, name text not null, version integer not null default 1, active boolean not null default true, metadata jsonb not null default '{}', created_at timestamptz not null default now());
create table public.operator_definitions (key text primary key, name text not null, version integer not null default 1, active boolean not null default true, metadata jsonb not null default '{}', created_at timestamptz not null default now());
insert into public.event_type_definitions(key,name) values ('pain_measurement','Pain check-in'),('workout','Workout'),('exercise','Exercise'),('training_session','Training session'),('measurement','Measurement');
insert into public.component_definitions(key,name) values ('pain_logger','Pain check-in'),('exercise_logger','Exercise logger'),('graph','Volume & pain'),('session_logger','Training session'),('value_logger','Quick measurement'),('statistic','Statistic'),('recent_events','Recent activity');
insert into public.operator_definitions(key,name) values ('filter_type','Event type filter'),('filter_target','Target filter'),('filter_date','Date range filter'),('extract_field','Numeric field'),('placeholder_volume_load','Training volume (placeholder)'),('daily_aggregation','Daily aggregation'),('moving_average','Moving average'),('align_by_date','Align by date');
create table public.events (
  id uuid primary key default gen_random_uuid(), user_id uuid not null references public.profiles(id) on delete cascade,
  event_type text not null references public.event_type_definitions(key), schema_version integer not null check (schema_version > 0),
  occurred_at timestamptz not null, started_at timestamptz, ended_at timestamptz,
  parent_event_id uuid references public.events(id) on delete restrict, batch_id uuid,
  payload jsonb not null, notes text check (length(notes) <= 4000), is_locked boolean not null default false,
  created_at timestamptz not null default now(), updated_at timestamptz not null default now(),
  check (ended_at is null or (started_at is not null and ended_at >= started_at)), check(parent_event_id is null or parent_event_id <> id)
);
create index events_owner_date on public.events(user_id,occurred_at desc);
create index events_owner_type_date on public.events(user_id,event_type,occurred_at desc);
create index events_parent on public.events(parent_event_id);
create table public.user_component_instances (
  id uuid primary key default gen_random_uuid(), user_id uuid not null references public.profiles(id) on delete cascade,
  component_definition_id text not null references public.component_definitions(key), version integer not null default 1,
  title text not null check(length(title) between 1 and 80), enabled boolean not null default true,
  position integer not null check(position between 0 and 10000), config jsonb not null,
  created_at timestamptz not null default now(), updated_at timestamptz not null default now()
);
create index instances_owner_position on public.user_component_instances(user_id,position);
create function public.is_approved() returns boolean language sql stable security definer set search_path = '' as $$ select exists(select 1 from public.profiles where id = auth.uid() and account_status = 'approved') $$;
create function public.is_admin() returns boolean language sql stable security definer set search_path = '' as $$ select exists(select 1 from public.profiles where id = auth.uid() and account_status = 'approved' and role = 'admin') $$;
create function public.handle_new_user() returns trigger language plpgsql security definer set search_path = '' as $$
begin
  insert into public.profiles(id,username) values (new.id, new.raw_user_meta_data->>'username');
  return new;
end $$;
create trigger on_auth_user_created after insert on auth.users for each row execute function public.handle_new_user();
alter table public.profiles enable row level security;
alter table public.events enable row level security;
alter table public.user_component_instances enable row level security;
alter table public.event_type_definitions enable row level security;
alter table public.component_definitions enable row level security;
alter table public.operator_definitions enable row level security;
create policy profiles_read on public.profiles for select to authenticated using (id = auth.uid() or public.is_admin());
create policy events_read on public.events for select to authenticated using (user_id = auth.uid() and public.is_approved());
create policy instances_read on public.user_component_instances for select to authenticated using (user_id = auth.uid() and public.is_approved());
create policy event_definitions_read on public.event_type_definitions for select to authenticated using (public.is_approved());
create policy component_definitions_read on public.component_definitions for select to authenticated using (public.is_approved());
create policy operators_read on public.operator_definitions for select to authenticated using (public.is_approved());
-- No direct write grants or policies. RPCs below are the only authenticated write surface.
revoke all on public.profiles,public.events,public.user_component_instances,public.event_type_definitions,public.component_definitions,public.operator_definitions from anon,authenticated;
grant select on public.profiles,public.events,public.user_component_instances,public.event_type_definitions,public.component_definitions,public.operator_definitions to authenticated;

create function public.validate_event(p jsonb) returns void language plpgsql set search_path = '' as $$
declare kind text := p->>'eventType'; body jsonb := p->'payload'; item jsonb;
begin
  if (p->>'schemaVersion')::integer is distinct from 1 then raise exception 'Unsupported schema version'; end if;
  if not exists(select 1 from public.event_type_definitions where key=kind and active) then raise exception 'Event type unavailable'; end if;
  if jsonb_typeof(body) is distinct from 'object' then raise exception 'Invalid event payload'; end if;
  if p->>'occurredAt' is null or not isfinite((p->>'occurredAt')::timestamptz) then raise exception 'Invalid event time'; end if;
  if (p->>'startedAt' is not null and not isfinite((p->>'startedAt')::timestamptz)) or (p->>'endedAt' is not null and not isfinite((p->>'endedAt')::timestamptz)) then raise exception 'Invalid duration'; end if;
  if length(p->>'notes') > 4000 then raise exception 'Invalid notes'; end if;
  if p->>'endedAt' is not null and (p->>'startedAt' is null or (p->>'endedAt')::timestamptz < (p->>'startedAt')::timestamptz) then raise exception 'Invalid duration'; end if;
  if kind='pain_measurement' then
    if jsonb_typeof(body->'painLevel') is distinct from 'number' or not ((body->>'painLevel')::numeric between 0 and 10) or jsonb_typeof(body->'injuryId') is distinct from 'string' or coalesce(length(btrim(body->>'injuryId')),0) not between 1 and 80 or body - array['painLevel','injuryId'] <> '{}'::jsonb then raise exception 'Invalid pain payload'; end if;
  elsif kind='workout' then
    if jsonb_typeof(body->'name') is distinct from 'string' or coalesce(length(btrim(body->>'name')),0) not between 1 and 120 or body - 'name' <> '{}'::jsonb then raise exception 'Invalid workout payload'; end if;
  elsif kind='exercise' then
    if jsonb_typeof(body->'exerciseId') is distinct from 'string' or coalesce(length(btrim(body->>'exerciseId')),0) not between 1 and 80 or jsonb_typeof(body->'sets') is distinct from 'array' or body - array['exerciseId','sets'] <> '{}'::jsonb then raise exception 'Invalid exercise payload'; end if;
    if jsonb_array_length(body->'sets') not between 1 and 100 then raise exception 'Invalid sets'; end if;
    for item in select value from jsonb_array_elements(body->'sets') loop
      if jsonb_typeof(item->'reps') is distinct from 'number' or jsonb_typeof(item->'weightKg') is distinct from 'number' or not ((item->>'reps')::numeric between 1 and 1000) or (item->>'reps')::numeric <> trunc((item->>'reps')::numeric) or not ((item->>'weightKg')::numeric between 0 and 2000) or item - array['reps','weightKg'] <> '{}'::jsonb then raise exception 'Invalid set'; end if;
    end loop;
  elsif kind='training_session' then
    if jsonb_typeof(body->'activityId') is distinct from 'string' or coalesce(length(btrim(body->>'activityId')),0) not between 1 and 80 or body - 'activityId' <> '{}'::jsonb then raise exception 'Invalid session payload'; end if;
  elsif kind='measurement' then
    if jsonb_typeof(body->'metricId') is distinct from 'string' or coalesce(length(btrim(body->>'metricId')),0) not between 1 and 80 or jsonb_typeof(body->'value') is distinct from 'number' or jsonb_typeof(body->'unit') is distinct from 'string' or length(body->>'unit') > 24 or body - array['metricId','value','unit'] <> '{}'::jsonb then raise exception 'Invalid measurement payload'; end if;
  else raise exception 'Unsupported event type'; end if;
  if p->>'parentEventId' is not null and (kind <> 'exercise' or not exists(select 1 from public.events where id=(p->>'parentEventId')::uuid and user_id=auth.uid() and event_type='workout')) then raise exception 'Invalid workout parent'; end if;
end $$;

create function public.validate_pipeline(p jsonb) returns void language plpgsql set search_path = '' as $$
declare s jsonb; k text; extracted boolean := false;
begin
  if jsonb_typeof(p) is distinct from 'array' then raise exception 'Invalid pipeline'; end if;
  if jsonb_array_length(p) not between 1 and 12 then raise exception 'Invalid pipeline length'; end if;
  for s in select value from jsonb_array_elements(p) loop
    k := s->>'key';
    if not exists(select 1 from public.operator_definitions where key=k and active) then raise exception 'Operator unavailable'; end if;
    if k like 'filter_%' and extracted then raise exception 'Invalid operator order'; end if;
    if k='filter_type' and not exists(select 1 from public.event_type_definitions where key=s->>'eventType') then raise exception 'Invalid event type filter';
    elsif k='filter_target' and (coalesce(s->>'field','') not in ('exerciseId','injuryId','activityId','metricId') or coalesce(length(s->>'value'),0) not between 1 and 80) then raise exception 'Invalid target filter';
    elsif k='filter_date' then
      if s->>'from' is null or s->>'to' is null or not isfinite((s->>'from')::timestamptz) or not isfinite((s->>'to')::timestamptz) or (s->>'from')::timestamptz > (s->>'to')::timestamptz then raise exception 'Invalid date filter'; end if;
    elsif k in ('extract_field','placeholder_volume_load') then
      if extracted or (k='extract_field' and coalesce(s->>'field','') not in ('painLevel','value')) then raise exception 'Invalid numeric transform'; end if; extracted := true;
    elsif k='daily_aggregation' then
      if not extracted or coalesce(s->>'method','') not in ('sum','average','min','max','count') then raise exception 'Invalid aggregation'; end if;
    elsif k='moving_average' then
      if not extracted or coalesce((s->>'window')::numeric,0) not between 1 and 90 or (s->>'window')::numeric <> trunc((s->>'window')::numeric) then raise exception 'Invalid moving average'; end if;
    elsif k='align_by_date' then raise exception 'Invalid pipeline: alignment belongs to the renderer input';
    end if;
  end loop;
  if not extracted then raise exception 'Invalid pipeline: numeric transform required'; end if;
end $$;
create function public.validate_component(p jsonb) returns void language plpgsql set search_path = '' as $$
declare k text := p->>'componentDefinitionId'; c jsonb := p->'config'; s jsonb;
begin
  if not exists(select 1 from public.component_definitions where key=k and active) then raise exception 'Component unavailable'; end if;
  if (p->>'version')::integer is distinct from 1 or jsonb_typeof(c) is distinct from 'object' or coalesce(length(btrim(p->>'title')),0) not between 1 and 80 then raise exception 'Invalid component'; end if;
  if k in ('pain_logger','exercise_logger','session_logger','value_logger') and jsonb_typeof(c->'showNotes') is distinct from 'boolean' then raise exception 'Invalid notes setting'; end if;
  if k='pain_logger' then
    if jsonb_typeof(c->'targets') is distinct from 'array' then raise exception 'Invalid targets'; end if;
    if jsonb_array_length(c->'targets') not between 1 and 12 or (select count(distinct value) from jsonb_array_elements(c->'targets')) <> jsonb_array_length(c->'targets') then raise exception 'Invalid targets'; end if;
    for s in select value from jsonb_array_elements(c->'targets') loop if jsonb_typeof(s) <> 'string' or length(btrim(s #>> '{}')) not between 1 and 80 then raise exception 'Invalid target'; end if; end loop;
  elsif k='exercise_logger' then
    if coalesce(length(btrim(c->>'exerciseId')),0) not between 1 and 80 or coalesce((c->>'defaultReps')::numeric,0) not between 1 and 1000 or (c->>'defaultReps')::numeric <> trunc((c->>'defaultReps')::numeric) or coalesce((c->>'defaultWeight')::numeric,-1) not between 0 and 2000 then raise exception 'Invalid exercise configuration'; end if;
  elsif k='session_logger' then
    if coalesce(length(btrim(c->>'activityId')),0) not between 1 and 80 then raise exception 'Invalid activity'; end if;
  elsif k='value_logger' then
    if coalesce(length(btrim(c->>'metricId')),0) not between 1 and 80 or jsonb_typeof(c->'unit') is distinct from 'string' or length(c->>'unit') > 24 then raise exception 'Invalid measurement configuration'; end if;
  elsif k in ('graph','statistic') then
    if coalesce((c->>'days')::integer,0) not between 1 and 365 then raise exception 'Invalid date range'; end if;
    if k='graph' then
      if coalesce(c->>'display','') not in ('line','bar') or jsonb_typeof(c->'sources') is distinct from 'array' then raise exception 'Invalid graph'; end if;
      if jsonb_array_length(c->'sources') not between 1 and 2 then raise exception 'Invalid graph sources'; end if;
      for s in select value from jsonb_array_elements(c->'sources') loop
        if coalesce(length(s->>'name'),0) not between 1 and 80 or jsonb_typeof(s->'unit') is distinct from 'string' or length(s->>'unit') > 24 then raise exception 'Invalid source'; end if;
        perform public.validate_pipeline(s->'pipeline');
      end loop;
    else
      if coalesce(c->>'method','') not in ('sum','average','count','latest') or coalesce(length(c->'source'->>'name'),0) not between 1 and 80 or jsonb_typeof(c->'source'->'unit') is distinct from 'string' or length(c->'source'->>'unit') > 24 then raise exception 'Invalid statistic'; end if;
      perform public.validate_pipeline(c->'source'->'pipeline');
    end if;
  elsif k='recent_events' then
    if coalesce((c->>'limit')::integer,0) not between 1 and 50 then raise exception 'Invalid list limit'; end if;
  else raise exception 'Unsupported component'; end if;
end $$;

create function public.mutate_workspace(mutation jsonb) returns void language plpgsql security definer set search_path = '' as $$
declare action text := mutation->>'action'; item jsonb; old public.events; inst public.user_component_instances; target uuid; stamp timestamptz := clock_timestamp(); ids uuid[]; n integer := 0;
begin
  if not public.is_approved() then raise exception 'Approved account required' using errcode='42501'; end if;
  if action='createEvents' then
    if jsonb_typeof(mutation->'events') is distinct from 'array' then raise exception 'Invalid events'; end if;
    if jsonb_array_length(mutation->'events') not between 1 and 100 then raise exception 'Invalid batch size'; end if;
    -- Parents inserted first; the entire RPC is one transaction.
    for item in select value from jsonb_array_elements(mutation->'events') order by case when value->>'parentEventId' is null then 0 else 1 end loop
      perform public.validate_event(item);
      insert into public.events(id,user_id,event_type,schema_version,occurred_at,started_at,ended_at,parent_event_id,batch_id,payload,notes)
      values((item->>'id')::uuid,auth.uid(),item->>'eventType',(item->>'schemaVersion')::integer,(item->>'occurredAt')::timestamptz,(item->>'startedAt')::timestamptz,(item->>'endedAt')::timestamptz,(item->>'parentEventId')::uuid,(item->>'batchId')::uuid,item->'payload',item->>'notes');
    end loop;
  elsif action in ('editEvent','deleteEvent','lockEvent') then
    target := coalesce(mutation->'event'->>'id',mutation->>'id')::uuid;
    select * into old from public.events where id=target and user_id=auth.uid() for update;
    if not found then raise exception 'Event not found'; end if;
    if old.updated_at is distinct from (mutation->>'expectedUpdatedAt')::timestamptz then raise exception 'This event changed elsewhere. Refresh and try again.'; end if;
    if action='lockEvent' then
      if jsonb_typeof(mutation->'locked') is distinct from 'boolean' then raise exception 'Invalid lock state'; end if;
      update public.events set is_locked=(mutation->>'locked')::boolean,updated_at=stamp where id=target;
    else
      if old.is_locked then raise exception 'Unlock this event before editing or deleting it.'; end if;
      if action='deleteEvent' then
        if exists(select 1 from public.events where parent_event_id=target) then raise exception 'Delete or detach the exercises in this workout first.'; end if;
        delete from public.events where id=target;
      else
        item := mutation->'event'; perform public.validate_event(item);
        if item->>'eventType' <> old.event_type then raise exception 'Event type cannot be changed.'; end if;
        update public.events set occurred_at=(item->>'occurredAt')::timestamptz, started_at=(item->>'startedAt')::timestamptz,ended_at=(item->>'endedAt')::timestamptz,parent_event_id=(item->>'parentEventId')::uuid,batch_id=(item->>'batchId')::uuid,payload=item->'payload',notes=item->>'notes',updated_at=stamp where id=target;
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
create function public.admin_mutate(mutation jsonb) returns void language plpgsql security definer set search_path = '' as $$
begin
  if not public.is_admin() then raise exception 'Administrator access required' using errcode='42501'; end if;
  if mutation->>'action'='status' then
    if (mutation->>'id')::uuid = auth.uid() then raise exception 'Cannot change your own status'; end if;
    update public.profiles set account_status=mutation->>'status',updated_at=clock_timestamp() where id=(mutation->>'id')::uuid;
  elsif mutation->>'action'='definition' and mutation->>'table' in ('component_definitions','event_type_definitions','operator_definitions') then
    execute format('update public.%I set active=$1 where key=$2',mutation->>'table') using (mutation->>'active')::boolean,mutation->>'key';
  else raise exception 'Invalid admin action'; end if;
end $$;
revoke all on function public.handle_new_user(), public.validate_event(jsonb), public.validate_pipeline(jsonb), public.validate_component(jsonb), public.mutate_workspace(jsonb), public.admin_mutate(jsonb), public.is_approved(), public.is_admin() from public,anon,authenticated;
grant execute on function public.is_approved(),public.is_admin(),public.mutate_workspace(jsonb),public.admin_mutate(jsonb) to authenticated;
