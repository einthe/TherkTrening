import { expect, test, type Page } from "@playwright/test";

test.use({ timezoneId: "Europe/Oslo" });
async function state(page: Page) {
  return page.evaluate(() =>
    JSON.parse(localStorage.getItem("therktrening-demo-v1")!),
  );
}
async function setTime(page: Page, kind: "pain" | "workout", time: string) {
  const card = page.locator(`.${kind}-logger`);
  const expand = card.getByRole("button", {
    name: "Expand pain check-in",
    exact: true,
  });
  if (await expand.isVisible()) await expand.click();
  await card.locator(".when").getByRole("button").first().click();
  await card.getByLabel("Event date and time").fill(time);
}

test("pain completes today; today's workout persists and saves changes to the same event", async ({
  page,
}) => {
  await page.clock.install({ time: new Date("2026-09-24T10:00:00Z") });
  await page.goto("/demo");
  const pain = page.locator(".pain-logger");
  const workout = page.locator(".workout-logger");
  await pain.getByRole("slider").fill("7");
  const before = (await state(page)).events.length;
  await pain
    .getByRole("button", { name: "Save check-in", exact: true })
    .click();
  await expect(
    pain.getByText("Checked in today", { exact: true }),
  ).toBeVisible();
  await expect(
    pain.getByRole("button", { name: "Expand pain check-in", exact: true }),
  ).toHaveAttribute("aria-expanded", "false");
  await expect(pain.getByRole("slider")).toHaveCount(0);
  await pain
    .getByRole("button", { name: "Expand pain check-in", exact: true })
    .click();
  await expect(pain.getByRole("slider")).toBeDisabled();
  await expect(pain.getByRole("slider")).toHaveValue("7");
  expect((await state(page)).events.at(-1).isLocked).toBe(true);
  await workout.getByLabel("Workout name").fill("Today's strength");
  await workout
    .getByRole("button", { name: "Save workout", exact: true })
    .click();
  await expect(
    workout.getByText("Today's workout is saved", { exact: true }),
  ).toBeVisible();
  const saved = (await state(page)).events.at(-1);
  expect(saved.isLocked).toBe(false);
  expect(saved.autoLockAt).toBe("2026-09-24T22:00:00.000Z");
  await page.reload();
  await expect(pain.getByRole("slider")).toHaveCount(0);
  await pain
    .getByRole("button", { name: "Expand pain check-in", exact: true })
    .click();
  await expect(pain.getByRole("slider")).toHaveValue("7");
  await expect(pain.getByRole("slider")).toBeDisabled();
  await expect(workout.getByLabel("Workout name")).toHaveValue(
    "Today's strength",
  );
  await workout.getByRole("button", { name: /^Squat.*sets/ }).click();
  await workout
    .getByRole("spinbutton", { name: "Set 1 weight", exact: true })
    .focus();
  await workout
    .getByRole("spinbutton", { name: "Set 1 weight", exact: true })
    .fill("90");
  await workout
    .getByRole("button", { name: "Save changes", exact: true })
    .click();
  await expect(page.getByRole("status")).toContainText("Workout updated");
  const after = await state(page);
  expect(after.events).toHaveLength(before + 2);
  expect(after.events.at(-1).id).toBe(saved.id);
  expect(after.events.at(-1).payload.exercises[0].sets[0].weightKg).toBe(90);
});

