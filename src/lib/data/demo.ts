import {
  injuryInputSchema,
  legacyInjuries,
  withLegacyPainTitles,
} from "@/lib/domain/injuries";
import {
  isEventLocked,
  nextLocalMidnight,
  latestForDay,
  localDay,
} from "@/lib/domain/daily-events";
import {
  templateInputSchema,
  customExerciseSchema,
  defaultExercise,
  groupLegacyWorkouts,
  withoutWeights,
  type WorkoutExercise,
} from "@/lib/domain/workouts";
import {
  assertMutable,
  label,
  eventInputSchema,
  payloadSchemas,
  newEvent,
  validateParent,
  type EventRecord,
} from "@/lib/domain/events";
import {
  componentDefinitions,
  componentSchemas,
  instanceInputSchema,
  makeInstance,
} from "@/lib/domain/components";
import { eventNames, eventTypes } from "@/lib/domain/events";
import { operatorDefinitions } from "@/lib/domain/operators";
import type { Mutation, Repository, Snapshot } from "./repository";
const USER = "11111111-1111-4111-8111-111111111111";
const KEY = "therktrening-demo-v1";
export function createDemo(): Snapshot {
  const now = new Date().toISOString();
  const events: EventRecord[] = [];
  const add = (input: ReturnType<typeof newEvent>) => {
    const e = {
      ...input,
      userId: USER,
      isLocked:
        input.eventType === "pain_measurement" ||
        (input.eventType === "workout" &&
          Date.parse(nextLocalMidnight(input.occurredAt)) <= Date.now()),
      autoLockAt:
        input.eventType === "workout"
          ? nextLocalMidnight(input.occurredAt)
          : null,
      createdAt: now,
      updatedAt: now,
    };
    events.push(e);
    return e;
  };
  for (let ago = 20; ago >= 1; ago--) {
    const date = new Date();
    date.setUTCDate(date.getUTCDate() - ago);
    date.setUTCHours(8, 0, 0, 0);
    if (ago % 3 !== 1)
      add(
        newEvent(
          "pain_measurement",
          {
            injuryId: "left-knee",
            painLevel: Math.max(1, Math.round(2 + ago / 7 + Math.sin(ago))),
          },
          { occurredAt: date.toISOString() },
        ),
      );
    if (ago % 3 === 0) {
      date.setUTCHours(7, 0, 0, 0);
      const workout = add(
        newEvent(
          "workout",
          { name: "Lower body" },
          { occurredAt: date.toISOString() },
        ),
      );
      add(
        newEvent(
          "exercise",
          {
            exerciseId: "squat",
            sets: [
              { reps: 5, weightKg: 80 },
              { reps: 5, weightKg: 80 },
              { reps: 3 + (ago % 4), weightKg: 85 },
            ],
          },
          { occurredAt: date.toISOString(), parentEventId: workout.id },
        ),
      );
    }
    if (ago === 2 || ago === 9)
      add(
        newEvent(
          "training_session",
          { activityId: "volleyball" },
          {
            occurredAt: date.toISOString(),
            notes: "Evening practice with the team.",
          },
        ),
      );
  }
  const instances = (
    [
      "weekly_summary",
      "pain_logger",
      "workout_logger",
      "graph",
      "recent_events",
    ] as const
  ).map((key, i) => ({
    ...makeInstance(key, i),
    ...(key === "workout_logger"
      ? {
          config: {
            exercises: [defaultExercise("squat", 5, 80)],
            showNotes: false,
          },
        }
      : {}),
    title:
      key === "pain_logger"
        ? "Left knee pain"
        : key === "workout_logger"
          ? "Workout"
          : key === "graph"
            ? "Training volume & pain"
            : key === "weekly_summary"
              ? "Last 7 days"
              : "Recent activity",
    userId: USER,
    createdAt: now,
    updatedAt: now,
  }));
  return {
    profile: {
      id: USER,
      username: "Alex",
      role: "user",
      accountStatus: "approved",
    },
    events: withLegacyPainTitles(groupLegacyWorkouts(events), instances),
    instances,
    workoutTemplates: [],
    customExercises: [],
    injuries: legacyInjuries(events, instances),
    definitions: {
      components: componentDefinitions.map((d) => ({
        key: d.key,
        name: d.name,
        version: 1,
        active: true,
      })),
      events: eventTypes.map((key) => ({
        key,
        name: eventNames[key],
        active: true,
        version: 1,
      })),
      operators: operatorDefinitions.map((d) => ({
        ...d,
        active: true,
        version: 1,
      })),
    },
  };
}
export class DemoRepository implements Repository {
  async load(): Promise<Snapshot> {
    const raw = localStorage.getItem(KEY);
    if (raw) {
      const state: Snapshot = JSON.parse(raw);
      for (const definition of componentDefinitions) {
        if (definition.key === "graph") {
          const existing = state.definitions.components.find(
            (d) => d.key === "graph",
          );
          if (existing) existing.name = "Chart";
        }
        if (
          !state.definitions.components.some((d) => d.key === definition.key)
        ) {
          state.definitions.components.push({
            key: definition.key,
            name: definition.name,
            version: 1,
            active: true,
          });
        }
      }
      for (const definition of operatorDefinitions) {
        if (!state.definitions.operators.some((d) => d.key === definition.key))
          state.definitions.operators.push({
            ...definition,
            active: true,
            version: 1,
          });
      }
      state.events = withLegacyPainTitles(
        groupLegacyWorkouts(state.events),
        state.instances,
      );
      state.workoutTemplates ??= [];
      state.workoutTemplates = state.workoutTemplates.map((t) => ({
        ...t,
        version: 2,
        exercises: withoutWeights(t.exercises as WorkoutExercise[]),
        updatedAt: t.updatedAt ?? t.createdAt,
      }));
      state.customExercises = (state.customExercises ?? []).map((e) => ({
        ...e,
        description: e.description ?? "",
        updatedAt: e.updatedAt ?? "2000-01-01T00:00:00.000Z",
      }));
      state.customExercises ??= [];
      state.injuries ??= legacyInjuries(state.events, state.instances);
      for (const instance of state.instances) {
        instance.showOnAnalysis ??= false;
        if (
          instance.componentDefinitionId === "graph" &&
          instance.title === "Volume & pain"
        )
          instance.title = "Chart";
        if ((instance.componentDefinitionId as string) === "exercise_logger") {
          const config = instance.config as {
            exerciseId: string;
            defaultReps: number;
            defaultWeight: number;
            showNotes: boolean;
          };
          instance.componentDefinitionId = "workout_logger";
          if (
            ["Squat", "Exercise logger", label(config.exerciseId)].some(
              (title) => title.toLowerCase() === instance.title.toLowerCase(),
            )
          )
            instance.title = "Workout";
          instance.config = {
            exercises: [
              defaultExercise(
                config.exerciseId,
                config.defaultReps,
                config.defaultWeight,
              ),
            ],
            showNotes: config.showNotes,
          };
        }
      }
      state.definitions.components = state.definitions.components.filter(
        (d) => d.key !== "exercise_logger",
      );
      let locked = false;
      for (const event of state.events) {
        if (
          event.autoLockAt === undefined &&
          (event.eventType === "workout" ||
            event.eventType === "pain_measurement")
        ) {
          event.autoLockAt =
            event.eventType === "workout"
              ? nextLocalMidnight(event.occurredAt)
              : null;
          event.isLocked =
            event.isLocked || event.eventType === "pain_measurement";
          event.updatedAt = new Date().toISOString();
          locked = true;
        }
        if (!event.isLocked && isEventLocked(event)) {
          event.isLocked = true;
          event.autoLockAt = null;
          event.updatedAt = new Date().toISOString();
          locked = true;
        }
      }
      if (locked) localStorage.setItem(KEY, JSON.stringify(state));
      return state;
    }
    const state = createDemo();
    localStorage.setItem(KEY, JSON.stringify(state));
    return state;
  }
  async mutate(m: Mutation) {
    const s = await this.load();
    const now = new Date().toISOString();
    if (m.action === "saveInjury") {
      const input = injuryInputSchema.parse(m.injury);
      const old = s.injuries.find((injury) => injury.id === input.id);
      if (
        old
          ? old.updatedAt !== m.expectedUpdatedAt
          : Boolean(m.expectedUpdatedAt)
      )
        throw new Error("Injury changed elsewhere. Refresh and try again.");
      if (
        (!old || old.name.toLowerCase() !== input.name.toLowerCase()) &&
        s.injuries.some(
          (injury) =>
            injury.id !== input.id &&
            injury.name.toLowerCase() === input.name.toLowerCase(),
        )
      )
        throw new Error("Invalid injury name: choose a unique name.");
      if (old) Object.assign(old, input, { updatedAt: now });
      else s.injuries.push({ ...input, updatedAt: now });
    } else if (m.action === "saveWorkoutTemplate") {
      const input = templateInputSchema.parse(m.template);
      const old = s.workoutTemplates.find((t) => t.id === input.id);
      if (old && old.updatedAt !== m.expectedUpdatedAt)
        throw new Error("Template changed elsewhere. Refresh and try again.");
      if (!old && m.expectedUpdatedAt)
        throw new Error("Template changed elsewhere. Refresh and try again.");
      if (
        s.workoutTemplates.some(
          (t) =>
            t.id !== input.id &&
            t.name.toLowerCase() === input.name.toLowerCase(),
        )
      )
        throw new Error("Invalid template name: choose a new name.");
      if (old) Object.assign(old, input, { updatedAt: now });
      else
        s.workoutTemplates.push({
          ...input,
          userId: s.profile.id,
          createdAt: now,
          updatedAt: now,
        });
    } else if (m.action === "deleteWorkoutTemplate") {
      const old = s.workoutTemplates.find((t) => t.id === m.id);
      if (!old || old.updatedAt !== m.expectedUpdatedAt)
        throw new Error("Template changed elsewhere. Refresh and try again.");
      s.workoutTemplates = s.workoutTemplates.filter((t) => t.id !== m.id);
    } else if (m.action === "createExercise" || m.action === "saveExercise") {
      const input = customExerciseSchema.parse(m.exercise);
      const old = s.customExercises.find((e) => e.id === input.id);
      if (
        old &&
        (m.action === "createExercise" || old.updatedAt !== m.expectedUpdatedAt)
      )
        throw new Error("Exercise changed elsewhere. Refresh and try again.");
      if (!old && m.action === "saveExercise" && m.expectedUpdatedAt)
        throw new Error("Exercise changed elsewhere. Refresh and try again.");
      if (
        s.customExercises.some(
          (e) =>
            e.id !== input.id &&
            e.name.toLowerCase() === input.name.toLowerCase(),
        )
      )
        throw new Error("Invalid exercise name: this exercise already exists.");
      if (old) Object.assign(old, input, { updatedAt: now });
      else s.customExercises.push({ ...input, updatedAt: now });
    } else if (m.action === "createEvents") {
      const inputs = m.events.map((e) => eventInputSchema.parse(e));
      if (
        inputs.some((e) => s.events.some((old) => old.id === e.id)) ||
        new Set(inputs.map((e) => e.id)).size !== inputs.length
      )
        throw new Error("This event has already been saved.");
      const records = inputs.map((e) => ({
        ...e,
        userId: s.profile.id,
        isLocked:
          e.eventType === "pain_measurement" ||
          (e.eventType === "workout" &&
            Date.parse(nextLocalMidnight(e.occurredAt)) <= Date.now()),
        autoLockAt:
          e.eventType === "workout" ? nextLocalMidnight(e.occurredAt) : null,
        createdAt: now,
        updatedAt: now,
      }));
      records.forEach((e) =>
        validateParent(e, [...s.events, ...records], s.profile.id),
      );
      s.events.push(...records);
    } else if (
      m.action === "editEvent" ||
      m.action === "deleteEvent" ||
      m.action === "lockEvent"
    ) {
      const e = s.events.find(
        (e) => e.id === (m.action === "editEvent" ? m.event.id : m.id),
      );
      if (!e) throw new Error("Event not found.");
      if (m.action === "lockEvent") {
        if (e.updatedAt !== m.expectedUpdatedAt)
          throw new Error(
            "This event changed elsewhere. Refresh and try again.",
          );
        e.isLocked = m.locked;
        e.autoLockAt = null;
        e.updatedAt = now;
      } else {
        assertMutable(e, s.profile, m.expectedUpdatedAt);
        if (m.action === "deleteEvent") {
          if (s.events.some((child) => child.parentEventId === e.id))
            throw new Error(
              "Delete or detach the exercises in this workout first.",
            );
          s.events = s.events.filter((row) => row.id !== e.id);
        } else {
          const input = eventInputSchema.parse(m.event);
          if (input.eventType !== e.eventType)
            throw new Error("Event type cannot be changed.");
          validateParent(input, s.events, s.profile.id);
          Object.assign(e, input, {
            updatedAt: now,
            isLocked:
              input.eventType === "pain_measurement" ||
              (input.eventType === "workout" &&
                Date.parse(nextLocalMidnight(input.occurredAt)) <= Date.now()),
            autoLockAt:
              input.eventType === "workout"
                ? nextLocalMidnight(input.occurredAt)
                : null,
          });
        }
      }
    } else if (m.action === "saveInstance") {
      const input = instanceInputSchema.parse(m.instance);
      const old = s.instances.find((i) => i.id === input.id);
      if (input.componentDefinitionId === "pain_logger") {
        const targets = componentSchemas.pain_logger.parse(
          input.config,
        ).targets;
        const previous = old
          ? componentSchemas.pain_logger.parse(old.config).targets
          : [];
        if (
          targets.some((id) => !s.injuries.some((injury) => injury.id === id))
        )
          throw new Error(
            "Invalid injury selection. Create injuries in the Injuries section first.",
          );
        if (targets.some((target) => !previous.includes(target))) {
          const today = latestForDay(s.events, "pain_measurement", localDay());
          if (today) {
            const payload = payloadSchemas.pain_measurement.parse(
              today.payload,
            );
            const readings =
              "readings" in payload ? payload.readings : [payload];
            const savedTargets = readings.map((r) => r.injuryId);
            if (
              targets.some(
                (target) =>
                  !previous.includes(target) && !savedTargets.includes(target),
              )
            ) {
              if (new Set([...savedTargets, ...targets]).size > 12)
                throw new Error(
                  "Invalid pain targets: today's check-in can contain at most 12 injuries. Your saved readings are preserved.",
                );
              today.isLocked = false;
              today.autoLockAt = null;
              today.updatedAt = now;
            }
          }
        }
      }
      if (old) {
        if (old.updatedAt !== m.expectedUpdatedAt)
          throw new Error(
            "Component changed elsewhere. Refresh and try again.",
          );
        Object.assign(old, input, { updatedAt: now });
      } else
        s.instances.push({
          ...input,
          userId: s.profile.id,
          createdAt: now,
          updatedAt: now,
        });
    } else if (m.action === "removeInstance")
      s.instances = s.instances.filter((i) => i.id !== m.id);
    else if (m.action === "reorder") {
      if (
        m.ids.length !== s.instances.length ||
        new Set(m.ids).size !== m.ids.length ||
        m.ids.some((id) => !s.instances.some((i) => i.id === id))
      )
        throw new Error("Refresh your component list before reordering.");
      m.ids.forEach((id, position) => {
        const i = s.instances.find((i) => i.id === id)!;
        i.position = position;
        i.updatedAt = now;
      });
    }
    localStorage.setItem(KEY, JSON.stringify(s));
  }
}
