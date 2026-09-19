import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { PGlite } from "@electric-sql/pglite";
import { readFileSync, readdirSync } from "node:fs";
import { newEvent } from "@/lib/domain/events";
import { defaultExercise, workoutEvents } from "@/lib/domain/workouts";
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
      injuryId: "left-knee",
      painLevel: 3,
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
          payload: { injuryId: "left-knee", painLevel: 4 },
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
      version: 1,
      exercises: [
        defaultExercise("squat", 5, 80),
        defaultExercise("bench-press", 8, 40),
      ],
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
    ).rejects.toThrow("Invalid set");
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
          version: 2,
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
    ).rejects.toThrow("Invalid name");
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
    const draft = structuredClone(template.exercises);
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
    ).toHaveLength(2);
    expect((await rows("workout_templates"))[0].exercises).toEqual(
      template.exercises,
    );
    const card = makeInstance("workout_logger", 2);
    await mutate({ action: "saveInstance", instance: card });
    await mutate({ action: "removeInstance", id: card.id });
    expect(await rows("workout_templates")).toHaveLength(1);
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
