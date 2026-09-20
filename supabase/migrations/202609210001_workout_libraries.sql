-- Run the whole file in one transaction, including the legacy workout conversion.
begin;
lock table public.events, public.workout_templates, public.user_exercises in share row exclusive mode;
alter table public.workout_templates add column updated_at timestamptz not null default now();
alter table public.user_exercises add column description text not null default '' check(length(description) <= 1000);
alter table public.user_exercises add column updated_at timestamptz not null default now();
alter table public.workout_templates drop constraint workout_templates_version_check;
alter table public.workout_templates alter column version set default 2;
update public.workout_templates t set version=2, exercises=(
  select jsonb_agg(jsonb_build_object('exerciseId', e->'exerciseId', 'sets', (select jsonb_agg(jsonb_build_object('reps', s->'reps') order by n) from jsonb_array_elements(e->'sets') with ordinality as sets(s,n))) order by position)
  from jsonb_array_elements(t.exercises) with ordinality as exercises(e,position)
);
alter table public.workout_templates add constraint workout_templates_version_check check(version=2);

-- Nest complete original records for provenance, preserving notes, times, and locks.
create temporary table converted_workouts on commit drop as
select w.id, jsonb_agg(e.payload || jsonb_build_object('occurredAt', e.occurred_at, 'notes', e.notes, 'legacy', to_jsonb(e)) order by e.occurred_at,e.created_at,e.id) as exercises,
       bool_or(e.is_locked) as locked
from public.events w join public.events e on e.parent_event_id=w.id and e.user_id=w.user_id
where w.event_type='workout' and w.schema_version=1 and not (w.payload ? 'exercises')
group by w.id having bool_and(e.event_type='exercise' and e.schema_version=1) and count(*) <= 1000;
update public.events w set payload=w.payload || jsonb_build_object('exercises', c.exercises), is_locked=w.is_locked or c.locked, updated_at=clock_timestamp()
from converted_workouts c where w.id=c.id;
delete from public.events e using converted_workouts c where e.parent_event_id=c.id;

create or replace function public.validate_workout_exercises(exercises jsonb) returns void language plpgsql set search_path = '' as $$
declare exercise jsonb; item jsonb;
begin
  if jsonb_typeof(exercises) is distinct from 'array' then raise exception 'Invalid workout exercises'; end if;
  if jsonb_array_length(exercises) not between 1 and 1000 then raise exception 'Invalid workout: add at least one exercise'; end if;
  for exercise in select value from jsonb_array_elements(exercises) loop
    if jsonb_typeof(exercise) is distinct from 'object' or jsonb_typeof(exercise->'exerciseId') is distinct from 'string' or coalesce(length(btrim(exercise->>'exerciseId')),0) not between 1 and 80 or jsonb_typeof(exercise->'sets') is distinct from 'array' or exercise - array['exerciseId','sets','occurredAt','notes','legacy'] <> '{}'::jsonb then raise exception 'Invalid workout exercise'; end if;
    if exercise ? 'occurredAt' and (jsonb_typeof(exercise->'occurredAt') <> 'string' or not isfinite((exercise->>'occurredAt')::timestamptz)) then raise exception 'Invalid exercise time'; end if;
    if exercise ? 'notes' and exercise->'notes' <> 'null'::jsonb and (jsonb_typeof(exercise->'notes') <> 'string' or length(exercise->>'notes') > 4000) then raise exception 'Invalid exercise notes'; end if;
    if exercise ? 'legacy' and jsonb_typeof(exercise->'legacy') <> 'object' then raise exception 'Invalid legacy record'; end if;
    if jsonb_array_length(exercise->'sets') not between 1 and 100 then raise exception 'Invalid sets'; end if;
    for item in select value from jsonb_array_elements(exercise->'sets') loop
      if jsonb_typeof(item) is distinct from 'object' or jsonb_typeof(item->'reps') is distinct from 'number' or jsonb_typeof(item->'weightKg') is distinct from 'number' or not ((item->>'reps')::numeric between 0 and 1000) or (item->>'reps')::numeric <> trunc((item->>'reps')::numeric) or not ((item->>'weightKg')::numeric between 0 and 2000) or item - array['reps','weightKg'] <> '{}'::jsonb then raise exception 'Invalid set'; end if;
    end loop;
  end loop;
