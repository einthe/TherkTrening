insert into public.component_definitions(key, name) values ('weekly_summary', 'Last 7 days');

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
  elsif k='weekly_summary' then
    if c <> '{}'::jsonb then raise exception 'Invalid weekly summary configuration'; end if;
  else raise exception 'Unsupported component'; end if;
end $$;
