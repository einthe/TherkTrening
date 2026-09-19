import { expect, test } from "@playwright/test";

test("workouts expand exercises, log together, and save templates only on request", async ({
  page,
}, testInfo) => {
  await page.goto("/demo");
  const card = page.locator(".dashboard-card").filter({
    has: page.getByRole("heading", { name: "Workout", exact: true }),
  });
  const savedWorkouts = card.getByLabel("Saved workouts");
  await expect(savedWorkouts.locator("option")).toHaveCount(1);
  await card.getByLabel("Workout name", { exact: true }).fill("Strength day");
  await card.getByRole("button", { name: /^Squat.*sets/ }).click();
  await card
    .getByRole("spinbutton", { name: "Set 2 reps", exact: true })
    .fill("4");
  await card
    .getByRole("spinbutton", { name: "Set 2 weight", exact: true })
    .fill("85");
  await card
    .getByRole("spinbutton", { name: "Set 3 reps", exact: true })
    .fill("3");
  await card
    .getByRole("spinbutton", { name: "Set 3 weight", exact: true })
    .fill("90");
  await card
    .getByRole("button", { name: "Close exercise", exact: true })
    .click();
  await card.getByLabel("Exercise to add").selectOption("bench-press");
  await card.getByRole("button", { name: "Add exercise", exact: true }).click();
  await card
    .getByRole("group", { name: "Bench press sets 2" })
    .getByRole("spinbutton", { name: "Set 1 weight", exact: true })
    .fill("40");
  await card.getByRole("button", { name: /^Squat.*sets/ }).click();
  await expect(
    card.getByRole("spinbutton", { name: "Set 3 weight", exact: true }),
  ).toHaveValue("90");
  await card
    .getByRole("button", { name: "Remove Bench press exercise 2" })
    .click();
  await expect(
    card.getByRole("button", { name: /^Bench press.*sets/ }),
  ).toHaveCount(0);
  await card
    .getByRole("button", { name: "Create an exercise", exact: true })
    .click();
  await card.getByLabel("New exercise name").fill("Single leg step-up");
  await card.getByRole("button", { name: "Create & add", exact: true }).click();
  await expect(page.getByRole("status")).toContainText("Exercise created");
  await card
    .getByRole("group", { name: "Single leg step-up sets 2" })
    .getByRole("spinbutton", { name: "Set 1 weight", exact: true })
    .fill("10");
  await card
    .getByRole("button", { name: "Close exercise", exact: true })
    .click();
  await expect(card.locator(".workout-total")).toContainText("1,060 kg·reps");
  const countEvents = () =>
    page.evaluate(
      () =>
        JSON.parse(localStorage.getItem("therktrening-demo-v1")!).events.length,
    );
  const before = await countEvents();
  await card.getByRole("button", { name: "Save workout", exact: true }).click();
  await expect(page.getByRole("status")).toContainText("3 events saved");
  expect(await countEvents()).toBe(before + 3);
  await expect(savedWorkouts.locator("option")).toHaveCount(1);
  await card
    .getByRole("button", { name: "Save as template", exact: true })
    .click();
  await card
    .getByLabel("Template name", { exact: true })
    .fill("Lower body template");
  await card
    .getByRole("button", { name: "Save template", exact: true })
    .click();
  await expect(page.getByRole("status")).toContainText(
    "Workout template saved",
  );
  expect(await countEvents()).toBe(before + 3);
  await expect(savedWorkouts.locator("option")).toHaveCount(2);

  await page.reload();
  await expect(savedWorkouts.locator("option")).toHaveCount(2);
  await expect(
    card
      .getByLabel("Exercise to add")
      .locator('option[value="single-leg-step-up"]'),
  ).toHaveCount(1);
  await savedWorkouts.selectOption({ label: "Lower body template" });
  await expect(card.getByLabel("Workout name", { exact: true })).toHaveValue(
    "Lower body template",
  );
  await expect(card.locator(".workout-total")).toContainText("1,060 kg·reps");
  await card.getByRole("button", { name: /^Squat.*sets/ }).click();
  await card
    .getByRole("spinbutton", { name: "Set 1 weight", exact: true })
    .fill("100");
  await savedWorkouts.selectOption("");
  await expect(
    card.getByText(/Replace the current workout draft/),
  ).toBeVisible();
  await card.getByRole("button", { name: "Keep editing", exact: true }).click();
  await expect(
    card.getByRole("spinbutton", { name: "Set 1 weight", exact: true }),
  ).toHaveValue("100");
  await card
    .getByRole("button", { name: "Now · change time", exact: true })
    .click();
  await card
    .getByLabel("Event date and time", { exact: true })
    .fill("2020-01-02T10:00");
  await card.getByRole("button", { name: "Save workout", exact: true }).click();
  await expect(page.getByRole("status")).toContainText("3 events saved");
  const stored = await page.evaluate(() =>
    JSON.parse(localStorage.getItem("therktrening-demo-v1")!),
  );
  expect(stored.workoutTemplates).toHaveLength(1);
  expect(stored.workoutTemplates[0].exercises[0].sets[0].weightKg).toBe(80);
  const logged = stored.events.slice(-3);
  expect(logged[0].eventType).toBe("workout");
  expect(logged[1].parentEventId).toBe(logged[0].id);
  expect(logged[2].parentEventId).toBe(logged[0].id);
  expect(logged[1].payload.sets[0].weightKg).toBe(100);
  expect(logged[0].occurredAt).toContain("2020-01-02");
  expect(logged[1].occurredAt).toBe(logged[0].occurredAt);
  await page.screenshot({
    path: testInfo.outputPath("workout-desktop.png"),
    fullPage: true,
  });
  await page.setViewportSize({ width: 390, height: 844 });
  await expect
    .poll(() =>
      page.evaluate(() => document.documentElement.scrollWidth <= innerWidth),
    )
    .toBe(true);
  await page.screenshot({
    path: testInfo.outputPath("workout-mobile.png"),
    fullPage: true,
  });
});

test("invalid collapsed sets and storage failures preserve the workout draft", async ({
  page,
}) => {
  await page.goto("/demo");
  const card = page.locator(".workout-logger");
  await card.getByRole("button", { name: /^Squat.*sets/ }).click();
  await card
    .getByRole("spinbutton", { name: "Set 1 reps", exact: true })
    .fill("0");
  await card
    .getByRole("button", { name: "Close exercise", exact: true })
    .click();
  await card.getByRole("button", { name: "Save workout", exact: true }).click();
  await expect(card.getByRole("alert")).toBeVisible();
  await card.getByRole("button", { name: /^Squat.*sets/ }).click();
  await card
    .getByRole("spinbutton", { name: "Set 1 reps", exact: true })
    .fill("8");
  const before = await page.evaluate(() => {
    const count = JSON.parse(localStorage.getItem("therktrening-demo-v1")!)
      .events.length;
    Storage.prototype.setItem = () => {
      throw new Error("Storage unavailable");
    };
    return count;
  });
  await card.getByRole("button", { name: "Save workout", exact: true }).click();
  await expect(card.getByRole("alert")).toContainText(
    "Could not save this workout",
  );
  await expect(
    card.getByRole("spinbutton", { name: "Set 1 reps", exact: true }),
  ).toHaveValue("8");
  expect(
    await page.evaluate(
      () =>
        JSON.parse(localStorage.getItem("therktrening-demo-v1")!).events.length,
    ),
  ).toBe(before);
});
