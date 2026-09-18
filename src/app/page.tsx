import { redirect } from "next/navigation";
import { currentProfile, isConfigured } from "@/lib/supabase/server";
import { Workspace } from "@/components/workspace";
import { AccountStatus } from "@/components/auth";
export default async function Page() {
  if (!isConfigured()) return <Workspace demo />;
  const profile = await currentProfile();
  if (!profile) redirect("/login");
  if (profile.accountStatus !== "approved")
    return <AccountStatus status={profile.accountStatus} />;
  return <Workspace />;
}
