import { expect, test } from "@playwright/test";
test("reference flow: configure, log, graph, edit, lock, unlock, backdate, persist, and exit", async ({
  page,
}) => {
  await page.goto("/demo");
  await expect(page.getByRole("heading", { name: "Dashboard" })).toBeVisible();
  await page
    .getByRole("button", { name: "Save check-in", exact: true })
    .click();
  await expect(page.getByRole("status")).toContainText("Event saved");
  await page
    .locator(".workout-logger")
    .getByRole("button", { name: /^Squat.*sets/ })
    .click();
  await page
    .getByRole("spinbutton", { name: "Set 3 reps", exact: true })
    .fill("3");
  await page
    .getByRole("spinbutton", { name: "Set 3 weight", exact: true })
    .fill("90");
  await expect(page.locator(".workout-total")).toContainText("1,070");
  await page.getByRole("button", { name: "Save workout", exact: true }).click();
  await expect(page.getByRole("status")).toContainText("2 events saved");
  await expect(
    page.getByRole("img", {
      name: /Squat volume compared with Left knee pain/,
    }),
  ).toBeVisible();
  await page
    .getByRole("button", { name: "Event history", exact: true })
    .click();
  await page.getByLabel("Event type").selectOption("pain_measurement");
  await page
    .getByRole("button", { name: "Left knee · 3/10", exact: true })
    .first()
    .click();
  await page.getByRole("button", { name: "Edit event", exact: true }).click();
  await page.getByLabel("Pain level (0–10)").fill("4");
  await page.getByLabel("Occurred at").fill("2020-01-02T10:00");
  await page.getByLabel("Notes (optional)").fill("Backdated check-in");
  await page.getByRole("button", { name: "Save changes", exact: true }).click();
  await expect(page.getByRole("status")).toContainText("Event updated");
  await page.getByLabel("From", { exact: true }).fill("2020-01-01");
  await page.getByLabel("To", { exact: true }).fill("2020-01-03");
  await page
    .getByRole("button", { name: "Left knee · 4/10", exact: true })
    .click();
  await page.getByRole("button", { name: "Lock event", exact: true }).click();
  await expect(page.getByRole("status")).toContainText("Event locked");
  await page
    .getByRole("button", { name: "Left knee · 4/10", exact: true })
    .click();
  await expect(
    page.getByRole("button", { name: "Edit event", exact: true }),
  ).toBeDisabled();
  await expect(
    page.getByRole("button", { name: "Delete event", exact: true }),
  ).toBeDisabled();
  await page.getByRole("button", { name: "Unlock event", exact: true }).click();
  await page
    .getByRole("button", { name: "Left knee · 4/10", exact: true })
    .click();
  await page.getByRole("button", { name: "Edit event", exact: true }).click();
  await page.getByLabel("Pain level (0–10)").fill("2");
  await page.getByRole("button", { name: "Save changes", exact: true }).click();
  await page.getByRole("button", { name: "Components", exact: true }).click();
  await page
    .getByRole("button", { name: "Add component", exact: true })
    .click();
  await page
    .getByRole("button", { name: /Pain check-in.*Configure component/ })
    .click();
  await page.getByLabel("Title", { exact: true }).fill("Morning joint check");
  await page.getByLabel("Tracked targets").fill("left-knee, right-knee");
  await page.getByLabel("Show optional notes").check();
  await page
    .getByRole("button", { name: "Add component", exact: true })
    .last()
    .click();
  await expect(
    page.getByRole("heading", { name: "Morning joint check", exact: true }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Dashboard", exact: true }).click();
  await page.getByRole("button", { name: "Save all", exact: true }).click();
  await expect(page.getByRole("status")).toContainText("2 events saved");
  await page.reload();
  await expect(
    page.getByRole("heading", { name: "Morning joint check", exact: true }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Exit demo", exact: true }).click();
  await expect(page).toHaveURL(/\/login/);
});
test("component removal preserves events; reorder and visibility persist", async ({
  page,
}) => {
  await page.goto("/demo");
  await page.getByRole("button", { name: "Components", exact: true }).click();
  await page.getByRole("button", { name: "Customize", exact: true }).click();
  await page
    .getByRole("button", { name: "Move Workout up", exact: true })
    .click();
  await expect(page.getByRole("status")).toContainText(
    "Dashboard order updated",
  );
  await page
    .getByRole("button", { name: "Remove Left knee pain", exact: true })
    .click();
  await page
    .getByRole("button", { name: "Remove component", exact: true })
    .click();
  await expect(
    page.getByRole("heading", { name: "Left knee pain", exact: true }),
  ).toHaveCount(0);
  await page
    .getByRole("button", { name: "Event history", exact: true })
    .click();
  await page.getByLabel("Event type").selectOption("pain_measurement");
  await expect(
    page.getByRole("button", { name: /Left knee ·/ }).first(),
  ).toBeVisible();
});
test("mobile layout is usable without horizontal overflow", async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/demo");
  await expect(
    page.getByRole("button", { name: "Save check-in", exact: true }),
  ).toBeVisible();
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= window.innerWidth,
    ),
  ).toBe(true);
  await page.getByRole("button", { name: "Open navigation" }).click();
  await page
    .getByRole("button", { name: "Event history", exact: true })
    .click();
  await expect(
    page.getByRole("heading", { name: "Event history", exact: true }),
  ).toBeVisible();
});
