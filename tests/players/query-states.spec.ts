import { execFileSync } from "node:child_process";
import { test, expect } from "@playwright/test";
import { createTestUser, deleteTestUser } from "../support/local-supabase";

function fault(id: string, mode: string) {
  execFileSync('.venv/bin/python', ['scripts/testing/query_fault.py', id, mode], { stdio: 'pipe' });
}

for (const mode of ['empty', 'failure']) {
  test(`player reads render ${mode === 'empty' ? 'missing metadata' : 'recoverable database failure'} for a targeted local account`, async ({ page }) => {
    const user = await createTestUser('query-state');
    try {
      await page.goto('/sign-in');
      await page.getByLabel('Email', { exact: true }).fill(user.email);
      await page.getByLabel('Password', { exact: true }).fill(user.password);
      await page.getByRole('button', { name: 'Sign in', exact: true }).click();
      await expect(page).toHaveURL(/\/dashboard$/);
      fault(user.id, mode);
      await page.goto('/players');
      if (mode === 'empty') {
        await expect(page.getByText(/No dataset imported/)).toBeVisible();
        await expect(page.getByRole('table')).toHaveCount(0);
        await page.goto('/players/2544');
        await expect(page.getByRole('heading', { name: 'No dataset imported' })).toBeVisible();
      } else {
        await expect(page.getByRole('heading', { name: 'We couldn’t load this page' })).toBeVisible();
        fault(user.id, 'clean');
        await page.getByRole('button', { name: 'Try again' }).click();
        await expect(page.getByRole('table', { name: 'Season players' })).toBeVisible();
      }
    } finally {
      fault(user.id, 'clean');
      await deleteTestUser(user);
    }
  });
}
