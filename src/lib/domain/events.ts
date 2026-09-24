import { z } from "zod";

const identifier = z.string().trim().min(1).max(80);
export const exercisePayloadSchema = z
  .object({
    exerciseId: identifier,
    sets: z
      .array(
        z
          .object({
            reps: z.number().int().min(0).max(1000),
            weightKg: z.number().min(0).max(2000),
          })
          .strict(),
      )
      .min(1)
      .max(100),
  })
  .strict();
export const workoutExerciseSchema = exercisePayloadSchema
  .extend({
    occurredAt: z.iso.datetime({ offset: true }).optional(),
    notes: z.string().max(4000).nullable().optional(),
    legacy: z.record(z.string(), z.unknown()).optional(),
  })
  .strict();
export const painReadingSchema = z
  .object({ injuryId: identifier, painLevel: z.number().min(0).max(10) })
  .strict();
export type PainReading = z.infer<typeof painReadingSchema>;
export const painCheckInSchema = z
  .object({
    name: identifier.optional(),
    readings: z
      .array(painReadingSchema)
      .min(1)
      .max(12)
      .refine(
        (readings) =>
          new Set(readings.map((r) => r.injuryId)).size === readings.length,
        "Each injury can appear only once in a check-in.",
      ),
  })
  .strict();
const volleyballRatingsSchema = z
  .object({
    activityId: z.literal("volleyball"),
    intensity: z.number().int().min(0).max(10),
    jumps: z.number().int().min(0).max(10),
  })
  .strict();
export const volleyballSessionSchema = z.union([
  volleyballRatingsSchema.extend({
    sessionType: z.literal("practice").default("practice"),
  }),
  volleyballRatingsSchema.extend({
    sessionType: z.literal("match"),
    setsPlayed: z.number().int().min(0).max(5),
  }),
]);
export type VolleyballSession = z.infer<typeof volleyballSessionSchema>;
export const payloadSchemas = {
  pain_measurement: z.union([
    painReadingSchema.extend({ name: identifier.optional() }),
    painCheckInSchema,
  ]),
  workout: z
    .object({
      name: z.string().trim().min(1).max(120),
      exercises: z.array(workoutExerciseSchema).min(1).max(1000).optional(),
    })
    .strict(),
  exercise: exercisePayloadSchema,
  training_session: z.union([
    z.object({ activityId: identifier }).strict(),
    volleyballSessionSchema,
  ]),
  measurement: z
    .object({
      metricId: identifier,
      value: z.number().finite(),
      unit: z.string().max(24),
    })
    .strict(),
};
export type EventType = keyof typeof payloadSchemas;
export const eventTypes = Object.keys(payloadSchemas) as EventType[];
export const eventNames: Record<EventType, string> = {
  pain_measurement: "Pain check-in",
  workout: "Workout",
  exercise: "Exercise",
  training_session: "Training session",
  measurement: "Measurement",
};
const timestamp = z.iso.datetime({ offset: true });
export const eventInputSchema = z
  .object({
    id: z.uuid(),
    eventType: z.enum(eventTypes),
    schemaVersion: z.literal(1),
    occurredAt: timestamp,
    startedAt: timestamp.nullable().default(null),
    endedAt: timestamp.nullable().default(null),
    parentEventId: z.uuid().nullable().default(null),
    batchId: z.uuid().nullable().default(null),
    payload: z.unknown(),
    notes: z.string().max(4000).nullable().default(null),
  })
  .strict()
  .superRefine((event, ctx) => {
    const parsed = payloadSchemas[event.eventType].safeParse(event.payload);
    if (!parsed.success)
      ctx.addIssue({
        code: "custom",
        path: ["payload"],
        message:
          "Invalid " +
          eventNames[event.eventType].toLowerCase() +
          " data: " +
          parsed.error.issues.map((i) => i.message).join(", "),
      });
    if (event.endedAt && !event.startedAt)
      ctx.addIssue({
        code: "custom",
        path: ["endedAt"],
        message: "Add a start time before an end time.",
      });
    if (
      event.startedAt &&
      event.endedAt &&
      Date.parse(event.endedAt) < Date.parse(event.startedAt)
    )
      ctx.addIssue({
        code: "custom",
        path: ["endedAt"],
        message: "End time must be after start time.",
      });
    if (event.parentEventId && event.eventType !== "exercise")
      ctx.addIssue({
        code: "custom",
        path: ["parentEventId"],
        message: "Only exercises support a workout parent in version 1.",
      });
    if (event.parentEventId === event.id)
      ctx.addIssue({
        code: "custom",
        path: ["parentEventId"],
        message: "An event cannot be its own parent.",
      });
  });
