create table public.workout_templates (
  id uuid primary key,
  user_id uuid not null references public.profiles(id) on delete cascade,
  name text not null check (length(btrim(name)) between 1 and 120),
  version integer not null default 1 check (version = 1),
  exercises jsonb not null,
  created_at timestamptz not null default now()
);
create unique index workout_template_names on public.workout_templates(user_id, lower(name));
create table public.user_exercises (
  user_id uuid not null references public.profiles(id) on delete cascade,
  id text not null check (length(id) between 1 and 80),
  name text not null check (length(btrim(name)) between 1 and 80),
  created_at timestamptz not null default now(),
  primary key (user_id, id)
);
create unique index user_exercise_names on public.user_exercises(user_id, lower(name));
alter table public.workout_templates enable row level security;
alter table public.user_exercises enable row level security;
create policy workout_templates_read on public.workout_templates for select to authenticated using (public.is_approved() and user_id = auth.uid());
create policy user_exercises_read on public.user_exercises for select to authenticated using (public.is_approved() and user_id = auth.uid());
revoke all on public.workout_templates, public.user_exercises from public, anon, authenticated;
grant select on public.workout_templates, public.user_exercises to authenticated;

create function public.validate_workout_exercises(exercises jsonb) returns void language plpgsql set search_path = '' as $$
declare exercise jsonb; item jsonb;
begin
  if jsonb_typeof(exercises) is distinct from 'array' then raise exception 'Invalid workout exercises'; end if;
  if jsonb_array_length(exercises) not between 1 and 30 then raise exception 'Invalid workout: add 1–30 exercises'; end if;
  for exercise in select value from jsonb_array_elements(exercises) loop
    if jsonb_typeof(exercise) is distinct from 'object' or jsonb_typeof(exercise->'exerciseId') is distinct from 'string' or coalesce(length(btrim(exercise->>'exerciseId')),0) not between 1 and 80 or jsonb_typeof(exercise->'sets') is distinct from 'array' or exercise - array['exerciseId','sets'] <> '{}'::jsonb then raise exception 'Invalid workout exercise'; end if;
    if jsonb_array_length(exercise->'sets') not between 1 and 100 then raise exception 'Invalid sets'; end if;
    for item in select value from jsonb_array_elements(exercise->'sets') loop
      if jsonb_typeof(item) is distinct from 'object' or jsonb_typeof(item->'reps') is distinct from 'number' or jsonb_typeof(item->'weightKg') is distinct from 'number' or not ((item->>'reps')::numeric between 1 and 1000) or (item->>'reps')::numeric <> trunc((item->>'reps')::numeric) or not ((item->>'weightKg')::numeric between 0 and 2000) or item - array['reps','weightKg'] <> '{}'::jsonb then raise exception 'Invalid set'; end if;
    end loop;
  end loop;
end $$;

create function public.mutate_workout_library(mutation jsonb) returns void language plpgsql security definer set search_path = '' as $$
declare item jsonb;
begin
  if not public.is_approved() then raise exception 'Approved account required' using errcode='42501'; end if;
  if mutation->>'action' = 'saveWorkoutTemplate' then
    item := mutation->'template';
    if jsonb_typeof(item) is distinct from 'object' or item - array['id','name','version','exercises'] <> '{}'::jsonb or jsonb_typeof(item->'name') is distinct from 'string' or coalesce(length(btrim(item->>'name')),0) not between 1 and 120 or item->'version' is distinct from '1'::jsonb then raise exception 'Invalid template'; end if;
    perform public.validate_workout_exercises(item->'exercises');
    insert into public.workout_templates(id, user_id, name, exercises) values ((item->>'id')::uuid, auth.uid(), btrim(item->>'name'), item->'exercises');
  elsif mutation->>'action' = 'createExercise' then
    item := mutation->'exercise';
    if jsonb_typeof(item) is distinct from 'object' or item - array['id','name'] <> '{}'::jsonb or jsonb_typeof(item->'id') is distinct from 'string' or coalesce(length(btrim(item->>'id')),0) not between 1 and 80 or jsonb_typeof(item->'name') is distinct from 'string' or coalesce(length(btrim(item->>'name')),0) not between 1 and 80 then raise exception 'Invalid exercise'; end if;
    insert into public.user_exercises(user_id,id,name) values(auth.uid(), btrim(item->>'id'), btrim(item->>'name'));
  else raise exception 'Invalid action'; end if;
exception when unique_violation then
  raise exception 'Invalid name: already saved. Choose a new name.';
end $$;
revoke all on function public.validate_workout_exercises(jsonb), public.mutate_workout_library(jsonb) from public, anon, authenticated;
grant execute on function public.mutate_workout_library(jsonb) to authenticated;

insert into public.component_definitions(key, name, active)
values ('workout_logger', 'Workout', coalesce((select active from public.component_definitions where key='exercise_logger'), true));
-- Convert card configuration only. Historical exercise/workout events stay intact.
update public.user_component_instances
set component_definition_id = 'workout_logger',
    title = case when lower(title) in ('squat', 'exercise logger', lower(replace(config->>'exerciseId','-',' '))) then 'Workout' else title end,
    config = jsonb_build_object('showNotes',config->'showNotes','exercises',jsonb_build_array(jsonb_build_object('exerciseId',config->'exerciseId','sets',jsonb_build_array(
      jsonb_build_object('reps',config->'defaultReps','weightKg',config->'defaultWeight'),
      jsonb_build_object('reps',config->'defaultReps','weightKg',config->'defaultWeight'),
      jsonb_build_object('reps',config->'defaultReps','weightKg',config->'defaultWeight')
    )))), updated_at = clock_timestamp()
where component_definition_id = 'exercise_logger';
update public.component_definitions set active=false where key='exercise_logger';

create or replace function public.validate_component(p jsonb) returns void language plpgsql set search_path = '' as $$
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
  elsif k='workout_logger' then
    if jsonb_typeof(c->'showNotes') is distinct from 'boolean' or c - array['showNotes','exercises'] <> '{}'::jsonb then raise exception 'Invalid workout configuration'; end if;
    perform public.validate_workout_exercises(c->'exercises');
  elsif k='weekly_summary' then
    if c <> '{}'::jsonb then raise exception 'Invalid weekly summary configuration'; end if;
  else raise exception 'Unsupported component'; end if;
end $$;
