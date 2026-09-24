import { expect, test, type Page } from "@playwright/test";

async function addVolleyball(page: Page) {
  await page.goto("/demo");
  await page.getByRole("button", { name: "Components", exact: true }).click();
  await page
    .getByRole("button", { name: "Add component", exact: true })
    .click();
  const catalog = page.getByRole("dialog");
  await expect(
    catalog.getByRole("heading", { name: "Chart", exact: true }),
  ).toBeVisible();
  await expect(
    catalog.getByRole("heading", { name: "Volume & pain", exact: true }),
  ).toHaveCount(0);
  await catalog
    .getByRole("button", { name: /Volleyball.*Configure component/ })
    .click();
  await page
    .getByRole("dialog")
    .getByRole("button", { name: "Add component", exact: true })
    .click();
  await page.getByRole("button", { name: "Dashboard", exact: true }).click();
  return page.locator(".volleyball-logger");
}

test("volleyball saves both ratings as one session and supports history edits and locks", async ({
  page,
}, testInfo) => {
  const card = await addVolleyball(page);
  await expect(
    card.getByRole("combobox", { name: "Session type", exact: true }),
  ).toHaveValue("practice");
  await expect(
    card.getByRole("slider", { name: "Sets played", exact: true }),
  ).toHaveCount(0);
  for (const label of ["Intensity", "Jumps"]) {
    await expect(
      card.getByRole("slider", { name: label, exact: true }),
    ).toHaveAttribute("min", "0");
    await expect(
      card.getByRole("slider", { name: label, exact: true }),
    ).toHaveAttribute("max", "10");
  }
  await card.getByRole("slider", { name: "Intensity", exact: true }).fill("10");
  await card.getByRole("slider", { name: "Jumps", exact: true }).fill("0");
  await card.getByLabel("Notes (optional)").fill("Serving practice");
  const before = await page.evaluate(
    () =>
      JSON.parse(localStorage.getItem("therktrening-demo-v1")!).events.length,
  );
  const sessions = Number(
    await page.locator(".overview-stat > strong").first().textContent(),
  );
  await card
    .getByRole("button", { name: "Save volleyball", exact: true })
    .click();
  await expect(page.getByRole("status")).toContainText("Event saved");
  await expect(page.locator(".overview-stat > strong").first()).toHaveText(
    String(sessions + 1).padStart(2, "0"),
  );
  const saved = await page.evaluate(() =>
    JSON.parse(localStorage.getItem("therktrening-demo-v1")!),
  );
  expect(saved.events).toHaveLength(before + 1);
  const event = saved.events.at(-1);
  expect(event).toMatchObject({
    eventType: "training_session",
    payload: {
      activityId: "volleyball",
      sessionType: "practice",
      intensity: 10,
      jumps: 0,
    },
    notes: "Serving practice",
  });
  await expect(
    card.getByRole("slider", { name: "Intensity", exact: true }),
  ).toHaveValue("0");
  await page.reload();
  await expect(card).toBeVisible();
  await page
    .getByRole("button", { name: "Event history", exact: true })
    .click();
  await page
    .getByRole("button", { name: "Volleyball", exact: true })
    .first()
    .click();
  let dialog = page.getByRole("dialog");
  await expect(dialog.getByText("10/10", { exact: true })).toBeVisible();
  await expect(dialog.getByText("0/10", { exact: true })).toBeVisible();
  await dialog.getByRole("button", { name: "Edit event", exact: true }).click();
  await dialog
    .getByRole("slider", { name: "Intensity", exact: true })
    .fill("6");
  await dialog.getByRole("slider", { name: "Jumps", exact: true }).fill("9");
  await dialog
    .getByRole("combobox", { name: "Session type", exact: true })
    .selectOption("match");
  await dialog
    .getByRole("slider", { name: "Sets played", exact: true })
    .fill("5");
  await dialog
    .getByRole("textbox", { name: "Occurred at", exact: true })
    .fill("2020-01-02T10:00");
  await dialog
    .getByRole("button", { name: "Save changes", exact: true })
    .click();
  await expect(dialog).toHaveCount(0);
  const updated = await page.evaluate(
    (id) =>
      JSON.parse(localStorage.getItem("therktrening-demo-v1")!).events.find(
        (e: { id: string }) => e.id === id,
      ),
    event.id,
  );
  expect(updated.payload).toEqual({
    activityId: "volleyball",
    sessionType: "match",
    setsPlayed: 5,
    intensity: 6,
    jumps: 9,
  });
  expect(updated.occurredAt).toContain("2020-01-02");
  await page.getByLabel("From", { exact: true }).fill("2020-01-01");
  await page.getByLabel("To", { exact: true }).fill("2020-01-03");
  await page.getByRole("button", { name: "Volleyball", exact: true }).click();
  dialog = page.getByRole("dialog");
  await expect(dialog.getByText("Match", { exact: true })).toBeVisible();
  await expect(dialog.getByText("Sets played", { exact: true })).toBeVisible();
  await dialog.getByRole("button", { name: "Lock event", exact: true }).click();
  await expect(dialog).toHaveCount(0);
  await page.getByRole("button", { name: "Volleyball", exact: true }).click();
  await expect(
    page
      .getByRole("dialog")
      .getByRole("button", { name: "Edit event", exact: true }),
  ).toBeDisabled();
  await page.getByRole("button", { name: "Close dialog" }).click();
  await page.getByRole("button", { name: "Dashboard", exact: true }).click();
  await card
    .getByRole("combobox", { name: "Session type", exact: true })
    .selectOption("match");
  await card.screenshot({ path: testInfo.outputPath("volleyball.png") });
  await page.setViewportSize({ width: 390, height: 844 });
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
  await card.screenshot({ path: testInfo.outputPath("volleyball-mobile.png") });
});

