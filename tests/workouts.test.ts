import { afterEach, describe, expect, it, vi } from "vitest";
import {
  defaultExercise,
  templateInputSchema,
  workoutEvents,
} from "@/lib/domain/workouts";
import { totalSetVolume } from "@/lib/domain/operators";
import { createDemo, DemoRepository } from "@/lib/data/demo";

afterEach(() => vi.unstubAllGlobals());
describe("workouts and templates", () => {
  it("records one parent and independent exercises with non-uniform sets and shared backdated time", () => {
    const exercises = [
      {
        exerciseId: "squat",
        sets: [
          { reps: 5, weightKg: 80 },
          { reps: 4, weightKg: 85 },
          { reps: 3, weightKg: 90 },
        ],
      },
      defaultExercise("bench-press", 8, 40),
    ];
    const events = workoutEvents(
      "Strength",
      exercises,
      "2020-01-02T10:00:00.000Z",
      "Felt good",
    );
    expect(events).toHaveLength(3);
    expect(events[0].eventType).toBe("workout");
    expect(events[0].notes).toBe("Felt good");
    for (const event of events.slice(1)) {
      expect(event.parentEventId).toBe(events[0].id);
      expect(event.occurredAt).toBe(events[0].occurredAt);
    }
    expect(totalSetVolume(exercises[0].sets)).toBe(1010);
    expect(() =>
      workoutEvents("Empty", [], events[0].occurredAt, ""),
    ).toThrow();
    expect(
      templateInputSchema.safeParse({
        id: crypto.randomUUID(),
        name: "Bad",
        version: 1,
        exercises: [{ exerciseId: "squat", sets: [{ reps: 0, weightKg: 80 }] }],
      }).success,
    ).toBe(false);
  });
  it("upgrades saved exercise cards and stores templates independently from logged events", async () => {
    const state = createDemo();
    const card = state.instances.find(
      (i) => i.componentDefinitionId === "workout_logger",
    )!;
    const legacy = {
      ...state,
      workoutTemplates: undefined,
      customExercises: undefined,
      instances: [
        {
          ...card,
          title: "Squat",
          componentDefinitionId: "exercise_logger",
          config: {
            exerciseId: "squat",
            defaultReps: 7,
            defaultWeight: 65,
            showNotes: true,
          },
        },
      ],
    };
    const storage = new Map([["therktrening-demo-v1", JSON.stringify(legacy)]]);
    vi.stubGlobal("localStorage", {
      getItem: (key: string) => storage.get(key) ?? null,
      setItem: (key: string, value: string) => storage.set(key, value),
    });
    const repo = new DemoRepository();
    const migrated = await repo.load();
    expect(migrated.instances[0]).toMatchObject({
      id: card.id,
      title: "Workout",
      componentDefinitionId: "workout_logger",
      config: { showNotes: true, exercises: [defaultExercise("squat", 7, 65)] },
    });
    const template = {
      id: crypto.randomUUID(),
      name: "Strength",
      version: 1 as const,
      exercises: [defaultExercise("squat", 7, 65)],
    };
    await repo.mutate({ action: "saveWorkoutTemplate", template });
    expect((await repo.load()).events).toEqual(state.events);
    const draft = structuredClone(template.exercises);
    draft[0].sets[0].reps = 3;
    await repo.mutate({
      action: "createEvents",
      events: workoutEvents("Today", draft, new Date().toISOString(), ""),
    });
    expect(
      (await repo.load()).workoutTemplates[0].exercises[0].sets[0].reps,
    ).toBe(7);
    expect((await repo.load()).workoutTemplates).toHaveLength(1);
    await repo.mutate({
      action: "createExercise",
      exercise: { id: "step-up", name: "Step-up" },
    });
    expect((await repo.load()).customExercises).toEqual([
      { id: "step-up", name: "Step-up" },
    ]);
  });
});
