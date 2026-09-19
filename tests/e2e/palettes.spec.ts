import { expect, test } from "@playwright/test";

const paletteStorageKey = "therktrening-palette";

test("palettes recolor the interface and charts, persist across pages, and preserve draft input", async ({
  page,
}, testInfo) => {
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await page.goto("/demo");
  const picker = page.getByRole("combobox", { name: "Color palette" });
  await expect(
    page.getByRole("button", { name: "Save workout", exact: true }),
  ).toBeVisible();
  await page
    .locator(".workout-logger")
    .getByRole("button", { name: /^Squat.*sets/ })
    .click();
  await page
    .getByRole("spinbutton", { name: "Set 1 reps", exact: true })
    .fill("8");
  const forestBackground = await page
    .locator("body")
    .evaluate((el) => getComputedStyle(el).backgroundColor);
  for (const palette of ["petrol", "slate", "plum", "forest"]) {
    await picker.selectOption(palette);
    await expect(page.locator("html")).toHaveAttribute("data-palette", palette);
    await expect(
      page.getByRole("spinbutton", { name: "Set 1 reps", exact: true }),
    ).toHaveValue("8");
    if (palette !== "forest") {
      expect(
        await page
          .locator("body")
          .evaluate((el) => getComputedStyle(el).backgroundColor),
      ).not.toBe(forestBackground);
    }
  }
  await picker.selectOption("petrol");
  const line = page.locator(".recharts-line-curve").first();
  await expect(line).toBeVisible();
  expect(await line.evaluate((el) => getComputedStyle(el).stroke)).toBe(
    "rgb(130, 210, 216)",
  );
  await page
    .getByRole("button", { name: "Settings for Workout", exact: true })
    .click();
  expect(
    await page
      .getByRole("dialog")
      .evaluate((el) => getComputedStyle(el).backgroundColor),
  ).toBe("rgb(21, 41, 48)");
  await page.getByRole("button", { name: "Close dialog" }).click();
  await page.screenshot({
    path: testInfo.outputPath("petrol-desktop.png"),
    fullPage: true,
  });
  await page.reload();
  await expect(picker).toHaveValue("petrol");
  await page.getByRole("button", { name: "Exit demo", exact: true }).click();
  await expect(page).toHaveURL(/\/login/);
  await expect(picker).toHaveValue("petrol");
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/demo");
  await expect(picker).toBeVisible();
  await expect(picker).toHaveValue("petrol");
  await expect(
    page.getByRole("button", { name: "Save check-in", exact: true }),
  ).toBeVisible();
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
  await page.screenshot({
    path: testInfo.outputPath("petrol-mobile.png"),
    fullPage: true,
  });
  expect(errors).toEqual([]);
});

test("unknown preferences fall back to Forest and other tabs follow changes", async ({
  page,
  context,
}) => {
  await page.addInitScript((key) => {
    localStorage.setItem(key, "unknown-palette");
  }, paletteStorageKey);
  await page.goto("/login");
  const picker = page.getByRole("combobox", { name: "Color palette" });
  await expect(picker).toHaveValue("forest");
  await picker.selectOption("petrol");
  const other = await context.newPage();
  await other.goto("/login");
  await expect(
    other.getByRole("combobox", { name: "Color palette" }),
  ).toHaveValue("petrol");
  await other
    .getByRole("combobox", { name: "Color palette" })
    .selectOption("plum");
  await expect(picker).toHaveValue("plum");
  await expect(page.locator("html")).toHaveAttribute("data-palette", "plum");
});
