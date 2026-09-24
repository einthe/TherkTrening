begin;

insert into public.operator_definitions(key,name) values
  ('chart_source','Chart data source'), ('chart_trend','Chart trend');

create function public.validate_chart_config(c jsonb) returns void language plpgsql set search_path = '' as $$
declare entry jsonb; source jsonb; kind text; metric text; r jsonb := c->'range';
begin
  if c - array['version','range','mode','entries'] <> '{}'::jsonb or c->'version' is distinct from '2'::jsonb
    or jsonb_typeof(r) is distinct from 'object' or r - array['amount','unit'] <> '{}'::jsonb
    or jsonb_typeof(r->'amount') is distinct from 'number' or (r->>'amount')::numeric not between 1 and 365 or (r->>'amount')::numeric <> trunc((r->>'amount')::numeric)
    or coalesce(r->>'unit','') not in ('days','weeks') or coalesce(c->>'mode','') not in ('raw','day','week')
    or jsonb_typeof(c->'entries') is distinct from 'array' then raise exception 'Invalid chart settings'; end if;
  if jsonb_array_length(c->'entries') not between 1 and 20 then raise exception 'Invalid chart entries: choose 1 to 20'; end if;
  if (select count(distinct (value->>'id')::uuid) from jsonb_array_elements(c->'entries')) <> jsonb_array_length(c->'entries') then raise exception 'Invalid chart entry IDs'; end if;
  for entry in select value from jsonb_array_elements(c->'entries') loop
    if jsonb_typeof(entry) is distinct from 'object' or entry - array['id','name','source','display','mode','color'] <> '{}'::jsonb
      or jsonb_typeof(entry->'id') is distinct from 'string' or (entry->>'id')::uuid is null
      or jsonb_typeof(entry->'name') is distinct from 'string' or length(btrim(entry->>'name')) > 80
      or coalesce(entry->>'display','') not in ('line','dots','bar') or coalesce(entry->>'mode','') not in ('inherit','raw','day','week')
      or jsonb_typeof(entry->'color') is distinct from 'string' or not (entry->>'color' in ('volume','pain') or entry->>'color' ~ '^#[0-9a-fA-F]{6}$') then raise exception 'Invalid chart entry'; end if;
    source := entry->'source'; kind := source->>'type'; metric := source->>'metric';
    if kind <> 'legacy' and not exists(select 1 from public.operator_definitions where key='chart_source' and active) then raise exception 'Operator unavailable'; end if;
    if (case when entry->>'mode'='inherit' then c->>'mode' else entry->>'mode' end) <> 'raw'
      and not exists(select 1 from public.operator_definitions where key='chart_trend' and active) then raise exception 'Operator unavailable'; end if;
    if jsonb_typeof(source) is distinct from 'object' then raise exception 'Invalid chart source'; end if;
    if kind='legacy' then
      if source - array['type','unit','pipeline'] <> '{}'::jsonb or jsonb_typeof(source->'unit') is distinct from 'string' or length(source->>'unit') > 24 then raise exception 'Invalid saved chart source'; end if;
      perform public.validate_pipeline(source->'pipeline');
    elsif kind in ('exercise','workout','pain','activity','measurement') then
      if jsonb_typeof(source->'target') is distinct from 'string' or coalesce(length(btrim(source->>'target')),0) not between 1 and (case when kind='workout' then 120 else 80 end) then raise exception 'Invalid chart target'; end if;
      if kind='measurement' then
        if source - array['type','target','metric','unit'] <> '{}'::jsonb or jsonb_typeof(source->'unit') is distinct from 'string' or length(source->>'unit') > 24 then raise exception 'Invalid chart measurement'; end if;
      elsif source - array['type','target','metric'] <> '{}'::jsonb then raise exception 'Invalid chart source fields'; end if;
      if metric is null or not (
        (kind='exercise' and metric in ('volume','weight','averageWeight','sets','reps')) or
        (kind='workout' and metric in ('volume','sets','reps','exercises','count','duration')) or
        (kind='pain' and metric='painLevel') or (kind='activity' and metric in ('count','duration')) or
        (kind='measurement' and metric='value')
      ) then raise exception 'Invalid chart metric'; end if;
    elsif kind='volleyball' then
      if source - array['type','sessionType','metric'] <> '{}'::jsonb or coalesce(source->>'sessionType','') not in ('all','practice','match')
        or coalesce(metric,'') not in ('intensity','jumps','setsPlayed','count','duration') then raise exception 'Invalid volleyball chart source'; end if;
    else raise exception 'Invalid chart data type'; end if;
  end loop;
end $$;
revoke all on function public.validate_chart_config(jsonb) from public,anon,authenticated;

create or replace function public.validate_component(p jsonb) returns void language plpgsql set search_path = '' as $$
declare k text := p->>'componentDefinitionId'; c jsonb := p->'config'; s jsonb;
begin
  if not exists(select 1 from public.component_definitions where key=k and active) then raise exception 'Component unavailable'; end if;
  if (p->>'version')::integer is distinct from 1 or jsonb_typeof(c) is distinct from 'object' or coalesce(length(btrim(p->>'title')),0) not between 1 and 80 then raise exception 'Invalid component'; end if;
  if k='graph' and c->'version'='2'::jsonb then perform public.validate_chart_config(c); return; end if;
  if k in ('pain_logger','exercise_logger','session_logger','value_logger') and jsonb_typeof(c->'showNotes') is distinct from 'boolean' then raise exception 'Invalid notes setting'; end if;
  if k='pain_logger' then
    if jsonb_typeof(c->'targets') is distinct from 'array' then raise exception 'Invalid targets'; end if;
    if jsonb_array_length(c->'targets') not between 1 and 12 or (select count(distinct value) from jsonb_array_elements(c->'targets')) <> jsonb_array_length(c->'targets') then raise exception 'Invalid targets'; end if;
    for s in select value from jsonb_array_elements(c->'targets') loop if jsonb_typeof(s) <> 'string' or length(btrim(s #>> '{}')) not between 1 and 80 then raise exception 'Invalid target'; end if; end loop;
  elsif k='exercise_logger' then
    if coalesce(length(btrim(c->>'exerciseId')),0) not between 1 and 80 or coalesce((c->>'defaultReps')::numeric,0) not between 1 and 1000 or (c->>'defaultReps')::numeric <> trunc((c->>'defaultReps')::numeric) or coalesce((c->>'defaultWeight')::numeric,-1) not between 0 and 2000 then raise exception 'Invalid exercise configuration'; end if;
  elsif k='volleyball_logger' then
    if jsonb_typeof(c->'showNotes') is distinct from 'boolean' or c - 'showNotes' <> '{}'::jsonb then raise exception 'Invalid volleyball configuration'; end if;
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

commit;
