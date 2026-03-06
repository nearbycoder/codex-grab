import { test, expect } from "@playwright/test";

test("renders the demo overlay shell", async ({ page }) => {
  await page.goto("/");

  await expect(page.getByText("codex-grab demo")).toBeVisible();
  await expect(page.getByText("Update a React component straight from the browser.")).toBeVisible();
  const picker = page.getByRole("button", { name: "Select area for codex-grab" });
  await expect(picker).toBeVisible();
  await picker.click();
  await expect(page.getByRole("button", { name: "Cancel selection" })).toBeVisible();
});
