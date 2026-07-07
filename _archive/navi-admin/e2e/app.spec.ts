import { test, expect } from '@playwright/test';

test.describe('App navigation', () => {
  test.beforeEach(async ({ page }) => {
    // Login first
    await page.goto('/login');
    await page.getByLabel(/email/i).fill('admin@navi.app');
    await page.getByLabel(/password/i).fill('password');
    await page.getByRole('button', { name: /sign in/i }).click();
    await expect(page).toHaveURL(/\/$/);
  });

  test('navigates to campuses page', async ({ page }) => {
    await page.getByRole('link', { name: 'Campuses' }).click();
    await expect(page).toHaveURL(/\/campuses/);
    await expect(page.getByRole('heading', { name: 'Campuses' })).toBeVisible();
  });

  test('navigates to buildings page', async ({ page }) => {
    await page.getByRole('link', { name: 'Buildings' }).click();
    await expect(page).toHaveURL(/\/buildings/);
    await expect(page.getByRole('heading', { name: 'Buildings' })).toBeVisible();
  });

  test('navigates to routes page', async ({ page }) => {
    await page.getByRole('link', { name: /route graph/i }).click();
    await expect(page).toHaveURL(/\/routes/);
  });

  test('logs out', async ({ page }) => {
    await page.getByRole('button', { name: /logout/i }).click();
    await expect(page).toHaveURL(/\/login/);
  });
});
