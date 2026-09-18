import { type EmailOtpType } from "@supabase/supabase-js";
import { NextResponse } from "next/server";
import { supabaseServer } from "@/lib/supabase/server";
export async function GET(request: Request) {
  const url = new URL(request.url);
  const token_hash = url.searchParams.get("token_hash");
  const type = url.searchParams.get("type") as EmailOtpType | null;
  if (token_hash && type && ["signup", "email"].includes(type)) {
    const db = await supabaseServer();
    const { error } = await db.auth.verifyOtp({ token_hash, type });
    if (!error) return NextResponse.redirect(new URL("/", url));
  }
  return NextResponse.redirect(new URL("/login?error=confirmation", url));
}
