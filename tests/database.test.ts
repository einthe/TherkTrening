import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { PGlite } from "@electric-sql/pglite";
import { readFileSync, readdirSync } from "node:fs";
import { newEvent } from "@/lib/domain/events";
import {
  defaultExercise,
  workoutEvents,
  withoutWeights,
  fromTemplate,
} from "@/lib/domain/workouts";
import { makeInstance } from "@/lib/domain/components";
// Runs the actual migration and RPCs in PostgreSQL (WASM). Only Supabase Auth's
// external users table and JWT subject function are stubbed; RLS is real.
let db: PGlite;
let migratedCard: Record<string, unknown>;
const migrationUser = "55555555-5555-4555-8555-555555555555";
const migrationCard = "66666666-6666-4666-8666-666666666666";
const alice = "11111111-1111-4111-8111-111111111111",
  bob = "22222222-2222-4222-8222-222222222222",
  admin = "33333333-3333-4333-8333-333333333333",
  pending = "44444444-4444-4444-8444-444444444444";
async function asUser(id: string) {
  await db.exec("reset role");
  await db.query("select set_config('request.jwt.claim.sub',$1,false)", [id]);
  await db.exec("set role authenticated");
}
async function mutate(m: unknown) {
  return db.query("select public.mutate_workspace($1::jsonb)", [
    JSON.stringify(m),
  ]);
}
async function unlock(id: string) {
  const current = await get(id);
  await mutate({
    action: "lockEvent",
    id,
    locked: false,
    expectedUpdatedAt: current.updated_at,
  });
}
async function rows(table = "events") {
  return (
    await db.query<Record<string, unknown>>(`select * from public.${table}`)
  ).rows;
}
async function get(id: string) {
  return (
    await db.query<{ updated_at: string; is_locked: boolean }>(
      "select updated_at::text,is_locked from public.events where id=$1",
      [id],
    )
  ).rows[0];
}
beforeAll(async () => {
  db = new PGlite();
  await db.exec(
    "create role anon; create role authenticated; create schema auth; create table auth.users(id uuid primary key, raw_user_meta_data jsonb); create function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid $$; grant usage on schema public,auth to authenticated; grant execute on function auth.uid() to authenticated;",
  );
  for (const file of readdirSync("supabase/migrations")
    .filter((name) => name.endsWith(".sql"))
    .sort()) {
    if (file === "202609190002_workout_templates.sql") {
      await db.query("insert into auth.users values($1,$2)", [
        migrationUser,
        JSON.stringify({ username: "migration" }),
      ]);
      await db.query(
        "insert into public.user_component_instances(id,user_id,component_definition_id,title,enabled,position,config) values($1,$2,'exercise_logger','Squat',false,3,$3)",
        [
          migrationCard,
          migrationUser,
          JSON.stringify({
            exerciseId: "squat",
            defaultReps: 7,
            defaultWeight: 65,
            showNotes: true,
          }),
        ],
      );
    }
    if (file === "202609210001_workout_libraries.sql") {
      await db.query(
        "insert into public.workout_templates(id,user_id,name,exercises) values($1,$2,'Legacy template',$3)",
        [
          "77777777-7777-4777-8777-777777777777",
          migrationUser,
          JSON.stringify([defaultExercise("squat", 8, 70)]),
        ],
      );
      await db.query(
        "insert into public.events(id,user_id,event_type,schema_version,occurred_at,payload) values($1,$2,'workout',1,'2020-01-01T10:00:00Z',$3)",
        [
          "88888888-8888-4888-8888-888888888888",
          migrationUser,
          JSON.stringify({ name: "Legacy workout" }),
        ],
      );
      await db.query(
        "insert into public.events(id,user_id,event_type,schema_version,occurred_at,payload,parent_event_id,notes,is_locked) values($1,$2,'exercise',1,'2020-01-02T10:00:00Z',$3,$4,'Keep these notes',true)",
        [
          "99999999-9999-4999-8999-999999999999",
          migrationUser,
          JSON.stringify(defaultExercise("squat", 8, 70)),
          "88888888-8888-4888-8888-888888888888",
        ],
      );
    }
    await db.exec(readFileSync(`supabase/migrations/${file}`, "utf8"));
    if (file === "202609190002_workout_templates.sql")
      migratedCard = (
        await db.query<Record<string, unknown>>(
          "select * from public.user_component_instances where id=$1",
          [migrationCard],
        )
      ).rows[0];
  }
  for (const [id, username] of [
    [alice, "alice"],
    [bob, "bob"],
    [admin, "admin"],
    [pending, "pending"],
  ])
    await db.query("insert into auth.users values($1,$2)", [
      id,
      JSON.stringify({ username }),
    ]);
  await db.query(
    "update public.profiles set account_status='approved' where id<>$1",
    [pending],
  );
  await db.query("update public.profiles set role='admin' where id=$1", [
    admin,
  ]);
}, 30000);
afterAll(async () => {
  await db?.close();
});
async function library(mutation: unknown) {
  return db.query("select public.mutate_workout_library($1::jsonb)", [
    JSON.stringify(mutation),
  ]);
}
describe.sequential("PostgreSQL RLS and validated RPCs", () => {
  it("migrates exercise cards without changing their identity, visibility, order, or defaults", () => {
    expect(migratedCard).toMatchObject({
      id: migrationCard,
      user_id: migrationUser,
      component_definition_id: "workout_logger",
      title: "Workout",
      enabled: false,
      position: 3,
      config: { showNotes: true, exercises: [defaultExercise("squat", 7, 65)] },
    });
  });
  it("converts legacy workouts without losing sets, notes, times or lock state, and removes template weights", async () => {
    await asUser(migrationUser);
    const migrated = await rows();
    expect(migrated).toHaveLength(1);
    expect(migrated[0]).toMatchObject({
      id: "88888888-8888-4888-8888-888888888888",
      event_type: "workout",
      is_locked: true,
      payload: {
        name: "Legacy workout",
        exercises: [
          {
            exerciseId: "squat",
            sets: defaultExercise("squat", 8, 70).sets,
            notes: "Keep these notes",
            legacy: {
              id: "99999999-9999-4999-8999-999999999999",
              is_locked: true,
            },
          },
        ],
      },
    });
    expect(
      (migrated[0].payload as { exercises: { occurredAt: string }[] })
        .exercises[0].occurredAt,
    ).toContain("2020-01-02");
    expect((await rows("workout_templates"))[0]).toMatchObject({
      version: 2,
      exercises: withoutWeights([defaultExercise("squat", 8, 70)]),
    });
  });
  it("creates pending profiles and blocks workspace reads/writes", async () => {
    await asUser(pending);
    expect((await rows("profiles"))[0].account_status).toBe("pending");
    await expect(
      library({
        action: "createExercise",
        exercise: { id: "blocked", name: "Blocked" },
      }),
    ).rejects.toThrow("Approved account required");
    expect(await rows("workout_templates")).toHaveLength(0);
    expect(await rows("user_exercises")).toHaveLength(0);
    expect(await rows()).toHaveLength(0);
    await expect(
      mutate({
        action: "createEvents",
        events: [newEvent("workout", { name: "Forbidden" })],
      }),
    ).rejects.toThrow("Approved account required");
  });
  it("allows admin approval, then allows approved user writes", async () => {
    await asUser(admin);
    await db.query("select public.admin_mutate($1)", [
      JSON.stringify({ action: "status", id: pending, status: "approved" }),
    ]);
    await asUser(pending);
    await mutate({
      action: "createEvents",
      events: [newEvent("workout", { name: "Approved" })],
    });
    expect(await rows()).toHaveLength(1);
  });
  it("creates a workout and non-uniform exercise atomically", async () => {
    await asUser(alice);
    const workout = newEvent("workout", { name: "Lower body" });
    const exercise = newEvent(
      "exercise",
      {
        exerciseId: "squat",
        sets: [
          { reps: 5, weightKg: 80 },
          { reps: 3, weightKg: 90 },
        ],
      },
      { parentEventId: workout.id, occurredAt: "2020-01-01T10:00:00Z" },
    );
    await mutate({ action: "createEvents", events: [exercise, workout] });
    const found = await rows();
    expect(found).toHaveLength(2);
    expect(found.find((e) => e.id === exercise.id)?.parent_event_id).toBe(
      workout.id,
    );
  });
  it("prevents cross-user reads, writes, parent links, and admin private access", async () => {
    await asUser(alice);
    const event = (await rows())[0];
    await asUser(bob);
    expect(await rows()).toHaveLength(0);
    await expect(
      mutate({
        action: "deleteEvent",
        id: event.id,
        expectedUpdatedAt: event.updated_at,
      }),
    ).rejects.toThrow("Event not found");
    await expect(
      mutate({
        action: "createEvents",
        events: [
          newEvent(
            "exercise",
            { exerciseId: "squat", sets: [{ reps: 1, weightKg: 1 }] },
            { parentEventId: String(event.id) },
          ),
        ],
      }),
    ).rejects.toThrow("Invalid workout parent");
    await asUser(admin);
    expect(await rows()).toHaveLength(0);
  });
  it("blocks ordinary admin mutations and direct table writes", async () => {
    await asUser(alice);
    await expect(
      db.query("select public.admin_mutate($1)", [
        JSON.stringify({ action: "status", id: bob, status: "disabled" }),
      ]),
    ).rejects.toThrow("Administrator access required");
    await expect(
      db.exec("update public.profiles set role='admin' where id=auth.uid()"),
    ).rejects.toThrow("permission denied");
    await expect(db.exec("delete from public.events")).rejects.toThrow(
      "permission denied",
    );
  });
  it("enforces locking, separate unlocking, stale writes, and deletion", async () => {
    await asUser(alice);
    const event = newEvent("pain_measurement", {
      readings: [
        { injuryId: "left-knee", painLevel: 3 },
        { injuryId: "right-shoulder", painLevel: 7 },
      ],
    });
    await mutate({ action: "createEvents", events: [event] });
    let current = await get(event.id);
    await mutate({
      action: "lockEvent",
      id: event.id,
      locked: true,
      expectedUpdatedAt: current.updated_at,
    });
    current = await get(event.id);
    expect(current.is_locked).toBe(true);
    await expect(
      mutate({
        action: "editEvent",
        event: {
          ...event,
          payload: {
            readings: [
              { injuryId: "left-knee", painLevel: 4 },
              { injuryId: "right-shoulder", painLevel: 2 },
            ],
          },
          isLocked: false,
        },
        expectedUpdatedAt: current.updated_at,
      }),
    ).rejects.toThrow("Unlock this event");
    await expect(
      mutate({
        action: "deleteEvent",
        id: event.id,
        expectedUpdatedAt: current.updated_at,
      }),
    ).rejects.toThrow("Unlock this event");
    await mutate({
      action: "lockEvent",
      id: event.id,
      locked: false,
      expectedUpdatedAt: current.updated_at,
    });
    await expect(
      mutate({
        action: "editEvent",
        event,
        expectedUpdatedAt: current.updated_at,
      }),
    ).rejects.toThrow("changed elsewhere");
    current = await get(event.id);
    await mutate({
      action: "editEvent",
      event: { ...event, notes: "Updated" },
      expectedUpdatedAt: current.updated_at,
    });
    expect((await get(event.id)).is_locked).toBe(true);
    await unlock(event.id);
    current = await get(event.id);
    await mutate({
      action: "deleteEvent",
      id: event.id,
      expectedUpdatedAt: current.updated_at,
    });
    expect(await get(event.id)).toBeUndefined();
  });
  it("rolls back the entire batch when any payload is invalid", async () => {
    await asUser(alice);
    const before = (await rows()).length;
    await expect(
      mutate({
        action: "createEvents",
        events: [
          newEvent("workout", { name: "Rollback" }),
          {
            ...newEvent("pain_measurement", { injuryId: "knee", painLevel: 1 }),
            payload: { injuryId: "knee", painLevel: 11 },
          },
        ],
      }),
    ).rejects.toThrow("Invalid pain");
    expect(await rows()).toHaveLength(before);
  });
  it("validates configuration in PostgreSQL and scopes instances to their owner", async () => {
    await asUser(alice);
    const instance = makeInstance("graph", 0);
    await mutate({ action: "saveInstance", instance });
    expect(await rows("user_component_instances")).toHaveLength(1);
    await asUser(bob);
    expect(await rows("user_component_instances")).toHaveLength(0);
    await expect(mutate({ action: "saveInstance", instance })).rejects.toThrow(
      "Invalid component owner",
    );
    await expect(
      mutate({
        action: "saveInstance",
        instance: {
          ...makeInstance("pain_logger", 0),
          config: { targets: [], showNotes: false },
        },
      }),
    ).rejects.toThrow("Invalid targets");
  });
  it("persists weekly summary visibility and rejects invalid configuration", async () => {
    await asUser(alice);
    const instance = makeInstance("weekly_summary", 0);
    await mutate({ action: "saveInstance", instance });
    const saved = (await rows("user_component_instances")).find(
      (i) => i.id === instance.id,
    )!;
    expect(saved.enabled).toBe(true);
    await mutate({
      action: "saveInstance",
      instance: { ...instance, enabled: false },
      expectedUpdatedAt: saved.updated_at,
    });
    expect(
      (await rows("user_component_instances")).find((i) => i.id === instance.id)
        ?.enabled,
    ).toBe(false);
    await expect(
      mutate({
        action: "saveInstance",
        instance: {
          ...makeInstance("weekly_summary", 0),
          config: { days: 30 },
        },
      }),
    ).rejects.toThrow("Invalid weekly summary configuration");
    await mutate({ action: "removeInstance", id: instance.id });
  });
  it("keeps templates and custom exercises private and separate from logs, validating every set", async () => {
    await asUser(alice);
    const before = await rows();
    const template = {
      id: crypto.randomUUID(),
      name: "Strength",
      version: 2,
      exercises: withoutWeights([
        defaultExercise("squat", 5, 80),
        defaultExercise("bench-press", 8, 40),
      ]),
    };
    await library({ action: "saveWorkoutTemplate", template });
    await library({
      action: "createExercise",
      exercise: { id: "step-up", name: "Step-up" },
    });
    expect(await rows()).toEqual(before);
    expect(await rows("workout_templates")).toHaveLength(1);
    expect(await rows("user_exercises")).toHaveLength(1);
    await expect(
      library({
        action: "saveWorkoutTemplate",
        template: {
          ...template,
          id: crypto.randomUUID(),
          name: "Invalid",
          exercises: [
            { exerciseId: "squat", sets: [{ reps: 0, weightKg: 80 }] },
          ],
        },
      }),
    ).rejects.toThrow("Invalid template set");
    await expect(
      library({
        action: "saveWorkoutTemplate",
        template: {
          ...template,
          id: crypto.randomUUID(),
          name: "Invalid",
          exercises: [],
        },
      }),
    ).rejects.toThrow("Invalid workout");
    await expect(
      library({
        action: "saveWorkoutTemplate",
        template: {
          ...template,
          id: crypto.randomUUID(),
          name: "Invalid",
          version: 3,
        },
      }),
    ).rejects.toThrow("Invalid template");
    await expect(
      db.query(
        "insert into public.workout_templates(id,user_id,name,exercises) values($1,$2,'Bypass','[]')",
        [crypto.randomUUID(), alice],
      ),
    ).rejects.toThrow("permission denied");
    await asUser(bob);
    expect(await rows("workout_templates")).toHaveLength(0);
    expect(await rows("user_exercises")).toHaveLength(0);
    await expect(
      library({ action: "saveWorkoutTemplate", template }),
    ).rejects.toThrow("Invalid template owner");
    await expect(
      db.query(
        "update public.workout_templates set name='Stolen' where id=$1",
        [template.id],
      ),
    ).rejects.toThrow("permission denied");
    await expect(
      db.query("delete from public.user_exercises where user_id=$1", [alice]),
    ).rejects.toThrow("permission denied");
    await asUser(admin);
    expect(await rows("workout_templates")).toHaveLength(0);
    expect(await rows("user_exercises")).toHaveLength(0);
    await asUser(alice);
    const draft = fromTemplate(template.exercises);
    draft[0].sets[0] = { reps: 3, weightKg: 90 };
    const events = workoutEvents(
      "Today",
      draft,
      "2020-01-02T10:00:00.000Z",
      "",
    );
    await mutate({ action: "createEvents", events });
    expect(
      (await rows()).filter((e) => e.parent_event_id === events[0].id),
    ).toHaveLength(0);
    expect((await rows("workout_templates"))[0].exercises).toEqual(
      template.exercises,
    );
    const card = makeInstance("workout_logger", 2);
    await mutate({ action: "saveInstance", instance: card });
    await mutate({ action: "removeInstance", id: card.id });
    expect(await rows("workout_templates")).toHaveLength(1);
  });
  it("edits libraries with owner and stale-write checks and keeps a whole workout editable as one record", async () => {
    await asUser(alice);
    const template = (await rows("workout_templates"))[0];
    const input = {
      id: template.id,
      name: "Updated template",
      version: 2,
      exercises: withoutWeights([defaultExercise("squat", 0)]),
    };
    await library({
      action: "saveWorkoutTemplate",
      template: input,
      expectedUpdatedAt: template.updated_at,
    });
    await expect(
      library({
        action: "saveWorkoutTemplate",
        template: input,
        expectedUpdatedAt: template.updated_at,
      }),
    ).rejects.toThrow("changed elsewhere");
    const latest = (await rows("workout_templates"))[0];
    await expect(
      library({
        action: "saveWorkoutTemplate",
        template: { ...input, exercises: [defaultExercise()] },
        expectedUpdatedAt: latest.updated_at,
      }),
    ).rejects.toThrow("templates contain reps only");
    const custom = (await rows("user_exercises"))[0];
    await library({
      action: "saveExercise",
      exercise: {
        id: custom.id,
        name: "Renamed step-up",
        description: "Use a low step",
      },
      expectedUpdatedAt: custom.updated_at,
    });
    await expect(
      library({
        action: "saveExercise",
        exercise: { id: custom.id, name: "Stale" },
        expectedUpdatedAt: custom.updated_at,
      }),
    ).rejects.toThrow("changed elsewhere");
    await library({
      action: "saveExercise",
      exercise: {
        id: "squat",
        name: "My squat",
        description: "Personal override",
      },
    });
    await asUser(bob);
    await expect(
      library({
        action: "saveWorkoutTemplate",
        template: input,
        expectedUpdatedAt: latest.updated_at,
      }),
    ).rejects.toThrow("Invalid template owner");
    await expect(
      library({
        action: "deleteWorkoutTemplate",
        id: latest.id,
        expectedUpdatedAt: latest.updated_at,
      }),
    ).rejects.toThrow("changed elsewhere");
    expect((await rows("user_exercises")).some((e) => e.id === "squat")).toBe(
      false,
    );
    await asUser(alice);
    const [workout] = workoutEvents(
      "Editable workout",
      [defaultExercise("squat", 0, 0), defaultExercise("bench-press", 5, 40)],
      "2020-02-01T12:00:00Z",
      "",
    );
    const before = (await rows()).length;
    await mutate({ action: "createEvents", events: [workout] });
    expect(await rows()).toHaveLength(before + 1);
    expect((await get(workout.id)).is_locked).toBe(true);
    await unlock(workout.id);
    let saved = await get(workout.id);
    const edit = {
      ...workout,
      payload: {
        name: "Edited workout",
        exercises: [defaultExercise("squat", 8, 95)],
      },
    };
    await mutate({
      action: "editEvent",
      event: edit,
      expectedUpdatedAt: saved.updated_at,
    });
    await expect(
      mutate({
        action: "editEvent",
        event: edit,
        expectedUpdatedAt: new Date(
          Date.parse(saved.updated_at) - 1000,
        ).toISOString(),
      }),
    ).rejects.toThrow("changed elsewhere");
    saved = await get(workout.id);
    await mutate({
      action: "lockEvent",
      id: workout.id,
      locked: true,
      expectedUpdatedAt: saved.updated_at,
    });
    saved = await get(workout.id);
    await expect(
      mutate({
        action: "editEvent",
        event: edit,
        expectedUpdatedAt: saved.updated_at,
      }),
    ).rejects.toThrow("Unlock this event");
    await mutate({
      action: "lockEvent",
      id: workout.id,
      locked: false,
      expectedUpdatedAt: saved.updated_at,
    });
    saved = await get(workout.id);
    await mutate({
      action: "deleteEvent",
      id: workout.id,
      expectedUpdatedAt: saved.updated_at,
    });
    expect(await rows()).toHaveLength(before);
    await library({
      action: "deleteWorkoutTemplate",
      id: latest.id,
      expectedUpdatedAt: latest.updated_at,
    });
    expect(await rows("workout_templates")).toHaveLength(0);
    expect(await rows()).toHaveLength(before);
  });
  it("shares global configuration and prevents disabled operators from being configured", async () => {
    await asUser(admin);
    await db.query("select public.admin_mutate($1)", [
      JSON.stringify({
        action: "definition",
        table: "operator_definitions",
        key: "placeholder_volume_load",
        active: false,
      }),
    ]);
    await asUser(alice);
    expect(
      (await rows("operator_definitions")).find(
        (d) => d.key === "placeholder_volume_load",
      )?.active,
    ).toBe(false);
    await expect(
      mutate({ action: "saveInstance", instance: makeInstance("graph", 1) }),
    ).rejects.toThrow("Operator unavailable");
  });
  it("revokes all normal data access after disabling an account", async () => {
    await asUser(admin);
    await db.query("select public.admin_mutate($1)", [
      JSON.stringify({ action: "status", id: alice, status: "disabled" }),
    ]);
    await asUser(alice);
    expect(await rows()).toHaveLength(0);
    expect(await rows("user_component_instances")).toHaveLength(0);
    expect(await rows("workout_templates")).toHaveLength(0);
    expect(await rows("user_exercises")).toHaveLength(0);
    await expect(
      library({
        action: "createExercise",
        exercise: { id: "blocked", name: "Blocked" },
      }),
    ).rejects.toThrow("Approved account required");
    await expect(
      mutate({
        action: "createEvents",
        events: [newEvent("workout", { name: "Blocked" })],
      }),
    ).rejects.toThrow("Approved account required");
  });
});

