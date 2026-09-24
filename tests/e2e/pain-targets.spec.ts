import { expect, test, type Page } from "@playwright/test";

async function openSettings(page: Page) {
  await page.getByRole("button", { name: "Components", exact: true }).click();
  await page
    .locator(".manage-card")
    .filter({
      has: page.getByRole("heading", { name: "Left knee pain", exact: true }),
    })
    .getByRole("button", { name: "Settings", exact: true })
    .click();
  return page.getByRole("dialog", { name: "Component settings" });
}

test("injuries are managed in settings, share one card, persist, and log together", async ({
  page,
}, testInfo) => {
  await page.goto("/demo");
  const card = page.locator(".pain-logger");
  await expect(
    card.getByRole("slider", { name: "Left knee pain level" }),
  ).toBeVisible();
  const original = await page.evaluate(
    () =>
      JSON.parse(localStorage.getItem("therktrening-demo-v1")!).instances.find(
        (i: { componentDefinitionId: string }) =>
          i.componentDefinitionId === "pain_logger",
      ).id,
  );
  await expect(
    page.getByLabel("Injury or body part", { exact: true }),
  ).toHaveCount(0);
  await expect(card.getByRole("button", { name: /Stop tracking/ })).toHaveCount(
    0,
  );
  const editor = await openSettings(page);
  await editor
    .getByLabel("Injury or body part", { exact: true })
    .fill("Right shoulder");
  await editor
    .getByRole("button", { name: "Add injury / body part", exact: true })
    .click();
  await editor
    .getByLabel("Injury or body part", { exact: true })
    .fill("Lower back");
  await editor
    .getByLabel("Injury or body part", { exact: true })
    .press("Enter");
  await editor
    .getByLabel("Injury or body part", { exact: true })
    .fill("RIGHT SHOULDER");
  await editor
    .getByRole("button", { name: "Add injury / body part", exact: true })
    .click();
  await expect(editor.getByRole("alert")).toContainText("already track");
  await editor
    .getByRole("button", { name: "Save changes", exact: true })
    .click();
  await page.getByRole("button", { name: "Dashboard", exact: true }).click();
  await expect(card.getByRole("slider")).toHaveCount(3);
  await expect(
    page.getByRole("button", { name: "Add injury / body part", exact: true }),
  ).toHaveCount(0);
  await card.getByRole("slider", { name: "Left knee pain level" }).fill("7");
  await card
    .getByRole("slider", { name: "Right shoulder pain level" })
    .fill("2");
  await card.getByRole("slider", { name: "Lower back pain level" }).fill("0");
  await card.locator(".when").getByRole("button").first().click();
  await card.getByLabel("Event date and time").fill("2020-01-02T10:00");
  const countBefore = await page.evaluate(
    () =>
      JSON.parse(localStorage.getItem("therktrening-demo-v1")!).events.length,
  );
  await card
    .getByRole("button", { name: "Save check-in", exact: true })
    .click();
  await expect(page.getByRole("status")).toContainText("Event saved");
  const state = await page.evaluate(() =>
    JSON.parse(localStorage.getItem("therktrening-demo-v1")!),
  );
  const painCards = state.instances.filter(
    (i: { componentDefinitionId: string }) =>
      i.componentDefinitionId === "pain_logger",
  );
  expect(painCards).toHaveLength(1);
  expect(painCards[0].id).toBe(original);
  expect(painCards[0].config.targets).toEqual([
    "left-knee",
    "right-shoulder",
    "lower-back",
  ]);
  expect(state.events).toHaveLength(countBefore + 1);
  expect(state.events.at(-1).payload).toEqual({
    readings: [
      { injuryId: "left-knee", painLevel: 7 },
      { injuryId: "right-shoulder", painLevel: 2 },
      { injuryId: "lower-back", painLevel: 0 },
    ],
  });
  expect(state.events.at(-1).batchId).toBeNull();
  await page.reload();
  await expect(card.getByRole("slider")).toHaveCount(3);
  const removalSettings = await openSettings(page);
  await removalSettings
    .getByRole("button", { name: "Stop tracking Right shoulder", exact: true })
    .click();
  await removalSettings
    .getByRole("button", { name: "Save changes", exact: true })
    .click();
  await page.getByRole("button", { name: "Dashboard", exact: true }).click();
  await expect(card.getByRole("slider")).toHaveCount(2);
  const after = await page.evaluate(() =>
    JSON.parse(localStorage.getItem("therktrening-demo-v1")!),
  );
  expect(after.events).toEqual(state.events);
  await page.getByRole("button", { name: "Components", exact: true }).click();
  await page
    .getByRole("button", { name: "Add component", exact: true })
    .click();
  await page
    .getByRole("button", { name: /Pain check-in.*Configure component/ })
    .click();
  const settings = page.getByRole("dialog", { name: "Component settings" });
  await expect(settings).toBeVisible();
  await settings
    .getByLabel("Injury or body part", { exact: true })
    .fill("Left ankle");
  await settings
    .getByRole("button", { name: "Add injury / body part", exact: true })
    .click();
  await settings
    .getByRole("button", { name: "Save changes", exact: true })
    .click();
  await page.getByRole("button", { name: "Dashboard", exact: true }).click();
  await expect(card).toHaveCount(1);
  await expect(card.getByRole("slider")).toHaveCount(3);
  await expect(
    card.getByRole("slider", { name: "Left ankle pain level" }),
  ).toBeVisible();
  await page.screenshot({
    path: testInfo.outputPath("pain-desktop.png"),
    fullPage: true,
  });
  await page.setViewportSize({ width: 390, height: 844 });
  await expect
    .poll(() =>
      page.evaluate(() => document.documentElement.scrollWidth <= innerWidth),
    )
    .toBe(true);
  await page.screenshot({
    path: testInfo.outputPath("pain-mobile.png"),
    fullPage: true,
  });
});

