import { expect, test } from "@playwright/test";

test("invalid collapsed sets and storage failures preserve the workout draft", async ({
  page,
}) => {
  await page.goto("/demo");
  const card = page.locator(".workout-logger");
  await card.getByRole("button", { name: /^Squat.*sets/ }).click();
  await card
    .getByRole("spinbutton", { name: "Set 1 reps", exact: true })
    .fill("-1");
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

test("exercise and workout libraries persist edits; templates exclude weights; workouts log and edit as one record", async ({
  page,
}, testInfo) => {
  await page.goto("/demo");
  const nav = page.getByRole("navigation", { name: "Main navigation" });
  await nav.getByRole("button", { name: "Exercises", exact: true }).click();
  await page.getByRole("button", { name: "New exercise", exact: true }).click();
  let dialog = page.getByRole("dialog");
  await dialog.getByLabel("Exercise name", { exact: true }).fill("Step-up");
  await dialog.getByLabel("Description (optional)").fill("Use a low step");
  await dialog
    .getByRole("button", { name: "Save exercise", exact: true })
    .click();
  await expect(
    page.getByRole("heading", { name: "Step-up", exact: true }),
  ).toBeVisible();
  await page
    .getByRole("button", { name: "Edit Step-up exercise", exact: true })
    .click();
  await dialog
    .getByLabel("Exercise name", { exact: true })
    .fill("Single leg step-up");
  await dialog
    .getByRole("button", { name: "Save exercise", exact: true })
    .click();
  await page
    .getByRole("button", { name: "Edit Squat exercise", exact: true })
    .click();
  await dialog.getByLabel("Exercise name", { exact: true }).fill("Back squat");
  await dialog
    .getByRole("button", { name: "Save exercise", exact: true })
    .click();
  await expect(
    page.getByRole("heading", { name: "Back squat", exact: true }),
  ).toBeVisible();
  await nav.getByRole("button", { name: "Workouts", exact: true }).click();
  await page.getByRole("button", { name: "New template", exact: true }).click();
  await dialog.getByLabel("Template name", { exact: true }).fill("Strength A");
  await dialog.getByRole("button", { name: /^Back squat.*sets/ }).click();
  const reps = dialog.getByRole("spinbutton", {
    name: "Set 1 reps",
    exact: true,
  });
  await reps.fill("");
  await expect(reps).toHaveValue("");
  await reps.press("Tab");
  await expect(reps).toHaveValue("0");
  await reps.fill("8");
  await expect(dialog.getByRole("spinbutton", { name: /weight/ })).toHaveCount(
    0,
  );
  await dialog.getByLabel("Exercise to add").selectOption("step-up");
  await dialog
    .getByRole("button", { name: "Add exercise", exact: true })
    .click();
  await dialog
    .getByRole("button", { name: "Save template", exact: true })
    .click();
  await expect(
    page.getByRole("heading", { name: "Strength A", exact: true }),
  ).toBeVisible();
  await page
    .getByRole("button", { name: "Edit Strength A template", exact: true })
    .click();
  await dialog.getByLabel("Template name", { exact: true }).fill("Strength B");
  await dialog.getByRole("button", { name: /^Back squat.*sets/ }).click();
  await dialog
    .getByRole("spinbutton", { name: "Set 2 reps", exact: true })
    .fill("6");
  await dialog
    .getByRole("button", { name: "Save template", exact: true })
    .click();
  await page.reload();
  const card = page.locator(".workout-logger");
  const dropdown = card.getByLabel("Saved workouts");
  await dropdown.selectOption({ label: "Strength B" });
  await card.getByRole("button", { name: /^Back squat.*sets/ }).click();
  await expect(
    card.getByRole("spinbutton", { name: "Set 1 reps", exact: true }),
  ).toHaveValue("8");
  const weight = card.getByRole("spinbutton", {
    name: "Set 1 weight",
    exact: true,
  });
  await expect(weight).toHaveValue("0");
  await weight.fill("");
  await expect(weight).toHaveValue("");
  await weight.fill("80");
  const secondWeight = card.getByRole("spinbutton", {
    name: "Set 2 weight",
    exact: true,
  });
  await secondWeight.fill("");
  await expect(secondWeight).toHaveValue("");
  await secondWeight.press("Tab");
  await expect(secondWeight).toHaveValue("0");
  await card
    .getByRole("button", { name: "Close exercise", exact: true })
    .click();
  await card.getByRole("button", { name: /^Single leg step-up.*sets/ }).click();
  await card
    .getByRole("spinbutton", { name: "Set 1 weight", exact: true })
    .fill("10");
  await dropdown.selectOption("");
  await expect(
    card.getByText(/Replace the current workout draft/),
  ).toBeVisible();
  await card.getByRole("button", { name: "Keep editing", exact: true }).click();
  await card.getByLabel("Workout name", { exact: true }).fill("Monday workout");
  const before = await page.evaluate(
    () =>
      JSON.parse(localStorage.getItem("therktrening-demo-v1")!).events.length,
  );
  await card.getByRole("button", { name: "Save workout", exact: true }).click();
  await expect(page.getByRole("status")).toContainText("Workout saved");
  let state = await page.evaluate(() =>
    JSON.parse(localStorage.getItem("therktrening-demo-v1")!),
  );
  expect(state.events).toHaveLength(before + 1);
  expect(state.events.at(-1).eventType).toBe("workout");
  expect(state.events.at(-1).payload.exercises).toHaveLength(2);
  expect(state.workoutTemplates).toHaveLength(1);
  expect(JSON.stringify(state.workoutTemplates)).not.toContain("weightKg");
  expect(
    state.customExercises.find((e: { id: string }) => e.id === "step-up").name,
  ).toBe("Single leg step-up");
  await card
    .getByRole("button", { name: "Save as template", exact: true })
    .click();
  await card.getByLabel("Template name", { exact: true }).fill("Strength C");
  await card
    .getByRole("button", { name: "Save template", exact: true })
    .click();
  await expect(page.getByRole("status")).toContainText(
    "Workout template saved",
  );
  state = await page.evaluate(() =>
    JSON.parse(localStorage.getItem("therktrening-demo-v1")!),
  );
  expect(state.events).toHaveLength(before + 1);
  expect(JSON.stringify(state.workoutTemplates)).not.toContain("weightKg");
  const workoutId = state.events.at(-1).id;
  await nav.getByRole("button", { name: "Event history", exact: true }).click();
  await page.getByLabel("Search events").fill("Monday workout");
  await expect(page.locator(".history-table tbody tr")).toHaveCount(1);
  await page
    .getByRole("button", { name: "Monday workout", exact: true })
    .click();
  await dialog
    .getByRole("button", { name: "Edit workout", exact: true })
    .click();
  await dialog.getByRole("button", { name: /^Back squat.*sets/ }).click();
  await dialog
    .getByRole("spinbutton", { name: "Set 1 weight", exact: true })
    .fill("85");
  await dialog
    .getByRole("button", {
      name: "Remove Single leg step-up exercise 2",
      exact: true,
    })
    .click();
  await dialog.getByLabel("Exercise to add").selectOption("bench-press");
  await dialog
    .getByRole("button", { name: "Add exercise", exact: true })
    .click();
  await dialog
    .getByRole("spinbutton", { name: "Set 1 weight", exact: true })
    .fill("40");
  await dialog.locator(".when").getByRole("button").first().click();
  await dialog.getByLabel("Event date and time").fill("2020-01-02T10:00");
  await dialog
    .getByRole("button", { name: "Save changes", exact: true })
    .click();
  await expect(page.getByRole("status")).toContainText("Workout updated");
  await page.reload();
  state = await page.evaluate(() =>
    JSON.parse(localStorage.getItem("therktrening-demo-v1")!),
  );
  expect(state.events).toHaveLength(before + 1);
  const updated = state.events.find((e: { id: string }) => e.id === workoutId);
  expect(
    updated.payload.exercises.map((e: { exerciseId: string }) => e.exerciseId),
  ).toEqual(["squat", "bench-press"]);
  expect(updated.payload.exercises[0].sets[0].weightKg).toBe(85);
  expect(updated.occurredAt).toContain("2020-01-02");
  await nav.getByRole("button", { name: "Workouts", exact: true }).click();
  await page
    .getByRole("button", { name: "Delete Strength C template", exact: true })
    .click();
  await page
    .getByRole("button", { name: "Delete template", exact: true })
    .click();
  await expect(
    page.getByRole("heading", { name: "Strength C", exact: true }),
  ).toHaveCount(0);
  expect(
    await page.evaluate(
      () =>
        JSON.parse(localStorage.getItem("therktrening-demo-v1")!).events.length,
    ),
  ).toBe(before + 1);
  await page.screenshot({
    path: testInfo.outputPath("workouts-desktop.png"),
    fullPage: true,
  });
  await page.setViewportSize({ width: 390, height: 844 });
  await page
    .getByRole("button", { name: "Edit Strength B template", exact: true })
    .click();
  dialog = page.getByRole("dialog");
  await dialog.getByRole("button", { name: /^Back squat.*sets/ }).click();
  await expect
    .poll(() =>
      page.evaluate(() => document.documentElement.scrollWidth <= innerWidth),
    )
    .toBe(true);
  await page.screenshot({
    path: testInfo.outputPath("template-mobile.png"),
    fullPage: true,
  });
});