describe("grouped pain storage", () => {
  beforeAll(async () => {
    await asUser(admin);
    await db.query("select public.admin_mutate($1)", [
      JSON.stringify({ action: "status", id: alice, status: "approved" }),
    ]);
  });
  it("stores and edits all readings in a single row, isolated by owner", async () => {
    await asUser(alice);
    const before = (await rows()).length;
    const event = newEvent("pain_measurement", {
      readings: [
        { injuryId: "knee", painLevel: 0 },
        { injuryId: "shoulder", painLevel: 10 },
      ],
    });
    await mutate({ action: "createEvents", events: [event] });
    expect(await rows()).toHaveLength(before + 1);
    expect((await rows()).find((r) => r.id === event.id)?.payload).toEqual(
      event.payload,
    );
    expect((await get(event.id)).is_locked).toBe(true);
    await unlock(event.id);
    const current = await get(event.id);
    const updated = {
      ...event,
      payload: {
        readings: [
          { injuryId: "knee", painLevel: 4 },
          { injuryId: "shoulder", painLevel: 8 },
        ],
      },
    };
    await mutate({
      action: "editEvent",
      event: updated,
      expectedUpdatedAt: current.updated_at,
    });
    expect((await rows()).find((r) => r.id === event.id)?.payload).toEqual(
      updated.payload,
    );
    await asUser(bob);
    expect(await get(event.id)).toBeUndefined();
  });
  it.each([
    { readings: [] },
    { readings: null },
    { readings: {} },
    {
      readings: Array.from({ length: 13 }, (_, i) => ({
        injuryId: `injury-${i}`,
        painLevel: 3,
      })),
    },
    {
      readings: [
        { injuryId: "knee", painLevel: 3 },
        { injuryId: "knee", painLevel: 4 },
      ],
    },
    {
      readings: [
        { injuryId: "knee", painLevel: 3 },
        { injuryId: " knee ", painLevel: 4 },
      ],
    },
    { readings: [{ injuryId: "knee", painLevel: 11 }] },
    { readings: [{ injuryId: "knee", painLevel: -1 }] },
    { readings: [{ injuryId: "knee", painLevel: "3" }] },
    { readings: [{ injuryId: "", painLevel: 3 }] },
    { readings: [null] },
    { readings: [{ injuryId: "knee", painLevel: 3, extra: true }] },
    { readings: [{ injuryId: "knee", painLevel: 3 }], extra: true },
  ])("rejects invalid nested readings atomically: %j", async (payload) => {
    await asUser(alice);
    const before = (await rows()).length;
    await expect(
      mutate({
        action: "createEvents",
        events: [
          {
            ...newEvent("pain_measurement", { injuryId: "knee", painLevel: 3 }),
            payload,
          },
        ],
      }),
    ).rejects.toThrow(/Invalid pain|Duplicate injury/);
    expect(await rows()).toHaveLength(before);
  });
});

