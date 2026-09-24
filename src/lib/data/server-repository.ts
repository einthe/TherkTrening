import {
  templateInputSchema,
  customExerciseSchema,
  type WorkoutTemplate,
} from "@/lib/domain/workouts";
import { z } from "zod";
import { eventInputSchema, type EventRecord } from "@/lib/domain/events";
import { instanceInputSchema, type Instance } from "@/lib/domain/components";
export const mutationSchema = z.discriminatedUnion("action", [
  z
    .object({
      action: z.literal("deleteWorkoutTemplate"),
      id: z.uuid(),
      expectedUpdatedAt: z.string(),
    })
    .strict(),
  z
    .object({
      action: z.literal("saveExercise"),
      exercise: customExerciseSchema,
      expectedUpdatedAt: z.string().optional(),
    })
    .strict(),
  z
    .object({
      action: z.literal("saveWorkoutTemplate"),
      template: templateInputSchema,
      expectedUpdatedAt: z.string().optional(),
    })
    .strict(),
  z
    .object({
      action: z.literal("createExercise"),
      exercise: customExerciseSchema,
    })
    .strict(),
  z
    .object({
      action: z.literal("createEvents"),
      timeZone: z.string().min(1).max(100).optional(),
      events: z.array(eventInputSchema).min(1).max(100),
    })
    .strict(),
  z
    .object({
      action: z.literal("editEvent"),
      timeZone: z.string().min(1).max(100).optional(),
      event: eventInputSchema,
      expectedUpdatedAt: z.string().min(1),
    })
    .strict(),
  z
    .object({
      action: z.literal("deleteEvent"),
      id: z.uuid(),
      expectedUpdatedAt: z.string().min(1),
    })
    .strict(),
  z
    .object({
      action: z.literal("lockEvent"),
      id: z.uuid(),
      locked: z.boolean(),
      expectedUpdatedAt: z.string().min(1),
    })
    .strict(),
  z
    .object({
      action: z.literal("saveInstance"),
      timeZone: z.string().min(1).max(100).optional(),
      instance: instanceInputSchema,
      expectedUpdatedAt: z.string().optional(),
    })
    .strict(),
  z.object({ action: z.literal("removeInstance"), id: z.uuid() }).strict(),
  z
    .object({
      action: z.literal("reorder"),
      ids: z
        .array(z.uuid())
        .max(100)
        .refine((ids) => new Set(ids).size === ids.length),
    })
    .strict(),
]);
export function eventFromRow(r: Record<string, unknown>): EventRecord {
  return {
    id: r.id,
    userId: r.user_id,
    eventType: r.event_type,
    schemaVersion: r.schema_version,
    occurredAt: r.occurred_at,
    startedAt: r.started_at,
    endedAt: r.ended_at,
    parentEventId: r.parent_event_id,
    batchId: r.batch_id,
    payload: r.payload,
    notes: r.notes,
    isLocked: r.is_locked,
    autoLockAt: r.auto_lock_at,
    createdAt: r.created_at,
    updatedAt: r.updated_at,
  } as EventRecord;
}
export function instanceFromRow(r: Record<string, unknown>): Instance {
  return {
    id: r.id,
    userId: r.user_id,
    componentDefinitionId: r.component_definition_id,
    version: r.version,
    title: r.title,
    enabled: r.enabled,
    position: r.position,
    config: r.config,
    createdAt: r.created_at,
    updatedAt: r.updated_at,
  } as Instance;
}

export function templateFromRow(r: Record<string, unknown>): WorkoutTemplate {
  return {
    ...templateInputSchema.parse({
      id: r.id,
      name: r.name,
      version: r.version,
      exercises: r.exercises,
    }),
    userId: String(r.user_id),
    createdAt: String(r.created_at),
    updatedAt: String(r.updated_at),
  };
}
