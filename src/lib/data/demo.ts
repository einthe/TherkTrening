import {
  assertMutable,
  eventInputSchema,
  newEvent,
  validateParent,
  type EventRecord,
} from "@/lib/domain/events";
import {
  componentDefinitions,
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
      isLocked: false,
      createdAt: now,
      updatedAt: now,
    };
    events.push(e);
    return e;
  };
  for (let ago = 20; ago >= 0; ago--) {
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
    ["pain_logger", "exercise_logger", "graph", "recent_events"] as const
  ).map((key, i) => ({
    ...makeInstance(key, i),
    title:
      key === "pain_logger"
        ? "Left knee pain"
        : key === "exercise_logger"
          ? "Squat"
          : key === "graph"
            ? "Training volume & pain"
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
    events,
    instances,
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
    if (raw) return JSON.parse(raw);
    const state = createDemo();
    localStorage.setItem(KEY, JSON.stringify(state));
    return state;
  }
  async mutate(m: Mutation) {
    const s = await this.load();
    const now = new Date().toISOString();
    if (m.action === "createEvents") {
      const inputs = m.events.map((e) => eventInputSchema.parse(e));
      if (
        inputs.some((e) => s.events.some((old) => old.id === e.id)) ||
        new Set(inputs.map((e) => e.id)).size !== inputs.length
      )
        throw new Error("This event has already been saved.");
      const records = inputs.map((e) => ({
        ...e,
        userId: s.profile.id,
        isLocked: false,
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
          Object.assign(e, input, { updatedAt: now });
        }
      }
    } else if (m.action === "saveInstance") {
      const input = instanceInputSchema.parse(m.instance);
      const old = s.instances.find((i) => i.id === input.id);
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
