import { z } from "zod";
import { eventTypes, payloadSchemas, type EventRecord } from "./events";

export type Point = { date: string; value: number };
export const stepSchema = z.discriminatedUnion("key", [
  z
    .object({ key: z.literal("filter_type"), eventType: z.enum(eventTypes) })
    .strict(),
  z
    .object({
      key: z.literal("filter_target"),
      field: z.enum(["exerciseId", "injuryId", "activityId", "metricId"]),
      value: z.string().min(1).max(80),
    })
    .strict(),
  z
    .object({
      key: z.literal("filter_date"),
      from: z.iso.datetime({ offset: true }),
      to: z.iso.datetime({ offset: true }),
    })
    .strict(),
  z
    .object({
      key: z.literal("extract_field"),
      field: z.enum(["painLevel", "value"]),
    })
    .strict(),
  z.object({ key: z.literal("placeholder_volume_load") }).strict(),
  z
    .object({
      key: z.literal("daily_aggregation"),
      method: z.enum(["sum", "average", "min", "max", "count"]),
    })
    .strict(),
  z
    .object({
      key: z.literal("moving_average"),
      window: z.number().int().min(1).max(90),
    })
    .strict(),
]);
export const pipelineSchema = z.array(stepSchema).min(1).max(12);
export type Pipeline = z.infer<typeof pipelineSchema>;
export const operatorDefinitions = [
  {
    key: "filter_type",
    name: "Event type filter",
    description: "Select events by their registered type.",
  },
  {
    key: "filter_target",
    name: "Target filter",
    description: "Select an injury, exercise, activity, or metric.",
  },
  {
    key: "filter_date",
    name: "Date range filter",
    description: "Filter by the time an event occurred.",
  },
  {
    key: "extract_field",
    name: "Numeric field",
    description: "Extract a registered numeric field.",
  },
  {
    key: "placeholder_volume_load",
    name: "Training volume (placeholder)",
    description:
      "Sets × reps × weight for identical sets; otherwise sum each set’s reps × weight (kg). Not a medical measure or loading-capacity estimate.",
  },
  {
    key: "daily_aggregation",
    name: "Daily aggregation",
    description: "Group recorded values by UTC calendar day.",
  },
  {
    key: "moving_average",
    name: "Moving average",
    description:
      "Average the last N recorded points; missing days remain unmeasured.",
  },
  {
    key: "align_by_date",
    name: "Align by date",
    description: "Outer join calendar days, keeping missing measurements null.",
  },
];
/** Sum each set once. Identical sets reduce to set count × reps × weight. */
export function totalSetVolume(
  sets: readonly { reps: number; weightKg: number }[],
): number {
  return sets.reduce((sum, set) => sum + set.reps * set.weightKg, 0);
}
export function volumeLoad(payload: unknown): number {
  return totalSetVolume(payloadSchemas.exercise.parse(payload).sets);
}
export function dailyAggregation(
  points: Point[],
  method: "sum" | "average" | "min" | "max" | "count",
): Point[] {
  const groups = new Map<string, number[]>();
  for (const point of points) {
    if (!Number.isFinite(point.value) || Number.isNaN(Date.parse(point.date)))
      throw new Error("Invalid series point.");
    const day = new Date(point.date).toISOString().slice(0, 10);
    groups.set(day, [...(groups.get(day) ?? []), point.value]);
  }
  return [...groups]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([date, values]) => ({
      date,
      value:
        method === "count"
          ? values.length
          : method === "min"
            ? Math.min(...values)
            : method === "max"
              ? Math.max(...values)
              : values.reduce((a, b) => a + b, 0) /
                (method === "average" ? values.length : 1),
    }));
}
export function runPipeline(
  input: EventRecord[],
  serialized: unknown,
  allowed = operatorDefinitions.map((o) => o.key),
): Point[] {
  const pipeline = pipelineSchema.parse(serialized);
  let events = [...input];
  let points: Point[] | null = null;
  for (const step of pipeline) {
    if (!allowed.includes(step.key))
      throw new Error(`Operator ${step.key} is unavailable.`);
    if (step.key.startsWith("filter_") && points)
      throw new Error("Event filters must precede numeric transforms.");
    switch (step.key) {
      case "filter_type":
        events = events.filter((e) => e.eventType === step.eventType);
        break;
      case "filter_target":
        events = events.filter(
          (e) =>
            e.payload &&
            typeof e.payload === "object" &&
            (e.payload as Record<string, unknown>)[step.field] === step.value,
        );
        break;
      case "filter_date":
        if (Date.parse(step.from) > Date.parse(step.to))
          throw new Error("Invalid date range.");
        events = events.filter(
          (e) =>
            Date.parse(e.occurredAt) >= Date.parse(step.from) &&
            Date.parse(e.occurredAt) <= Date.parse(step.to),
        );
        break;
      case "extract_field":
      case "placeholder_volume_load":
        if (points)
          throw new Error("A pipeline may extract numeric values only once.");
        points = events.map((e) => {
          if (e.schemaVersion !== 1)
            throw new Error("Unsupported event schema version.");
          const p = payloadSchemas[e.eventType].parse(e.payload);
          const value =
            step.key === "placeholder_volume_load"
              ? e.eventType === "exercise"
                ? volumeLoad(p)
                : NaN
              : (p as Record<string, unknown>)[step.field];
          if (typeof value !== "number" || !Number.isFinite(value))
            throw new Error(
              "This operator is incompatible with the selected events.",
            );
          return { date: e.occurredAt, value };
        });
        break;
      case "daily_aggregation":
        if (!points)
          throw new Error("Extract numeric values before aggregation.");
        points = dailyAggregation(points, step.method);
        break;
      case "moving_average":
        if (!points)
          throw new Error("Extract numeric values before averaging.");
        {
          const sorted: Point[] = [...points].sort((a, b) =>
            a.date.localeCompare(b.date),
          );
          points = sorted.map((p, i) => {
            const window = sorted.slice(
              Math.max(0, i - step.window + 1),
              i + 1,
            );
            return {
              date: p.date,
              value: window.reduce((s, p) => s + p.value, 0) / window.length,
            };
          });
        }
        break;
    }
  }
  if (!points) throw new Error("Pipeline must produce a numeric series.");
  return points;
}
export function alignByDate(
  series: Point[][],
): { date: string; [key: string]: string | number | null }[] {
  const dates = [
    ...new Set(series.flatMap((s) => s.map((p) => p.date))),
  ].sort();
  return dates.map((date) =>
    Object.assign(
      { date },
      ...series.map((s, i) => ({
        [`series${i}`]: s.find((p) => p.date === date)?.value ?? null,
      })),
    ),
  );
}
