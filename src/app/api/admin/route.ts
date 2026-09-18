import { NextResponse } from "next/server";
import { z } from "zod";
import { currentProfile, supabaseServer } from "@/lib/supabase/server";
const schema = z.discriminatedUnion("action", [
  z
    .object({
      action: z.literal("status"),
      id: z.uuid(),
      status: z.enum(["pending", "approved", "rejected", "disabled"]),
    })
    .strict(),
  z
    .object({
      action: z.literal("definition"),
      table: z.enum([
        "component_definitions",
        "event_type_definitions",
        "operator_definitions",
      ]),
      key: z.string().min(1).max(100),
      active: z.boolean(),
    })
    .strict(),
]);
export async function GET() {
  const profile = await currentProfile();
  if (profile?.role !== "admin" || profile.accountStatus !== "approved")
    return NextResponse.json(
      { error: "Administrator access required." },
      { status: 403 },
    );
  const db = await supabaseServer();
  const { data, error } = await db
    .from("profiles")
    .select("id,username,role,account_status,created_at")
    .order("created_at", { ascending: false });
  if (error)
    return NextResponse.json(
      { error: "Unable to load accounts." },
      { status: 500 },
    );
  return NextResponse.json(data, {
    headers: { "Cache-Control": "private, no-store" },
  });
}
export async function POST(request: Request) {
  const profile = await currentProfile();
  if (profile?.role !== "admin" || profile.accountStatus !== "approved")
    return NextResponse.json(
      { error: "Administrator access required." },
      { status: 403 },
    );
  let result;
  try {
    result = schema.safeParse(await request.json());
  } catch {
    return NextResponse.json({ error: "Invalid request." }, { status: 400 });
  }
  if (!result.success)
    return NextResponse.json({ error: "Invalid request." }, { status: 400 });
  const db = await supabaseServer();
  const { error } = await db.rpc("admin_mutate", { mutation: result.data });
  if (error)
    return NextResponse.json(
      { error: "Unable to update. You cannot change your own account status." },
      { status: 400 },
    );
  return NextResponse.json({ ok: true });
}