test("a failed settings save preserves the injury draft and stored targets", async ({
  page,
}) => {
  await page.goto("/demo");
  await expect(page.locator(".pain-logger").getByRole("slider")).toHaveCount(1);
  const settings = await openSettings(page);
  await settings
    .getByLabel("Injury or body part", { exact: true })
    .fill("Right knee");
  await settings
    .getByRole("button", { name: "Add injury / body part", exact: true })
    .click();
  await page.evaluate(() => {
    Storage.prototype.setItem = () => {
      throw new Error("Storage unavailable");
    };
  });
  await settings
    .getByRole("button", { name: "Save changes", exact: true })
    .click();
  await expect(settings.getByRole("alert")).toContainText("Could not save");
  await expect(
    settings.getByRole("button", {
      name: "Stop tracking Right knee",
      exact: true,
    }),
  ).toBeVisible();
  const targets = await page.evaluate(
    () =>
      JSON.parse(localStorage.getItem("therktrening-demo-v1")!).instances.find(
        (i: { componentDefinitionId: string }) =>
          i.componentDefinitionId === "pain_logger",
      ).config.targets,
  );
  expect(targets).toEqual(["left-knee"]);
});

test("a check-in can be edited, locked, and deleted as one event", async ({
  page,
}) => {
  await page.goto("/demo");
  await expect(page.locator(".pain-logger")).toBeVisible();
  const settings = await openSettings(page);
  await settings
    .getByLabel("Injury or body part", { exact: true })
    .fill("Right shoulder");
  await settings
    .getByRole("button", { name: "Add injury / body part", exact: true })
    .click();
  await settings
    .getByRole("button", { name: "Save changes", exact: true })
    .click();
  await page.getByRole("button", { name: "Dashboard", exact: true }).click();
  const card = page.locator(".pain-logger");
  await card.getByRole("slider", { name: "Left knee pain level" }).fill("6");
  await card
    .getByRole("slider", { name: "Right shoulder pain level" })
    .fill("9");
  await card
    .getByRole("button", { name: "Save check-in", exact: true })
    .click();
  await expect(page.getByRole("status")).toContainText("Event saved");
  const saved = await page.evaluate(() =>
    JSON.parse(localStorage.getItem("therktrening-demo-v1")!).events.at(-1),
  );
  await page
    .getByRole("button", { name: "Event history", exact: true })
    .click();
  const row = page.locator(".event-name").first();
  await expect(row).toHaveText(/ - Pain check-in$/);
  await expect(row).toHaveCount(1);
  await row.click();
  let dialog = page.getByRole("dialog");
  await expect(dialog.getByText("9/10", { exact: true })).toBeVisible();
  await expect(
    dialog.getByRole("button", { name: "Edit event", exact: true }),
  ).toBeDisabled();
  await dialog
    .getByRole("button", { name: "Unlock event", exact: true })
    .click();
  await expect(dialog).toBeVisible();
  await expect(
    dialog.getByRole("button", { name: "Edit event", exact: true }),
  ).toBeEnabled();
  await dialog.getByRole("button", { name: "Edit event", exact: true }).click();
  await expect(dialog.getByRole("slider")).toHaveCount(2);
  await expect(
    dialog.getByLabel("Injury or body part", { exact: true }),
  ).toHaveCount(0);
  await dialog.getByRole("slider", { name: "Left knee pain level" }).fill("0");
  await dialog
    .getByRole("slider", { name: "Right shoulder pain level" })
    .fill("4");
  await dialog.getByLabel("Occurred at").fill("2020-01-02T10:00");
  await dialog
    .getByLabel("Notes (optional)")
    .fill("Both readings updated together");
  await dialog
    .getByRole("button", { name: "Save changes", exact: true })
    .click();
  await expect(page.getByRole("status")).toContainText("Event updated");
  const updated = await page.evaluate(
    (id) =>
      JSON.parse(localStorage.getItem("therktrening-demo-v1")!).events.find(
        (e: { id: string }) => e.id === id,
      ),
    saved.id,
  );
  expect(updated.payload.readings).toEqual([
    { injuryId: "left-knee", painLevel: 0 },
    { injuryId: "right-shoulder", painLevel: 4 },
  ]);
  expect(updated.notes).toBe("Both readings updated together");
  expect(updated.occurredAt).toContain("2020-01-02");
  await page.reload();
  await page
    .getByRole("button", { name: "Event history", exact: true })
    .click();
  await page.getByLabel("Search events").fill("Right shoulder");
  const updatedRow = page.getByRole("button", {
    name: "Thursday - Pain check-in",
    exact: true,
  });
  await expect(updatedRow).toHaveCount(1);
  await updatedRow.click();
  dialog = page.getByRole("dialog");
  await expect(
    dialog.getByRole("button", { name: "Edit event", exact: true }),
  ).toBeDisabled();
  await expect(
    dialog.getByRole("button", { name: "Delete event", exact: true }),
  ).toBeDisabled();
  await dialog
    .getByRole("button", { name: "Unlock event", exact: true })
    .click();
  await expect(page.getByRole("status")).toContainText("Event unlocked");
  await expect(dialog).toBeVisible();
  await dialog
    .getByRole("button", { name: "Delete event", exact: true })
    .click();
  await dialog
    .getByRole("button", { name: "Delete event", exact: true })
    .click();
  await expect(page.getByRole("status")).toContainText("Event deleted");
  await expect(updatedRow).toHaveCount(0);
});

