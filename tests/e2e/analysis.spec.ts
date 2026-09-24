import { expect, test } from "@playwright/test";

test("components can appear in Analysis, Dashboard, both, or neither and persist", async ({
  page,
}, testInfo) => {
  await page.goto("/demo");
  const navigate = (name: string) =>
    page.getByRole("button", { name, exact: true }).click();
  const chart = page.getByRole("heading", {
    name: "Training volume & pain",
    exact: true,
  });
  await expect(chart).toBeVisible();
  await navigate("Analysis");
  await expect(
    page.getByRole("heading", { name: "Analysis", exact: true }),
  ).toBeVisible();
  await expect(
    page.getByRole("heading", { name: "No components" }),
  ).toBeVisible();
  await page.getByRole("button", { name: /Go to Components/ }).click();
  const row = page.locator(".manage-card").filter({ has: chart });
  await row.getByRole("button", { name: "Settings", exact: true }).click();
  const dashboard = page.getByRole("checkbox", {
    name: "Dashboard",
    exact: true,
  });
  const analysis = page.getByRole("checkbox", {
    name: "Analysis",
    exact: true,
  });
  await expect(dashboard).toBeChecked();
  await expect(analysis).not.toBeChecked();
  await dashboard.uncheck();
  await analysis.check();
  await navigate("Save changes");
  await expect(row).toContainText("Chart · Analysis");
  await navigate("Dashboard");
  await expect(chart).toHaveCount(0);
  await page.reload();
  await expect(
    page.getByRole("heading", { name: "Dashboard", exact: true }),
  ).toBeVisible();
  await expect(chart).toHaveCount(0);
  await navigate("Analysis");
  await expect(chart).toBeVisible();
  await expect(page.locator(".chart")).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Customize", exact: true }),
  ).toHaveCount(0);
  await expect(
    page.getByRole("button", { name: "Add component", exact: true }),
  ).toHaveCount(0);
  await page.screenshot({
    path: testInfo.outputPath("analysis-desktop.png"),
    fullPage: true,
  });
  await navigate("Settings for Training volume & pain");
  await dashboard.check();
  await navigate("Save changes");
  await expect(chart).toBeVisible();
  await navigate("Dashboard");
  await expect(chart).toBeVisible();
  await navigate("Components");
  await expect(row).toContainText("Dashboard · Analysis");
  await row.getByRole("button", { name: "Settings", exact: true }).click();
  await dashboard.uncheck();
  await analysis.uncheck();
  await navigate("Save changes");
  await expect(row).toContainText("Hidden");
  await navigate("Analysis");
  await expect(chart).toHaveCount(0);
  await navigate("Dashboard");
  await expect(chart).toHaveCount(0);
  await navigate("Components");
  await row.getByRole("button", { name: "Settings", exact: true }).click();
  await analysis.check();
  await navigate("Save changes");
  await page.setViewportSize({ width: 390, height: 844 });
  await navigate("Open navigation");
  await navigate("Analysis");
  await expect(chart).toBeVisible();
  await expect(page.locator(".sidebar")).toBeHidden();
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
  await page.screenshot({
    path: testInfo.outputPath("analysis-mobile.png"),
    fullPage: true,
  });
});

test("a workout shared between pages keeps its draft and updates one saved workout", async ({
  page,
}) => {
  await page.goto("/demo");
  await page
    .getByRole("button", { name: "Settings for Workout", exact: true })
    .click();
  await page.getByRole("checkbox", { name: "Analysis", exact: true }).check();
  await page.getByRole("button", { name: "Save changes", exact: true }).click();
  await expect(page.getByRole("dialog")).toHaveCount(0);
  await page
    .getByRole("textbox", { name: "Workout name", exact: true })
    .fill("Shared workout");
  await page.getByRole("button", { name: "Analysis", exact: true }).click();
  await expect(
    page.getByRole("textbox", { name: "Workout name", exact: true }),
  ).toHaveValue("Shared workout");
  await page.getByRole("button", { name: "Save workout", exact: true }).click();
  await expect(page.getByRole("status")).toContainText("Workout saved");
  await page.getByRole("button", { name: "Dashboard", exact: true }).click();
  await expect(
    page.getByRole("textbox", { name: "Workout name", exact: true }),
  ).toHaveValue("Shared workout");
  await page
    .locator(".workout-logger")
    .getByRole("button", { name: "Save changes", exact: true })
    .click();
  await expect(page.getByRole("status")).toContainText("Workout updated");
  expect(
    await page.evaluate(() => {
      const state = JSON.parse(localStorage.getItem("therktrening-demo-v1")!);
      return state.events.filter(
        (e: { eventType: string; payload: { name?: string } }) =>
          e.eventType === "workout" && e.payload.name === "Shared workout",
      ).length;
    }),
  ).toBe(1);
});
