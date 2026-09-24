import { afterEach, describe, expect, it, vi } from "vitest";
import {
  defaultExercise,
  withPreviousWeights,
  withoutWeights,
  fromTemplate,
  groupLegacyWorkouts,
  templateInputSchema,
  workoutEvents,
} from "@/lib/domain/workouts";
import { newEvent, type EventRecord } from "@/lib/domain/events";
import { volumePipeline } from "@/lib/domain/components";
import { totalSetVolume, runPipeline } from "@/lib/domain/operators";
import { createDemo, DemoRepository } from "@/lib/data/demo";

afterEach(() => vi.unstubAllGlobals());
describe("workouts and templates", () => {
  it("records one workout containing non-uniform exercise sets", () => {
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
    expect(events).toHaveLength(1);
    expect(events[0].payload).toEqual({ name: "Strength", exercises });
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
        version: 2,
        exercises: [{ exerciseId: "squat", sets: [{ reps: 0, weightKg: 80 }] }],
      }).success,
    ).toBe(false);
  });
  it("keeps volume series equivalent for nested workouts and legacy records, including child dates", () => {
    const userId = crypto.randomUUID();
    const record = (input: ReturnType<typeof newEvent>): EventRecord => ({
      ...input,
      userId,
      isLocked: false,
      createdAt: "2020-01-01T10:00:00Z",
      updatedAt: "2020-01-01T10:00:00Z",
    });
    const parent = record(
      newEvent(
        "workout",
        { name: "Legacy" },
        { occurredAt: "2020-01-01T10:00:00Z" },
      ),
    );
    const child = record(
      newEvent(
        "exercise",
        {
          exerciseId: "squat",
          sets: [
            { reps: 5, weightKg: 80 },
            { reps: 3, weightKg: 90 },
          ],
        },
        {
          parentEventId: parent.id,
          occurredAt: "2020-01-02T10:00:00Z",
          notes: "Kept",
        },
      ),
    );
    const legacy = [parent, child];
    const grouped = groupLegacyWorkouts(legacy);
    const pipeline = [
      {
        key: "filter_date",
        from: "2020-01-02T00:00:00Z",
        to: "2020-01-02T23:59:59Z",
      },
      ...volumePipeline(),
    ];
    expect(runPipeline(grouped, pipeline)).toEqual(
      runPipeline(legacy, pipeline),
    );
    expect(runPipeline(grouped, pipeline)).toEqual([
      { date: "2020-01-02", value: 670 },
    ]);
    expect(grouped).toHaveLength(1);
    expect(grouped[0].payload).toMatchObject({
      exercises: [{ notes: "Kept", legacy: child }],
    });
    const fresh = workoutEvents(
      "Today",
      [defaultExercise("squat", 5, 80), defaultExercise("bench-press", 5, 40)],
      "2020-01-02T12:00:00Z",
      "",
    ).map(record);
    expect(runPipeline(fresh, pipeline)).toEqual([
      { date: "2020-01-02", value: 1200 },
    ]);
    expect(
      fromTemplate(withoutWeights([defaultExercise("squat", 5, 80)]))[0].sets,
    ).toEqual(defaultExercise("squat", 5, 0).sets);
    const input = {
      id: crypto.randomUUID(),
      name: "No weights",
      version: 2,
      exercises: [defaultExercise("squat", 5, 80)],
    };
    expect(templateInputSchema.safeParse(input).success).toBe(false);
    expect(
      templateInputSchema.safeParse({
        ...input,
        exercises: withoutWeights(input.exercises),
      }).success,
    ).toBe(true);
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
      version: 2 as const,
      exercises: withoutWeights([defaultExercise("squat", 7, 65)]),
    };
    await repo.mutate({ action: "saveWorkoutTemplate", template });
    expect((await repo.load()).events).toEqual(state.events);
    const draft = fromTemplate(template.exercises);
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
    expect((await repo.load()).customExercises).toMatchObject([
      { id: "step-up", name: "Step-up" },
    ]);
  });
});

describe("previous exercise weights", () => {
  const record = (
    eventType: "exercise" | "workout",
    payload: unknown,
    occurredAt: string,
    createdAt = occurredAt,
  ): EventRecord => ({
    ...newEvent(eventType, payload, { occurredAt }),
    userId: "owner",
    isLocked: true,
    createdAt,
    updatedAt: createdAt,
  });
  it("selects by exercise time, handles legacy entries, and keeps draft reps and history unchanged", () => {
    const old = record(
      "exercise",
      defaultExercise("squat", 2, 60),
      "2020-01-01T10:00:00Z",
      "2030-01-01T00:00:00Z",
    );
    const recent = record(
      "workout",
      {
        name: "Recent",
        exercises: [
          {
            exerciseId: "squat",
            sets: [
              { reps: 8, weightKg: 80 },
              { reps: 6, weightKg: 85 },
            ],
          },
        ],
      },
      "2020-01-02T10:00:00Z",
    );
    const future = record(
      "workout",
      { name: "Future", exercises: [defaultExercise("squat", 1, 100)] },
      "2020-01-04T10:00:00Z",
    );
    const draft = [
      defaultExercise("squat", 5),
      defaultExercise("bench-press", 8),
    ];
    const events = [future, recent, old];
    const snapshot = structuredClone(events);
    expect(withPreviousWeights(draft, events, "2020-01-03T10:00:00Z")).toEqual([
      {
        exerciseId: "squat",
        sets: [
          { reps: 5, weightKg: 80 },
          { reps: 5, weightKg: 85 },
          { reps: 5, weightKg: 85 },
        ],
      },
      defaultExercise("bench-press", 8),
    ]);
    expect(events).toEqual(snapshot);
    expect(draft[0].sets[0].weightKg).toBe(0);
    expect(
      withPreviousWeights(draft, events, "2020-01-03T10:00:00Z", recent.id)[0],
    ).toEqual(defaultExercise("squat", 5, 60));
  });
  it("uses migrated exercise dates, preserves zero weights, and skips unsupported or malformed data", () => {
    const old = record(
      "exercise",
      defaultExercise("squat", 3, 90),
      "2020-01-02T10:00:00Z",
    );
    const migrated = record(
      "workout",
      {
        name: "Migrated",
        exercises: [
          {
            ...defaultExercise("squat", 3, 0),
            occurredAt: "2020-01-03T10:00:00Z",
          },
        ],
      },
      "2020-01-01T10:00:00Z",
    );
    const ignored = {
      ...old,
      schemaVersion: 999,
      occurredAt: "2020-01-04T10:00:00Z",
    };
    const invalid = { ...old, payload: { exerciseId: "squat", sets: [] } };
    expect(
      withPreviousWeights(
        [defaultExercise("squat", 5, 80)],
        [old, migrated, ignored, invalid],
        "2020-01-05T10:00:00Z",
      )[0],
    ).toEqual(defaultExercise("squat", 5, 0));
  });
});