describe("daily event lifecycle", () => {
  it.each([
    ["2026-03-29T12:00:00Z", "Europe/Oslo", "2026-03-29T22:00:00.000Z"],
    ["2026-10-25T12:00:00Z", "Europe/Oslo", "2026-10-25T23:00:00.000Z"],
    ["2026-03-08T12:00:00Z", "America/New_York", "2026-03-09T04:00:00.000Z"],
  ])(
    "uses local midnight including daylight savings: %s in %s",
    async (date, zone, expected) => {
      const result = await db.query<{ deadline: Date }>(
        "select public.workout_lock_time($1::timestamptz,$2) as deadline",
        [date, zone],
      );
      expect(new Date(result.rows[0].deadline).toISOString()).toBe(expected);
    },
  );
  it("keeps today's workout editable, rejects expired writes, and permits explicit unlocking", async () => {
    await asUser(alice);
    const event = newEvent("workout", {
      name: "Today",
      exercises: [defaultExercise()],
    });
    await mutate({
      action: "createEvents",
      events: [event],
      timeZone: "Europe/Oslo",
    });
    expect((await get(event.id)).is_locked).toBe(false);
    await mutate({
      action: "editEvent",
      event: { ...event, notes: "Updated today" },
      expectedUpdatedAt: (await get(event.id)).updated_at,
      timeZone: "Europe/Oslo",
    });
    expect((await get(event.id)).is_locked).toBe(false);
    await db.exec("reset role");
    await db.query(
      "update public.events set auto_lock_at=clock_timestamp()-interval '1 second' where id=$1",
      [event.id],
    );
    await asUser(alice);
    await expect(
      mutate({
        action: "editEvent",
        event,
        expectedUpdatedAt: (await get(event.id)).updated_at,
      }),
    ).rejects.toThrow("Unlock this event");
    await expect(
      mutate({
        action: "deleteEvent",
        id: event.id,
        expectedUpdatedAt: (await get(event.id)).updated_at,
      }),
    ).rejects.toThrow("Unlock this event");
    await asUser(bob);
    await db.exec("select public.lock_expired_workouts()");
    await asUser(alice);
    expect((await get(event.id)).is_locked).toBe(false);
    await db.exec("select public.lock_expired_workouts()");
    expect((await get(event.id)).is_locked).toBe(true);
    await unlock(event.id);
    await db.exec("select public.lock_expired_workouts()");
    expect((await get(event.id)).is_locked).toBe(false);
    await mutate({
      action: "editEvent",
      event: { ...event, occurredAt: "2020-01-02T10:00:00Z" },
      expectedUpdatedAt: (await get(event.id)).updated_at,
      timeZone: "Europe/Oslo",
    });
    expect((await get(event.id)).is_locked).toBe(true);
  });
  it("locks pain and backdated workouts in the save transaction", async () => {
    await asUser(alice);
    const pain = newEvent("pain_measurement", {
      readings: [{ injuryId: "knee", painLevel: 3 }],
    });
    const workout = newEvent(
      "workout",
      { name: "Yesterday" },
      { occurredAt: "2020-01-01T10:00:00Z" },
    );
    await mutate({
      action: "createEvents",
      events: [pain, workout],
      timeZone: "Europe/Oslo",
    });
    expect((await get(pain.id)).is_locked).toBe(true);
    expect((await get(workout.id)).is_locked).toBe(true);
    const invalid = newEvent("workout", { name: "Bad timezone" });
    await expect(
      mutate({
        action: "createEvents",
        events: [invalid],
        timeZone: "invalid/zone",
      }),
    ).rejects.toThrow("Invalid time zone");
    expect(await get(invalid.id)).toBeUndefined();
  });
});

