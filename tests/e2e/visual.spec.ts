import { expect, test } from "@playwright/test";
test("dashboard renders without runtime errors at desktop and mobile sizes", async ({
  page,
}, testInfo) => {
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await page.goto("/demo");
  await expect(page.getByRole("heading", { name: "Dashboard" })).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Save check-in", exact: true }),
  ).toBeVisible();
  await page.screenshot({
    path: testInfo.outputPath("desktop.png"),
    fullPage: true,
  });
  await page.setViewportSize({ width: 390, height: 844 });
  await expect(page.locator(".sidebar")).toBeHidden();
  await page.screenshot({
    path: testInfo.outputPath("mobile.png"),
    fullPage: true,
  });
  expect(errors).toEqual([]);
});
test("chart settings tolerate empty numeric drafts and persist replacements", async ({
  page,
}) => {
  await page.goto("/demo");
  await page
    .getByRole("button", { name: "Settings for Training volume & pain" })
    .click();
  const range = page.getByRole("spinbutton", { name: "Time range" });
  await range.fill("");
  await expect(
    page.getByRole("dialog", { name: "Component settings" }),
  ).toBeVisible();
  await range.fill("28");
  await page.locator(".chart-entry-settings summary").first().click();
  const entry = page.getByRole("group", { name: "Entry 1", exact: true });
  await entry
    .getByRole("combobox", { name: "Exercise", exact: true })
    .selectOption("bench-press");
  await entry
    .getByRole("combobox", { name: "Display", exact: true })
    .selectOption("bar");
  await page.getByRole("button", { name: "Save changes", exact: true }).click();
  await expect(page.getByRole("status")).toContainText("Component updated");
  await page.reload();
  await page
    .getByRole("button", { name: "Settings for Training volume & pain" })
    .click();
  await expect(range).toHaveValue("28");
  await page.locator(".chart-entry-settings summary").first().click();
  await expect(
    entry.getByRole("combobox", { name: "Exercise", exact: true }),
  ).toHaveValue("bench-press");
  await expect(
    entry.getByRole("combobox", { name: "Display", exact: true }),
  ).toHaveValue("bar");
});
