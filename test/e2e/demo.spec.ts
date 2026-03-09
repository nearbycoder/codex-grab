import { test, expect } from "@playwright/test";

test("renders the demo overlay shell", async ({ page }) => {
  await page.goto("/");

  await expect(page.getByText("codex-grab routed demo")).toBeVisible();
  await expect(
    page.getByText("Pick a component here, switch routes, then come back and watch the widget return."),
  ).toBeVisible();
  const picker = page.getByRole("button", { name: "Select area for codex-grab" });
  await expect(picker).toBeVisible();
  await picker.click();
  await expect(page.getByRole("button", { name: "Cancel selection" })).toBeVisible();
});