describe("adding injuries to today's saved pain check-in", () => {
  it("atomically saves targets and unlocks only today's own event, retaining readings and time", async () => {
    await asUser(alice);
    const instance = makeInstance("pain_logger", 0);
    instance.config = { targets: ["left-knee"], showNotes: true };
    await mutate({ action: "saveInstance", instance, timeZone: "Europe/Oslo" });
    let card = (await rows("user_component_instances")).find(
      (i) => i.id === instance.id,
    )!;
    const pain = newEvent(
      "pain_measurement",
      { readings: [{ injuryId: "left-knee", painLevel: 7 }] },
      { notes: "Keep notes" },
    );
    const earlier = newEvent(
      "pain_measurement",
      { injuryId: "left-knee", painLevel: 6 },
      { occurredAt: "2020-01-01T10:00:00Z" },
    );
    await mutate({ action: "createEvents", events: [pain, earlier] });
    await asUser(bob);
    const other = newEvent("pain_measurement", {
      injuryId: "left-knee",
      painLevel: 3,
    });
    await mutate({ action: "createEvents", events: [other] });
    await asUser(alice);
    const updated = {
      ...instance,
      config: { targets: ["left-knee", "right-shoulder"], showNotes: true },
    };
    await expect(
      mutate({
        action: "saveInstance",
        instance: updated,
        expectedUpdatedAt: "2000-01-01T00:00:00Z",
        timeZone: "Europe/Oslo",
      }),
    ).rejects.toThrow("changed elsewhere");
    expect((await get(pain.id)).is_locked).toBe(true);
    expect(
      (await rows("user_component_instances")).find((i) => i.id === instance.id)
        ?.config,
    ).toEqual(instance.config);
    await mutate({
      action: "saveInstance",
      instance: updated,
      expectedUpdatedAt: card.updated_at,
      timeZone: "Europe/Oslo",
    });
    expect((await get(pain.id)).is_locked).toBe(false);
    expect((await get(earlier.id)).is_locked).toBe(true);
    const persisted = (await rows()).find((e) => e.id === pain.id)!;
    expect(persisted.payload).toEqual(pain.payload);
    expect(persisted.notes).toBe("Keep notes");
    expect(new Date(persisted.occurred_at as string).toISOString()).toBe(
      pain.occurredAt,
    );
    await mutate({
      action: "editEvent",
      event: {
        ...pain,
        payload: {
          readings: [
            { injuryId: "left-knee", painLevel: 7 },
            { injuryId: "right-shoulder", painLevel: 4 },
          ],
        },
      },
      expectedUpdatedAt: (await get(pain.id)).updated_at,
    });
    expect((await get(pain.id)).is_locked).toBe(true);
    card = (await rows("user_component_instances")).find(
      (i) => i.id === instance.id,
    )!;
    await mutate({
      action: "saveInstance",
      instance: { ...updated, title: "Renamed check-in" },
      expectedUpdatedAt: card.updated_at,
      timeZone: "Europe/Oslo",
    });
    expect((await get(pain.id)).is_locked).toBe(true);
    await asUser(bob);
    expect((await get(other.id)).is_locked).toBe(true);
  });
});