test("a failed volleyball save retains ratings and notes", async ({ page }) => {
  const card = await addVolleyball(page);
  await card.getByRole("slider", { name: "Intensity", exact: true }).fill("7");
  await card.getByRole("slider", { name: "Jumps", exact: true }).fill("8");
  await card
    .getByRole("combobox", { name: "Session type", exact: true })
    .selectOption("match");
  await card
    .getByRole("slider", { name: "Sets played", exact: true })
    .fill("3");
  await card.getByLabel("Notes (optional)").fill("Keep my draft");
  await page.evaluate(() => {
    Storage.prototype.setItem = () => {
      throw new Error("Storage unavailable");
    };
  });
  await card
    .getByRole("button", { name: "Save volleyball", exact: true })
    .click();
  await expect(card.getByRole("alert")).toContainText("Could not save");
  await expect(
    card.getByRole("combobox", { name: "Session type", exact: true }),
  ).toHaveValue("match");
  await expect(
    card.getByRole("slider", { name: "Sets played", exact: true }),
  ).toHaveValue("3");
  await expect(
    card.getByRole("slider", { name: "Intensity", exact: true }),
  ).toHaveValue("7");
  await expect(
    card.getByRole("slider", { name: "Jumps", exact: true }),
  ).toHaveValue("8");
  await expect(card.getByLabel("Notes (optional)")).toHaveValue(
    "Keep my draft",
  );
});

test("matches allow zero sets, reset to Practice, and discard set counts when switched to Practice", async ({
  page,
}) => {
  const card = await addVolleyball(page);
  const type = card.getByRole("combobox", {
    name: "Session type",
    exact: true,
  });
  await type.selectOption("match");
  const sets = card.getByRole("slider", { name: "Sets played", exact: true });
  await expect(sets).toHaveValue("0");
  await expect(sets).toHaveAttribute("min", "0");
  await expect(sets).toHaveAttribute("max", "5");
  await card
    .getByRole("button", { name: "Save volleyball", exact: true })
    .click();
  await expect(type).toHaveValue("practice");
  expect(
    await page.evaluate(
      () =>
        JSON.parse(localStorage.getItem("therktrening-demo-v1")!).events.at(-1)
          .payload,
    ),
  ).toMatchObject({ sessionType: "match", setsPlayed: 0 });
  await page
    .getByRole("button", { name: "Event history", exact: true })
    .click();
  await page
    .getByRole("button", { name: "Volleyball", exact: true })
    .first()
    .click();
  const dialog = page.getByRole("dialog");
  await dialog.getByRole("button", { name: "Edit event", exact: true }).click();
  await dialog
    .getByRole("slider", { name: "Sets played", exact: true })
    .fill("4");
  await dialog
    .getByRole("combobox", { name: "Session type", exact: true })
    .selectOption("practice");
  await expect(
    dialog.getByRole("slider", { name: "Sets played", exact: true }),
  ).toHaveCount(0);
  await dialog
    .getByRole("button", { name: "Save changes", exact: true })
    .click();
  await expect(dialog).toHaveCount(0);
  const stored = await page.evaluate(
    () =>
      JSON.parse(localStorage.getItem("therktrening-demo-v1")!).events.at(-1)
        .payload,
  );
  expect(stored.sessionType).toBe("practice");
  expect(stored).not.toHaveProperty("setsPlayed");
  await page.reload();
  await expect(type).toHaveValue("practice");
  await type.selectOption("match");
  await sets.fill("5");
  await type.selectOption("practice");
  await card
    .getByRole("button", { name: "Save volleyball", exact: true })
    .click();
  await expect(page.getByRole("status")).toContainText("Event saved");
  expect(
    await page.evaluate(
      () =>
        JSON.parse(localStorage.getItem("therktrening-demo-v1")!).events.at(-1)
          .payload,
    ),
  ).toEqual({
    activityId: "volleyball",
    sessionType: "practice",
    intensity: 0,
    jumps: 0,
  });
});
