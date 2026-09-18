import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";
export const isConfigured = () =>
  Boolean(
    process.env.NEXT_PUBLIC_SUPABASE_URL &&
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
  );
export async function supabaseServer() {
  const cookieStore = await cookies();
  return createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll: () => cookieStore.getAll(),
        setAll: (values) => {
          try {
            values.forEach(({ name, value, options }) =>
              cookieStore.set(name, value, options),
            );
          } catch {
            /* Read-only Server Component; proxy refreshes the session. */
          }
        },
      },
    },
  );
}
export async function currentProfile() {
  if (!isConfigured()) return null;
  const db = await supabaseServer();
  const {
    data: { user },
  } = await db.auth.getUser();
  if (!user) return null;
  const { data, error } = await db
    .from("profiles")
    .select("id,username,role,account_status")
    .eq("id", user.id)
    .single();
  if (error || !data) return null;
  return {
    id: data.id as string,
    username: data.username as string,
    role: data.role as "admin" | "user",
    accountStatus: data.account_status as
      "pending" | "approved" | "rejected" | "disabled",
  };
}
