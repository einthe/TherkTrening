import { expect, test } from "@playwright/test";

test("mixed chart entries select sources, persist overrides/colors, and fit mobile", async ({
  page,
}, testInfo) => {
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await page.goto("/demo");
  await expect(page.getByRole("heading", { name: "Dashboard" })).toBeVisible();
  await page.evaluate(() => {
    const key = "therktrening-demo-v1";
    const state = JSON.parse(localStorage.getItem(key)!);
    const sample = state.events.find(
      (e: { eventType: string }) => e.eventType === "training_session",
    );
    state.events.push({
      ...sample,
      id: crypto.randomUUID(),
      payload: {
        activityId: "volleyball",
        sessionType: "match",
        intensity: 8,
        jumps: 7,
        setsPlayed: 4,
      },
    });
    localStorage.setItem(key, JSON.stringify(state));
  });
  await page.reload();
  const openSettings = () =>
    page
      .getByRole("button", { name: "Settings for Training volume & pain" })
      .click();
  await openSettings();
  const entries = page.locator(".chart-entry-settings");
  const toggle = (n: number) =>
    entries
      .nth(n - 1)
      .locator("summary")
      .click();
  await expect(entries.locator("details[open]")).toHaveCount(0);
  await expect(
    page.getByRole("button", { name: "Move entry 1 up", exact: true }),
  ).toBeDisabled();
  await page
    .getByRole("button", { name: "Move entry 2 up", exact: true })
    .press("Enter");
  await expect(entries.first().locator("summary")).toContainText(
    "Left knee pain",
  );
  await expect(entries.locator("details[open]")).toHaveCount(0);
  await page
    .getByRole("button", { name: "Move entry 1 down", exact: true })
    .click();
  await expect(entries.first().locator("summary")).toContainText(
    "Squat volume",
  );
  await expect(entries.locator("details[open]")).toHaveCount(0);
  await toggle(1);
  const entry = (n: number) =>
    page.getByRole("group", { name: `Entry ${n}`, exact: true });
  await page.getByRole("spinbutton", { name: "Time range" }).focus();
  await page.getByRole("spinbutton", { name: "Time range" }).fill("4");
  await expect(
    page.getByRole("spinbutton", { name: "Time range" }),
  ).toHaveValue("4");
  await page
    .getByRole("combobox", { name: "Time unit", exact: true })
    .selectOption("weeks");
  await page
    .getByRole("combobox", { name: "Chart mode", exact: true })
    .selectOption("week");
  await entry(1)
    .getByRole("combobox", { name: "Value", exact: true })
    .selectOption("weight");
  await entry(1)
    .getByRole("combobox", { name: "Display", exact: true })
    .selectOption("dots");
  await entry(1)
    .getByRole("combobox", { name: "Data mode", exact: true })
    .selectOption("raw");
  await entry(1)
    .getByRole("combobox", { name: "Color", exact: true })
    .selectOption("custom");
  await entry(1).getByLabel("Custom color", { exact: true }).fill("#ff0000");
  await toggle(2);
  await entry(2)
    .getByRole("combobox", { name: "Data mode", exact: true })
    .selectOption("day");
  await page.getByRole("button", { name: "Add entry", exact: true }).click();
  await toggle(3);
  await entry(3)
    .getByRole("combobox", { name: "Data type", exact: true })
    .selectOption("workout");
  await entry(3)
    .getByRole("combobox", { name: "Workout", exact: true })
    .selectOption("*");
  await entry(3)
    .getByRole("combobox", { name: "Display", exact: true })
    .selectOption("bar");
  await expect(
    entry(3).getByRole("combobox", { name: "Data mode", exact: true }),
  ).toHaveValue("inherit");
  await page.getByRole("button", { name: "Add entry", exact: true }).click();
  await toggle(4);
  await entry(4)
    .getByRole("combobox", { name: "Data type", exact: true })
    .selectOption("volleyball");
  await entry(4)
    .getByRole("combobox", { name: "Session type", exact: true })
    .selectOption("match");
  await entry(4)
    .getByRole("combobox", { name: "Value", exact: true })
    .selectOption("setsPlayed");
  await entry(4)
    .getByRole("combobox", { name: "Data mode", exact: true })
    .selectOption("raw");
  await page.getByRole("button", { name: "Save changes", exact: true }).click();
  await expect(page.getByRole("status")).toContainText("Component updated");
  await expect(page.locator(".recharts-bar-rectangle").first()).toBeVisible();
  await expect(
    page.locator('.recharts-line-dot[fill="#ff0000"]').first(),
  ).toBeVisible();
  await page.getByText("View chart data", { exact: true }).click();
  await expect(
    page.getByRole("columnheader", {
      name: "Volleyball matches sets played (sets)",
    }),
  ).toBeVisible();
  await expect(page.locator(".chart-data tbody")).toContainText("85");
  await expect(page.locator(".chart-data tbody")).toContainText("4");
  await page.screenshot({
    path: testInfo.outputPath("chart-desktop.png"),
    fullPage: true,
  });
  await page.reload();
  await openSettings();
  await expect(entries.locator("details[open]")).toHaveCount(0);
  for (const n of [1, 3, 4]) await toggle(n);
  await expect(
    page.getByRole("combobox", { name: "Time unit", exact: true }),
  ).toHaveValue("weeks");
  await expect(
    page.getByRole("combobox", { name: "Chart mode", exact: true }),
  ).toHaveValue("week");
  await expect(
    entry(1).getByLabel("Custom color", { exact: true }),
  ).toHaveValue("#ff0000");
  await expect(
    entry(3).getByRole("combobox", { name: "Data mode", exact: true }),
  ).toHaveValue("inherit");
  await expect(
    entry(4).getByRole("combobox", { name: "Session type", exact: true }),
  ).toHaveValue("match");
  for (const n of [1, 3, 4]) await toggle(n);
  await page.setViewportSize({ width: 390, height: 844 });
  await page.screenshot({
    path: testInfo.outputPath("chart-settings-mobile.png"),
    fullPage: true,
  });
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
  await page
    .getByRole("button", { name: "Move entry 4 up", exact: true })
    .click();
  await expect(entries.locator("details[open]")).toHaveCount(0);
  await toggle(3);
  await toggle(4);
  await expect(
    entry(3).getByRole("combobox", { name: "Data type", exact: true }),
  ).toHaveValue("volleyball");
  await entry(4).getByRole("button", { name: "Remove entry" }).click();
  await page.getByRole("button", { name: "Save changes", exact: true }).click();
  await expect(page.getByRole("status")).toContainText("Component updated");
  await expect(page.locator(".chart")).toBeVisible();
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
  await page.screenshot({
    path: testInfo.outputPath("chart-mobile.png"),
    fullPage: true,
  });
  // The chart remains readable even when its independent axes need horizontal scrolling.
  await expect(page.locator(".graph-legend")).toContainText(
    "Volleyball matches sets played",
  );
  expect(errors).toEqual([]);
});

