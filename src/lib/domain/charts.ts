import { z } from "zod";
import {
  payloadSchemas,
  volleyballSessionSchema,
  type EventRecord,
} from "./events";
import {
  pipelineSchema,
  runPipeline,
  totalSetVolume,
  operatorDefinitions,
} from "./operators";

const target = z.string().trim().min(1).max(120);
export const chartSourceSchema = z.discriminatedUnion("type", [
  z
    .object({
      type: z.literal("exercise"),
      target: target.max(80),
      metric: z.enum(["volume", "weight", "averageWeight", "sets", "reps"]),
    })
    .strict(),
  z
    .object({
      type: z.literal("workout"),
      target,
      metric: z.enum([
        "volume",
        "sets",
        "reps",
        "exercises",
        "count",
        "duration",
      ]),
    })
    .strict(),
  z
    .object({
      type: z.literal("pain"),
      target: target.max(80),
      metric: z.literal("painLevel"),
    })
    .strict(),
  z
    .object({
      type: z.literal("volleyball"),
      sessionType: z.enum(["all", "practice", "match"]),
      metric: z.enum(["intensity", "jumps", "setsPlayed", "count", "duration"]),
    })
    .strict(),
  z
    .object({
      type: z.literal("activity"),
      target: target.max(80),
      metric: z.enum(["count", "duration"]),
    })
    .strict(),
  z
    .object({
      type: z.literal("measurement"),
      target: target.max(80),
      unit: z.string().max(24),
      metric: z.literal("value"),
    })
    .strict(),
  z
    .object({
      type: z.literal("legacy"),
      unit: z.string().max(24),
      pipeline: pipelineSchema,
    })
    .strict(),
]);
export type ChartSource = z.infer<typeof chartSourceSchema>;
export const chartModeSchema = z.enum(["raw", "day", "week"]);
export type ChartMode = z.infer<typeof chartModeSchema>;
export const chartEntrySchema = z
  .object({
    id: z.uuid(),
    name: z.string().trim().max(80),
    source: chartSourceSchema,
    display: z.enum(["line", "dots", "bar"]),
    mode: z.enum(["inherit", "raw", "day", "week"]),
    color: z.union([
      z.string().regex(/^#[0-9a-fA-F]{6}$/),
      z.enum(["volume", "pain"]),
    ]),
  })
  .strict();
export type ChartEntry = z.infer<typeof chartEntrySchema>;
export const chartConfigSchema = z
  .object({
    version: z.literal(2),
    range: z
      .object({
        amount: z.number().int().min(1).max(365),
        unit: z.enum(["days", "weeks"]),
      })
      .strict(),
    mode: chartModeSchema,
    entries: z
      .array(chartEntrySchema)
      .min(1)
      .max(20)
      .refine(
        (entries) => new Set(entries.map((e) => e.id)).size === entries.length,
        "Entry IDs must be unique.",
      ),
  })
  .strict();
export type ChartConfig = z.infer<typeof chartConfigSchema>;
export const legacyChartSchema = z
  .object({
    days: z.number().int().min(1).max(365),
    display: z.enum(["line", "bar"]),
    sources: z
      .array(
        z
          .object({
            name: z.string().min(1).max(80),
            unit: z.string().max(24),
            pipeline: pipelineSchema,
          })
          .strict(),
      )
      .min(1)
      .max(2),
  })
  .strict();
export function upgradeChartConfig(input: unknown): ChartConfig {
  const current = chartConfigSchema.safeParse(input);
  if (current.success) return current.data;
  const old = legacyChartSchema.parse(input);
  return {
    version: 2,
    range: { amount: old.days, unit: "days" },
    mode: "raw",
    entries: old.sources.map((source, i) => ({
      id: `00000000-0000-4000-8000-${String(i + 1).padStart(12, "0")}`,
      name: source.name,
      source: { type: "legacy", unit: source.unit, pipeline: source.pipeline },
      display: old.display,
      mode: "inherit",
      color: i === 0 ? "volume" : "pain",
    })),
  };
}
export const chartColors = [
  "#22d3ee",
  "#f87171",
  "#4ade80",
  "#60a5fa",
  "#c084fc",
  "#fbbf24",
  "#fb923c",
  "#f472b6",
];
export const metricLabels: Record<string, string> = {
  volume: "Volume",
  weight: "Heaviest weight",
  averageWeight: "Average set weight",
  sets: "Sets",
  reps: "Total reps",
  exercises: "Exercises",
  count: "Sessions",
  duration: "Duration",
  painLevel: "Pain level",
  intensity: "Intensity",
  jumps: "Jumps",
  setsPlayed: "Sets played",
  value: "Value",
};
export const sourceMetrics = {
  exercise: ["volume", "weight", "averageWeight", "sets", "reps"],
  workout: ["volume", "sets", "reps", "exercises", "count", "duration"],
  pain: ["painLevel"],
  volleyball: ["intensity", "jumps", "setsPlayed", "count", "duration"],
  activity: ["count", "duration"],
  measurement: ["value"],
  legacy: [],
} as const;
export const sourceLabels = {
  exercise: "Exercise",
  workout: "Workout",
  pain: "Pain check-in",
  volleyball: "Volleyball",
  activity: "Training activity",
  measurement: "Measurement",
  legacy: "Saved calculation",
};
export function chartUnit(source: ChartSource): string {
  if (source.type === "legacy" || source.type === "measurement")
    return source.unit;
  switch (source.metric) {
    case "volume":
      return "kg·reps";
    case "weight":
    case "averageWeight":
      return "kg";
    case "sets":
    case "setsPlayed":
      return "sets";
    case "reps":
      return "reps";
    case "exercises":
      return "exercises";
    case "duration":
      return "min";
    case "count":
      return "sessions";
    default:
      return "/10";
  }
}
export type ChartPoint = { time: number; value: number | null; count: number };
const DAY = 86400000;
export function chartRange(config: ChartConfig, now: Date) {
  const end = now.getTime();
  const days = config.range.amount * (config.range.unit === "weeks" ? 7 : 1);
  const start =
    Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()) -
    (days - 1) * DAY;
  return { start, end };
}
function duration(event: EventRecord): number | undefined {
  if (!event.startedAt || !event.endedAt) return undefined;
  const value =
    (Date.parse(event.endedAt) - Date.parse(event.startedAt)) / 60000;
  return value >= 0 && Number.isFinite(value) ? value : undefined;
}
export function extractChartPoints(
  events: EventRecord[],
  source: ChartSource,
  start: number,
  end: number,
  allowed = operatorDefinitions.map((o) => o.key),
): ChartPoint[] {
  if (source.type === "legacy")
    return runPipeline(
      events,
      [
        {
          key: "filter_date",
          from: new Date(start).toISOString(),
          to: new Date(end).toISOString(),
        },
        ...source.pipeline,
      ],
      allowed,
    ).map((p) => ({ time: Date.parse(p.date), value: p.value, count: 1 }));
  if (!allowed.includes("chart_source"))
    throw new Error("Chart data sources are unavailable.");
  const points: ChartPoint[] = [];
  const add = (time: string, value: number | undefined) => {
    const stamp = Date.parse(time);
    if (
      stamp >= start &&
      stamp <= end &&
      value !== undefined &&
      Number.isFinite(value)
    )
      points.push({ time: stamp, value, count: 1 });
  };
  const exerciseValue = (
    sets: { reps: number; weightKg: number }[],
    metric: string,
  ) => {
    if (metric === "sets") return sets.length;
    if (metric === "reps") return sets.reduce((n, s) => n + s.reps, 0);
    if (metric === "volume") return totalSetVolume(sets);
    if (metric === "averageWeight")
      return sets.reduce((n, s) => n + s.weightKg, 0) / sets.length;
    return Math.max(...sets.map((s) => s.weightKg));
  };
  // Nested workouts are canonical; avoid counting legacy child rows a second time.
  const nestedParents = new Set(
    events
      .filter(
        (e) =>
          e.eventType === "workout" &&
          payloadSchemas.workout.safeParse(e.payload).success &&
          Array.isArray((e.payload as { exercises?: unknown }).exercises),
      )
      .map((e) => e.id),
  );
  for (const event of events) {
    if (event.schemaVersion !== 1) continue;
    if (source.type === "exercise") {
      if (
        event.eventType === "exercise" &&
        (!event.parentEventId || !nestedParents.has(event.parentEventId))
      ) {
        const p = payloadSchemas.exercise.safeParse(event.payload);
        if (
          p.success &&
          (source.target === "*" || p.data.exerciseId === source.target)
        )
          add(event.occurredAt, exerciseValue(p.data.sets, source.metric));
      } else if (event.eventType === "workout") {
        const p = payloadSchemas.workout.safeParse(event.payload);
        if (p.success)
          for (const exercise of p.data.exercises ?? [])
            if (source.target === "*" || exercise.exerciseId === source.target)
              add(
                exercise.occurredAt ?? event.occurredAt,
                exerciseValue(exercise.sets, source.metric),
              );
      }
    } else if (source.type === "workout" && event.eventType === "workout") {
      const p = payloadSchemas.workout.safeParse(event.payload);
      if (
        !p.success ||
        (source.target !== "*" && p.data.name !== source.target)
      )
        continue;
      const exercises =
        p.data.exercises ??
        events
          .filter(
            (e) =>
              e.parentEventId === event.id &&
              e.eventType === "exercise" &&
              e.schemaVersion === 1,
          )
          .flatMap((e) => {
            const p = payloadSchemas.exercise.safeParse(e.payload);
            return p.success ? [p.data] : [];
          });
      const sets = exercises.flatMap((e) => e.sets);
      const value =
        source.metric === "count"
          ? 1
          : source.metric === "duration"
            ? duration(event)
            : source.metric === "exercises"
              ? exercises.length
              : exerciseValue(sets, source.metric);
      add(event.occurredAt, value);
    } else if (
      source.type === "pain" &&
      event.eventType === "pain_measurement"
    ) {
      const p = payloadSchemas.pain_measurement.safeParse(event.payload);
      if (p.success)
        for (const reading of "readings" in p.data ? p.data.readings : [p.data])
          if (reading.injuryId === source.target)
            add(event.occurredAt, reading.painLevel);
    } else if (
      (source.type === "volleyball" || source.type === "activity") &&
      event.eventType === "training_session"
    ) {
      const p = payloadSchemas.training_session.safeParse(event.payload);
      if (!p.success) continue;
      if (source.type === "activity") {
        if (source.target === "*" || p.data.activityId === source.target)
          add(
            event.occurredAt,
            source.metric === "count" ? 1 : duration(event),
          );
      } else if (p.data.activityId === "volleyball") {
        const rated = volleyballSessionSchema.safeParse(p.data);
        const type = rated.success ? rated.data.sessionType : "practice";
        if (source.sessionType !== "all" && source.sessionType !== type)
          continue;
        const metric = source.metric;
        if (metric === "count" || metric === "duration")
          add(event.occurredAt, metric === "count" ? 1 : duration(event));
        else if (rated.success)
          add(
            event.occurredAt,
            metric === "setsPlayed"
              ? rated.data.sessionType === "match"
                ? rated.data.setsPlayed
                : undefined
              : rated.data[metric],
          );
      }
    } else if (
      source.type === "measurement" &&
      event.eventType === "measurement"
    ) {
      const p = payloadSchemas.measurement.safeParse(event.payload);
      if (
        p.success &&
        p.data.metricId === source.target &&
        p.data.unit === source.unit
      )
        add(event.occurredAt, p.data.value);
    }
  }
  return points.sort((a, b) => a.time - b.time);
}
export function averageChartPoints(
  points: ChartPoint[],
  mode: ChartMode,
  start: number,
  end: number,
): ChartPoint[] {
  if (mode === "raw") return points;
  const bucket = (stamp: number) => {
    const d = new Date(stamp);
    d.setUTCHours(0, 0, 0, 0);
    if (mode === "week")
      d.setUTCDate(d.getUTCDate() - ((d.getUTCDay() + 6) % 7));
    return d.getTime();
  };
  const groups = new Map<number, number[]>();
  for (const point of points)
    if (point.value !== null) {
      const key = bucket(point.time);
      const group = groups.get(key) ?? [];
      group.push(point.value);
      groups.set(key, group);
    }
  const result: ChartPoint[] = [];
  for (
    let time = bucket(start);
    time <= end;
    time += mode === "week" ? DAY * 7 : DAY
  ) {
    const values = groups.get(time) ?? [];
    result.push({
      time,
      value: values.length
        ? values.reduce((a, b) => a + b, 0) / values.length
        : null,
      count: values.length,
    });
  }
  return result;
}
export type ChartSeries = {
  entry: ChartEntry;
  mode: ChartMode;
  unit: string;
  points: ChartPoint[];
  error?: string;
};
export function buildChartSeries(
  events: EventRecord[],
  config: ChartConfig,
  now: Date,
  allowed = operatorDefinitions.map((o) => o.key),
): ChartSeries[] {
  const { start, end } = chartRange(config, now);
  return config.entries.map((entry) => {
    const mode = entry.mode === "inherit" ? config.mode : entry.mode;
    try {
      if (mode !== "raw" && !allowed.includes("chart_trend"))
        throw new Error("Chart trends are unavailable.");
      return {
        entry,
        mode,
        unit: chartUnit(entry.source),
        points: averageChartPoints(
          extractChartPoints(events, entry.source, start, end, allowed),
          mode,
          start,
          end,
        ),
      };
    } catch (e) {
      return {
        entry,
        mode,
        unit: chartUnit(entry.source),
        points: [],
        error:
          e instanceof Error ? e.message : "Unable to calculate this entry.",
      };
    }
  });
}

