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

async function createInjury(page: Page, name: string, notes = "") {
  await page.getByRole("button", { name: "Injuries", exact: true }).click();
  await page.getByRole("button", { name: "New injury", exact: true }).click();
  const dialog = page.getByRole("dialog", { name: "New injury", exact: true });
  await dialog.getByLabel("Injury name", { exact: true }).fill(name);
  await dialog.getByLabel("Notes (optional)").fill(notes);
  await dialog
    .getByRole("button", { name: "Save injury", exact: true })
    .click();
  await expect(dialog).toHaveCount(0);
  return page.evaluate(
    (name) =>
      JSON.parse(localStorage.getItem("therktrening-demo-v1")!).injuries.find(
        (i: { name: string }) => i.name === name,
      ).id as string,
    name,
  );
}

test("injury library preserves legacy history, supports rename and notes, and only selected injuries get sliders", async ({
  page,
}, testInfo) => {
  await page.goto("/demo");
  const card = page.locator(".pain-logger");
  await expect(
    card.getByRole("slider", { name: "Left knee pain level" }),
  ).toBeVisible();
  const before = await page.evaluate(() =>
    JSON.parse(localStorage.getItem("therktrening-demo-v1")!),
  );
  const shoulderId = await createInjury(
    page,
    "Right shoulder",
    "Started after swimming.\nTrack after training.",
  );
  const backId = await createInjury(page, "Lower back");
  await page.getByRole("button", { name: "Dashboard", exact: true }).click();
  await expect(card.getByRole("slider")).toHaveCount(1);
  const settings = await openSettings(page);
  await expect(
    settings.getByRole("textbox", { name: "Injury name" }),
  ).toHaveCount(0);
  await settings
    .getByRole("checkbox", { name: "Right shoulder", exact: true })
    .check();
  await settings
    .getByRole("checkbox", { name: "Lower back", exact: true })
    .check();
  await settings
    .getByRole("button", { name: "Save changes", exact: true })
    .click();
  await page.getByRole("button", { name: "Dashboard", exact: true }).click();
  await expect(card.getByRole("slider")).toHaveCount(3);
  await card.getByRole("slider", { name: "Left knee pain level" }).fill("7");
  await card
    .getByRole("slider", { name: "Right shoulder pain level" })
    .fill("2");
  await card.getByRole("slider", { name: "Lower back pain level" }).fill("0");
  await card.locator(".when").getByRole("button").first().click();
  await card.getByLabel("Event date and time").fill("2020-01-02T10:00");
  await card
    .getByRole("button", { name: "Save check-in", exact: true })
    .click();
  await expect(page.getByRole("status")).toContainText("Event saved");
  const logged = await page.evaluate(() =>
    JSON.parse(localStorage.getItem("therktrening-demo-v1")!),
  );
  expect(logged.events).toHaveLength(before.events.length + 1);
  expect(logged.events.at(-1).payload.readings).toEqual([
    { injuryId: "left-knee", painLevel: 7 },
    { injuryId: shoulderId, painLevel: 2 },
    { injuryId: backId, painLevel: 0 },
  ]);
  await page.getByRole("button", { name: "Injuries", exact: true }).click();
  await page
    .getByRole("button", { name: "Edit Right shoulder injury", exact: true })
    .click();
  const edit = page.getByRole("dialog");
  await expect(edit.getByLabel("Notes (optional)")).toHaveValue(
    "Started after swimming.\nTrack after training.",
  );
  await edit.getByLabel("Injury name", { exact: true }).fill("Rotator cuff");
  await edit.getByRole("button", { name: "Save injury", exact: true }).click();
  await expect(edit).toHaveCount(0);
  await page.reload();
  await expect(
    card.getByRole("slider", { name: "Rotator cuff pain level" }),
  ).toBeVisible();
  await page
    .getByRole("button", { name: "Event history", exact: true })
    .click();
  await page.getByLabel("Search events").fill("Rotator cuff");
  await page
    .getByRole("button", { name: "Thursday - Pain check-in", exact: true })
    .click();
  await expect(
    page.getByRole("dialog").getByText("Rotator cuff", { exact: true }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Close dialog" }).click();
  const removal = await openSettings(page);
  await removal
    .getByRole("checkbox", { name: "Rotator cuff", exact: true })
    .uncheck();
  await removal
    .getByRole("button", { name: "Save changes", exact: true })
    .click();
  await page.getByRole("button", { name: "Dashboard", exact: true }).click();
  await expect(card.getByRole("slider")).toHaveCount(2);
  const after = await page.evaluate(() =>
    JSON.parse(localStorage.getItem("therktrening-demo-v1")!),
  );
  expect(after.events).toEqual(logged.events);
  expect(
    after.instances.filter(
      (i: { componentDefinitionId: string }) =>
        i.componentDefinitionId === "pain_logger",
    ),
  ).toHaveLength(1);
  await page.getByRole("button", { name: "Injuries", exact: true }).click();
  await page.screenshot({
    path: testInfo.outputPath("injuries-desktop.png"),
    fullPage: true,
  });
  await page.setViewportSize({ width: 390, height: 844 });
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
  await page.screenshot({
    path: testInfo.outputPath("injuries-mobile.png"),
    fullPage: true,
  });
});

test("failed settings saves preserve the selection and reject an empty selection", async ({
  page,
}) => {
  await page.goto("/demo");
  await createInjury(page, "Right knee");
  const settings = await openSettings(page);
  await settings
    .getByRole("checkbox", { name: "Left knee", exact: true })
    .uncheck();
  await settings
    .getByRole("button", { name: "Save changes", exact: true })
    .click();
  await expect(settings.getByRole("alert")).toContainText(
    "Select at least one",
  );
  await settings
    .getByRole("checkbox", { name: "Right knee", exact: true })
    .check();
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
    settings.getByRole("checkbox", { name: "Right knee", exact: true }),
  ).toBeChecked();
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
  const shoulderId = await createInjury(page, "Right shoulder");
  const settings = await openSettings(page);
  await settings
    .getByRole("checkbox", { name: "Right shoulder", exact: true })
    .check();
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
    { injuryId: shoulderId, painLevel: 4 },
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
  const shoulderId = await createInjury(page, "Right shoulder");
  const settings = await openSettings(page);
  await settings
    .getByRole("checkbox", { name: "Right shoulder", exact: true })
    .check();
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
        { injuryId: shoulderId, painLevel: 4 },
      ],
    },
  });
});
