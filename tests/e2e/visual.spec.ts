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
test("graph settings tolerate empty draft fields and persist valid replacements", async ({
  page,
}) => {
  await page.goto("/demo");
  await page
    .getByRole("button", { name: "Settings for Training volume & pain" })
    .click();
  await page.getByLabel("Exercise ID", { exact: true }).fill("");
  await expect(
    page.getByRole("dialog", { name: "Component settings" }),
  ).toBeVisible();
  await page.getByLabel("Exercise ID", { exact: true }).fill("bench-press");
  await page
    .getByRole("combobox", { name: "Display", exact: true })
    .selectOption("bar");
  await page.getByRole("button", { name: "Save changes", exact: true }).click();
  await expect(page.getByRole("status")).toContainText("Component updated");
  await page.reload();
  await page
    .getByRole("button", { name: "Settings for Training volume & pain" })
    .click();
  await expect(page.getByLabel("Exercise ID", { exact: true })).toHaveValue(
    "bench-press",
  );
  await expect(
    page.getByRole("combobox", { name: "Display", exact: true }),
  ).toHaveValue("bar");
});
