import { NextResponse } from "next/server";
import { currentProfile, supabaseServer } from "@/lib/supabase/server";
import {
  mutationSchema,
  eventFromRow,
  instanceFromRow,
  templateFromRow,
} from "@/lib/data/server-repository";
export async function GET(request: Request) {
  const profile = await currentProfile();
  if (profile?.accountStatus !== "approved")
    return NextResponse.json(
      { error: "Sign in with an approved account." },
      { status: 403 },
    );
  const db = await supabaseServer();
  const { error: lockError } = await db.rpc("lock_expired_workouts", {
    zone: new URL(request.url).searchParams.get("timeZone") || "UTC",
  });
  if (lockError)
    return NextResponse.json(
      {
        error:
          "Unable to update daily locks. Apply the latest database migrations and try again.",
      },
      { status: 500 },
    );
  const [
    events,
    instances,
    components,
    eventDefs,
    operators,
    templates,
    exercises,
  ] = await Promise.all([
    readAllEvents(db),
    db.from("user_component_instances").select("*").order("position"),
    db.from("component_definitions").select("key,name,version,active"),
    db.from("event_type_definitions").select("key,name,version,active"),
    db.from("operator_definitions").select("key,name,version,active"),
    readAllRows(db, "workout_templates"),
    readAllRows(db, "user_exercises"),
  ]);
  if (
    [
      events,
      instances,
      components,
      eventDefs,
      operators,
      templates,
      exercises,
    ].some((r) => r.error)
  )
    return NextResponse.json(
      { error: "Unable to load your workspace. Please try again." },
      { status: 500 },
    );
  return NextResponse.json(
    {
      profile,
      workoutTemplates: templates.data!.map(templateFromRow),
      customExercises: exercises.data!.map((r) => ({
        id: r.id,
        name: r.name,
        description: r.description,
        updatedAt: r.updated_at,
      })),
      events: events.data!.map(eventFromRow),
      instances: instances.data!.map(instanceFromRow),
      definitions: {
        components: components.data,
        events: eventDefs.data,
        operators: operators.data,
      },
    },
    { headers: { "Cache-Control": "private, no-store" } },
  );
}
export async function POST(request: Request) {
  const profile = await currentProfile();
  if (profile?.accountStatus !== "approved")
    return NextResponse.json(
      { error: "Sign in with an approved account." },
      { status: 403 },
    );
  let body;
  try {
    body = mutationSchema.safeParse(await request.json());
  } catch {
    return NextResponse.json({ error: "Invalid request." }, { status: 400 });
  }
  if (!body.success)
    return NextResponse.json(
      { error: body.error.issues.map((i) => i.message).join(" ") },
      { status: 400 },
    );
  const db = await supabaseServer();
  const { error } = await db.rpc(
    body.data.action === "saveWorkoutTemplate" ||
      body.data.action === "createExercise" ||
      body.data.action === "saveExercise" ||
      body.data.action === "deleteWorkoutTemplate"
      ? "mutate_workout_library"
      : "mutate_workspace",
    { mutation: body.data },
  );
  if (error) {
    const known = [
      "Unlock this event",
      "changed elsewhere",
      "Event not found",
      "workout first",
      "unavailable",
      "Invalid",
      "Unsupported",
      "Refresh your",
      "cannot be changed",
    ];
    return NextResponse.json(
      {
        error: known.some((s) => error.message.includes(s))
          ? error.message
          : "Could not save your changes. Check the inputs and try again.",
      },
      { status: 409 },
    );
  }
  return NextResponse.json({ ok: true });
}

// Supabase REST caps each response. Page explicitly so old events stay queryable.
async function readAllEvents(db: Awaited<ReturnType<typeof supabaseServer>>) {
  const events: Record<string, unknown>[] = [];
  for (let offset = 0; ; offset += 1000) {
    const { data, error } = await db
      .from("events")
      .select("*")
      .order("occurred_at", { ascending: false })
      .order("id")
      .range(offset, offset + 999);
    if (error) return { data: null, error };
    events.push(...data);
    if (data.length < 1000) return { data: events, error: null };
  }
}

async function readAllRows(
  db: Awaited<ReturnType<typeof supabaseServer>>,
  table: "workout_templates" | "user_exercises",
) {
  const rows: Record<string, unknown>[] = [];
  for (let offset = 0; ; offset += 1000) {
    const { data, error } = await db
      .from(table)
      .select("*")
      .order("id")
      .range(offset, offset + 999);
    if (error) return { data: null, error };
    rows.push(...data);
    if (data.length < 1000) return { data: rows, error: null };
  }
}