end $$;
create or replace function public.mutate_workout_library(mutation jsonb) returns void language plpgsql security definer set search_path = '' as $$
declare item jsonb; exercise jsonb; rowset jsonb; old public.workout_templates; old_exercise public.user_exercises; stamp timestamptz := clock_timestamp();
begin
  if not public.is_approved() then raise exception 'Approved account required' using errcode='42501'; end if;
  -- Serialize writes to each user's library, including first-time standard-exercise overrides.
  perform 1 from public.profiles where id=auth.uid() for update;
  if mutation->>'action' = 'saveWorkoutTemplate' then
    item := mutation->'template';
    if jsonb_typeof(item) is distinct from 'object' or item - array['id','name','version','exercises'] <> '{}'::jsonb or jsonb_typeof(item->'name') is distinct from 'string' or coalesce(length(btrim(item->>'name')),0) not between 1 and 120 or item->'version' is distinct from '2'::jsonb then raise exception 'Invalid template'; end if;
    if jsonb_typeof(item->'exercises') is distinct from 'array' then raise exception 'Invalid workout exercises'; end if;
    if jsonb_array_length(item->'exercises') not between 1 and 1000 then raise exception 'Invalid workout exercises'; end if;
    for exercise in select value from jsonb_array_elements(item->'exercises') loop
      if jsonb_typeof(exercise) is distinct from 'object' or exercise - array['exerciseId','sets'] <> '{}'::jsonb or jsonb_typeof(exercise->'exerciseId') is distinct from 'string' or coalesce(length(btrim(exercise->>'exerciseId')),0) not between 1 and 80 or jsonb_typeof(exercise->'sets') is distinct from 'array' then raise exception 'Invalid template exercise'; end if;
      if jsonb_array_length(exercise->'sets') not between 1 and 100 then raise exception 'Invalid sets'; end if;
      for rowset in select value from jsonb_array_elements(exercise->'sets') loop
        if jsonb_typeof(rowset) is distinct from 'object' or rowset - 'reps' <> '{}'::jsonb or jsonb_typeof(rowset->'reps') is distinct from 'number' or not ((rowset->>'reps')::numeric between 0 and 1000) or (rowset->>'reps')::numeric <> trunc((rowset->>'reps')::numeric) then raise exception 'Invalid template set: templates contain reps only'; end if;
      end loop;
    end loop;
    select * into old from public.workout_templates where id=(item->>'id')::uuid for update;
    if found then
      if old.user_id <> auth.uid() then raise exception 'Invalid template owner'; end if;
      if old.updated_at is distinct from (mutation->>'expectedUpdatedAt')::timestamptz then raise exception 'Template changed elsewhere. Refresh and try again.'; end if;
      update public.workout_templates set name=btrim(item->>'name'),exercises=item->'exercises',updated_at=stamp where id=old.id;
    else
      if mutation->>'expectedUpdatedAt' is not null then raise exception 'Template changed elsewhere. Refresh and try again.'; end if;
      insert into public.workout_templates(id,user_id,name,version,exercises,updated_at) values((item->>'id')::uuid,auth.uid(),btrim(item->>'name'),2,item->'exercises',stamp);
    end if;
  elsif mutation->>'action' = 'deleteWorkoutTemplate' then
    select * into old from public.workout_templates where id=(mutation->>'id')::uuid and user_id=auth.uid() for update;
    if not found or old.updated_at is distinct from (mutation->>'expectedUpdatedAt')::timestamptz then raise exception 'Template changed elsewhere. Refresh and try again.'; end if;
    delete from public.workout_templates where id=old.id;
  elsif mutation->>'action' in ('createExercise','saveExercise') then
    item := mutation->'exercise';
    if jsonb_typeof(item) is distinct from 'object' or item - array['id','name','description'] <> '{}'::jsonb or jsonb_typeof(item->'id') is distinct from 'string' or coalesce(length(btrim(item->>'id')),0) not between 1 and 80 or jsonb_typeof(item->'name') is distinct from 'string' or coalesce(length(btrim(item->>'name')),0) not between 1 and 80 or (item ? 'description' and (jsonb_typeof(item->'description') <> 'string' or length(item->>'description') > 1000)) then raise exception 'Invalid exercise'; end if;
    select * into old_exercise from public.user_exercises where user_id=auth.uid() and id=item->>'id' for update;
    if found then
      if mutation->>'action'='createExercise' or old_exercise.updated_at is distinct from (mutation->>'expectedUpdatedAt')::timestamptz then raise exception 'Exercise changed elsewhere. Refresh and try again.'; end if;
      update public.user_exercises set name=btrim(item->>'name'),description=coalesce(item->>'description',''),updated_at=stamp where user_id=auth.uid() and id=old_exercise.id;
    else
      if mutation->>'expectedUpdatedAt' is not null then raise exception 'Exercise changed elsewhere. Refresh and try again.'; end if;
      insert into public.user_exercises(user_id,id,name,description,updated_at) values(auth.uid(),item->>'id',btrim(item->>'name'),coalesce(item->>'description',''),stamp);
    end if;
  else raise exception 'Invalid action'; end if;