export type ChartCatalog = {
  exercises: { id: string; name: string }[];
  injuries: { id: string; name: string }[];
  workouts: string[];
  activities: string[];
  measurements: { id: string; unit: string }[];
};
export const emptyChartCatalog: ChartCatalog = {
  exercises: [],
  injuries: [],
  workouts: [],
  activities: [],
  measurements: [],
};
export function chartEntryName(
  entry: ChartEntry,
  catalog: ChartCatalog,
): string {
  if (entry.name) return entry.name;
  const source = entry.source;
  const readable = (value: string) =>
    value.replace(/[-_]/g, " ").replace(/^./, (c) => c.toUpperCase());
  let object = "";
  if (source.type === "exercise")
    object =
      source.target === "*"
        ? "All exercises"
        : (catalog.exercises.find((e) => e.id === source.target)?.name ??
          readable(source.target));
  if (source.type === "workout")
    object = source.target === "*" ? "All workouts" : source.target;
  if (source.type === "pain")
    object =
      catalog.injuries.find((e) => e.id === source.target)?.name ??
      readable(source.target);
  if (source.type === "volleyball")
    object = `Volleyball${source.sessionType === "all" ? "" : source.sessionType === "match" ? " matches" : " practice"}`;
  if (source.type === "activity")
    object = source.target === "*" ? "All activities" : readable(source.target);
  if (source.type === "measurement") object = readable(source.target);
  return source.type === "legacy"
    ? "Saved calculation"
    : `${object} ${source.type === "pain" ? "pain" : metricLabels[source.metric].toLowerCase()}`;
}
export function chartDefaultSource(
  type: ChartSource["type"],
  catalog: ChartCatalog,
): ChartSource {
  switch (type) {
    case "exercise":
      return {
        type,
        target: catalog.exercises[0]?.id ?? "*",
        metric: "volume",
      };
    case "workout":
      return { type, target: "*", metric: "volume" };
    case "pain":
      return {
        type,
        target: catalog.injuries[0]?.id ?? "",
        metric: "painLevel",
      };
    case "volleyball":
      return { type, sessionType: "all", metric: "intensity" };
    case "activity":
      return { type, target: "*", metric: "count" };
    case "measurement":
      return {
        type,
        target: catalog.measurements[0]?.id ?? "",
        unit: catalog.measurements[0]?.unit ?? "",
        metric: "value",
      };
    default:
      return { type: "workout", target: "*", metric: "volume" };
  }
}

export function alignChartSeries(series: ChartSeries[]) {
  const rows = new Map<
    string,
    { time: number; ordinal: number; [key: string]: number | null }
  >();
  const segments: { key: string; seriesIndex: number }[] = [];
  series.forEach((s, seriesIndex) => {
    let segment = 0;
    const used = new Set<string>();
    const ordinals = new Map<number, number>();
    for (const point of s.points) {
      const ordinal = ordinals.get(point.time) ?? 0;
      ordinals.set(point.time, ordinal + 1);
      const rowId = `${point.time}:${ordinal}`;
      const row = rows.get(rowId) ?? { time: point.time, ordinal };
      row[s.entry.id] = point.value;
      const key = `s${seriesIndex}_${segment}`;
      row[key] = point.value;
      if (point.value === null) segment++;
      else if (!used.has(key)) {
        used.add(key);
        segments.push({ key, seriesIndex });
      }
      rows.set(rowId, row);
    }
  });
  return {
    rows: [...rows.values()].sort(
      (a, b) => a.time - b.time || a.ordinal - b.ordinal,
    ),
    segments,
  };
}
