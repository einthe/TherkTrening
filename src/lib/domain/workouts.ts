import { z } from "zod";
import { newEvent, payloadSchemas, type EventInput } from "./events";

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
  .array(payloadSchemas.exercise)
  .min(1, "Add at least one exercise.")
  .max(30);
export type WorkoutExercise = z.infer<typeof payloadSchemas.exercise>;
export const templateInputSchema = z
  .object({
    id: z.uuid(),
    name: z.string().trim().min(1).max(120),
    version: z.literal(1),
    exercises: workoutExercisesSchema,
  })
  .strict();
export type TemplateInput = z.infer<typeof templateInputSchema>;
export type WorkoutTemplate = TemplateInput & {
  userId: string;
  createdAt: string;
};
export const customExerciseSchema = z
  .object({
    id: z.string().min(1).max(80),
    name: z.string().trim().min(1).max(80),
  })
  .strict();
export type CustomExercise = z.infer<typeof customExerciseSchema>;
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
  const workout = newEvent(
    "workout",
    { name },
    { occurredAt, notes: notes || null },
  );
  return [
    workout,
    ...parsed.map((exercise) =>
      newEvent("exercise", exercise, { occurredAt, parentEventId: workout.id }),
    ),
  ];
}