export type EventInput = z.infer<typeof eventInputSchema>;
export type EventRecord = Omit<EventInput, "schemaVersion"> & {
  schemaVersion: number;
  userId: string;
  isLocked: boolean;
  autoLockAt?: string | null;
  createdAt: string;
  updatedAt: string;
};
export type Profile = {
  id: string;
  username: string;
  role: "admin" | "user";
  accountStatus: "pending" | "approved" | "rejected" | "disabled";
};
export const registrationSchema = z.object({
  username: z
    .string()
    .regex(
      /^[a-zA-Z0-9_]{3,30}$/,
      "Use 3–30 letters, numbers, or underscores.",
    ),
  email: z.email(),
  password: z.string().min(8).max(128),
});
export function assertApproved(
  profile: Profile | null,
): asserts profile is Profile {
  if (!profile || profile.accountStatus !== "approved")
    throw new Error("Your account must be approved to use the app.");
}
export function assertAdmin(profile: Profile) {
  assertApproved(profile);
  if (profile.role !== "admin")
    throw new Error("Administrator access required.");
}
export function assertMutable(
  event: EventRecord,
  profile: Profile,
  expectedUpdatedAt: string,
) {
  assertApproved(profile);
  if (event.userId !== profile.id) throw new Error("Event not found.");
  if (event.isLocked)
    throw new Error("Unlock this event before editing or deleting it.");
  if (event.updatedAt !== expectedUpdatedAt)
    throw new Error("This event changed elsewhere. Refresh and try again.");
}
export function validateParent(
  event: EventInput,
  events: EventRecord[],
  userId: string,
) {
  if (!event.parentEventId) return;
  const parent = events.find(
    (e) => e.id === event.parentEventId && e.userId === userId,
  );
  if (
    !parent ||
    parent.eventType !== "workout" ||
    "exercises" in (parent.payload as object)
  )
    throw new Error("Select an existing workout that belongs to you.");
}
export function describeEvent(event: EventRecord): string {
  const parsed = payloadSchemas[event.eventType]?.safeParse(event.payload);
  if (!parsed?.success || event.schemaVersion !== 1)
    return "Unsupported historical data";
  const p = parsed.data;
  if (event.eventType === "pain_measurement")
    return ("name" in p && p.name) || "Pain check-in";
  if ("exerciseId" in p)
    return `${label(p.exerciseId)} · ${p.sets.length} sets`;
  if ("name" in p && p.name) return p.name;
  if ("activityId" in p) return label(p.activityId);
  if ("metricId" in p) return `${label(p.metricId)} · ${p.value} ${p.unit}`;
  return eventNames[event.eventType];
}
export function eventSearchText(event: EventRecord): string {
  const title = describeEvent(event);
  if (event.eventType !== "pain_measurement") return title;
  const parsed = payloadSchemas.pain_measurement.safeParse(event.payload);
  if (!parsed.success) return title;
  const readings =
    "readings" in parsed.data ? parsed.data.readings : [parsed.data];
  return `${title} ${readings.map((r) => `${label(r.injuryId)} ${r.painLevel}/10`).join(" ")}`;
}
export function label(value: string) {
  return value.replace(/[-_]/g, " ").replace(/^./, (c) => c.toUpperCase());
}
export function newEvent(
  eventType: EventType,
  payload: unknown,
  extra: Partial<EventInput> = {},
): EventInput {
  return eventInputSchema.parse({
    id: crypto.randomUUID(),
    eventType,
    schemaVersion: 1,
    occurredAt: new Date().toISOString(),
    payload,
    ...extra,
  });
}
