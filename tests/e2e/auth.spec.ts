import { expect, test } from "@playwright/test";
import { createClient } from "@supabase/supabase-js";
// Opt in against a disposable LOCAL Supabase stack. Start Next with matching
// NEXT_PUBLIC_SUPABASE_* values. Local email confirmation must be disabled.
// SUPABASE_TEST_URL=http://127.0.0.1:54321
// SUPABASE_TEST_SERVICE_ROLE_KEY=<local service_role key from supabase status>
const url = process.env.SUPABASE_TEST_URL;
const key = process.env.SUPABASE_TEST_SERVICE_ROLE_KEY;
test("live registration, pending access, admin approval, session persistence and logout", async ({
  page,
  browser,
}) => {
  test.skip(
    !url || !key,
    "Requires an explicitly configured local Supabase stack.",
  );
  test.setTimeout(90000);
  if (!["localhost", "127.0.0.1"].includes(new URL(url!).hostname))
    throw new Error("Live tests must use a disposable local Supabase stack.");
  const service = createClient(url!, key!, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const suffix = Date.now().toString();
  const password = `Test-only-${suffix}!`;
  const adminEmail = `admin-${suffix}@example.test`;
  const email = `user-${suffix}@example.test`;
  const username = `user_${suffix}`;
  const { data: created, error } = await service.auth.admin.createUser({
    email: adminEmail,
    password,
    email_confirm: true,
    user_metadata: { username: `admin_${suffix}` },
  });
  if (error || !created.user)
    throw error ?? new Error("Unable to create test admin.");
  const adminId = created.user.id;
  let userId: string | undefined;
  const adminContext = await browser.newContext();
  try {
    const { error: promotionError } = await service
      .from("profiles")
      .update({ role: "admin", account_status: "approved" })
      .eq("id", adminId);
    if (promotionError) throw promotionError;
    await page.goto("/login");
    await page
      .getByRole("button", { name: "New here? Create an account" })
      .click();
    await page.getByLabel("Username", { exact: true }).fill(username);
    await page.getByLabel("Email address").fill(email);
    await page.getByLabel("Password", { exact: true }).fill(password);
    await page
      .getByRole("button", { name: "Create account", exact: true })
      .click();
    await expect(
      page.getByRole("heading", { name: "You’re on the list." }),
    ).toBeVisible();
    const { data: profile } = await service
      .from("profiles")
      .select("id,account_status")
      .eq("username", username)
      .single();
    expect(profile?.account_status).toBe("pending");
    userId = profile?.id;
    expect((await page.request.get("/api/data")).status()).toBe(403);
    expect((await page.request.get("/api/admin")).status()).toBe(403);
    const adminPage = await adminContext.newPage();
    await adminPage.goto("/login");
    await adminPage.getByLabel("Email address").fill(adminEmail);
    await adminPage.getByLabel("Password", { exact: true }).fill(password);
    await adminPage
      .getByRole("button", { name: "Sign in", exact: true })
      .click();
    await adminPage
      .getByRole("button", { name: "Administration", exact: true })
      .click();
    await adminPage
      .getByLabel(`Status for ${username}`)
      .selectOption("approved");
    await expect
      .poll(async () => {
        const { data } = await service
          .from("profiles")
          .select("account_status")
          .eq("id", userId!)
          .single();
        return data?.account_status;
      })
      .toBe("approved");
    await page.getByRole("button", { name: "Check status" }).click();
    await expect(
      page.getByRole("heading", { name: `Let’s keep moving, ${username}.` }),
    ).toBeVisible();
    await page
      .getByRole("button", { name: "Add component", exact: true })
      .click();
    await page
      .getByRole("button", { name: /Pain check-in.*Configure component/ })
      .click();
    await page
      .getByRole("button", { name: "Add component", exact: true })
      .last()
      .click();
    await page
      .getByRole("button", { name: "Save check-in", exact: true })
      .click();
    await expect(page.getByRole("status")).toContainText("Event saved");
    await page.reload();
    await expect(
      page.getByRole("heading", { name: `Let’s keep moving, ${username}.` }),
    ).toBeVisible();
    await page.getByRole("button", { name: "Sign out", exact: true }).click();
    await expect(page).toHaveURL(/\/login/);
    expect((await page.request.get("/api/data")).status()).toBe(403);
  } finally {
    await adminContext.close();
    if (!userId) {
      const { data } = await service
        .from("profiles")
        .select("id")
        .eq("username", username)
        .maybeSingle();
      userId = data?.id;
    }
    if (userId) await service.auth.admin.deleteUser(userId);
    await service.auth.admin.deleteUser(adminId);
  }
});
