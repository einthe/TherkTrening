begin;

create or replace function public.validate_event(p jsonb) returns void language plpgsql set search_path = '' as $$
declare kind text := p->>'eventType'; body jsonb := p->'payload'; item jsonb; rating_key text;
begin
  if (p->>'schemaVersion')::integer is distinct from 1 then raise exception 'Unsupported schema version'; end if;
  if not exists(select 1 from public.event_type_definitions where key=kind and active) then raise exception 'Event type unavailable'; end if;
  if jsonb_typeof(body) is distinct from 'object' then raise exception 'Invalid event payload'; end if;
  if p->>'occurredAt' is null or not isfinite((p->>'occurredAt')::timestamptz) then raise exception 'Invalid event time'; end if;
  if (p->>'startedAt' is not null and not isfinite((p->>'startedAt')::timestamptz)) or (p->>'endedAt' is not null and not isfinite((p->>'endedAt')::timestamptz)) then raise exception 'Invalid duration'; end if;
  if length(p->>'notes') > 4000 then raise exception 'Invalid notes'; end if;
  if p->>'endedAt' is not null and (p->>'startedAt' is null or (p->>'endedAt')::timestamptz < (p->>'startedAt')::timestamptz) then raise exception 'Invalid duration'; end if;
  if kind='pain_measurement' then
    if body ? 'name' and (jsonb_typeof(body->'name') is distinct from 'string' or coalesce(length(btrim(body->>'name')),0) not between 1 and 80) then raise exception 'Invalid pain check-in name'; end if;
    if body ? 'readings' then
      if body - array['readings','name'] <> '{}'::jsonb or jsonb_typeof(body->'readings') is distinct from 'array' then raise exception 'Invalid pain payload'; end if;
      if jsonb_array_length(body->'readings') not between 1 and 12 then raise exception 'Invalid pain readings'; end if;
      for item in select value from jsonb_array_elements(body->'readings') loop
        if jsonb_typeof(item) is distinct from 'object' or jsonb_typeof(item->'painLevel') is distinct from 'number' or not ((item->>'painLevel')::numeric between 0 and 10) or jsonb_typeof(item->'injuryId') is distinct from 'string' or coalesce(length(btrim(item->>'injuryId')),0) not between 1 and 80 or item - array['painLevel','injuryId'] <> '{}'::jsonb then raise exception 'Invalid pain reading'; end if;
      end loop;
      if (select count(distinct btrim(value->>'injuryId')) from jsonb_array_elements(body->'readings')) <> jsonb_array_length(body->'readings') then raise exception 'Duplicate injury in pain check-in'; end if;
    else
      if jsonb_typeof(body->'painLevel') is distinct from 'number' or not ((body->>'painLevel')::numeric between 0 and 10) or jsonb_typeof(body->'injuryId') is distinct from 'string' or coalesce(length(btrim(body->>'injuryId')),0) not between 1 and 80 or body - array['painLevel','injuryId','name'] <> '{}'::jsonb then raise exception 'Invalid pain payload'; end if;
    end if;
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
    if jsonb_typeof(body->'activityId') is distinct from 'string' or coalesce(length(btrim(body->>'activityId')),0) not between 1 and 80 or body - array['activityId','intensity','jumps','sessionType','setsPlayed'] <> '{}'::jsonb then raise exception 'Invalid session payload'; end if;
    if body ? 'intensity' or body ? 'jumps' or body ? 'sessionType' or body ? 'setsPlayed' then
      if body->>'activityId' <> 'volleyball' then raise exception 'Invalid volleyball activity'; end if;
      foreach rating_key in array array['intensity','jumps'] loop
        if jsonb_typeof(body->rating_key) is distinct from 'number' or (body->>rating_key)::numeric not between 0 and 10 or (body->>rating_key)::numeric <> trunc((body->>rating_key)::numeric) then raise exception 'Invalid volleyball rating: use whole numbers from 0 to 10'; end if;
      end loop;
      if body ? 'sessionType' and (jsonb_typeof(body->'sessionType') is distinct from 'string' or body->>'sessionType' not in ('practice','match')) then raise exception 'Invalid volleyball session type'; end if;
      if body->>'sessionType'='match' then
        if jsonb_typeof(body->'setsPlayed') is distinct from 'number' or (body->>'setsPlayed')::numeric not between 0 and 5 or (body->>'setsPlayed')::numeric <> trunc((body->>'setsPlayed')::numeric) then raise exception 'Invalid volleyball sets played: use a whole number from 0 to 5'; end if;
      elsif body ? 'setsPlayed' then raise exception 'Invalid volleyball sets played: only matches include sets';
      end if;
    end if;
  elsif kind='measurement' then
    if jsonb_typeof(body->'metricId') is distinct from 'string' or coalesce(length(btrim(body->>'metricId')),0) not between 1 and 80 or jsonb_typeof(body->'value') is distinct from 'number' or jsonb_typeof(body->'unit') is distinct from 'string' or length(body->>'unit') > 24 or body - array['metricId','value','unit'] <> '{}'::jsonb then raise exception 'Invalid measurement payload'; end if;
  else raise exception 'Unsupported event type'; end if;
  if p->>'parentEventId' is not null and (kind <> 'exercise' or not exists(select 1 from public.events where id=(p->>'parentEventId')::uuid and user_id=auth.uid() and event_type='workout' and not (payload ? 'exercises'))) then raise exception 'Invalid workout parent'; end if;
end $$;

commit;
