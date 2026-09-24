begin;

lock table public.events, public.user_component_instances in share row exclusive mode;

create table public.user_injuries (
  user_id uuid not null references public.profiles(id) on delete cascade,
  id text not null check(length(btrim(id)) between 1 and 80),
  name text not null check(length(btrim(name)) between 1 and 80),
  notes text not null default '' check(length(notes) <= 4000),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key(user_id,id)
);
alter table public.user_injuries enable row level security;
create policy user_injuries_read on public.user_injuries for select to authenticated
  using(public.is_approved() and user_id=auth.uid());
revoke all on public.user_injuries from public, anon, authenticated;
grant select on public.user_injuries to authenticated;

-- Keep legacy IDs unchanged, including labels used only in historical events or graphs.
with targets as (
  select user_id, target.value as id from public.user_component_instances
    cross join lateral jsonb_array_elements_text(coalesce(config->'targets','[]'::jsonb)) target
    where component_definition_id='pain_logger'
  union
  select user_id, reading->>'injuryId' from public.events
    cross join lateral jsonb_array_elements(case when payload ? 'readings' then payload->'readings' else jsonb_build_array(payload) end) reading
    where event_type='pain_measurement'
  union
  select user_id, step->>'value' from public.user_component_instances
    cross join lateral jsonb_array_elements(coalesce(config->'sources','[]'::jsonb)) source
    cross join lateral jsonb_array_elements(coalesce(source->'pipeline','[]'::jsonb)) step
    where component_definition_id='graph' and step->>'key'='filter_target' and step->>'field'='injuryId'
), names as (
  select user_id,id,replace(replace(id,'-',' '),'_',' ') as name from targets where length(btrim(id)) between 1 and 80
)
insert into public.user_injuries(user_id,id,name)
select user_id,id,upper(left(name,1)) || substr(name,2) from names;

create function public.mutate_injury_library(mutation jsonb) returns void
language plpgsql security definer set search_path = '' as $$
declare item jsonb := mutation->'injury'; old public.user_injuries; stamp timestamptz := clock_timestamp();
begin
  if not public.is_approved() then raise exception 'Approved account required' using errcode='42501'; end if;
  if mutation->>'action' is distinct from 'saveInjury' then raise exception 'Invalid action'; end if;
  if jsonb_typeof(item) is distinct from 'object' or item - array['id','name','notes'] <> '{}'::jsonb
    or jsonb_typeof(item->'id') is distinct from 'string' or coalesce(length(btrim(item->>'id')),0) not between 1 and 80
    or jsonb_typeof(item->'name') is distinct from 'string' or coalesce(length(btrim(item->>'name')),0) not between 1 and 80
    or (item ? 'notes' and (jsonb_typeof(item->'notes') is distinct from 'string' or length(item->>'notes') > 4000)) then
    raise exception 'Invalid injury';
  end if;
  perform 1 from public.profiles where id=auth.uid() for update;
  select * into old from public.user_injuries where user_id=auth.uid() and id=item->>'id' for update;
  if found then
    if old.updated_at is distinct from (mutation->>'expectedUpdatedAt')::timestamptz then raise exception 'Injury changed elsewhere. Refresh and try again.'; end if;
  elsif mutation->>'expectedUpdatedAt' is not null then raise exception 'Injury changed elsewhere. Refresh and try again.';
  end if;
  -- Legacy names can coincide. Preserve those entries, but reject new duplicate names.
  if (old.id is null or lower(old.name) <> lower(btrim(item->>'name'))) and exists(
    select 1 from public.user_injuries where user_id=auth.uid() and id <> item->>'id' and lower(name)=lower(btrim(item->>'name'))
  ) then raise exception 'Invalid injury name: choose a unique name.'; end if;
  if old.id is null then
    insert into public.user_injuries(user_id,id,name,notes,updated_at)
      values(auth.uid(),item->>'id',btrim(item->>'name'),coalesce(item->>'notes',''),stamp);
  else
    update public.user_injuries set name=btrim(item->>'name'),notes=coalesce(item->>'notes',''),updated_at=greatest(stamp,old.updated_at+interval '1 microsecond')
      where user_id=auth.uid() and id=old.id;
  end if;
end $$;
revoke all on function public.mutate_injury_library(jsonb) from public, anon, authenticated;
grant execute on function public.mutate_injury_library(jsonb) to authenticated;

create function public.check_component_injuries() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if new.component_definition_id='pain_logger' and exists(
    select 1 from jsonb_array_elements_text(new.config->'targets') target
    where not exists(select 1 from public.user_injuries where user_id=new.user_id and id=target.value)
  ) then raise exception 'Invalid injury selection. Create injuries in the Injuries section first.'; end if;
  return new;
end $$;
revoke all on function public.check_component_injuries() from public, anon, authenticated;
create trigger component_injuries before insert or update of config on public.user_component_instances
  for each row execute function public.check_component_injuries();

commit;
