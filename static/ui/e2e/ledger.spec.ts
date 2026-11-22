import { expect, test } from '@playwright/test';

test('ledger groups open promises by deadline and settles one', async ({ page }) => {
  await page.goto('/');
  await expect(page.getByRole('heading', { level: 1 })).toContainText('kept track of');
  const overdue = page.getByRole('region', { name: 'Overdue' });
  await expect(overdue.getByRole('heading', { name: 'send the redlined MSA' })).toBeVisible();
  await expect(page.getByRole('region', { name: 'No date given' })).toContainText('update the checklist');
  await expect(page.getByText('soft promise')).toBeVisible();

  const card = page.getByRole('listitem').filter({ hasText: 'send the redlined MSA' });
  await card.getByRole('button', { name: 'Mark kept' }).click();
  await expect(overdue).toHaveCount(0);
  await page.getByRole('tab', { name: /Kept/ }).click();
  await expect(page.getByRole('listitem').filter({ hasText: 'send the redlined MSA' })).toContainText('Kept');
});

test('opens the source, edits a date and searches', async ({ page }) => {
  await page.goto('/');
  const card = page.getByRole('listitem').filter({ hasText: 'book the review session' });
  await card.getByRole('button', { name: /LEO-4/ }).click();
  expect(await page.evaluate(() => window.__sdNav)).toEqual(['/browse/LEO-4']);
  await card.getByRole('button', { name: 'Details' }).click();
  await card.getByLabel('Due date').fill('2026-12-09');
  await card.getByRole('button', { name: 'Save date' }).click();
  await expect(card).toContainText('Wed');
  await page.getByPlaceholder('Search people, issues, words').fill('banner');
  await expect(page.getByRole('listitem')).toHaveCount(1);
});

test('empty ledger scans the last 30 days', async ({ page }) => {
  await page.goto('/?empty=1');
  await expect(page.getByRole('heading', { name: 'No promises yet' })).toBeVisible();
  await page.getByRole('button', { name: 'Scan last 30 days' }).first().click();
  await expect(page.getByRole('status')).toContainText('found 1 new promise');
  await expect(page.getByRole('heading', { name: 'send the onboarding pack' })).toBeVisible();
});

test('issue panel is compact and scoped', async ({ page }) => {
  await page.goto('/?module=jira-issue-promises');
  await expect(page.getByText(/open promises on this issue/)).toBeVisible();
  await expect(page.getByRole('heading', { level: 1 })).toHaveCount(0);
});

test('small screens and dark theme', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 800 });
  await page.goto('/?theme=dark');
  await expect(page.locator('html')).toHaveAttribute('data-color-mode', 'dark');
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth);
  expect(overflow).toBe(false);
});