test("backdated pain and workouts lock and reset without filling today's slot", async ({
  page,
}) => {
  await page.clock.install({ time: new Date("2026-09-24T10:00:00Z") });
  await page.goto("/demo");
  const pain = page.locator(".pain-logger");
  const workout = page.locator(".workout-logger");
  await pain.getByRole("slider").fill("8");
  await setTime(page, "pain", "2020-01-02T10:00");
  await pain
    .getByRole("button", { name: "Save check-in", exact: true })
    .click();
  await expect(page.getByRole("status")).toContainText("Event saved");
  expect((await state(page)).events.at(-1).isLocked).toBe(true);
  await expect(pain.getByRole("slider")).toBeEnabled();
  await expect(pain.getByRole("slider")).toHaveValue("3");
  await expect(pain.getByLabel("Event date and time")).toHaveCount(0);
  await workout.getByLabel("Workout name").fill("Earlier workout");
  await setTime(page, "workout", "2020-01-02T10:00");
  await workout
    .getByRole("button", { name: "Save workout", exact: true })
    .click();
  await expect(page.getByRole("status")).toContainText("Workout saved");
  const past = (await state(page)).events.at(-1);
  expect(past.isLocked).toBe(true);
  expect(past.occurredAt).toBe("2020-01-02T09:00:00.000Z");
  await expect(workout.getByLabel("Workout name")).toHaveValue("Workout");
  await expect(workout.getByLabel("Event date and time")).toHaveCount(0);
  await expect(
    workout.getByRole("button", { name: "Save workout", exact: true }),
  ).toBeEnabled();
  await pain
    .getByRole("button", { name: "Save check-in", exact: true })
    .click();
  await expect(
    pain.getByRole("button", { name: "Expand pain check-in", exact: true }),
  ).toHaveAttribute("aria-expanded", "false");
  await setTime(page, "pain", "2020-01-03T10:00");
  await expect(pain.getByRole("slider")).toBeEnabled();
  await pain
    .getByRole("button", { name: "Save check-in", exact: true })
    .click();
  await expect(
    pain.getByRole("button", { name: "Expand pain check-in", exact: true }),
  ).toHaveAttribute("aria-expanded", "false");
});

test("midnight resets both components and locks yesterday's workout", async ({
  page,
}) => {
  await page.clock.install({ time: new Date("2026-09-24T21:59:30Z") });
  await page.goto("/demo");
  const pain = page.locator(".pain-logger");
  const workout = page.locator(".workout-logger");
  await pain
    .getByRole("button", { name: "Save check-in", exact: true })
    .click();
  await expect(
    pain.getByRole("button", { name: "Expand pain check-in", exact: true }),
  ).toHaveAttribute("aria-expanded", "false");
  await workout.getByLabel("Workout name").fill("Before midnight");
  await workout
    .getByRole("button", { name: "Save workout", exact: true })
    .click();
  await expect(
    workout.getByText("Today's workout is saved", { exact: true }),
  ).toBeVisible();
  const id = (await state(page)).events.at(-1).id;
  await page.clock.runFor(31000);
  await expect(
    pain.getByRole("button", { name: "Save check-in", exact: true }),
  ).toBeEnabled();
  await expect(workout.getByLabel("Workout name")).toHaveValue("Workout");
  expect(
    (await state(page)).events.find((e: { id: string }) => e.id === id)
      .isLocked,
  ).toBe(true);
  await page.reload();
  await expect(
    workout.getByRole("button", { name: "Save workout", exact: true }),
  ).toBeEnabled();
  await expect(pain.getByRole("slider")).toBeEnabled();
});

test("a failed daily workout update retains the draft and saved event", async ({
  page,
}) => {
  await page.goto("/demo");
  const card = page.locator(".workout-logger");
  await card.getByRole("button", { name: "Save workout", exact: true }).click();
  await expect(
    card.getByText("Today's workout is saved", { exact: true }),
  ).toBeVisible();
  const original = (await state(page)).events.at(-1);
  await card.getByLabel("Workout name").fill("Unsaved changes");
  await page.evaluate(() => {
    Storage.prototype.setItem = () => {
      throw new Error("Storage unavailable");
    };
  });
  await card.getByRole("button", { name: "Save changes", exact: true }).click();
  await expect(card.getByRole("alert")).toContainText(
    "Your entries are still here",
  );
  await expect(card.getByLabel("Workout name")).toHaveValue("Unsaved changes");
  expect((await state(page)).events.at(-1)).toEqual(original);
});
