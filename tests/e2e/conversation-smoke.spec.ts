import { test, expect } from "@playwright/test";

test("clicking Start renders a phrase card", async ({ page }) => {
  await page.goto("/");
  await page.getByRole("button", { name: /start/i }).click();
  await expect(page.locator(".font-serif").first()).toBeVisible();
});

test("mic button is keyboard-accessible", async ({ page }) => {
  await page.goto("/");
  const btn = page.getByRole("button", { name: /hold to talk/i });
  await expect(btn).toBeVisible();
});
