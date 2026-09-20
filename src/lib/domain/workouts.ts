import { z } from "zod";
import {
  newEvent,
  workoutExerciseSchema,
  type EventInput,
  type EventRecord,
} from "./events";

export const standardExercises = [
  { id: "squat", name: "Squat" },
  { id: "bench-press", name: "Bench press" },
  { id: "deadlift", name: "Deadlift" },
  { id: "overhead-press", name: "Overhead press" },
  { id: "barbell-row", name: "Barbell row" },
  { id: "pull-up", name: "Pull-up" },
  { id: "lat-pulldown", name: "Lat pulldown" },
  { id: "leg-press", name: "Leg press" },
  { id: "lunge", name: "Lunge" },
  { id: "leg-curl", name: "Leg curl" },
  { id: "calf-raise", name: "Calf raise" },
  { id: "biceps-curl", name: "Biceps curl" },
  { id: "triceps-extension", name: "Triceps extension" },
] as const;
export const workoutExercisesSchema = z
  .array(workoutExerciseSchema)
  .min(1, "Add at least one exercise.")
  .max(1000);
export type WorkoutExercise = z.infer<typeof workoutExerciseSchema>;
export const templateInputSchema = z
  .object({
    id: z.uuid(),
    name: z.string().trim().min(1).max(120),
    version: z.literal(2),
    exercises: z
      .array(
        z
          .object({
            exerciseId: z.string().trim().min(1).max(80),
            sets: z
              .array(
                z.object({ reps: z.number().int().min(0).max(1000) }).strict(),
              )
              .min(1)
              .max(100),
          })
          .strict(),
      )
      .min(1)
      .max(1000),
  })
  .strict();
export type TemplateInput = z.infer<typeof templateInputSchema>;
export type WorkoutTemplate = TemplateInput & {
  userId: string;
  createdAt: string;
  updatedAt: string;
};
export const customExerciseSchema = z
  .object({
    id: z.string().min(1).max(80),
    name: z.string().trim().min(1).max(80),
    description: z.string().max(1000).default(""),
  })
  .strict();
export type CustomExercise = z.input<typeof customExerciseSchema> & {
  updatedAt?: string;
};
export function defaultExercise(
  exerciseId = "squat",
  reps = 5,
  weightKg = 0,
): WorkoutExercise {
  return {
    exerciseId,
    sets: Array.from({ length: 3 }, () => ({ reps, weightKg })),
  };
}
export function workoutEvents(
  name: string,
  exercises: WorkoutExercise[],
  occurredAt: string,
  notes: string,
): EventInput[] {
  const parsed = workoutExercisesSchema.parse(exercises);
  return [
    newEvent(
      "workout",
      { name, exercises: parsed },
      { occurredAt, notes: notes || null },
    ),
  ];
}
export function withoutWeights(
  exercises: WorkoutExercise[],
): TemplateInput["exercises"] {
  return exercises.map((e) => ({
    exerciseId: e.exerciseId,
    sets: e.sets.map((s) => ({ reps: s.reps })),
  }));
}
export function fromTemplate(
  exercises: TemplateInput["exercises"],
): WorkoutExercise[] {
  return exercises.map((e) => ({
    exerciseId: e.exerciseId,
    sets: e.sets.map((s) => ({ reps: s.reps, weightKg: 0 })),
  }));
}
export function exerciseCatalog(
  custom: CustomExercise[],
  events: EventRecord[] = [],
): CustomExercise[] {
  const options = new Map<string, CustomExercise>(
    standardExercises.map((e) => [e.id, { ...e, description: "" }]),
  );
  for (const event of events) {
    const payload = event.payload as {
      exerciseId?: string;
      exercises?: WorkoutExercise[];
    };
    for (const id of [
      payload.exerciseId,
      ...(payload.exercises ?? []).map((e) => e.exerciseId),
    ]) {
      if (id && !options.has(id))
        options.set(id, {
          id,
          name: id.replace(/[-_]/g, " ").replace(/^./, (c) => c.toUpperCase()),
          description: "",
        });
    }
  }
  custom.forEach((e) => options.set(e.id, e));
  return [...options.values()];
}
// Preserve original child records inside the workout when upgrading old demo data.
export function groupLegacyWorkouts(events: EventRecord[]): EventRecord[] {
  const removed = new Set<string>();
  const grouped = events.map((event) => {
    if (
      event.eventType !== "workout" ||
      event.schemaVersion !== 1 ||
      "exercises" in (event.payload as object)
    )
      return event;
    const children = events.filter(
      (e) => e.parentEventId === event.id && e.eventType === "exercise",
    );
    if (!children.length || children.some((e) => e.schemaVersion !== 1))
      return event;
    children.forEach((e) => removed.add(e.id));
    return {
      ...event,
      isLocked: event.isLocked || children.some((e) => e.isLocked),
      payload: {
        ...(event.payload as object),
        exercises: children.map((e) => ({
          ...(e.payload as WorkoutExercise),
          occurredAt: e.occurredAt,
          notes: e.notes,
          legacy: { ...e },
        })),
      },
    };
  });
  return grouped.filter((e) => !removed.has(e.id));
}
