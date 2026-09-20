import { z } from "zod";
import { pipelineSchema, type Pipeline } from "./operators";
import { defaultExercise, workoutExercisesSchema } from "./workouts";
const common = { showNotes: z.boolean().default(false) };
export const graphSourceSchema = z
  .object({
    name: z.string().min(1).max(80),
    unit: z.string().max(24),
    pipeline: pipelineSchema,
  })
  .strict();
export const componentSchemas = {
  pain_logger: z
    .object({
      ...common,
      targets: z
        .array(z.string().trim().min(1).max(80))
        .min(1)
        .max(12)
        .refine((v) => new Set(v).size === v.length, "Targets must be unique."),
    })
    .strict(),
  workout_logger: z
    .object({ ...common, exercises: workoutExercisesSchema })
    .strict(),
  session_logger: z
    .object({ ...common, activityId: z.string().trim().min(1).max(80) })
    .strict(),
  value_logger: z
    .object({
      ...common,
      metricId: z.string().trim().min(1).max(80),
      unit: z.string().max(24),
    })
    .strict(),
  graph: z
    .object({
      days: z.number().int().min(1).max(365),
      display: z.enum(["line", "bar"]),
      sources: z.array(graphSourceSchema).min(1).max(2),
    })
    .strict(),
  statistic: z
    .object({
      days: z.number().int().min(1).max(365),
      source: graphSourceSchema,
      method: z.enum(["sum", "average", "count", "latest"]),
    })
    .strict(),
  recent_events: z.object({ limit: z.number().int().min(1).max(50) }).strict(),
  weekly_summary: z.object({}).strict(),
};
export type ComponentKey = keyof typeof componentSchemas;
export type GraphConfig = z.infer<typeof componentSchemas.graph>;
export type Instance = {
  id: string;
  userId: string;
  componentDefinitionId: ComponentKey;
  version: number;
  title: string;
  enabled: boolean;
  position: number;
  config: unknown;
  createdAt: string;
  updatedAt: string;
};
export type Definition = {
  key: string;
  name: string;
  active: boolean;
  version: number;
};
export const volumePipeline = (exercise = "squat"): Pipeline => [
  { key: "filter_type", eventType: "exercise" },
  { key: "filter_target", field: "exerciseId", value: exercise },
  { key: "placeholder_volume_load" },
  { key: "daily_aggregation", method: "sum" },
];
export const painPipeline = (injury = "left-knee"): Pipeline => [
  { key: "filter_type", eventType: "pain_measurement" },
  { key: "filter_target", field: "injuryId", value: injury },
  { key: "extract_field", field: "painLevel" },
  { key: "daily_aggregation", method: "average" },
];
export const componentDefinitions = [
  {
    key: "weekly_summary",
    name: "Last 7 days",
    kind: "display",
    description:
      "Training sessions, pain check-ins, and active days over the past week.",
    icon: "activity",
    supportedEventTypes: [],
    capabilities: { canReadEvents: true },
    config: {},
  },
  {
    key: "pain_logger",
    name: "Pain check-in",
    kind: "logger",
    description: "A quick check-in for one or more joints or injuries.",
    icon: "heart",
    supportedEventTypes: ["pain_measurement"],
    capabilities: { canCreateEvents: true, canCreateMultipleEvents: true },
    config: { targets: ["left-knee"], showNotes: false },
  },
  {
    key: "workout_logger",
    name: "Workout",
    kind: "logger",
    description:
      "Log a workout with expandable exercises and reusable templates.",
    icon: "dumbbell",
    supportedEventTypes: ["workout"],
    capabilities: { canCreateEvents: true, canCreateMultipleEvents: true },
    config: { exercises: [defaultExercise()], showNotes: false },
  },
  {
    key: "graph",
    name: "Volume & pain",
    kind: "display",
    description: "Compare training volume with how you feel over time.",
    icon: "chart",
    supportedEventTypes: ["exercise", "pain_measurement", "measurement"],
    capabilities: { canReadEvents: true, canRunOperators: true },
    config: {
      days: 21,
      display: "line",
      sources: [
        { name: "Squat volume", unit: "kg·reps", pipeline: volumePipeline() },
        { name: "Left knee pain", unit: "/10", pipeline: painPipeline() },
      ],
    },
  },
  {
    key: "session_logger",
    name: "Training session",
    kind: "logger",
    description: "Log an activity with optional duration.",
    icon: "activity",
    supportedEventTypes: ["training_session"],
    capabilities: { canCreateEvents: true },
    config: { activityId: "volleyball", showNotes: true },
  },
  {
    key: "value_logger",
    name: "Quick measurement",
    kind: "logger",
    description: "Record a numeric value in your own units.",
    icon: "gauge",
    supportedEventTypes: ["measurement"],
    capabilities: { canCreateEvents: true },
    config: { metricId: "body-weight", unit: "kg", showNotes: false },
  },
  {
    key: "statistic",
    name: "Statistic",
    kind: "display",
    description: "Show a total, average, count, or latest value.",
    icon: "gauge",
    supportedEventTypes: ["exercise", "pain_measurement", "measurement"],
    capabilities: { canReadEvents: true, canRunOperators: true },
    config: {
      days: 21,
      method: "sum",
      source: {
        name: "Squat volume",
        unit: "kg·reps",
        pipeline: volumePipeline(),
      },
    },
  },
  {
    key: "recent_events",
    name: "Recent activity",
    kind: "display",
    description: "Show your latest logged events.",
    icon: "history",
    supportedEventTypes: [],
    capabilities: { canReadEvents: true },
    config: { limit: 5 },
  },
] as const;
export const instanceInputSchema = z
  .object({
    id: z.uuid(),
    componentDefinitionId: z.enum(
      Object.keys(componentSchemas) as [ComponentKey, ...ComponentKey[]],
    ),
    version: z.literal(1),
    title: z.string().trim().min(1).max(80),
    enabled: z.boolean(),
    position: z.number().int().min(0).max(10000),
    config: z.unknown(),
  })
  .strict()
  .superRefine((v, ctx) => {
    const r = componentSchemas[v.componentDefinitionId].safeParse(v.config);
    if (!r.success)
      ctx.addIssue({
        code: "custom",
        path: ["config"],
        message: r.error.issues.map((i) => i.message).join(", "),
      });
  });
export type InstanceInput = z.infer<typeof instanceInputSchema>;
export function makeInstance(
  key: ComponentKey,
  position: number,
): InstanceInput {
  const d = componentDefinitions.find((d) => d.key === key)!;
  return instanceInputSchema.parse({
    id: crypto.randomUUID(),
    componentDefinitionId: key,
    version: 1,
    title: d.name,
    enabled: true,
    position,
    config: structuredClone(d.config),
  });
}