test("legacy charts keep saved calculations and can migrate through settings", async ({
  page,
}) => {
  await page.goto("/demo");
  await expect(page.getByRole("heading", { name: "Dashboard" })).toBeVisible();
  await page.evaluate(() => {
    const key = "therktrening-demo-v1";
    const state = JSON.parse(localStorage.getItem(key)!);
    const chart = state.instances.find(
      (i: { componentDefinitionId: string }) =>
        i.componentDefinitionId === "graph",
    );
    chart.config = {
      days: 21,
      display: "bar",
      sources: [
        {
          name: "My original volume",
          unit: "kg·reps",
          pipeline: [
            { key: "filter_type", eventType: "exercise" },
            { key: "filter_target", field: "exerciseId", value: "squat" },
            { key: "placeholder_volume_load" },
            { key: "daily_aggregation", method: "sum" },
          ],
        },
      ],
    };
    localStorage.setItem(key, JSON.stringify(state));
  });
  await page.reload();
  await expect(
    page.getByRole("img", { name: /My original volume over 21 days/ }),
  ).toBeVisible();
  await page
    .getByRole("button", { name: "Settings for Training volume & pain" })
    .click();
  await page.locator(".chart-entry-settings summary").click();
  await expect(
    page.getByRole("combobox", { name: "Data type", exact: true }),
  ).toHaveValue("legacy");
  await page.getByRole("button", { name: "Save changes", exact: true }).click();
  await expect(page.getByRole("status")).toContainText("Component updated");
  await page.reload();
  await expect(
    page.getByRole("img", { name: /My original volume over 21 days/ }),
  ).toBeVisible();
  await expect(page.locator(".recharts-bar-rectangle").first()).toBeVisible();
});