exception when unique_violation then raise exception 'Invalid name: already saved. Choose a new name.';
end $$;

create or replace function public.validate_event(p jsonb) returns void language plpgsql set search_path = '' as $$
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
    if jsonb_typeof(body->'name') is distinct from 'string' or coalesce(length(btrim(body->>'name')),0) not between 1 and 120 or body - array['name','exercises'] <> '{}'::jsonb then raise exception 'Invalid workout payload'; end if;
    if body ? 'exercises' then perform public.validate_workout_exercises(body->'exercises'); end if;
  elsif kind='exercise' then
    if jsonb_typeof(body->'exerciseId') is distinct from 'string' or coalesce(length(btrim(body->>'exerciseId')),0) not between 1 and 80 or jsonb_typeof(body->'sets') is distinct from 'array' or body - array['exerciseId','sets'] <> '{}'::jsonb then raise exception 'Invalid exercise payload'; end if;
    if jsonb_array_length(body->'sets') not between 1 and 100 then raise exception 'Invalid sets'; end if;
    for item in select value from jsonb_array_elements(body->'sets') loop
      if jsonb_typeof(item->'reps') is distinct from 'number' or jsonb_typeof(item->'weightKg') is distinct from 'number' or not ((item->>'reps')::numeric between 0 and 1000) or (item->>'reps')::numeric <> trunc((item->>'reps')::numeric) or not ((item->>'weightKg')::numeric between 0 and 2000) or item - array['reps','weightKg'] <> '{}'::jsonb then raise exception 'Invalid set'; end if;
    end loop;
  elsif kind='training_session' then
    if jsonb_typeof(body->'activityId') is distinct from 'string' or coalesce(length(btrim(body->>'activityId')),0) not between 1 and 80 or body - 'activityId' <> '{}'::jsonb then raise exception 'Invalid session payload'; end if;
  elsif kind='measurement' then
    if jsonb_typeof(body->'metricId') is distinct from 'string' or coalesce(length(btrim(body->>'metricId')),0) not between 1 and 80 or jsonb_typeof(body->'value') is distinct from 'number' or jsonb_typeof(body->'unit') is distinct from 'string' or length(body->>'unit') > 24 or body - array['metricId','value','unit'] <> '{}'::jsonb then raise exception 'Invalid measurement payload'; end if;
  else raise exception 'Unsupported event type'; end if;
  if p->>'parentEventId' is not null and (kind <> 'exercise' or not exists(select 1 from public.events where id=(p->>'parentEventId')::uuid and user_id=auth.uid() and event_type='workout' and not (payload ? 'exercises'))) then raise exception 'Invalid workout parent'; end if;
end $$;


commit;