test("adding an injury reopens today's check-in and updates the same event", async ({
  page,
}) => {
  await page.goto("/demo");
  const card = page.locator(".pain-logger");
  await card.getByRole("slider", { name: "Left knee pain level" }).fill("7");
  await card
    .getByRole("button", { name: "Save check-in", exact: true })
    .click();
  await expect(
    card.getByRole("button", { name: "Expand pain check-in", exact: true }),
  ).toBeVisible();
  const before = await page.evaluate(() =>
    JSON.parse(localStorage.getItem("therktrening-demo-v1")!),
  );
  const saved = before.events.at(-1);
  const settings = await openSettings(page);
  await settings
    .getByLabel("Injury or body part", { exact: true })
    .fill("Right shoulder");
  await settings
    .getByRole("button", { name: "Add injury / body part", exact: true })
    .click();
  await settings
    .getByRole("button", { name: "Save changes", exact: true })
    .click();
  await page.getByRole("button", { name: "Dashboard", exact: true }).click();
  await expect(card.getByRole("slider")).toHaveCount(2);
  await expect(
    card.getByRole("slider", { name: "Left knee pain level" }),
  ).toHaveValue("7");
  await expect(
    card.getByRole("slider", { name: "Left knee pain level" }),
  ).toBeEnabled();
  await expect(
    card.getByRole("slider", { name: "Right shoulder pain level" }),
  ).toBeEnabled();
  let state = await page.evaluate(() =>
    JSON.parse(localStorage.getItem("therktrening-demo-v1")!),
  );
  expect(state.events).toHaveLength(before.events.length);
  expect(state.events.at(-1)).toMatchObject({
    id: saved.id,
    isLocked: false,
    payload: saved.payload,
    occurredAt: saved.occurredAt,
  });
  await page.reload();
  await expect(card.getByRole("slider")).toHaveCount(2);
  await card
    .getByRole("slider", { name: "Right shoulder pain level" })
    .fill("4");
  await card.getByRole("button", { name: "Save changes", exact: true }).click();
  await expect(
    card.getByRole("button", { name: "Expand pain check-in", exact: true }),
  ).toBeVisible();
  await expect(card.getByRole("slider")).toHaveCount(0);
  state = await page.evaluate(() =>
    JSON.parse(localStorage.getItem("therktrening-demo-v1")!),
  );
  expect(state.events).toHaveLength(before.events.length);
  expect(state.events.at(-1)).toMatchObject({
    id: saved.id,
    isLocked: true,
    occurredAt: saved.occurredAt,
    payload: {
      readings: [
        { injuryId: "left-knee", painLevel: 7 },
        { injuryId: "right-shoulder", painLevel: 4 },
      ],
    },
  });
});
