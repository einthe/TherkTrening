import { expect, test } from "@playwright/test";

test.use({ timezoneId: "UTC" });

test("dashboard controls stay on Components and the weekly summary is optional and persistent", async ({
  page,
}) => {
  await page.clock.setFixedTime(new Date("2026-09-19T12:00:00Z"));
  await page.goto("/demo");
  const summary = page.locator(".summary-card");
  await expect(
    summary.getByRole("heading", { name: "Last 7 days" }),
  ).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Customize", exact: true }),
  ).toHaveCount(0);
  await expect(
    page.getByRole("button", { name: "Add component", exact: true }),
  ).toHaveCount(0);
  await expect(summary.locator(".overview-stat > strong")).toHaveText([
    "04",
    "05",
    "05 / 7",
  ]);
  await page
    .getByRole("button", { name: "Save check-in", exact: true })
    .click();
  await expect(summary.locator(".overview-stat > strong")).toHaveText([
    "04",
    "06",
    "05 / 7",
  ]);

  await page.getByRole("button", { name: "Components", exact: true }).click();
  const row = page.locator(".manage-card").filter({
    has: page.getByRole("heading", { name: "Last 7 days", exact: true }),
  });
  await expect(
    page.getByRole("button", { name: "Customize", exact: true }),
  ).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Add component", exact: true }),
  ).toBeVisible();
  await row.getByRole("button", { name: "Settings", exact: true }).click();
  await page.getByLabel("Show on my dashboard").uncheck();
  await page.getByRole("button", { name: "Save changes", exact: true }).click();
  await expect(row).toContainText("Hidden");
  await page.getByRole("button", { name: "Dashboard", exact: true }).click();
  await expect(summary).toHaveCount(0);
  await page.reload();
  await expect(
    page.getByRole("button", { name: "Save check-in", exact: true }),
  ).toBeVisible();
  await expect(summary).toHaveCount(0);

  await page.getByRole("button", { name: "Components", exact: true }).click();
  await row.getByRole("button", { name: "Settings", exact: true }).click();
  await page.getByLabel("Show on my dashboard").check();
  await page.getByRole("button", { name: "Save changes", exact: true }).click();
  await page.getByRole("button", { name: "Customize", exact: true }).click();
  await page
    .getByRole("button", { name: "Move Last 7 days down", exact: true })
    .click();
  await expect(page.locator(".manage-card").nth(1)).toContainText(
    "Last 7 days",
  );
  await page.getByRole("button", { name: "Dashboard", exact: true }).click();
  await expect(page.locator(".dashboard-card").nth(1)).toContainText(
    "Last 7 days",
  );
  await expect(
    page.getByRole("button", { name: /Move .* (up|down)/ }),
  ).toHaveCount(0);
  await page.reload();
  await expect(page.locator(".dashboard-card").nth(1)).toContainText(
    "Last 7 days",
  );

  await page.getByRole("button", { name: "Components", exact: true }).click();
  await page.getByRole("button", { name: "Customize", exact: true }).click();
  await page
    .getByRole("button", { name: "Remove Last 7 days", exact: true })
    .click();
  await page
    .getByRole("button", { name: "Remove component", exact: true })
    .click();
  await expect(row).toHaveCount(0);
  // Simulate a demo saved before this component was registered.
  await page.evaluate(() => {
    const state = JSON.parse(localStorage.getItem("therktrening-demo-v1")!);
    state.definitions.components = state.definitions.components.filter(
      (d: { key: string }) => d.key !== "weekly_summary",
    );
    localStorage.setItem("therktrening-demo-v1", JSON.stringify(state));
  });
  await page.reload();
  await expect(
    page.getByRole("button", { name: "Save check-in", exact: true }),
  ).toBeVisible();
  await expect(summary).toHaveCount(0);
  await page.getByRole("button", { name: "Components", exact: true }).click();
  await page
    .getByRole("button", { name: "Add component", exact: true })
    .click();
  await page
    .getByRole("button", { name: /Last 7 days.*Configure component/ })
    .click();
  await page
    .getByRole("dialog")
    .getByRole("button", { name: "Add component", exact: true })
    .click();
  await expect(row).toBeVisible();
  await page.getByRole("button", { name: "Dashboard", exact: true }).click();
  await expect(summary.locator(".overview-stat > strong")).toHaveText([
    "04",
    "06",
    "05 / 7",
  ]);
});
